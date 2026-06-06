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
import {ERC725YCore} from "@erc725/smart-contracts/contracts/ERC725YCore.sol";
import {IERC725Y} from "@erc725/smart-contracts/contracts/interfaces/IERC725Y.sol";

// OpenZeppelin
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

interface ILSP7ForLikes {
    function balanceOf(address tokenOwner) external view returns (uint256);
    function transfer(address from, address to, uint256 amount, bool force, bytes memory data) external;
}

/**
 * @title TrackToken
 * @author OG Labs
 * @notice LSP7 "track" token (token type NFT). Single or album; fans mint copies at a fixed price. Reserve mint for creator. Can receive LIKES; owner can withdraw.
 * @dev Creator (typically a Universal Profile) is the contract owner. maxSupply is required and immutable. URD set for LSP7 so frontend can track likes/comments.
 */
contract TrackToken is LSP7Mintable, ReentrancyGuard, ILSP1UniversalReceiver {
    bytes32 internal constant _LSP33_METADATA_KEY = 0xbecee5b67fa43fb2e96c7c6ccdc23007fffc2b24205416b2122cd7b8d8ef48fa;

    address public treasury;
    address public platformTreasury;
    uint16 public platformFeeBps;
    uint16 public poolMintBps;
    uint256 public pricePerMint;
    uint256 public immutable maxSupply;
    uint256 public immutable earlySupportersCap;
    uint256 public totalMinted;
    bytes32 public immutable contentHash;
    bool public metadataFrozen;
    address public likesToken;
    address public musicURD;

    // Early supporters pool: first N distinct paying minters can withdraw equal share
    uint256 public earlySupportersCount;
    mapping(address => bool) public isEarlySupporter;
    mapping(address => uint256) public earlyWithdrawn;
    uint256 public totalPoolReceived;

    event TrackMinted(address indexed buyer, uint256 amount, uint256 paid);
    event PriceUpdated(uint256 oldPrice, uint256 newPrice);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event MetadataURIUpdated(bytes newURI);
    event MetadataFrozen();
    event LikesWithdrawn(address indexed owner, uint256 amount);
    event EarlySupporterAdded(address indexed supporter, uint256 count);
    event EarlySupportWithdrawn(address indexed supporter, uint256 amount);

    error InvalidTreasury();
    error InvalidRecipient();
    error InvalidAmount();
    error WrongPayment();
    error InsufficientLikes();
    error MaxSupplyReached();
    error MetadataAlreadyFrozen();
    error InvalidMetadataBatch();
    error MissingLSP4Metadata();
    error MissingLSP33Metadata();
    error LYXForwardFailed();
    error NotEarlySupporter();
    error MintSplitExceeds10000();

    /**
     * @param name Token name
     * @param symbol Token symbol
     * @param creator_ Address of the artist (UP); becomes contract owner
     * @param treasury_ Address to receive mint proceeds; if zero, uses creator_
     * @param platformTreasury_ Platform fee recipient; address(0) = no platform fee
     * @param platformFeeBps_ Platform fee in basis points (e.g. 100 = 1%). Set by factory.
     * @param pricePerMint_ Price in LYX per copy (wei)
     * @param maxSupply_ Max number of copies (must be > 0)
     * @param initialMetadataURI LSP4 metadata URI (e.g. ipfs://)
     * @param contentHash_ Immutable hash so buyers can verify the release
     * @param poolMintBps_ Early supporter pool share of mint (basis points). Rest goes to artist.
     * @param earlySupportersCap_ Max number of distinct addresses that count as early supporters (0 = no pool).
     * @param royaltyArtistBps_ Artist resale royalty in basis points (e.g. 500 = 5%).
     * @param royaltyEarlyBps_ Early pool resale royalty in basis points (extra on top of artist). 0 = no early royalty.
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
        uint16 poolMintBps_,
        uint256 earlySupportersCap_,
        uint16 royaltyArtistBps_,
        uint16 royaltyEarlyBps_,
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
        if (platformFeeBps_ + poolMintBps_ > 10000) revert MintSplitExceeds10000();
        treasury = treasury_ != address(0) ? treasury_ : creator_;
        platformTreasury = platformTreasury_;
        platformFeeBps = platformFeeBps_;
        poolMintBps = poolMintBps_;
        earlySupportersCap = earlySupportersCap_;
        pricePerMint = pricePerMint_;
        maxSupply = maxSupply_;
        contentHash = contentHash_;
        likesToken = likesToken_;
        musicURD = musicURD_;
        _applyInitialMetadataBatch(initialMetadataURI);
        _setData(
            LSP2Utils.generateMappingKey("SupportedStandards", "LSP33MusicNFT"),
            abi.encodePacked(bytes4(keccak256(bytes("LSP33MusicNFT"))))
        );
        _setLSP18Royalties(royaltyArtistBps_, royaltyEarlyBps_);
        if (musicURD_ != address(0)) {
            bytes32 key = LSP2Utils.generateMappingKey(
                _LSP1_UNIVERSAL_RECEIVER_DELEGATE_PREFIX,
                bytes20(_TYPEID_LSP7_TOKENSRECIPIENT)
            );
            _setData(key, abi.encodePacked(musicURD_));
        }
    }

    function _setLSP18Royalties(uint16 royaltyArtistBps_, uint16 royaltyEarlyBps_) internal {
        if (royaltyArtistBps_ == 0 && royaltyEarlyBps_ == 0) return;
        address artistReceiver = treasury;
        if (royaltyEarlyBps_ > 0 && earlySupportersCap > 0) {
            bytes memory compact = LSP18Constants.encodeTwoRecipients(
                royaltyArtistBps_,
                artistReceiver,
                royaltyEarlyBps_,
                address(this)
            );
            _setData(LSP18Constants.LSP18_ROYALTIES_RECIPIENTS_KEY, compact);
        } else {
            if (artistReceiver == address(0)) return;
            bytes memory compact = LSP18Constants.encodeSingleRecipient(royaltyArtistBps_, artistReceiver);
            _setData(LSP18Constants.LSP18_ROYALTIES_RECIPIENTS_KEY, compact);
        }
        _setData(LSP18Constants.LSP18_ROYALTIES_ENFORCE_PAYMENT_KEY, abi.encode(false));
    }

    /**
     * @notice Mint track copies by paying pricePerMint * amount in LYX.
     * @param amount Number of copies to mint (each copy = 1 token unit, decimals 0).
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
        uint256 poolAmount = (poolMintBps > 0) ? (msg.value * poolMintBps) / 10000 : 0;
        uint256 artistAmount = msg.value - platformAmount - poolAmount;

        if (poolAmount > 0 && earlySupportersCap > 0) {
            if (!isEarlySupporter[msg.sender] && earlySupportersCount < earlySupportersCap) {
                isEarlySupporter[msg.sender] = true;
                earlySupportersCount++;
                emit EarlySupporterAdded(msg.sender, earlySupportersCount);
            }
            totalPoolReceived += poolAmount;
        }

        if (platformAmount > 0) {
            (bool okPlatform, ) = platformTreasury.call{value: platformAmount}("");
            if (!okPlatform) revert LYXForwardFailed();
        }
        if (artistAmount > 0) {
            (bool okArtist, ) = treasury.call{value: artistAmount}("");
            if (!okArtist) revert LYXForwardFailed();
        }
        emit TrackMinted(msg.sender, amount, msg.value);
    }

    /// @notice Receive LYX (e.g. early supporter royalty from marketplace); credits the early pool.
    receive() external payable override {
        if (earlySupportersCap > 0) {
            totalPoolReceived += msg.value;
        }
    }

    /**
     * @notice Withdraw caller's share of the early supporter pool. Only the first N paying minters are eligible; share is equal per address.
     */
    function withdrawEarlySupport() external nonReentrant {
        if (!isEarlySupporter[msg.sender]) revert NotEarlySupporter();
        if (earlySupportersCount == 0) revert InvalidAmount();
        uint256 share = totalPoolReceived / earlySupportersCount;
        uint256 claimable = share - earlyWithdrawn[msg.sender];
        if (claimable == 0) return;
        earlyWithdrawn[msg.sender] = share;
        (bool ok, ) = msg.sender.call{value: claimable}("");
        if (!ok) revert LYXForwardFailed();
        emit EarlySupportWithdrawn(msg.sender, claimable);
    }

    /// @notice View: claimable LYX for an early supporter address.
    function claimableEarlySupport(address account) external view returns (uint256) {
        if (!isEarlySupporter[account] || earlySupportersCount == 0) return 0;
        uint256 share = totalPoolReceived / earlySupportersCount;
        uint256 withdrawn = earlyWithdrawn[account];
        return share > withdrawn ? share - withdrawn : 0;
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

    // --- Creator admin (onlyOwner = creator/UP) ---

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
        emit MetadataURIUpdated(newURI);
    }

    function setData(
        bytes32 dataKey,
        bytes memory dataValue
    ) public payable virtual override(ERC725YCore, IERC725Y) {
        if (metadataFrozen && _isMetadataKey(dataKey)) revert MetadataAlreadyFrozen();
        super.setData(dataKey, dataValue);
    }

    function setDataBatch(
        bytes32[] memory dataKeys,
        bytes[] memory dataValues
    ) public payable virtual override(ERC725YCore, IERC725Y) {
        if (metadataFrozen) {
            for (uint256 i = 0; i < dataKeys.length; ) {
                if (_isMetadataKey(dataKeys[i])) revert MetadataAlreadyFrozen();
                unchecked {
                    ++i;
                }
            }
        }
        super.setDataBatch(dataKeys, dataValues);
    }

    function freezeMetadata() external onlyOwner {
        if (metadataFrozen) revert MetadataAlreadyFrozen();
        metadataFrozen = true;
        emit MetadataFrozen();
    }

    /// @return Creator address (contract owner)
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

    function _applyInitialMetadataBatch(bytes memory initialMetadataBatch) internal {
        (bytes32[] memory keys, bytes[] memory values) = abi.decode(initialMetadataBatch, (bytes32[], bytes[]));
        if (keys.length == 0 || keys.length != values.length) revert InvalidMetadataBatch();

        bool hasLSP4Metadata;
        bool hasLSP33Metadata;

        for (uint256 i = 0; i < keys.length; ) {
            if (keys[i] == _LSP4_METADATA_KEY) {
                hasLSP4Metadata = true;
            } else if (keys[i] == _LSP33_METADATA_KEY) {
                hasLSP33Metadata = true;
            }

            _setData(keys[i], values[i]);

            unchecked {
                ++i;
            }
        }

        if (!hasLSP4Metadata) revert MissingLSP4Metadata();
        if (!hasLSP33Metadata) revert MissingLSP33Metadata();
    }

    function _isMetadataKey(bytes32 dataKey) internal pure returns (bool) {
        return dataKey == _LSP4_METADATA_KEY || dataKey == _LSP33_METADATA_KEY;
    }
}
