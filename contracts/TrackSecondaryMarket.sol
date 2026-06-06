// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {IERC725Y} from "@erc725/smart-contracts/contracts/interfaces/IERC725Y.sol";
import {ILSP7DigitalAsset} from "@lukso/lsp-smart-contracts/contracts/LSP7DigitalAsset/ILSP7DigitalAsset.sol";
import {_INTERFACEID_LSP7} from "@lukso/lsp7-contracts/contracts/LSP7Constants.sol";

import {LSP18Constants} from "./LSP18Constants.sol";

/**
 * @title TrackSecondaryMarket
 * @author OG Labs
 * @notice LYX fixed-price secondary sales for LSP7 track editions. Sellers pre-authorize this contract as LSP7 operator, then createListing; buyers call buy with exact LYX.
 * @dev LSP-18 royalties are read from the track token ERC725Y storage and paid from gross sale; optional platform fee; remainder to seller. LSP-1 hooks on buyer UPs run via LSP7 transfer(force=true).
 */
contract TrackSecondaryMarket is Ownable, ReentrancyGuard {
    struct Listing {
        address track;
        address seller;
        uint256 tokenAmount;
        uint256 price;
        uint64 expiresAt;
        bool active;
    }

    uint256 public nextListingId = 1;
    mapping(uint256 => Listing) public listings;

    address public platformTreasury;
    uint16 public platformFeeBps;

    event ListingCreated(
        uint256 indexed listingId,
        address indexed track,
        address indexed seller,
        uint256 tokenAmount,
        uint256 price,
        uint64 expiresAt
    );
    event ListingCancelled(uint256 indexed listingId, address indexed seller);
    event Sale(
        uint256 indexed listingId,
        address indexed track,
        address indexed seller,
        address buyer,
        uint256 tokenAmount,
        uint256 gross,
        uint256 royaltiesPaid,
        uint256 platformFee
    );
    event PlatformTreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event PlatformFeeBpsUpdated(uint16 oldBps, uint16 newBps);

    error InvalidTrack();
    error InvalidAmount();
    error InvalidPrice();
    error InvalidExpiry();
    error InsufficientOperatorAllowance();
    error InsufficientSellerBalance();
    error ListingNotActive();
    error ListingExpired();
    error WrongPayment();
    error NotSeller();
    error PayoutsExceedGross();
    error LYXForwardFailed();
    error InvalidRoyaltyData();
    error PlatformTreasuryUnset();

    constructor(address platformTreasury_, uint16 platformFeeBps_) Ownable(msg.sender) {
        platformTreasury = platformTreasury_;
        platformFeeBps = platformFeeBps_;
    }

    function setPlatformTreasury(address newTreasury) external onlyOwner {
        address old = platformTreasury;
        platformTreasury = newTreasury;
        emit PlatformTreasuryUpdated(old, newTreasury);
    }

    function setPlatformFeeBps(uint16 newBps) external onlyOwner {
        require(newBps <= 10_000, "fee bps");
        uint16 old = platformFeeBps;
        platformFeeBps = newBps;
        emit PlatformFeeBpsUpdated(old, newBps);
    }

    /**
     * @notice Create a sale listing. Caller must have authorized this market as LSP7 operator for at least `tokenAmount` on `track`.
     * @param track TrackToken (LSP7) address
     * @param tokenAmount Raw LSP7 units (same as balance / mint units)
     * @param price Gross LYX (wei) the buyer must pay
     * @param expiresAt Unix timestamp; 0 = no expiry
     */
    function createListing(address track, uint256 tokenAmount, uint256 price, uint64 expiresAt) external returns (uint256 listingId) {
        if (track == address(0)) revert InvalidTrack();
        if (!IERC165(track).supportsInterface(_INTERFACEID_LSP7)) revert InvalidTrack();
        if (tokenAmount == 0) revert InvalidAmount();
        if (price == 0) revert InvalidPrice();
        if (expiresAt != 0 && expiresAt <= block.timestamp) revert InvalidExpiry();

        address seller = msg.sender;
        _requireOperatorAndBalance(track, seller, tokenAmount);

        listingId = nextListingId++;
        listings[listingId] = Listing({
            track: track,
            seller: seller,
            tokenAmount: tokenAmount,
            price: price,
            expiresAt: expiresAt,
            active: true
        });

        emit ListingCreated(listingId, track, seller, tokenAmount, price, expiresAt);
    }

    function cancelListing(uint256 listingId) external {
        Listing storage l = listings[listingId];
        if (!l.active) revert ListingNotActive();
        if (l.seller != msg.sender) revert NotSeller();
        l.active = false;
        emit ListingCancelled(listingId, msg.sender);
    }

    /**
     * @notice Buy a listing; send exactly the listed price in LYX. Transfers LSP7 from seller to msg.sender.
     */
    function buy(uint256 listingId) external payable nonReentrant {
        Listing storage l = listings[listingId];
        if (!l.active) revert ListingNotActive();
        if (l.expiresAt != 0 && block.timestamp > l.expiresAt) revert ListingExpired();
        if (msg.value != l.price) revert WrongPayment();

        _requireOperatorAndBalance(l.track, l.seller, l.tokenAmount);

        uint256 gross = msg.value;
        uint256 platformFee = _platformFee(gross);
        if (platformFee > 0 && platformTreasury == address(0)) revert PlatformTreasuryUnset();

        uint256 royaltiesPaid = _distributeLSP18Royalties(l.track, gross);
        if (royaltiesPaid + platformFee > gross) revert PayoutsExceedGross();

        uint256 sellerAmount = gross - royaltiesPaid - platformFee;
        l.active = false;

        ILSP7DigitalAsset(l.track).transfer(l.seller, msg.sender, l.tokenAmount, true, abi.encodePacked("TrackSecondaryMarket"));

        if (platformFee > 0) {
            (bool okP, ) = payable(platformTreasury).call{value: platformFee}("");
            if (!okP) revert LYXForwardFailed();
        }

        if (sellerAmount > 0) {
            (bool okS, ) = payable(l.seller).call{value: sellerAmount}("");
            if (!okS) revert LYXForwardFailed();
        }

        emit Sale(listingId, l.track, l.seller, msg.sender, l.tokenAmount, gross, royaltiesPaid, platformFee);
    }

    function _requireOperatorAndBalance(address track, address seller, uint256 tokenAmount) internal view {
        uint256 allowed = ILSP7DigitalAsset(track).authorizedAmountFor(address(this), seller);
        if (allowed < tokenAmount) revert InsufficientOperatorAllowance();
        if (ILSP7DigitalAsset(track).balanceOf(seller) < tokenAmount) revert InsufficientSellerBalance();
    }

    function _platformFee(uint256 gross) internal view returns (uint256) {
        if (platformTreasury == address(0)) return 0;
        if (platformFeeBps == 0) return 0;
        return (gross * uint256(platformFeeBps)) / 10_000;
    }

    /**
     * @dev Parses LSP-18 compact recipient array on `track` and sends (gross * points / 100_000) LYX per tuple. Skips zero recipients.
     * @return totalWei Sum of wei sent to royalty recipients
     */
    function _distributeLSP18Royalties(address track, uint256 gross) internal returns (uint256 totalWei) {
        bytes memory data = IERC725Y(track).getData(LSP18Constants.LSP18_ROYALTIES_RECIPIENTS_KEY);
        if (data.length < 30) return 0;

        uint256 p = 0;
        while (p + 30 <= data.length) {
            uint256 elemLen = (uint256(uint8(data[p])) << 8) | uint256(uint8(data[p + 1]));
            if (elemLen != LSP18Constants.LSP18_RECIPIENT_TUPLE_LENGTH) revert InvalidRoyaltyData();

            address recipient;
            uint32 points;
            assembly {
                recipient := shr(96, mload(add(add(data, 0x20), add(p, 6))))
                points := shr(224, mload(add(add(data, 0x20), add(p, 26))))
            }

            p += 2 + elemLen;

            if (recipient == address(0) || points == 0) continue;

            uint256 pay = (gross * uint256(points)) / 100_000;
            if (pay > 0) {
                (bool ok, ) = payable(recipient).call{value: pay}("");
                if (!ok) revert LYXForwardFailed();
                totalWei += pay;
            }
        }
    }
}
