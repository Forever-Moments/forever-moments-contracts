// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {ERC165Checker} from "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";

import {IERC725Y} from "@erc725/smart-contracts/contracts/interfaces/IERC725Y.sol";

import {ITemplateRegistry} from "./ITemplateRegistry.sol";

/**
 * @title PermissionsOnchainTemplateRegistry
 * @notice Businesses (Universal Profiles) can publish immutable LSP6 permission templates onchain.
 *
 * @dev
 * - Publisher must be a contract exposing ERC725X and ERC725Y capabilities.
 * - Data is stored in ERC725Y-style key/value storage using deterministic LSP2 mapping keys.
 * - External ERC725Y setters are disabled (read-only); publishing happens through the registry API.
 */
contract PermissionsOnchainTemplateRegistry is IERC165, IERC725Y, ITemplateRegistry {
    // --- Errors ---

    error PublisherMustBeUniversalProfile(address sender);
    error InvalidVersion();
    error TemplateAlreadyExists(address publisherUP, bytes32 templateId, uint32 version);
    error TemplateDoesNotExist(address publisherUP, bytes32 templateId, uint32 version);
    error ERC725YReadOnly();

    // --- Events (indexing) ---

    event TemplatePublished(
        address indexed publisherUP,
        bytes32 indexed templateId,
        uint32 indexed version,
        uint256 chainId,
        uint256 permissions,
        bytes allowedCalls,
        bytes allowedERC725YDataKeys,
        string metadataURI
    );

    event TemplateDeprecated(
        address indexed publisherUP,
        bytes32 indexed templateId,
        uint32 indexed version,
        bool deprecated
    );

    // --- ERC725Y storage ---

    mapping(bytes32 => bytes) private _store;

    // --- LSP2 mapping prefixes (bytes12) for the exact mapping names required ---

    bytes12 private constant _PREFIX_CHAIN_ID = 0x8433c0f99c6b469e58fe0000;
    bytes12 private constant _PREFIX_PERMISSIONS = 0x1ae13c51d491d18cf2340000;
    bytes12 private constant _PREFIX_ALLOWED_CALLS = 0x2543223386ce66feaf200000;
    bytes12 private constant _PREFIX_ALLOWED_ERC725Y_DATA_KEYS = 0x5cc3ff3dc8d6531e51af0000;
    bytes12 private constant _PREFIX_METADATA_URI = 0x5a5a852a7f77281fc9670000;
    bytes12 private constant _PREFIX_DEPRECATED = 0xa00359bcbbd4510c9ea20000;
    bytes12 private constant _PREFIX_EXISTS = 0xf7f8309273b315c453670000;
    bytes12 private constant _PREFIX_LATEST_VERSION = 0x27ce4d041e3b14bc47de0000;

    bytes4 private constant _INTERFACEID_ERC725X = 0x7545acac;
    bytes4 private constant _INTERFACEID_ERC725Y = type(IERC725Y).interfaceId;

    // --- IERC165 ---

    function supportsInterface(bytes4 interfaceId) public pure override returns (bool) {
        return interfaceId == type(IERC165).interfaceId
            || interfaceId == type(IERC725Y).interfaceId
            || interfaceId == type(ITemplateRegistry).interfaceId;
    }

    // --- IERC725Y (read) ---

    function getData(bytes32 dataKey) external view override returns (bytes memory dataValue) {
        return _store[dataKey];
    }

    function getDataBatch(
        bytes32[] memory dataKeys
    ) external view override returns (bytes[] memory dataValues) {
        uint256 length = dataKeys.length;
        dataValues = new bytes[](length);
        for (uint256 i = 0; i < length; i++) {
            dataValues[i] = _store[dataKeys[i]];
        }
    }

    // --- IERC725Y (write) disabled (registry is not a generic key/value store) ---

    function setData(bytes32, bytes memory) external payable override {
        revert ERC725YReadOnly();
    }

    function setDataBatch(bytes32[] memory, bytes[] memory) external payable override {
        revert ERC725YReadOnly();
    }

    // --- ITemplateRegistry ---

    function publishTemplate(
        bytes32 templateId,
        uint32 version,
        uint256 chainId,
        uint256 permissions,
        bytes calldata allowedCalls,
        bytes calldata allowedERC725YDataKeys,
        string calldata metadataURI
    ) external override {
        _requirePublisherIsUP();
        if (version == 0) revert InvalidVersion();

        bytes32 templateKey = keccak256(abi.encodePacked(msg.sender, templateId, version));

        // immutability per (publisherUP, templateId, version)
        bytes32 existsKey = _lsp2MappingKey(_PREFIX_EXISTS, templateKey);
        if (_isTrue(_store[existsKey])) {
            revert TemplateAlreadyExists(msg.sender, templateId, version);
        }

        _setData(existsKey, abi.encodePacked(bytes1(0x01)));

        _setData(_lsp2MappingKey(_PREFIX_CHAIN_ID, templateKey), abi.encodePacked(bytes32(uint256(chainId))));
        _setData(_lsp2MappingKey(_PREFIX_PERMISSIONS, templateKey), abi.encodePacked(bytes32(uint256(permissions))));
        _setDataCalldata(_lsp2MappingKey(_PREFIX_ALLOWED_CALLS, templateKey), allowedCalls);
        _setDataCalldata(
            _lsp2MappingKey(_PREFIX_ALLOWED_ERC725Y_DATA_KEYS, templateKey),
            allowedERC725YDataKeys
        );
        _setData(_lsp2MappingKey(_PREFIX_METADATA_URI, templateKey), bytes(metadataURI));
        _setData(_lsp2MappingKey(_PREFIX_DEPRECATED, templateKey), abi.encodePacked(bytes1(0x00)));

        _updateLatestVersion(msg.sender, templateId, version);

        emit TemplatePublished(
            msg.sender,
            templateId,
            version,
            chainId,
            permissions,
            allowedCalls,
            allowedERC725YDataKeys,
            metadataURI
        );
    }

    function deprecateTemplate(bytes32 templateId, uint32 version, bool deprecated) external override {
        _requirePublisherIsUP();
        if (version == 0) revert InvalidVersion();

        address publisherUP = msg.sender;
        bytes32 templateKey = keccak256(abi.encodePacked(publisherUP, templateId, version));
        bytes32 existsKey = _lsp2MappingKey(_PREFIX_EXISTS, templateKey);
        if (!_isTrue(_store[existsKey])) {
            revert TemplateDoesNotExist(publisherUP, templateId, version);
        }

        bytes32 deprecatedKey = _lsp2MappingKey(_PREFIX_DEPRECATED, templateKey);
        _setData(deprecatedKey, abi.encodePacked(bytes1(deprecated ? 0x01 : 0x00)));

        emit TemplateDeprecated(publisherUP, templateId, version, deprecated);
    }

    function getTemplate(
        address publisherUP,
        bytes32 templateId,
        uint32 version
    )
        external
        view
        override
        returns (
            uint256 chainId,
            uint256 permissions,
            bytes memory allowedCalls,
            bytes memory allowedERC725YDataKeys,
            string memory metadataURI,
            bool deprecated
        )
    {
        if (version == 0) revert InvalidVersion();

        bytes32 templateKey = keccak256(abi.encodePacked(publisherUP, templateId, version));
        bytes32 existsKey = _lsp2MappingKey(_PREFIX_EXISTS, templateKey);
        if (!_isTrue(_store[existsKey])) {
            revert TemplateDoesNotExist(publisherUP, templateId, version);
        }

        chainId = uint256(bytes32(_store[_lsp2MappingKey(_PREFIX_CHAIN_ID, templateKey)]));
        permissions = uint256(bytes32(_store[_lsp2MappingKey(_PREFIX_PERMISSIONS, templateKey)]));
        allowedCalls = _store[_lsp2MappingKey(_PREFIX_ALLOWED_CALLS, templateKey)];
        allowedERC725YDataKeys = _store[_lsp2MappingKey(_PREFIX_ALLOWED_ERC725Y_DATA_KEYS, templateKey)];
        metadataURI = string(_store[_lsp2MappingKey(_PREFIX_METADATA_URI, templateKey)]);
        deprecated = _isTrue(_store[_lsp2MappingKey(_PREFIX_DEPRECATED, templateKey)]);
    }

    function getLatestVersion(address publisherUP, bytes32 templateId) external view override returns (uint32) {
        bytes32 seriesKey = keccak256(abi.encodePacked(publisherUP, templateId));
        bytes32 latestKey = _lsp2MappingKey(_PREFIX_LATEST_VERSION, seriesKey);
        return _asUint32(_store[latestKey]);
    }

    // --- Internals ---

    function _requirePublisherIsUP() internal view {
        if (msg.sender.code.length == 0) {
            revert PublisherMustBeUniversalProfile(msg.sender);
        }

        bool supportsERC725X = ERC165Checker.supportsInterface(msg.sender, _INTERFACEID_ERC725X);
        bool supportsERC725Y = ERC165Checker.supportsInterface(msg.sender, _INTERFACEID_ERC725Y);
        if (!(supportsERC725X && supportsERC725Y)) {
            revert PublisherMustBeUniversalProfile(msg.sender);
        }
    }

    function _setData(bytes32 dataKey, bytes memory dataValue) internal {
        _store[dataKey] = dataValue;
        emit DataChanged(dataKey, dataValue);
    }

    function _setDataCalldata(bytes32 dataKey, bytes calldata dataValue) internal {
        bytes memory v = dataValue;
        _setData(dataKey, v);
    }

    function _updateLatestVersion(address publisherUP, bytes32 templateId, uint32 version) internal {
        // update latest version (monotonic max)
        bytes32 seriesKey = keccak256(abi.encodePacked(publisherUP, templateId));
        bytes32 latestKey = _lsp2MappingKey(_PREFIX_LATEST_VERSION, seriesKey);
        uint32 currentLatest = _asUint32(_store[latestKey]);
        if (version > currentLatest) {
            _setData(latestKey, abi.encodePacked(bytes32(uint256(version))));
        }
    }

    function _lsp2MappingKey(bytes12 prefix, bytes32 logicalKey) internal pure returns (bytes32) {
        bytes32 inner = keccak256(abi.encodePacked(logicalKey));
        bytes20 suffix = bytes20(uint160(uint256(inner)));
        return bytes32(bytes.concat(prefix, suffix));
    }

    function _isTrue(bytes memory v) internal pure returns (bool) {
        return v.length == 1 && v[0] == bytes1(0x01);
    }

    function _asUint32(bytes memory v) internal pure returns (uint32) {
        if (v.length == 0) return 0;
        if (v.length != 32) return 0;
        return uint32(uint256(bytes32(v)));
    }
}

