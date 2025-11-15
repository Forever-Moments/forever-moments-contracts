# Forever Moments - Social platform on LUKSO

A decentralised social platform built on LUKSO that enables creators to mint, share, and engage with digital Moments as LSP8 tokens. The platform features social interactions through $LIKES tokens and Collection management capabilities.

## Features

- **Moment Creation**: Mint LSP8 tokens representing digital Moments with rich metadata
- **Collection Management**: Create and manage collections of Moments
- **Social Interactions**: Like and comment on Moments using $LIKES tokens
- **Open Collections**: Join public collections and contribute Moments
- **Universal Profile Integration**: Full integration with LUKSO's Universal Profile system

## Smart Contracts

- **`MomentFactoryV2.sol`**: Factory contract for minting Moments as LSP8 tokens using minimal proxy pattern
- **`MomentV2.sol`**: Implementation contract for Moment proxies with marketplace functionality
- **`CollectionRegistry.sol`**: Registry for managing collections with different access types (Private, Open, TokenGated)
- **`ICollectionRegistry.sol`**: Interface for the Collection Registry
- **`LikesToken.sol`**: LSP7 token implementation for social interactions ($LIKES)
- **`MomentURD.sol`**: Universal Receiver Delegate for handling likes and comments on Moments

## Prerequisites

1. Node.js (via [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm))
2. [Universal Profile Browser Extension](https://docs.lukso.tech/install-up-browser-extension)
3. [LUKSO Universal Profile](https://my.universalprofile.cloud/)
4. [LUKSO testnet LYX](https://faucet.testnet.lukso.network)


## Documentation

- [LUKSO Technical Documentation](https://docs.lukso.tech)
- [LSP8 Standard](https://docs.lukso.tech/standards/tokens/LSP8-Identifiable-Digital-Asset)
- [LSP7 Standard](https://docs.lukso.tech/standards/tokens/LSP7-Digital-Asset)


## Contact

- X: [@momentsonchain](https://twitter.com/momentsonchain)
- Common Ground: [@momentsonchain](https://app.cg/c/Jl4wN7ZLR8/)
- Website: [forevermoments.life](https://forevermoments.life)