// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {ILSP0ERC725Account} from "@lukso/lsp0-contracts/contracts/ILSP0ERC725Account.sol";

/**
 * @dev Minimal mock Universal Profile for testing "publisher must be a UP".
 * It claims the LSP0 ERC725Account interface id via ERC165 and can forward calls,
 * making the registry see `msg.sender == address(this)`.
 */
contract MockUniversalProfile is IERC165 {
    bytes4 private constant _INTERFACEID_LSP0 = type(ILSP0ERC725Account).interfaceId;

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IERC165).interfaceId || interfaceId == _INTERFACEID_LSP0;
    }

    function forward(address target, uint256 value, bytes calldata data) external payable returns (bytes memory) {
        (bool ok, bytes memory result) = target.call{value: value}(data);
        if (!ok) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
        return result;
    }
}

