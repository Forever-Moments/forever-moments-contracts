// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Imports
import {ERC725Y} from "@erc725/smart-contracts/contracts/ERC725Y.sol";
import {LSP7DigitalAsset} from "@lukso/lsp-smart-contracts/contracts/LSP7DigitalAsset/LSP7DigitalAsset.sol";
import {ILSP8IdentifiableDigitalAsset} from "@lukso/lsp-smart-contracts/contracts/LSP8IdentifiableDigitalAsset/ILSP8IdentifiableDigitalAsset.sol";
import {_LSP8_REFERENCE_CONTRACT} from "@lukso/lsp-smart-contracts/contracts/LSP8IdentifiableDigitalAsset/LSP8Constants.sol";
import {_LSP4_METADATA_KEY} from "@lukso/lsp-smart-contracts/contracts/LSP4DigitalAssetMetadata/LSP4Constants.sol";
import {ILSP1UniversalReceiver} from "@lukso/lsp1-contracts/contracts/ILSP1UniversalReceiver.sol";
import {ILSP1UniversalReceiverDelegate} from "@lukso/lsp1-contracts/contracts/ILSP1UniversalReceiverDelegate.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC725Y} from "@erc725/smart-contracts/contracts/interfaces/IERC725Y.sol";
import {
    _INTERFACEID_LSP1_DELEGATE,
    _LSP1_UNIVERSAL_RECEIVER_DELEGATE_PREFIX,
    _LSP1_UNIVERSAL_RECEIVER_DELEGATE_KEY
} from "@lukso/lsp1-contracts/contracts/LSP1Constants.sol";
import {_TYPEID_LSP0_VALUE_RECEIVED} from "@lukso/lsp0-contracts/contracts/LSP0Constants.sol";
import {_PERMISSION_CHANGEOWNER, _LSP6KEY_ADDRESSPERMISSIONS_PERMISSIONS_PREFIX} from "@lukso/lsp-smart-contracts/contracts/LSP6KeyManager/LSP6Constants.sol";
import {LSP2Utils} from "@lukso/lsp2-contracts/contracts/LSP2Utils.sol";
import {LSP6Utils} from "@lukso/lsp-smart-contracts/contracts/LSP6KeyManager/LSP6Utils.sol";

/**
 * @title MomentV2
 * @dev Implementation contract for Moment proxies
 * @notice This contract contains all the logic for Moment functionality
 *         Proxies delegate calls to this contract to save gas
 */
contract MomentV2 is ERC725Y, ILSP1UniversalReceiver {
    bytes32 public constant TYPE_ID_LSP7_RECEIVED = 0x20804611b3e2ea21c480dc465142210acf4a2485947541770ec1fb87dee4a55c;
        
    LSP7DigitalAsset public likesToken;
    address public collectionOwner;
    address public MOMENT_URD;
    address public MOMENT_FACTORY;
    uint256 public salePrice;
    bool private _initialized;

    // Events
    event LSP4MetadataUpdated(bytes32 indexed tokenId, bytes metadataURI);
    event LikesWithdrawn(address indexed owner, uint256 amount);
    event MomentListedForSale(uint256 indexed price, address indexed seller);
    event MomentRemovedFromSale(address indexed seller);
    event MomentPurchased(address indexed buyer, address indexed seller, uint256 price);
    event PurchaseFeeDistributed(address indexed collectionOwner, uint256 collectionOwnerFee, uint256 platformFee);

    function owner() public view override returns (address) {
        if (!_initialized) {
            return super.owner();
        }
        
        bytes32 tokenId = bytes32(uint256(uint160(address(this))));
        try ILSP8IdentifiableDigitalAsset(MOMENT_FACTORY).tokenOwnerOf(tokenId) returns (address tokenOwner) {
            return tokenOwner;
        } catch {
            return super.owner();
        }
    }

    function transferOwnership(address /* newOwner */) public virtual override {
        if (_initialized) {
            bytes32 tokenId = bytes32(uint256(uint160(address(this))));
            try ILSP8IdentifiableDigitalAsset(MOMENT_FACTORY).tokenOwnerOf(tokenId) returns (address currentTokenOwner) {
                address previousOwner = super.owner();
                _setOwner(currentTokenOwner);
                
                if (previousOwner != currentTokenOwner && salePrice > 0) {
                    salePrice = 0;
                    emit MomentRemovedFromSale(previousOwner);
                }
            } catch {
                // If token doesn't exist or factory call fails, do nothing
                // This prevents reverts during construction or if token is burned
            }
        }
    }

    /**
     * @dev Constructor for the implementation contract
     * @param _initialOwner The initial owner (can be address(0) for implementation)
     */
    constructor(address _initialOwner) ERC725Y(_initialOwner) {
        // Implementation contract constructor
        // The actual initialization happens in the initialize() function
        // Set some default values to prevent constructor issues
        MOMENT_FACTORY = address(0);
        MOMENT_URD = address(0);
        collectionOwner = address(0);
        likesToken = LSP7DigitalAsset(payable(address(0)));
        salePrice = 0;
        _initialized = false;
    }

    /**
     * @dev Initialize the proxy with Moment data
     * @param _momentOwner The initial owner of the moment
     * @param _momentFactory The factory contract address
     * @param _metadataURI The metadata URI for the moment
     * @param _likesToken The LIKES token contract address
     * @param _collectionOwner The collection owner address
     * @param _momentURD The Universal Receiver Delegate address
     */
    function initialize(
        address _momentOwner,
        address _momentFactory,
        bytes memory _metadataURI,
        address _likesToken,
        address _collectionOwner,
        address _momentURD
    ) external {
        require(!_initialized, "Already initialized");
        
        _setOwner(_momentOwner);
        MOMENT_FACTORY = _momentFactory;
        MOMENT_URD = _momentURD;
        
        _setData(
            _LSP8_REFERENCE_CONTRACT,
            abi.encodePacked(_momentFactory, bytes32(bytes20(address(this))))
        );

        _setData(_LSP4_METADATA_KEY, _metadataURI);

        likesToken = LSP7DigitalAsset(payable(_likesToken));
        collectionOwner = _collectionOwner;

        bytes32 key = LSP2Utils.generateMappingKey(
            _LSP1_UNIVERSAL_RECEIVER_DELEGATE_PREFIX,
            bytes20(TYPE_ID_LSP7_RECEIVED)
        );
        _setData(key, abi.encodePacked(MOMENT_URD));
        
        // Mark as initialized - now owner() can query the factory
        _initialized = true;
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

    function setLSP4Metadata(bytes32 tokenId, bytes calldata metadataURI) external onlyOwner {
        _setData(_LSP4_METADATA_KEY, metadataURI);
        emit LSP4MetadataUpdated(tokenId, metadataURI);
    }

    function withdrawLikes(uint256 amount) external {
        require(msg.sender == owner(), "Owner only");
        require(amount > 0, "Amount > 0");

        uint256 availableLikes = likesToken.balanceOf(address(this));
        require(amount <= availableLikes, "Insufficient LIKES");

        likesToken.transfer(address(this), msg.sender, amount, true, abi.encodePacked("Likes withdrawn"));

        emit LikesWithdrawn(msg.sender, amount);
    }

    // --- Marketplace Functions ---

    function setSalePrice(uint256 price) external {
        require(msg.sender == owner(), "Only owner can set price");
        
        if (price > 0) {
            uint256 listingFee = 42 * 10**18; // 42 LIKES
            uint256 halfFee = listingFee / 2;

            address platformTreasury = 0x7dE347bE3EbAED43065182FcABA462796d6f2a83;
            address collectionOwnerUP = collectionOwner;
            
            // Transfer 50% to platform treasury
            likesToken.transfer(
                msg.sender, 
                platformTreasury, 
                halfFee, 
                true, 
                abi.encodePacked("50% Listing fee to platform treasury")
            );

            // Transfer 50% to collection owner
            likesToken.transfer(
                msg.sender, 
                collectionOwnerUP, 
                listingFee - halfFee, 
                true, 
                abi.encodePacked("50% Listing fee to collection owner")
            );
        }
        
        salePrice = price;
        
        if (price > 0) {
            emit MomentListedForSale(price, msg.sender);
        } else {
            emit MomentRemovedFromSale(msg.sender);
        }
    }

    function purchaseMoment() external payable {
        require(salePrice > 0, "Moment not for sale");
        require(msg.value >= salePrice, "Insufficient payment");
        
        address currentOwner = owner();
        require(msg.sender != currentOwner, "Cannot buy your own Moment");
        
        uint256 paidPrice = salePrice;
        
        salePrice = 0;
        
        // Calculate fees
        uint256 collectionOwnerFee = (paidPrice * 2) / 100;
        uint256 foreverMomentsFee = (paidPrice * 1) / 100;
        uint256 sellerAmount = paidPrice - collectionOwnerFee - foreverMomentsFee;
        
        // Transfer fees to collection owner
        if (collectionOwnerFee > 0) {
            (bool success1, ) = payable(collectionOwner).call{value: collectionOwnerFee}("");
            require(success1, "Collection owner fee transfer failed");
        }
        
        // Transfer fees to Forever Moments platform
        if (foreverMomentsFee > 0) {
            address platformTreasury = 0x7dE347bE3EbAED43065182FcABA462796d6f2a83;
            (bool success2, ) = payable(platformTreasury).call{value: foreverMomentsFee}("");
            require(success2, "Platform fee transfer failed");
        }
        
        // Transfer remaining amount to seller
        (bool success3, ) = payable(currentOwner).call{value: sellerAmount}("");
        require(success3, "Seller payment transfer failed");
        
        // Emit fee distribution event
        emit PurchaseFeeDistributed(collectionOwner, collectionOwnerFee, foreverMomentsFee);
        
        bytes32 tokenId = bytes32(uint256(uint160(address(this))));
        ILSP8IdentifiableDigitalAsset(MOMENT_FACTORY).transfer(
            currentOwner,
            msg.sender,
            tokenId,
            true,
            ""
        );
        
        emit MomentPurchased(msg.sender, currentOwner, paidPrice);
    }

    function isForSale() external view returns (bool) {
        return salePrice > 0;
    }
}
