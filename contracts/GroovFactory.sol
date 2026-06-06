// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {TrackFactory} from "./TrackFactory.sol";

/**
 * @title GroovFactory
 * @author OG Labs
 * @notice Deploys TrackToken (LSP7) for artists. Creator is msg.sender.
 * @dev Uses TrackFactory helper to stay under contract size limit. maxSupply is required; reserveMint available for creator giveaways.
 */
 
contract GroovFactory is Ownable {
    TrackFactory public immutable trackFactory;
    address public platformTreasury;
    address public likesToken;
    address public musicURD;
    uint16 public platformFeeBps; // default 1%; updatable by owner for future tracks

    event TrackCreated(address indexed trackAddress, address indexed creator, bytes initialMetadataURI);
    event PlatformTreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event MusicURDUpdated(address indexed oldURD, address indexed newURD);
    event PlatformFeeBpsUpdated(uint16 oldBps, uint16 newBps);

    constructor(
        address _trackFactory,
        address _platformTreasury,
        address _likesToken,
        address _musicURD
    ) Ownable(msg.sender) {
        trackFactory = TrackFactory(payable(_trackFactory));
        platformTreasury = _platformTreasury;
        likesToken = _likesToken;
        musicURD = _musicURD;
        platformFeeBps = 100; // 1%
    }

    function setPlatformFeeBps(uint16 newBps) external onlyOwner {
        uint16 oldBps = platformFeeBps;
        platformFeeBps = newBps;
        emit PlatformFeeBpsUpdated(oldBps, newBps);
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
     * @notice Deploy a new TrackToken. Creator and treasury (if zero) are set to msg.sender. maxSupply must be > 0.
     * @param poolMintBps Early supporter pool share of mint (basis points). Rest goes to artist. Protocol fee is set at factory.
     * @param earlySupportersCap Max number of distinct paying minters that count as early supporters (0 = no pool).
     * @param royaltyArtistBps Artist resale royalty basis points (e.g. 500 = 5%). 0 = none.
     * @param royaltyEarlyBps Early pool resale royalty basis points, extra on top of artist (e.g. 200 = 2%). 0 = none.
     */
    function createTrack(
        string memory name,
        string memory symbol,
        address treasury,
        uint256 pricePerMint,
        uint256 maxSupply,
        bytes memory initialMetadataURI,
        bytes32 contentHash,
        uint16 poolMintBps,
        uint256 earlySupportersCap,
        uint16 royaltyArtistBps,
        uint16 royaltyEarlyBps
    ) external returns (address trackAddress) {
        address creator_ = msg.sender;
        trackAddress = trackFactory.createTrack(
            creator_,
            name,
            symbol,
            treasury,
            platformTreasury,
            platformFeeBps,
            pricePerMint,
            maxSupply,
            initialMetadataURI,
            contentHash,
            poolMintBps,
            earlySupportersCap,
            royaltyArtistBps,
            royaltyEarlyBps,
            likesToken,
            musicURD
        );
        emit TrackCreated(trackAddress, creator_, initialMetadataURI);
        return trackAddress;
    }
}
