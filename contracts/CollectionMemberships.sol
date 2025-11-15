// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {IERC725Y} from "@erc725/smart-contracts/contracts/interfaces/IERC725Y.sol";
import {MomentFactory} from "./MomentFactory.sol";
import {LSP6Utils} from "@lukso/lsp-smart-contracts/contracts/LSP6KeyManager/LSP6Utils.sol";
import {_PERMISSION_CALL} from "@lukso/lsp-smart-contracts/contracts/LSP6KeyManager/LSP6Constants.sol";

contract CollectionMemberships {
    using EnumerableSet for EnumerableSet.AddressSet;

    // Storage
    mapping(address => EnumerableSet.AddressSet) private _memberCollections;
    mapping(address => EnumerableSet.AddressSet) private _collectionMembers;
    MomentFactory public immutable momentFactory;

    // Events
    event MembershipGranted(address indexed member, address indexed collection, address indexed collectionOwner);
    event MembershipRevoked(address indexed member, address indexed collection, address indexed collectionOwner);

    constructor(address _momentFactory) {
        require(_momentFactory != address(0), "Invalid MomentFactory address");
        momentFactory = MomentFactory(payable(_momentFactory));
    }

    modifier onlyCollectionOwner(address collection) {
        address collectionOwnerUP = momentFactory.getCollectionOwner(collection);
        
        if (msg.sender == collectionOwnerUP) {
            _;
            return;
        }

        bytes32 permissions = LSP6Utils.getPermissionsFor(
            IERC725Y(collectionOwnerUP),
            msg.sender
        );

        require(
            LSP6Utils.hasPermission(permissions, _PERMISSION_CALL),
            "Caller is not authorized for collection owner UP"
        );
        _;
    }

    function addMembership(address member, address collection) 
        external 
        onlyCollectionOwner(collection) 
    {
        require(member != address(0), "Invalid member address");
        require(collection != address(0), "Invalid collection address");
        
        _memberCollections[member].add(collection);
        _collectionMembers[collection].add(member);
        
        emit MembershipGranted(member, collection, msg.sender);
    }

    function addMembershipBatch(address[] calldata members, address collection) 
        external 
        onlyCollectionOwner(collection) 
    {
        for (uint i = 0; i < members.length; i++) {
            address member = members[i];
            require(member != address(0), "Invalid member address");
            
            _memberCollections[member].add(collection);
            _collectionMembers[collection].add(member);
            
            emit MembershipGranted(member, collection, msg.sender);
        }
    }

    function revokeMembership(address member, address collection) 
        external 
        onlyCollectionOwner(collection) 
    {
        require(member != address(0), "Invalid member address");
        require(collection != address(0), "Invalid collection address");
        
        _memberCollections[member].remove(collection);
        _collectionMembers[collection].remove(member);
        
        emit MembershipRevoked(member, collection, msg.sender);
    }

    function revokeMembershipBatch(address[] calldata members, address collection) 
        external 
        onlyCollectionOwner(collection) 
    {
        require(collection != address(0), "Invalid collection address");
        
        for (uint i = 0; i < members.length; i++) {
            address member = members[i];
            require(member != address(0), "Invalid member address");
            
            _memberCollections[member].remove(collection);
            _collectionMembers[collection].remove(member);
            
            emit MembershipRevoked(member, collection, msg.sender);
        }
    }

    // View functions
    function getMemberCollections(address member) external view returns (address[] memory) {
        return _memberCollections[member].values();
    }

    function getCollectionMembers(address collection) external view returns (address[] memory) {
        return _collectionMembers[collection].values();
    }

    function isMemberOfCollection(address member, address collection) external view returns (bool) {
        return _memberCollections[member].contains(collection);
    }

    function getMemberCollectionsCount(address member) external view returns (uint256) {
        return _memberCollections[member].length();
    }

    function getCollectionMembersCount(address collection) external view returns (uint256) {
        return _collectionMembers[collection].length();
    }
} 