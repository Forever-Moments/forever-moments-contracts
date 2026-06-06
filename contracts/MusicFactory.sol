// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SongFactory} from "./SongFactory.sol";
import {AlbumFactory} from "./AlbumFactory.sol";

/**
 * @title MusicFactory
 * @author Forever Moments
 * @notice Deploys SongToken (LSP7) and AlbumNFT (LSP7) for artists. Creator is msg.sender. 1% platform fee on mints.
 * @dev Uses SongFactory and AlbumFactory helpers to stay under contract size limit.
 */
contract MusicFactory is Ownable {
    SongFactory public immutable songFactory;
    AlbumFactory public immutable albumFactory;
    address public platformTreasury;
    address public likesToken;
    address public musicURD;
    uint16 public constant PLATFORM_FEE_BPS = 100; // 1%

    event SongCreated(address indexed songAddress, address indexed creator, bytes initialMetadataURI);
    event AlbumCreated(address indexed albumAddress, address indexed creator, bytes initialMetadataURI);
    event PlatformTreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event MusicURDUpdated(address indexed oldURD, address indexed newURD);

    constructor(
        address _songFactory,
        address _albumFactory,
        address _platformTreasury,
        address _likesToken,
        address _musicURD
    ) Ownable(msg.sender) {
        songFactory = SongFactory(payable(_songFactory));
        albumFactory = AlbumFactory(payable(_albumFactory));
        platformTreasury = _platformTreasury;
        likesToken = _likesToken;
        musicURD = _musicURD;
    }

    function setPlatformTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "Invalid treasury");
        address oldTreasury = platformTreasury;
        platformTreasury = newTreasury;
        emit PlatformTreasuryUpdated(oldTreasury, newTreasury);
    }

    function setMusicURD(address newURD) external onlyOwner {
        require(newURD != address(0), "Invalid URD");
        address oldURD = musicURD;
        musicURD = newURD;
        emit MusicURDUpdated(oldURD, newURD);
    }

    /**
     * @notice Deploy a new SongToken. Creator and treasury (if zero) are set to msg.sender.
     * @param royaltyBps LSP-18 royalty basis points (0 = none).
     * @param royaltyReceiver LSP-18 royalty recipient (address(0) = none).
     */
    function createSong(
        string memory name,
        string memory symbol,
        address treasury,
        uint256 pricePerMint,
        uint256 maxSupply,
        bytes memory initialMetadataURI,
        bytes32 contentHash,
        uint16 royaltyBps,
        address royaltyReceiver
    ) external returns (address songAddress) {
        address creator_ = msg.sender;
        songAddress = songFactory.createSong(
            creator_,
            name,
            symbol,
            treasury,
            platformTreasury,
            PLATFORM_FEE_BPS,
            pricePerMint,
            maxSupply,
            initialMetadataURI,
            contentHash,
            royaltyBps,
            royaltyReceiver,
            likesToken,
            musicURD
        );
        emit SongCreated(songAddress, creator_, initialMetadataURI);
        return songAddress;
    }

    /**
     * @notice Deploy a new AlbumNFT. Creator and treasury (if zero) are set to msg.sender.
     */
    function createAlbum(
        string memory name,
        string memory symbol,
        address treasury,
        uint256 pricePerMint,
        uint256 maxSupply,
        bytes memory initialMetadataURI,
        bytes32 contentHash,
        uint16 royaltyBps,
        address royaltyReceiver
    ) external returns (address albumAddress) {
        address creator_ = msg.sender;
        albumAddress = albumFactory.createAlbum(
            creator_,
            name,
            symbol,
            treasury,
            platformTreasury,
            PLATFORM_FEE_BPS,
            pricePerMint,
            maxSupply,
            initialMetadataURI,
            contentHash,
            royaltyBps,
            royaltyReceiver,
            likesToken,
            musicURD
        );
        emit AlbumCreated(albumAddress, creator_, initialMetadataURI);
        return albumAddress;
    }
}
