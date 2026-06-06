// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {TrackSecondaryMarket} from "../TrackSecondaryMarket.sol";

/// @dev Used to assert `nonReentrant` on TrackSecondaryMarket.buy: royalty LYX payout triggers receive, which tries nested buy.
contract ReentrantRoyaltyReceiver {
    TrackSecondaryMarket public immutable market;
    uint256 public listingId;

    constructor(address market_) {
        market = TrackSecondaryMarket(market_);
    }

    function setListingId(uint256 id) external {
        listingId = id;
    }

    receive() external payable {
        if (msg.sender != address(market)) return;
        market.buy{value: 0}(listingId);
    }
}
