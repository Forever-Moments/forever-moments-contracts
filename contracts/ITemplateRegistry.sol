// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ITemplateRegistry {
    function publishTemplate(
        bytes32 templateId,
        uint32 version,
        uint256 chainId,
        uint256 permissions,
        bytes calldata allowedCalls,
        bytes calldata allowedERC725YDataKeys,
        string calldata metadataURI
    ) external;

    function deprecateTemplate(
        bytes32 templateId,
        uint32 version,
        bool deprecated
    ) external;

    function getTemplate(
        address publisherUP,
        bytes32 templateId,
        uint32 version
    )
        external
        view
        returns (
            uint256 chainId,
            uint256 permissions,
            bytes memory allowedCalls,
            bytes memory allowedERC725YDataKeys,
            string memory metadataURI,
            bool deprecated
        );

    function getLatestVersion(
        address publisherUP,
        bytes32 templateId
    ) external view returns (uint32);
}

