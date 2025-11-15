// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ICollectionRegistry {
    // --- Enums
    enum CollectionType {
        Private,
        Open,
        TokenGated
    }

    // --- Events
    event CollectionCreated(
        address indexed owner,
        address indexed collectionUP,
        CollectionType collectionType,
        uint256 joiningFee,
        address gatingToken
    );
    event CollectionRemoved(address indexed owner, address indexed collectionUP);
    event UserJoinedCollection(address indexed user, address indexed collectionUP, uint256 fee);
    event UserLeftCollection(address indexed user, address indexed collectionUP);
    event JoiningFeeUpdated(address indexed collectionUP, uint256 newJoiningFee);

    // --- Collection Management
    function createCollection(
        address collectionUP,
        address controllerUP,
        address ownerUP,
        CollectionType collectionType,
        uint256 joiningFee,
        address gatingToken
    ) external;

    function removeCollection(address collectionUP) external;

    function updateJoiningFee(address collectionUP, uint256 newJoiningFee) external;

    // --- Membership Management
    function joinCollection(address collectionUP) external payable;

    function leaveCollection(address collectionUP) external;

    // --- View Functions
    function getCollectionOwner(address collectionUP) external view returns (address);

    function isCollectionOwnedBy(address collectionUP, address ownerUP) external view returns (bool);

    function getCollectionType(address collectionUP) external view returns (CollectionType);

    function getCollectionInfo(address collectionUP) external view returns (
        address owner,
        CollectionType collectionType,
        uint256 joiningFee,
        address gatingToken
    );

    function isMember(address collectionUP, address user) external view returns (bool);

    function canMint(address collectionUP, address user) external view returns (bool);

    function getCollectionMembers(address collectionUP) external view returns (address[] memory);

    function getCollectionMembersCount(address collectionUP) external view returns (uint256);

    function getAllCollections() external view returns (address[] memory);

    function getCollectionsByOwner(address owner) external view returns (address[] memory);
}
