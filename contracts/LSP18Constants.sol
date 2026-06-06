// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title LSP18Constants
 * @notice ERC725Y data keys and encoding for LSP-18 Royalties (https://github.com/lukso-network/LIPs/blob/main/LSPs/LSP-18-Royalties.md)
 */
library LSP18Constants {
    /// @dev LSP18RoyaltiesRecipients - CompactBytesArray of (bytes4 interfaceId, address recipient, uint32 points) where 100_000 points = 100%
    bytes32 internal constant LSP18_ROYALTIES_RECIPIENTS_KEY =
        0xc0569ca6c9180acc2c3590f36330a36ae19015a19f4e85c28a7631e3317e6b9d;

    /// @dev LSP18RoyaltiesEnforcePayment - boolean to enforce royalties even when sold at a loss
    bytes32 internal constant LSP18_ROYALTIES_ENFORCE_PAYMENT_KEY =
        0x580d62ad353782eca17b89e5900e7df3b13b6f4ca9bbc2f8af8bceb0c3d1ecc6;

    /// @dev Unknown interface id for recipient (per LSP-18)
    bytes4 internal constant LSP18_INTERFACE_ID_UNKNOWN = 0xffffffff;

    /// @dev Length of one LSP18 recipient tuple: bytes4 + address + uint32 = 4 + 20 + 4 = 28
    uint256 internal constant LSP18_RECIPIENT_TUPLE_LENGTH = 28;

    /// @dev Encode a single recipient for LSP18RoyaltiesRecipients. royaltyBps: 10000 = 100%. LSP18 points: 100_000 = 100%.
    function encodeSingleRecipient(uint16 royaltyBps, address recipient) internal pure returns (bytes memory) {
        if (recipient == address(0)) return "";
        uint32 points = uint32(royaltyBps) * 10;
        bytes memory tuple = abi.encodePacked(LSP18_INTERFACE_ID_UNKNOWN, recipient, points);
        return abi.encodePacked(uint16(tuple.length), tuple);
    }

    /// @dev Encode two recipients for LSP18RoyaltiesRecipients (e.g. artist + early supporter pool). Both must be non-zero.
    function encodeTwoRecipients(
        uint16 royaltyBps1,
        address recipient1,
        uint16 royaltyBps2,
        address recipient2
    ) internal pure returns (bytes memory) {
        require(recipient1 != address(0) && recipient2 != address(0), "LSP18: zero recipient");
        bytes memory r1 = encodeSingleRecipient(royaltyBps1, recipient1);
        bytes memory r2 = encodeSingleRecipient(royaltyBps2, recipient2);
        return abi.encodePacked(r1, r2);
    }
}
