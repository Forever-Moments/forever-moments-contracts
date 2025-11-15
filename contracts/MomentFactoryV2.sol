// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Imports
import {LSP8Mintable} from "@lukso/lsp-smart-contracts/contracts/LSP8IdentifiableDigitalAsset/presets/LSP8Mintable.sol";
import {_LSP8_TOKENID_FORMAT_ADDRESS} from "@lukso/lsp-smart-contracts/contracts/LSP8IdentifiableDigitalAsset/LSP8Constants.sol";
import {_LSP4_TOKEN_TYPE_COLLECTION, _LSP4_METADATA_KEY} from "@lukso/lsp-smart-contracts/contracts/LSP4DigitalAssetMetadata/LSP4Constants.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {MomentV2} from "./MomentV2.sol";
import {ICollectionRegistry} from "./ICollectionRegistry.sol";


contract MomentFactoryV2 is LSP8Mintable {
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableSet for EnumerableSet.Bytes32Set;

    // --- Constants
    address public constant LIKES_TOKEN = 0x403BfD53617555295347e0F7725CfdA480AB801e;
    
    // EIP-1167 minimal proxy bytecode
    bytes private constant PROXY_BYTECODE = hex"3d602d80600a3d3981f3363d3d373d3d3d363d73";
    bytes private constant PROXY_BYTECODE_SUFFIX = hex"5af43d82803e903d91602b57fd5bf3";

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

        // Create minimal proxy for the Moment
        address proxy = _createProxy(momentImplementation);
        
        // Initialize the proxy with Moment data
        MomentV2(proxy).initialize(
            recipient,
            address(this),
            metadataURI,
            LIKES_TOKEN,
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

    function _createProxy(address implementation) internal returns (address proxy) {
        bytes memory bytecode = abi.encodePacked(
            PROXY_BYTECODE,
            implementation,
            PROXY_BYTECODE_SUFFIX
        );
        
        assembly {
            proxy := create(0, add(bytecode, 0x20), mload(bytecode))
        }
        
        require(proxy != address(0), "Proxy creation failed");
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
            MomentV2(momentAddress).transferOwnership(address(0));
        }
    }
}
