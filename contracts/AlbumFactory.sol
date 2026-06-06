// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {AlbumNFT} from "./AlbumNFT.sol";

/**
 * @title AlbumFactory
 * @author Forever Moments
 * @notice Deploys AlbumNFT (LSP7 token type NFT). Used by MusicFactory to stay under contract size limit.
 */
contract AlbumFactory {
    /**
     * @notice Deploy a new AlbumNFT.
     * @param creator_ Artist (UP); becomes contract owner and treasury if treasury is zero.
     * @param platformTreasury_ Platform fee recipient; address(0) = no fee.
     * @param platformFeeBps_ Platform fee in basis points (e.g. 100 = 1%).
     * @param likesToken_ LIKES token for withdrawLikes; address(0) = disabled.
     * @param musicURD_ URD for likes/comments; address(0) = disabled.
     */
    function createAlbum(
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
    ) external returns (address albumAddress) {
        AlbumNFT album = new AlbumNFT(
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
        return address(album);
    }
}
