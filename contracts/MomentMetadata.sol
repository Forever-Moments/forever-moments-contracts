// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Import LUKSO Standards
import {ERC725Y} from "@erc725/smart-contracts/contracts/ERC725Y.sol";
import {LSP7DigitalAsset} from "@lukso/lsp-smart-contracts/contracts/LSP7DigitalAsset/LSP7DigitalAsset.sol";
import {_LSP8_REFERENCE_CONTRACT} from "@lukso/lsp-smart-contracts/contracts/LSP8IdentifiableDigitalAsset/LSP8Constants.sol";
import {_LSP4_METADATA_KEY} from "@lukso/lsp-smart-contracts/contracts/LSP4DigitalAssetMetadata/LSP4Constants.sol";
import {ILSP1UniversalReceiver} from "@lukso/lsp1-contracts/contracts/ILSP1UniversalReceiver.sol";
import {ILSP1UniversalReceiverDelegate} from "@lukso/lsp1-contracts/contracts/ILSP1UniversalReceiverDelegate.sol";
import {LSP17Extendable} from "@lukso/lsp17contractextension-contracts/contracts/LSP17Extendable.sol";
import {LSP1Utils} from "@lukso/lsp1-contracts/contracts/LSP1Utils.sol";
import {LSP2Utils} from "@lukso/lsp2-contracts/contracts/LSP2Utils.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

// Constants
import {
    _INTERFACEID_LSP1,
    _INTERFACEID_LSP1_DELEGATE,
    _LSP1_UNIVERSAL_RECEIVER_DELEGATE_PREFIX,
    _LSP1_UNIVERSAL_RECEIVER_DELEGATE_KEY
} from "@lukso/lsp1-contracts/contracts/LSP1Constants.sol";
import {_LSP17_EXTENSION_PREFIX} from "@lukso/lsp17contractextension-contracts/contracts/LSP17Constants.sol";
import {
    _INTERFACEID_LSP0,
    _TYPEID_LSP0_VALUE_RECEIVED
} from "@lukso/lsp0-contracts/contracts/LSP0Constants.sol";

contract MomentMetadata is ERC725Y, ILSP1UniversalReceiver {
    bytes32 public constant _MOMENT_METADATA_KEY = 0x3569795c73940696ea152d91d7bf7a2a1543fcf430ff086ba45e1de82f924e81;
    bytes32 public constant TYPE_ID_LSP7_RECEIVED = 0x20804611b3e2ea21c480dc465142210acf4a2485947541770ec1fb87dee4a55c;

    LSP7DigitalAsset public likesToken;
    address public collectionOwner;
    uint256 public totalLikesWithdrawn;
    address public immutable MOMENT_URD;

    // Events
    event LSP4MetadataUpdated(bytes32 indexed tokenId, bytes metadataURI, string description);
    event MetadataUpdated(bytes32 indexed tokenId, bytes metadataURI, string description);
    event LikesWithdrawn(address indexed owner, uint256 amount);

    constructor(
        address _momentOwner, 
        address _momentFactory, 
        bytes memory _metadataURI, 
        bytes memory _LSP4MetadataURI,
        address _likesToken,
        address _collectionOwner,
        address _momentURD
    ) ERC725Y(_momentOwner) {
        MOMENT_URD = _momentURD;
        _setData(
            _LSP8_REFERENCE_CONTRACT,
            abi.encodePacked(_momentFactory, bytes32(bytes20(address(this))))
        );

        _setData(_MOMENT_METADATA_KEY, _metadataURI);
        _setData(_LSP4_METADATA_KEY, _LSP4MetadataURI);

        likesToken = LSP7DigitalAsset(payable(_likesToken));
        collectionOwner = _collectionOwner;

        bytes32 key = LSP2Utils.generateMappingKey(
            _LSP1_UNIVERSAL_RECEIVER_DELEGATE_PREFIX,
            bytes20(TYPE_ID_LSP7_RECEIVED)
        );
        _setData(key, abi.encodePacked(MOMENT_URD));
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return 
            interfaceId == type(ILSP1UniversalReceiver).interfaceId || 
            super.supportsInterface(interfaceId);
    }

    function universalReceiver(
        bytes32 typeId,
        bytes memory receivedData
    ) public payable virtual override returns (bytes memory returnedValues) {
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
        emit UniversalReceiver(msg.sender, msg.value, typeId, receivedData, returnedValues);
        return returnedValues;
    }

    // --- Moment metadata updates ---
    function setLSP4Metadata(bytes32 tokenId, bytes calldata metadataURI) external onlyOwner {
        _setData(_LSP4_METADATA_KEY, metadataURI);
        emit LSP4MetadataUpdated(tokenId, metadataURI, "Metadata updated");
    }

    function setMomentMetadata(bytes32 tokenId, bytes calldata metadataURI) external onlyOwner {
        _setData(_MOMENT_METADATA_KEY, metadataURI);
        emit MetadataUpdated(tokenId, metadataURI, "Metadata updated");
    }

    // --- LIKES ---
    function withdrawLikes(uint256 amount) external {
        require(msg.sender == owner(), "Only owner can withdraw");
        require(amount > 0, "Amount must be greater than 0");

        uint256 availableLikes = likesToken.balanceOf(address(this));
        require(amount <= availableLikes, "Not enough LIKES available for withdrawal");

        likesToken.transfer(address(this), msg.sender, amount, true, abi.encodePacked("Likes withdrawn"));

        emit LikesWithdrawn(msg.sender, amount);
    }

    function getWithdrawnLikes() external view returns (uint256) {
        return totalLikesWithdrawn;
    }
}


