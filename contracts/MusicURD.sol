// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {ILSP1UniversalReceiverDelegate} from "@lukso/lsp1-contracts/contracts/ILSP1UniversalReceiverDelegate.sol";

/// @notice Universal Receiver Delegate for Groov: indexes threaded comments/replies on TrackToken
///         contracts when fans send LIKES.
/// @dev Comments are created by sending LIKES tokens to a track with `userData` containing either:
///      - Legacy format: raw UTF-8 bytes representing the comment text (treated as a root comment)
///      - Versioned format (recommended):
///        abi.encode(bytes4("GRVC"), uint8(1), uint8(0), uint256(parentId), string(text))
///        where action=0 means "create comment/reply".
contract MusicURD is IERC165, ILSP1UniversalReceiverDelegate {
    /// @dev LSP7 recipient notification typeId (LSP7Tokens_RecipientNotification)
    bytes32 public constant TYPE_ID_LSP7_RECEIVED =
        0x20804611b3e2ea21c480dc465142210acf4a2485947541770ec1fb87dee4a55c;

    /// @dev Magic prefix for versioned comment payloads: bytes4("GRVC")
    bytes4 public constant COMMENT_MAGIC = 0x47525643;

    /// @dev Payload version supported by this contract.
    uint8 public constant COMMENT_PAYLOAD_VERSION = 1;

    /// @dev Payload action supported by this contract (0 = create comment/reply).
    uint8 public constant COMMENT_ACTION_CREATE = 0;

    /// @notice The LIKES token address allowed to create comments.
    address public immutable LIKES_TOKEN;

    /// @notice Number of comments observed for each track.
    /// @dev Comment ids are 1-based and monotonically increasing per track.
    mapping(address => uint256) public commentCount;

    /// @notice Emitted for every comment/reply created via a LIKES transfer.
    /// @param track The TrackToken contract that received the LIKES.
    /// @param commentId The new comment id (sequential per track).
    /// @param parentId The parent comment id. 0 means root comment.
    /// @param author The token sender (the commenter).
    /// @param operator The operator that executed the token transfer (can differ from author).
    /// @param amount The LIKES amount sent alongside the comment.
    /// @param text The comment text (legacy or versioned payload).
    event CommentCreated(
        address indexed track,
        uint256 indexed commentId,
        uint256 indexed parentId,
        address author,
        address operator,
        uint256 amount,
        string text
    );

    error InvalidLikesToken(address sender);
    error InvalidTypeId(bytes32 typeId);
    error InvalidReceiver(address expectedTrack, address decodedTo);
    error InvalidParentId(uint256 parentId);
    error UnsupportedPayload(uint8 version, uint8 action);

    constructor(address likesToken) {
        require(likesToken != address(0), "Invalid LIKES token");
        LIKES_TOKEN = likesToken;
    }

    function universalReceiverDelegate(
        address sender,
        uint256 /*value*/,
        bytes32 typeId,
        bytes memory data
    ) public override returns (bytes memory) {
        if (sender != LIKES_TOKEN) revert InvalidLikesToken(sender);
        if (typeId != TYPE_ID_LSP7_RECEIVED) revert InvalidTypeId(typeId);

        // LSP7 receivedData ABI layout: (operator, from, to, amount, data)
        (address operator, address from, address to, uint256 amount, bytes memory userData) =
            abi.decode(data, (address, address, address, uint256, bytes));

        // The TrackToken contract is the recipient and is the one calling this delegate.
        if (to != msg.sender) revert InvalidReceiver(msg.sender, to);

        (uint256 parentId, string memory text) = _parseComment(userData);

        // Validate parentId against current count (before increment).
        uint256 currentCount = commentCount[to];
        if (parentId != 0 && parentId > currentCount) revert InvalidParentId(parentId);

        uint256 commentId = currentCount + 1;
        commentCount[to] = commentId;

        emit CommentCreated(to, commentId, parentId, from, operator, amount, text);
        return "";
    }

    function _parseComment(bytes memory userData) internal pure returns (uint256 parentId, string memory text) {
        // Legacy format: raw bytes are the comment text (root comment).
        if (userData.length < 4 || bytes4(userData) != COMMENT_MAGIC) {
            return (0, string(userData));
        }

        // Versioned format.
        (bytes4 magic, uint8 version, uint8 action, uint256 decodedParentId, string memory decodedText) =
            abi.decode(userData, (bytes4, uint8, uint8, uint256, string));

        if (magic != COMMENT_MAGIC || version != COMMENT_PAYLOAD_VERSION || action != COMMENT_ACTION_CREATE) {
            revert UnsupportedPayload(version, action);
        }

        return (decodedParentId, decodedText);
    }

    function supportsInterface(bytes4 interfaceId) public pure override returns (bool) {
        return interfaceId == type(ILSP1UniversalReceiverDelegate).interfaceId;
    }
}
