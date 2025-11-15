import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";

import { config as LoadEnv } from "dotenv";
LoadEnv();

const config: HardhatUserConfig = {
  networks: {
    lukso_testnet: {
      chainId: 4201,
      url: "https://rpc.testnet.lukso.network/",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    lukso_mainnet: {
      chainId: 42,
      url: "https://rpc.mainnet.lukso.network",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1, // Optimize for size, not gas efficiency
      }
    },
  },

  sourcify: {
    enabled: true,
  },

  etherscan: {
    apiKey: {
      'lukso_mainnet': 'empty',
      'lukso_testnet': 'empty',
    },
    customChains: [
      {
        network: "lukso_mainnet",
        chainId: 42,
        urls: {
          apiURL: "https://explorer.execution.mainnet.lukso.network/api",
          browserURL: "https://explorer.execution.mainnet.lukso.network"
        }
      },
      {
        network: "lukso_testnet",
        chainId: 4201,
        urls: {
          apiURL: "https://explorer.execution.testnet.lukso.network/api",
          browserURL: "https://explorer.execution.testnet.lukso.network"
        }
      }
    ]
  },
};

export default config;
