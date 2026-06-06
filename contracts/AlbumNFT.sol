// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

// LUKSO Standards
import {LSP7Mintable} from "@lukso/lsp-smart-contracts/contracts/LSP7DigitalAsset/presets/LSP7Mintable.sol";
import {LSP7DigitalAsset} from "@lukso/lsp-smart-contracts/contracts/LSP7DigitalAsset/LSP7DigitalAsset.sol";
import {_LSP4_TOKEN_TYPE_NFT, _LSP4_METADATA_KEY} from "@lukso/lsp4-contracts/contracts/LSP4Constants.sol";
import {LSP18Constants} from "./LSP18Constants.sol";
import {ILSP1UniversalReceiver} from "@lukso/lsp1-contracts/contracts/ILSP1UniversalReceiver.sol";
import {ILSP1UniversalReceiverDelegate} from "@lukso/lsp1-contracts/contracts/ILSP1UniversalReceiverDelegate.sol";
import {
    _INTERFACEID_LSP1_DELEGATE,
    _LSP1_UNIVERSAL_RECEIVER_DELEGATE_PREFIX,
    _LSP1_UNIVERSAL_RECEIVER_DELEGATE_KEY
} from "@lukso/lsp1-contracts/contracts/LSP1Constants.sol";
import {_TYPEID_LSP0_VALUE_RECEIVED} from "@lukso/lsp0-contracts/contracts/LSP0Constants.sol";
import {_TYPEID_LSP7_TOKENSRECIPIENT} from "@lukso/lsp7-contracts/contracts/LSP7Constants.sol";
import {LSP2Utils} from "@lukso/lsp2-contracts/contracts/LSP2Utils.sol";

// OpenZeppelin
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

interface ILSP7ForLikes {
    function balanceOf(address tokenOwner) external view returns (uint256);
    function transfer(address from, address to, uint256 amount, bool force, bytes memory data) external;
}

/**
 * @title AlbumNFT
 * @author OG Labs
 * @notice LSP7 "album" token (token type NFT). Same metadata for all units; fans mint copies at a fixed price. Can receive LIKES; owner can withdraw.
 * @dev Creator (UP) is owner. reserveMint for creator giveaways. Royalties per LSP-18. URD for likes/comments.
 */
contract AlbumNFT is LSP7Mintable, ReentrancyGuard, ILSP1UniversalReceiver {
    address public treasury;
    address public platformTreasury;
    uint16 public platformFeeBps;
    uint256 public pricePerMint;
    uint256 public immutable maxSupply;
    uint256 public totalMinted;
    bytes32 public immutable contentHash;
    bool public metadataFrozen;
    address public likesToken;
    address public musicURD;

    event AlbumMinted(address indexed buyer, uint256 amount, uint256 paid);
    event MetadataUpdated(bytes newURI);
    event MetadataFrozen();
    event PriceUpdated(uint256 oldPrice, uint256 newPrice);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event LikesWithdrawn(address indexed owner, uint256 amount);

    error InvalidTreasury();
    error InvalidRecipient();
    error InvalidAmount();
    error WrongPayment();
    error InsufficientLikes();
    error MaxSupplyReached();
    error MetadataAlreadyFrozen();
    error LYXForwardFailed();

    /**
     * @param name Token name
     * @param symbol Token symbol
     * @param creator_ Artist (UP); becomes contract owner
     * @param treasury_ Proceeds recipient; zero = creator_
     * @param platformTreasury_ Platform fee recipient; address(0) = no platform fee
     * @param platformFeeBps_ Platform fee in basis points (e.g. 100 = 1%). 0 = none.
     * @param pricePerMint_ Price in LYX per copy
     * @param maxSupply_ Fixed total supply (must be > 0)
     * @param initialMetadataURI LSP4 metadata URI
     * @param contentHash_ Immutable release hash
     * @param royaltyBps_ Royalty in basis points (e.g. 500 = 5%)
     * @param royaltyReceiver_ Address to receive royalties
     * @param likesToken_ LIKES token address for withdrawLikes; address(0) = disabled.
     * @param musicURD_ URD for LSP7 (likes/comments); address(0) = disabled.
     */
    constructor(
        string memory name,
        string memory symbol,
        address creator_,
        address treasury_,
        address platformTreasury_,
        uint16 platformFeeBps_,
        uint256 pricePerMint_,
        uint256 maxSupply_,
        bytes memory initialMetadataURI,
        bytes32 contentHash_,
        uint16 royaltyBps_,
        address royaltyReceiver_,
        address likesToken_,
        address musicURD_
    )
        LSP7Mintable(
            name,
            symbol,
            creator_,
            _LSP4_TOKEN_TYPE_NFT,
            true
        )
    {
        require(maxSupply_ > 0, "maxSupply must be > 0");
        treasury = treasury_ != address(0) ? treasury_ : creator_;
        platformTreasury = platformTreasury_;
        platformFeeBps = platformFeeBps_;
        pricePerMint = pricePerMint_;
        maxSupply = maxSupply_;
        contentHash = contentHash_;
        likesToken = likesToken_;
        musicURD = musicURD_;
        _setData(_LSP4_METADATA_KEY, initialMetadataURI);
        _setLSP18Royalties(royaltyBps_, royaltyReceiver_);
        if (musicURD_ != address(0)) {
            bytes32 key = LSP2Utils.generateMappingKey(
                _LSP1_UNIVERSAL_RECEIVER_DELEGATE_PREFIX,
                bytes20(_TYPEID_LSP7_TOKENSRECIPIENT)
            );
            _setData(key, abi.encodePacked(musicURD_));
        }
    }

    function _setLSP18Royalties(uint16 royaltyBps_, address royaltyReceiver_) internal {
        if (royaltyReceiver_ == address(0)) return;
        bytes memory compact = LSP18Constants.encodeSingleRecipient(royaltyBps_, royaltyReceiver_);
        _setData(LSP18Constants.LSP18_ROYALTIES_RECIPIENTS_KEY, compact);
        _setData(LSP18Constants.LSP18_ROYALTIES_ENFORCE_PAYMENT_KEY, abi.encode(false));
    }

    /**
     * @notice Mint album copies by paying pricePerMint * amount in LYX.
     * @param amount Number of copies to mint.
     */
    function mint(uint256 amount) external payable nonReentrant {
        if (amount == 0) revert InvalidAmount();
        uint256 required = pricePerMint * amount;
        if (msg.value != required) revert WrongPayment();
        if (totalMinted + amount > maxSupply) revert MaxSupplyReached();

        totalMinted += amount;
        uint256 tokenAmount = amount * 10 ** decimals();
        _mint(msg.sender, tokenAmount, true, "");

        uint256 platformAmount = (platformTreasury != address(0) && platformFeeBps > 0)
            ? (msg.value * platformFeeBps) / 10000
            : 0;
        uint256 artistAmount = msg.value - platformAmount;

        if (platformAmount > 0) {
            (bool okPlatform, ) = platformTreasury.call{value: platformAmount}("");
            if (!okPlatform) revert LYXForwardFailed();
        }
        if (artistAmount > 0) {
            (bool okArtist, ) = treasury.call{value: artistAmount}("");
            if (!okArtist) revert LYXForwardFailed();
        }
        emit AlbumMinted(msg.sender, amount, msg.value);
    }

    /**
     * @notice Reserve copies for giveaways (no payment). Only creator.
     */
    function reserveMint(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert InvalidRecipient();
        if (amount == 0) revert InvalidAmount();
        if (totalMinted + amount > maxSupply) revert MaxSupplyReached();

        totalMinted += amount;
        uint256 tokenAmount = amount * 10 ** decimals();
        _mint(to, tokenAmount, true, "");
    }

    // --- Creator admin ---

    function setPrice(uint256 newPrice) external onlyOwner {
        uint256 oldPrice = pricePerMint;
        pricePerMint = newPrice;
        emit PriceUpdated(oldPrice, newPrice);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidTreasury();
        address oldTreasury = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }

    function setMetadataURI(bytes calldata newURI) external onlyOwner {
        if (metadataFrozen) revert MetadataAlreadyFrozen();
        _setData(_LSP4_METADATA_KEY, newURI);
        emit MetadataUpdated(newURI);
    }

    function freezeMetadata() external onlyOwner {
        if (metadataFrozen) revert MetadataAlreadyFrozen();
        metadataFrozen = true;
        emit MetadataFrozen();
    }

    function creator() external view returns (address) {
        return owner();
    }

    // --- LSP1 (receive LIKES) + withdrawLikes ---

    function supportsInterface(bytes4 interfaceId) public view virtual override(IERC165, LSP7DigitalAsset) returns (bool) {
        return interfaceId == type(ILSP1UniversalReceiver).interfaceId || super.supportsInterface(interfaceId);
    }

    function universalReceiver(bytes32 typeId, bytes memory receivedData)
        public
        payable
        virtual
        override
        returns (bytes memory returnedValues)
    {
        if (msg.value != 0 && typeId != _TYPEID_LSP0_VALUE_RECEIVED) {
            universalReceiver(_TYPEID_LSP0_VALUE_RECEIVED, receivedData);
        }

        bytes memory resultDefaultDelegate;
        bytes memory resultTypeIdDelegate;

        bytes memory defaultURDValue = _getData(_LSP1_UNIVERSAL_RECEIVER_DELEGATE_KEY);
        if (defaultURDValue.length >= 20) {
            address defaultURD = address(bytes20(defaultURDValue));
            if (IERC165(defaultURD).supportsInterface(_INTERFACEID_LSP1_DELEGATE)) {
                resultDefaultDelegate = ILSP1UniversalReceiverDelegate(defaultURD)
                    .universalReceiverDelegate(msg.sender, msg.value, typeId, receivedData);
            }
        }

        bytes32 typeIdKey = LSP2Utils.generateMappingKey(
            _LSP1_UNIVERSAL_RECEIVER_DELEGATE_PREFIX,
            bytes20(typeId)
        );
        bytes memory typeIdURDValue = _getData(typeIdKey);
        if (typeIdURDValue.length >= 20) {
            address typeIdURD = address(bytes20(typeIdURDValue));
            if (IERC165(typeIdURD).supportsInterface(_INTERFACEID_LSP1_DELEGATE)) {
                resultTypeIdDelegate = ILSP1UniversalReceiverDelegate(typeIdURD)
                    .universalReceiverDelegate(msg.sender, msg.value, typeId, receivedData);
            }
        }

        returnedValues = abi.encode(resultDefaultDelegate, resultTypeIdDelegate);
        return returnedValues;
    }

    function withdrawLikes(uint256 amount) external {
        if (msg.sender != owner()) revert InvalidTreasury();
        if (likesToken == address(0)) revert InvalidTreasury();
        if (amount == 0) revert InvalidAmount();

        uint256 available = ILSP7ForLikes(likesToken).balanceOf(address(this));
        if (amount > available) revert InsufficientLikes();

        ILSP7ForLikes(likesToken).transfer(address(this), msg.sender, amount, true, abi.encodePacked("Likes withdrawn"));
        emit LikesWithdrawn(msg.sender, amount);
    }

    // --- LSP-18 Royalty getters ---

    function getRoyaltyBps() external view returns (uint256) {
        bytes memory b = _getData(LSP18Constants.LSP18_ROYALTIES_RECIPIENTS_KEY);
        if (b.length < 2 + LSP18Constants.LSP18_RECIPIENT_TUPLE_LENGTH) return 0;
        uint32 points;
        assembly {
            let word := mload(add(add(b, 32), 26))
            points := shr(224, word)
        }
        return uint256(points) / 10;
    }

    function getRoyaltyReceiver() external view returns (address) {
        bytes memory b = _getData(LSP18Constants.LSP18_ROYALTIES_RECIPIENTS_KEY);
        if (b.length < 2 + LSP18Constants.LSP18_RECIPIENT_TUPLE_LENGTH) return address(0);
        address recipient;
        assembly {
            let word := mload(add(add(b, 32), 6))
            recipient := shr(96, word)
        }
        return recipient;
    }

    function getRoyaltyInfo(bytes32) external view returns (address receiver, uint256 bps) {
        receiver = this.getRoyaltyReceiver();
        bps = this.getRoyaltyBps();
    }
}
