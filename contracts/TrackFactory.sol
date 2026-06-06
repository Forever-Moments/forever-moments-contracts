// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {TrackToken} from "./TrackToken.sol";

/**
 * @title TrackFactory
 * @author OG Labs
 * @notice Deploys TrackToken (LSP7). Used by GroovFactory to stay under contract size limit.
 */
contract TrackFactory {
    /**
     * @notice Deploy a new TrackToken.
     * @param creator_ Artist (UP); becomes contract owner and treasury if treasury is zero.
     * @param platformTreasury_ Platform fee recipient; address(0) = no fee.
     * @param platformFeeBps_ Platform fee in basis points (e.g. 100 = 1%). Set by factory.
     * @param poolMintBps Early supporter pool share of mint (basis points). Rest to artist.
     * @param earlySupportersCap Max number of distinct paying minters that count as early supporters (0 = no pool).
     * @param royaltyArtistBps Artist resale royalty basis points. 0 = none.
     * @param royaltyEarlyBps Early pool resale royalty basis points (extra). 0 = none.
     * @param likesToken_ LIKES token for withdrawLikes; address(0) = disabled.
     * @param musicURD_ URD for likes/comments; address(0) = disabled.
     */
    function createTrack(
        address creator_,
        string memory name,
        string memory symbol,
        address treasury,
        address platformTreasury_,
        uint16 platformFeeBps_,
        uint256 pricePerMint,
        uint256 maxSupply,
        bytes memory initialMetadataURI,
        bytes32 contentHash,
        uint16 poolMintBps,
        uint256 earlySupportersCap,
        uint16 royaltyArtistBps,
        uint16 royaltyEarlyBps,
        address likesToken_,
        address musicURD_
    ) external returns (address trackAddress) {
        TrackToken track = new TrackToken(
            name,
            symbol,
            creator_,
            treasury,
            platformTreasury_,
            platformFeeBps_,
            pricePerMint,
            maxSupply,
            initialMetadataURI,
            contentHash,
            poolMintBps,
            earlySupportersCap,
            royaltyArtistBps,
            royaltyEarlyBps,
            likesToken_,
            musicURD_
        );
        return address(track);
    }
}
