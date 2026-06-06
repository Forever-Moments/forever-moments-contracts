// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {SongToken} from "./SongToken.sol";

/**
 * @title SongFactory
 * @author Forever Moments
 * @notice Deploys SongToken (LSP7). Used by MusicFactory to stay under contract size limit.
 */
contract SongFactory {
    /**
     * @notice Deploy a new SongToken.
     * @param creator_ Artist (UP); becomes contract owner and treasury if treasury is zero.
     * @param platformTreasury_ Platform fee recipient; address(0) = no fee.
     * @param platformFeeBps_ Platform fee in basis points (e.g. 100 = 1%).
     * @param royaltyBps LSP-18 royalty basis points (10000 = 100%). 0 = none.
     * @param royaltyReceiver LSP-18 royalty recipient. address(0) = none.
     * @param likesToken_ LIKES token for withdrawLikes; address(0) = disabled.
     * @param musicURD_ URD for likes/comments; address(0) = disabled.
     */
    function createSong(
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
        uint16 royaltyBps,
        address royaltyReceiver,
        address likesToken_,
        address musicURD_
    ) external returns (address songAddress) {
        SongToken song = new SongToken(
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
            royaltyBps,
            royaltyReceiver,
            likesToken_,
            musicURD_
        );
        return address(song);
    }
}
