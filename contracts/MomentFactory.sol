// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Imports
import {LSP8Mintable} from "@lukso/lsp-smart-contracts/contracts/LSP8IdentifiableDigitalAsset/presets/LSP8Mintable.sol";
import {LSP6Utils} from "@lukso/lsp-smart-contracts/contracts/LSP6KeyManager/LSP6Utils.sol";
import {LSP2Utils} from "@lukso/lsp2-contracts/contracts/LSP2Utils.sol";
import {_LSP8_TOKENID_FORMAT_ADDRESS} from "@lukso/lsp-smart-contracts/contracts/LSP8IdentifiableDigitalAsset/LSP8Constants.sol";
import {_LSP4_TOKEN_TYPE_COLLECTION, _LSP4_METADATA_KEY} from "@lukso/lsp-smart-contracts/contracts/LSP4DigitalAssetMetadata/LSP4Constants.sol";
import {_PERMISSION_CALL} from "@lukso/lsp-smart-contracts/contracts/LSP6KeyManager/LSP6Constants.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {IERC725Y} from "@erc725/smart-contracts/contracts/interfaces/IERC725Y.sol";
import {MomentMetadata} from "./MomentMetadata.sol";


contract MomentFactory is LSP8Mintable {
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableSet for EnumerableSet.Bytes32Set;

    // --- Constants
    address public constant LIKES_TOKEN = 0x403BfD53617555295347e0F7725CfdA480AB801e;

    // --- Events
    event MomentMinted(address indexed recipient, bytes32 indexed tokenId, address indexed collectionUP, string description);
    event CollectionCreated(address indexed owner, address indexed collectionUP);
    event CollectionRemoved(address indexed owner, address indexed collectionUP);
    event PermissionsCheck(address indexed recipient, address indexed collectionUP, bytes32 permissionsKey, bytes permissions);
    event MomentURDUpdated(address indexed oldURD, address indexed newURD);

    // --- Storage
    EnumerableSet.AddressSet private _allCollections;
    EnumerableSet.AddressSet private _allMoments;
    mapping(address => address) private _collectionToOwner; // Mapping from collectionUP to ownerUP
    mapping(address => EnumerableSet.Bytes32Set) private _collectionMoments; // Mapping from collectionUP to set of Moments
    mapping(address => EnumerableSet.AddressSet) private _ownerToCollections; // Mapping from ownerUP to set of collectionUPs
    mapping(address => address) private _momentToCollection; // Mapping from Moment to Collection
    address public momentURD;

    constructor(
        string memory factoryName,
        string memory factorySymbol,
        address factoryOwner,
        bytes memory metadataURI,
        address _momentURD
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
    }

    // --- Public functions

    // Set LSP4 metadata for Moment Factory
    function setMomentFactoryData(bytes calldata metadataURI) external onlyOwner {
        _setData(_LSP4_METADATA_KEY, metadataURI); 
    }

    // Store new Collection
    function storeCollection(address collectionUP, address controllerUP, address ownerUP) external {
        require(msg.sender == controllerUP, "Caller must be the owner of the collection");
        require(_collectionToOwner[collectionUP] == address(0), "Collection already exists");

        _collectionToOwner[collectionUP] = ownerUP;
        _ownerToCollections[ownerUP].add(collectionUP);
        _allCollections.add(collectionUP);

        emit CollectionCreated(ownerUP, collectionUP);
    }

    // Remove a Collection from storage
    function removeCollection(address collectionUP) external onlyOwner {
        require(_collectionToOwner[collectionUP] != address(0), "Collection does not exist");
        address ownerUP = _collectionToOwner[collectionUP];

        _ownerToCollections[ownerUP].remove(collectionUP);
        _allCollections.remove(collectionUP);
        delete _collectionToOwner[collectionUP];
        // Note: We keep the _collectionMoments mapping data for historical reference
        
        emit CollectionRemoved(ownerUP, collectionUP);
    }

    // Mint a Moment
    function mintMoment(
        address recipient,
        bytes calldata moment_metadataURI,
        bytes calldata LSP4_metadataURI,
        address collectionUP
    ) external returns (bytes32) {
        require(_collectionToOwner[collectionUP] != address(0), "Invalid collectionUP");
        address collectionOwnerUP = _collectionToOwner[collectionUP];

        // Check if recipient is owner or has permissions
        if (recipient != collectionOwnerUP) {
            bytes32 permissions = LSP6Utils.getPermissionsFor(
                IERC725Y(collectionUP),
                recipient
            );

            require(
                LSP6Utils.hasPermission(permissions, _PERMISSION_CALL),
                "Missing CALL permission"
            );

            bytes memory allowedCalls = LSP6Utils.getAllowedCallsFor(
                IERC725Y(collectionUP),
                recipient
            );

            require(
                LSP6Utils.isCompactBytesArrayOfAllowedCalls(allowedCalls),
                "Invalid allowed calls format"
            );

            bytes memory expectedCall = abi.encodePacked(
                bytes4(0x00000002),
                address(this),
                bytes4(0xffffffff),
                msg.sig
            );

            bool hasAllowedCall = false;
            uint256 pointer = 0;
            while (pointer < allowedCalls.length) {
                uint256 elementLength = uint16(bytes2(abi.encodePacked(
                    allowedCalls[pointer],
                    allowedCalls[pointer + 1]
                )));
                
                bytes memory entry = new bytes(elementLength);
                for (uint i = 0; i < elementLength; i++) {
                    entry[i] = allowedCalls[pointer + 2 + i];
                }
                
                if (keccak256(entry) == keccak256(expectedCall)) {
                    hasAllowedCall = true;
                    break;
                }
                
                pointer += elementLength + 2;
            }

            require(hasAllowedCall, "Not allowed to call mintMoment");
        }

        // Create new Moment
        MomentMetadata newContract = new MomentMetadata(
            recipient,
            address(this),
            moment_metadataURI,
            LSP4_metadataURI,
            LIKES_TOKEN,
            collectionOwnerUP,
            momentURD
        );

        bytes32 tokenId = bytes32(uint256(uint160(address(newContract))));
    
        _momentToCollection[address(newContract)] = collectionUP;
        
        _mint(recipient, tokenId, true, "");
        _setDataForTokenId(tokenId, _LSP4_METADATA_KEY, LSP4_metadataURI);
        _allMoments.add(address(newContract));
        _collectionMoments[collectionUP].add(tokenId);

        emit MomentMinted(recipient, tokenId, collectionUP, "Moment minted");

        return tokenId;
    }

    // Update Universal Receiver Delegate
    function setMomentURD(address newURD) external onlyOwner {
        require(newURD != address(0), "Invalid URD address");
        address oldURD = momentURD;
        momentURD = newURD;
        emit MomentURDUpdated(oldURD, newURD);
    }

    // View Functions

    // Get all collections
    function getAllCollections() external view returns (address[] memory) {
        return _allCollections.values();
    }

    // Get the owner of a collection
    function getCollectionOwner(address collectionUP) external view returns (address) {
        return _collectionToOwner[collectionUP];
    }

    // Get all collections owned by an owner
    function getCollectionsByOwner(address ownerUP) external view returns (address[] memory) {
        return _ownerToCollections[ownerUP].values();
    }

    // Check if a collection is owned by a specific owner
    function isCollectionOwnedBy(address collectionUP, address ownerUP) external view returns (bool) {
        return _collectionToOwner[collectionUP] == ownerUP;
    }

    // Get all Moments in a collection
    function getMomentsInCollection(address collectionUP) external view returns (bytes32[] memory) {
        return _collectionMoments[collectionUP].values();
    }

    // Get total number of collections
    function getTotalCollections() external view returns (uint256) {
    return _allCollections.length();
    }

    // Get the total number of collections owned by an owner
    function getCollectionCountByOwner(address ownerUP) external view returns (uint256) {
        return _ownerToCollections[ownerUP].length();
    }

    // Get the total number of Moments in a collection
    function getMomentCountInCollection(address collectionUP) external view returns (uint256) {
        return _collectionMoments[collectionUP].length();
    }

    // Add a view function to get all Moments
    function getAllMoments() external view returns (address[] memory) {
        return _allMoments.values();
    }

    // Add a getter function to look up a Moment's collection
    function getMomentCollection(address momentAddress) external view returns (address) {
        return _momentToCollection[momentAddress];
    }
}
