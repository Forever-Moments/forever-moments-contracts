// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

// LUKSO Standards
import {LSP8Mintable} from "@lukso/lsp-smart-contracts/contracts/LSP8IdentifiableDigitalAsset/presets/LSP8Mintable.sol";
import {_LSP8_TOKENID_FORMAT_ADDRESS} from "@lukso/lsp-smart-contracts/contracts/LSP8IdentifiableDigitalAsset/LSP8Constants.sol";
import {_LSP4_TOKEN_TYPE_COLLECTION, _LSP4_METADATA_KEY} from "@lukso/lsp-smart-contracts/contracts/LSP4DigitalAssetMetadata/LSP4Constants.sol";

// OpenZeppelin
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

// Local Contracts
import {MomentV3} from "./MomentV3.sol";
import {ICollectionRegistry} from "./ICollectionRegistry.sol";
import {Constants} from "./Constants.sol";

/**
 * @title MomentFactoryV3
 * @dev Factory contract for minting Moments as LSP8 tokens using minimal proxy pattern
 * @notice V3 uses OpenZeppelin's Clones library for proxy deployment
 */
contract MomentFactoryV3 is LSP8Mintable {
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableSet for EnumerableSet.Bytes32Set;

    // --- Constants
    /// @dev Exposed for offchain consumers/tests. Used internally via `Constants.LIKES_TOKEN`.
    address public constant LIKES_TOKEN = Constants.LIKES_TOKEN;

    // --- Events
    event MomentMinted(address indexed recipient, bytes32 indexed tokenId, address indexed collectionUP);
    event MomentURDUpdated(address indexed oldURD, address indexed newURD);
    event CollectionRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);
    event ImplementationUpdated(address indexed oldImplementation, address indexed newImplementation);

    // --- Storage
    ICollectionRegistry public collectionRegistry;
    EnumerableSet.AddressSet private _allMoments;
    mapping(address => address) private _momentToCollection;
    address public momentURD;
    address public momentImplementation;

    // --- Modifiers
    modifier onlyRegistry() {
        require(msg.sender == address(collectionRegistry), "Only registry can call");
        _;
    }

    // --- Constructor
    constructor(
        string memory factoryName,
        string memory factorySymbol,
        address factoryOwner,
        bytes memory metadataURI,
        address _momentURD,
        address _collectionRegistry,
        address _momentImplementation
    )
        LSP8Mintable(
            factoryName,
            factorySymbol,
            factoryOwner,
            _LSP4_TOKEN_TYPE_COLLECTION,
            _LSP8_TOKENID_FORMAT_ADDRESS
        )
    {
        _setData(_LSP4_METADATA_KEY, metadataURI);
        momentURD = _momentURD;
        collectionRegistry = ICollectionRegistry(_collectionRegistry);
        momentImplementation = _momentImplementation;
    }

    // --- Public Functions

    function mintMoment(
        address recipient,
        bytes calldata metadataURI,
        address collectionUP
    ) external returns (bytes32) {
        // Delegate collection validation to the registry
        require(collectionRegistry.canMint(collectionUP, msg.sender), "Cannot mint to this collection");

        // Get collection owner for the Moment contract
        address collectionOwnerUP = collectionRegistry.getCollectionOwner(collectionUP);

        // Create minimal proxy for the Moment using OpenZeppelin's Clones library
        address proxy = Clones.clone(momentImplementation);
        
        // Initialize the proxy with Moment data
        MomentV3(proxy).initialize(
            recipient,
            address(this),
            metadataURI,
            Constants.LIKES_TOKEN,
            collectionOwnerUP,
            momentURD
        );

        bytes32 tokenId = bytes32(uint256(uint160(proxy)));
    
        // Store moment-to-collection mapping
        _momentToCollection[proxy] = collectionUP;
        
        // Mint the LSP8 token
        _mint(recipient, tokenId, true, "");
        _setDataForTokenId(tokenId, _LSP4_METADATA_KEY, metadataURI);
        _allMoments.add(proxy);

        emit MomentMinted(recipient, tokenId, collectionUP);

        return tokenId;
    }

    function setMomentURD(address newURD) external onlyOwner {
        require(newURD != address(0), "Invalid URD");
        address oldURD = momentURD;
        momentURD = newURD;
        emit MomentURDUpdated(oldURD, newURD);
    }

    function setCollectionRegistry(address newRegistry) external onlyOwner {
        require(newRegistry != address(0), "Invalid registry");
        address oldRegistry = address(collectionRegistry);
        collectionRegistry = ICollectionRegistry(newRegistry);
        emit CollectionRegistryUpdated(oldRegistry, newRegistry);
    }

    function setMomentImplementation(address newImplementation) external onlyOwner {
        require(newImplementation != address(0), "Invalid implementation");
        address oldImplementation = momentImplementation;
        momentImplementation = newImplementation;
        emit ImplementationUpdated(oldImplementation, newImplementation);
    }

    // --- View Functions

    /**
     * @dev Get the collection address for a given Moment
     * @param momentAddress The Moment contract address
     * @return The collection Universal Profile address
     */
    function getMomentCollection(address momentAddress) external view returns (address) {
        return _momentToCollection[momentAddress];
    }

    /**
     * @dev Get all Moment addresses
     * @return Array of all Moment contract addresses
     */
    function getAllMoments() external view returns (address[] memory) {
        return _allMoments.values();
    }

    /**
     * @dev Get the total number of Moments
     * @return The total count of Moments
     */
    function getMomentsCount() external view returns (uint256) {
        return _allMoments.length();
    }

    /**
     * @dev Check if an address is a valid Moment
     * @param momentAddress The address to check
     * @return True if the address is a registered Moment
     */
    function isMoment(address momentAddress) external view returns (bool) {
        return _allMoments.contains(momentAddress);
    }

    /**
     * @dev Get the current implementation address
     * @return The implementation contract address
     */
    function getImplementation() external view returns (address) {
        return momentImplementation;
    }

    // --- Internal Functions

    /**
     * @dev Handle token transfers and update Moment ownership
     */
    function _afterTokenTransfer(
        address from,
        address to,
        bytes32 tokenId,
        bytes memory data
    ) internal virtual override {
        super._afterTokenTransfer(from, to, tokenId, data);

        if (from == address(0) || to == address(0)) {
            return;
        }

        address momentAddress = address(uint160(uint256(tokenId)));
        
        if (_allMoments.contains(momentAddress)) {
            MomentV3(momentAddress).transferOwnership(address(0));
        }
    }
}

