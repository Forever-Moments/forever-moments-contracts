// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {ERC165Checker} from "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";

import {LSP8Mintable} from "@lukso/lsp-smart-contracts/contracts/LSP8IdentifiableDigitalAsset/presets/LSP8Mintable.sol";
import {_LSP8_TOKENID_FORMAT_HASH} from "@lukso/lsp-smart-contracts/contracts/LSP8IdentifiableDigitalAsset/LSP8Constants.sol";
import {_LSP4_TOKEN_TYPE_COLLECTION, _LSP4_METADATA_KEY} from "@lukso/lsp-smart-contracts/contracts/LSP4DigitalAssetMetadata/LSP4Constants.sol";
import {IERC725Y} from "@erc725/smart-contracts/contracts/interfaces/IERC725Y.sol";
import {ILSP0ERC725Account} from "@lukso/lsp0-contracts/contracts/ILSP0ERC725Account.sol";

contract PermissionControl is LSP8Mintable {
    struct TemplateData {
        address publisherUP;
        bytes32 templateId;
        uint32 version;
        uint256 chainId;
        uint256 permissions;
        bytes allowedCalls;
        bytes allowedERC725YDataKeys;
        string metadataURI;
        bool deprecated;
    }

    error PublisherMustBeUniversalProfile(address sender);
    error InvalidVersion();
    error TemplateAlreadyExists(address publisherUP, bytes32 templateId, uint32 version);
    error TemplateDoesNotExist(address publisherUP, bytes32 templateId, uint32 version);
    error TemplateTokenDoesNotExist(bytes32 tokenId);
    error NotTemplateOwner(address caller, bytes32 tokenId);
    error IncorrectMintFee(uint256 expected, uint256 actual);
    error InvalidWithdrawAddress();
    error InsufficientBalance(uint256 balance, uint256 requested);
    error WithdrawFailed();

    event TemplateMinted(
        address indexed publisherUP,
        bytes32 indexed templateId,
        uint32 indexed version,
        bytes32 tokenId,
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
        bytes32 tokenId,
        bool deprecated
    );
    event MintPriceUpdated(uint256 oldPrice, uint256 newPrice);
    event Withdrawal(address indexed to, uint256 amount);

    uint256 public mintPrice = 10 ether;

    mapping(bytes32 => TemplateData) private _templatesByTokenId;
    mapping(bytes32 => bytes32) private _templateTokenIds;
    mapping(address => mapping(bytes32 => uint32)) private _latestVersion;
    mapping(bytes32 => bool) private _templateExists;

    bytes4 private constant _INTERFACEID_ERC725X = 0x7545acac;
    bytes4 private constant _INTERFACEID_ERC725Y = type(IERC725Y).interfaceId;
    bytes4 private constant _INTERFACEID_LSP0 = type(ILSP0ERC725Account).interfaceId;

    /**
     * @param collectionLsp4Metadata_ ERC725Y value for `LSP4Metadata` on the collection contract: LSP-2 VerifiableURI
     *        (see LSP-2 ERC725Y JSON Schema — VerifiableURI in the LUKSO LIPs repo).
     *        Encode off-chain (e.g. ERC725 encodeData for LSP4Metadata) or match other LSP8 factory deployments in this repo.
     */
    constructor(
        string memory name_,
        string memory symbol_,
        address owner_,
        bytes memory collectionLsp4Metadata_
    )
        LSP8Mintable(
            name_,
            symbol_,
            owner_,
            _LSP4_TOKEN_TYPE_COLLECTION,
            _LSP8_TOKENID_FORMAT_HASH
        )
    {
        _setData(_LSP4_METADATA_KEY, collectionLsp4Metadata_);
    }

    function publishTemplate(
        bytes32 templateId,
        uint32 version,
        uint256 chainId,
        uint256 permissions,
        bytes calldata allowedCalls,
        bytes calldata allowedERC725YDataKeys,
        string calldata metadataURI
    ) external payable returns (bytes32 tokenId) {
        _requirePublisherIsUP();
        if (version == 0) revert InvalidVersion();
        if (msg.value != mintPrice) revert IncorrectMintFee(mintPrice, msg.value);

        bytes32 templateKey = _templateKey(msg.sender, templateId, version);
        if (_templateExists[templateKey]) {
            revert TemplateAlreadyExists(msg.sender, templateId, version);
        }

        tokenId = templateKey;
        _templateExists[templateKey] = true;
        _templateTokenIds[templateKey] = tokenId;

        _templatesByTokenId[tokenId] = TemplateData({
            publisherUP: msg.sender,
            templateId: templateId,
            version: version,
            chainId: chainId,
            permissions: permissions,
            allowedCalls: allowedCalls,
            allowedERC725YDataKeys: allowedERC725YDataKeys,
            metadataURI: metadataURI,
            deprecated: false
        });

        _mint(msg.sender, tokenId, true, "");
        _setDataForTokenId(tokenId, _LSP4_METADATA_KEY, _encodeVerifiableURI(metadataURI));

        uint32 currentLatest = _latestVersion[msg.sender][templateId];
        if (version > currentLatest) {
            _latestVersion[msg.sender][templateId] = version;
        }

        emit TemplateMinted(
            msg.sender,
            templateId,
            version,
            tokenId,
            chainId,
            permissions,
            allowedCalls,
            allowedERC725YDataKeys,
            metadataURI
        );
    }

    function deprecateTemplate(bytes32 tokenId, bool deprecated) external {
        if (!_exists(tokenId)) revert TemplateTokenDoesNotExist(tokenId);
        if (tokenOwnerOf(tokenId) != msg.sender) revert NotTemplateOwner(msg.sender, tokenId);

        TemplateData storage template = _templatesByTokenId[tokenId];
        template.deprecated = deprecated;

        emit TemplateDeprecated(
            template.publisherUP,
            template.templateId,
            template.version,
            tokenId,
            deprecated
        );
    }

    function getTemplateByTokenId(bytes32 tokenId) external view returns (TemplateData memory) {
        if (!_exists(tokenId)) revert TemplateTokenDoesNotExist(tokenId);
        return _templatesByTokenId[tokenId];
    }

    function getTemplate(
        address publisherUP,
        bytes32 templateId,
        uint32 version
    ) external view returns (TemplateData memory template, bytes32 tokenId) {
        if (version == 0) revert InvalidVersion();
        bytes32 key = _templateKey(publisherUP, templateId, version);
        if (!_templateExists[key]) {
            revert TemplateDoesNotExist(publisherUP, templateId, version);
        }
        tokenId = _templateTokenIds[key];
        template = _templatesByTokenId[tokenId];
    }

    function getTemplateTokenId(
        address publisherUP,
        bytes32 templateId,
        uint32 version
    ) external view returns (bytes32 tokenId) {
        if (version == 0) revert InvalidVersion();
        bytes32 key = _templateKey(publisherUP, templateId, version);
        if (!_templateExists[key]) {
            revert TemplateDoesNotExist(publisherUP, templateId, version);
        }
        return _templateTokenIds[key];
    }

    function existsTemplate(address publisherUP, bytes32 templateId, uint32 version) external view returns (bool) {
        if (version == 0) return false;
        return _templateExists[_templateKey(publisherUP, templateId, version)];
    }

    function getLatestVersion(address publisherUP, bytes32 templateId) external view returns (uint32) {
        return _latestVersion[publisherUP][templateId];
    }

    function setMintPrice(uint256 newPrice) external onlyOwner {
        uint256 oldPrice = mintPrice;
        mintPrice = newPrice;
        emit MintPriceUpdated(oldPrice, newPrice);
    }

    function withdraw(address payable to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert InvalidWithdrawAddress();

        uint256 balance = address(this).balance;
        uint256 amountToWithdraw = amount == 0 ? balance : amount;

        if (amountToWithdraw > balance) {
            revert InsufficientBalance(balance, amountToWithdraw);
        }

        (bool success, ) = to.call{value: amountToWithdraw}("");
        if (!success) revert WithdrawFailed();

        emit Withdrawal(to, amountToWithdraw);
    }

    function _requirePublisherIsUP() internal view {
        if (msg.sender.code.length == 0) {
            revert PublisherMustBeUniversalProfile(msg.sender);
        }

        bool supportsLSP0 = ERC165Checker.supportsInterface(msg.sender, _INTERFACEID_LSP0);
        bool supportsERC725X = ERC165Checker.supportsInterface(msg.sender, _INTERFACEID_ERC725X);
        bool supportsERC725Y = ERC165Checker.supportsInterface(msg.sender, _INTERFACEID_ERC725Y);
        if (!(supportsLSP0 || (supportsERC725X && supportsERC725Y))) {
            revert PublisherMustBeUniversalProfile(msg.sender);
        }
    }

    function _templateKey(address publisherUP, bytes32 templateId, uint32 version) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(publisherUP, templateId, version));
    }

    /**
     * @dev LSP-2 VerifiableURI with no verification (`verificationMethod` and verification data length are zero).
     *      Encoded URI is UTF-8 bytes of `uri` (e.g. `ipfs://...`).
     */
    function _encodeVerifiableURI(string memory uri) internal pure returns (bytes memory) {
        return abi.encodePacked(bytes2(0), bytes4(0), bytes2(0), bytes(uri));
    }
}
