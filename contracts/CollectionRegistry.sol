// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC725Y} from "@erc725/smart-contracts/contracts/interfaces/IERC725Y.sol";
import { ILSP7DigitalAsset as ILSP7 } from "@lukso/lsp7-contracts/contracts/ILSP7DigitalAsset.sol";
import {ICollectionRegistry} from "./ICollectionRegistry.sol";

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {LSP2Utils} from "@lukso/lsp2-contracts/contracts/LSP2Utils.sol";
import {LSP6Utils} from "@lukso/lsp-smart-contracts/contracts/LSP6KeyManager/LSP6Utils.sol";

import {
    _LSP5_RECEIVED_ASSETS_ARRAY_KEY,
    _LSP5_RECEIVED_ASSETS_MAP_KEY_PREFIX
} from "@lukso/lsp5-contracts/contracts/LSP5Constants.sol";

contract CollectionRegistry is ICollectionRegistry, Ownable {
    using EnumerableSet for EnumerableSet.AddressSet;

    // Constants
    address public constant LIKES_TOKEN = 0x403BfD53617555295347e0F7725CfdA480AB801e;
    address public immutable MOMENT_FACTORY;

    // Storage
    struct CollectionInfo {
        address owner;
        CollectionType collectionType;
        uint256 joiningFee;
        address gatingToken;
    }

    // Collection storage
    mapping(address => CollectionInfo) private _collections;
    mapping(address => EnumerableSet.AddressSet) private _ownerToCollections;
    EnumerableSet.AddressSet private _allCollections;

    // Membership storage
    mapping(address => EnumerableSet.AddressSet) private _collectionMembers;
    mapping(address => EnumerableSet.AddressSet) private _userCollections;

    // Modifiers
    modifier onlyCollectionOwner(address collectionUP) {
        require(_collections[collectionUP].owner == msg.sender, "Not collection owner");
        _;
    }

    modifier collectionExists(address collectionUP) {
        require(_collections[collectionUP].owner != address(0), "Collection does not exist");
        _;
    }

    // --- Constructor
    constructor(address _momentFactory) Ownable(msg.sender) {
        require(_momentFactory != address(0), "Invalid MomentFactory address");
        MOMENT_FACTORY = _momentFactory;
    }

    // --- Collection Management
    function createCollection(
        address collectionUP,
        address controllerUP,
        address ownerUP,
        CollectionType collectionType,
        uint256 joiningFee,
        address gatingToken
    ) external override {
        require(msg.sender == controllerUP, "Not controller");
        require(_collections[collectionUP].owner == address(0), "Collection already exists");
        require(collectionUP != address(0), "Invalid collection address");
        require(ownerUP != address(0), "Invalid owner address");

        // Validate collection type specific requirements
        if (collectionType == CollectionType.TokenGated) {
            require(gatingToken != address(0), "Token-gated collections require gating token");
        } else {
            require(gatingToken == address(0), "Non-token-gated collections cannot have gating token");
        }

        uint256 currentCount = _ownerToCollections[ownerUP].length();

        if (currentCount >= 3) {
            uint256 collectionFee = 420 * 10**18; // 18 decimals
            address platformTreasury = 0x7dE347bE3EbAED43065182FcABA462796d6f2a83;

            ILSP7(LIKES_TOKEN).transfer(
                msg.sender,
                platformTreasury,
                collectionFee,
                true,
                abi.encodePacked("Extra collection fee")
            );
        }

        _collections[collectionUP] = CollectionInfo({
            owner: ownerUP,
            collectionType: collectionType,
            joiningFee: joiningFee,
            gatingToken: gatingToken
        });

        _ownerToCollections[ownerUP].add(collectionUP);
        _allCollections.add(collectionUP);

        // Owner is automatically a member
        _collectionMembers[collectionUP].add(ownerUP);
        _userCollections[ownerUP].add(collectionUP);

        emit CollectionCreated(ownerUP, collectionUP, collectionType, joiningFee, gatingToken);
    }

    function removeCollection(address collectionUP) external override onlyOwner collectionExists(collectionUP) {
        address ownerUP = _collections[collectionUP].owner;

        // Remove from all mappings
        _ownerToCollections[ownerUP].remove(collectionUP);
        _allCollections.remove(collectionUP);

        // Remove all members
        EnumerableSet.AddressSet storage members = _collectionMembers[collectionUP];
        uint256 memberCount = members.length();
        for (uint256 i = 0; i < memberCount; i++) {
            address member = members.at(0);
            _userCollections[member].remove(collectionUP);
            members.remove(member);
        }

        delete _collections[collectionUP];

        emit CollectionRemoved(ownerUP, collectionUP);
    }

    function updateJoiningFee(address collectionUP, uint256 newJoiningFee) external override onlyCollectionOwner(collectionUP) collectionExists(collectionUP) {
        _collections[collectionUP].joiningFee = newJoiningFee;
    
        emit JoiningFeeUpdated(collectionUP, newJoiningFee);
    }

    // --- Membership Management
    function joinCollection(address collectionUP) external payable override collectionExists(collectionUP) {
        CollectionInfo memory collection = _collections[collectionUP];
        require(collection.collectionType == CollectionType.Open, "Collection is not open");
        require(!_collectionMembers[collectionUP].contains(msg.sender), "Already a member");

        // Handle joining fee
        if (collection.joiningFee > 0) {
            require(msg.value >= collection.joiningFee, "Insufficient joining fee");
            
            // Transfer fee to collection owner
            if (msg.value > 0) {
                (bool success, ) = payable(collection.owner).call{value: msg.value}("");
                require(success, "Fee transfer failed");
            }
        }

        _collectionMembers[collectionUP].add(msg.sender);
        _userCollections[msg.sender].add(collectionUP);

        emit UserJoinedCollection(msg.sender, collectionUP, collection.joiningFee);
    }

    function leaveCollection(address collectionUP) external override collectionExists(collectionUP) {
        require(_collectionMembers[collectionUP].contains(msg.sender), "Not a member");
        require(_collections[collectionUP].owner != msg.sender, "Owner cannot leave");

        _collectionMembers[collectionUP].remove(msg.sender);
        _userCollections[msg.sender].remove(collectionUP);

        emit UserLeftCollection(msg.sender, collectionUP);
    }

    // --- View Functions

    function getCollectionOwner(address collectionUP) external view override returns (address) {
        require(_collections[collectionUP].owner != address(0), "Collection does not exist");
        return _collections[collectionUP].owner;
    }

    function isCollectionOwnedBy(address collectionUP, address ownerUP) external view override returns (bool) {
        return _collections[collectionUP].owner != address(0) && _collections[collectionUP].owner == ownerUP;
    }

    function getCollectionType(address collectionUP) external view override returns (CollectionType) {
        require(_collections[collectionUP].owner != address(0), "Collection does not exist");
        return _collections[collectionUP].collectionType;
    }

    function getCollectionInfo(address collectionUP) external view override returns (
        address owner,
        CollectionType collectionType,
        uint256 joiningFee,
        address gatingToken
    ) {
        require(_collections[collectionUP].owner != address(0), "Collection does not exist");
        CollectionInfo memory collection = _collections[collectionUP];
        return (collection.owner, collection.collectionType, collection.joiningFee, collection.gatingToken);
    }

    function isMember(address collectionUP, address user) external view override returns (bool) {
        return _collections[collectionUP].owner != address(0) && _collectionMembers[collectionUP].contains(user);
    }

    function canMint(address collectionUP, address user) external view override returns (bool) {
        if (_collections[collectionUP].owner == address(0)) {
            return false;
        }

        CollectionInfo memory collection = _collections[collectionUP];

        // Owner can always mint
        if (user == collection.owner) {
            return true;
        }

        // Check based on collection type
        if (collection.collectionType == CollectionType.Private) {
            // Check LSP6 permissions
            return _hasLSP6Permission(collectionUP, user);
        } else if (collection.collectionType == CollectionType.Open) {
            // Check if user is a member
            return _collectionMembers[collectionUP].contains(user);
        } else if (collection.collectionType == CollectionType.TokenGated) {
            // Check if user owns the required token
            return _ownsGatingToken(collection.gatingToken, user);
        }

        return false;
    }

    function getCollectionMembers(address collectionUP) external view override returns (address[] memory) {
        require(_collections[collectionUP].owner != address(0), "Collection does not exist");
        return _collectionMembers[collectionUP].values();
    }

    function getCollectionMembersCount(address collectionUP) external view override returns (uint256) {
        require(_collections[collectionUP].owner != address(0), "Collection does not exist");
        return _collectionMembers[collectionUP].length();
    }

    function getAllCollections() external view override returns (address[] memory) {
        return _allCollections.values();
    }

    function getCollectionsByOwner(address owner) external view override returns (address[] memory) {
        return _ownerToCollections[owner].values();
    }

    // --- Internal Functions

    function _hasLSP6Permission(address collectionUP, address user) internal view returns (bool) {
        bytes memory allowedCalls = LSP6Utils.getAllowedCallsFor(
            IERC725Y(collectionUP),
            user
        );

        if (!LSP6Utils.isCompactBytesArrayOfAllowedCalls(allowedCalls)) {
            return false;
        }

        // Get the mintMoment function selector
        bytes4 mintMomentSelector = bytes4(keccak256("mintMoment(address,bytes,address)"));

        // Check for permission to call MomentFactory with mintMoment selector
        bytes memory expectedCall = abi.encodePacked(
            bytes4(0x00000002),      // CALL permission
            MOMENT_FACTORY,          // MomentFactory address
            bytes4(0xffffffff),      // any interface ID
            mintMomentSelector       // mintMoment function selector
        );

        uint256 pointer = 0;
        while (pointer < allowedCalls.length) {
            uint256 elementLength = uint16(
                bytes2(abi.encodePacked(
                    allowedCalls[pointer],
                    allowedCalls[pointer + 1]
                ))
            );

            bytes memory entry = new bytes(elementLength);
            for (uint256 i = 0; i < elementLength; i++) {
                entry[i] = allowedCalls[pointer + 2 + i];
            }

            if (keccak256(entry) == keccak256(expectedCall)) {
                return true;
            }

            pointer += elementLength + 2;
        }

        return false;
    }

    function _ownsGatingToken(address gatingToken, address user) internal view returns (bool) {
        if (gatingToken == address(0)) {
            return false;
        }

        // Check if the user is a Universal Profile with LSP5ReceivedAssets
        try IERC725Y(user).getData(_generateLSP5MapKey(gatingToken)) returns (bytes memory mapData) {
            // If the map key exists and has data, the user owns the asset
            return mapData.length > 0;
        } catch {
            // User is not a UP or doesn't have LSP5ReceivedAssets
        }

        return false;
    }

    
    function _generateLSP5MapKey(address assetAddress) internal pure returns (bytes32) {
        return LSP2Utils.generateMappingKey(_LSP5_RECEIVED_ASSETS_MAP_KEY_PREFIX, bytes20(assetAddress));
    }

    // --- Migration function

    function migrateLegacyCollections(
        address[] calldata collections,
        address[] calldata owners
    ) external onlyOwner {
        require(collections.length == owners.length, "Array length mismatch");

        for (uint256 i = 0; i < collections.length; i++) {
            address collectionUP = collections[i];
            address ownerUP = owners[i];
            
            if (_collections[collectionUP].owner != address(0)) {
                continue;
            }

            require(collectionUP != address(0), "Invalid collection address");
            require(ownerUP != address(0), "Invalid owner address");

            // All legacy collections are Private type with no fees and no gating
            _collections[collectionUP] = CollectionInfo({
                owner: ownerUP,
                collectionType: CollectionType.Private,
                joiningFee: 0,
                gatingToken: address(0)
            });

            _ownerToCollections[ownerUP].add(collectionUP);
            _allCollections.add(collectionUP);

            // Owner is automatically a member
            _collectionMembers[collectionUP].add(ownerUP);
            _userCollections[ownerUP].add(collectionUP);

            emit CollectionCreated(ownerUP, collectionUP, CollectionType.Private, 0, address(0));
        }
    }
}
