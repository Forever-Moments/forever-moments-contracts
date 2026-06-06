import { ethers } from "hardhat";

/**
 * Deploy MusicURD to the selected Hardhat network.
 *
 * Set LIKES_TOKEN (or LIKES_CONTRACT_ADDRESS) in the environment to the mainnet/testnet
 * LIKES contract. The deployed address is intended to be set as MUSIC_URD when deploying
 * GroovFactory (see deploy-groov-factory.ts).
 *
 * Run:
 *   npx hardhat run deploy/deploy-music-urd.ts --network lukso_testnet
 */
async function main() {
  const network = await ethers.provider.getNetwork();
  const [deployer] = await ethers.getSigners();

  const likesToken =
    process.env.LIKES_TOKEN ?? process.env.LIKES_CONTRACT_ADDRESS ?? ethers.ZeroAddress;

  if (likesToken === ethers.ZeroAddress) {
    throw new Error(
      "Set LIKES_TOKEN or LIKES_CONTRACT_ADDRESS to the Groov/LUKSO LIKES token address"
    );
  }

  console.log("network.chainId:", network.chainId.toString());
  console.log("deployer:", await deployer.getAddress());
  console.log("LIKES_TOKEN:", likesToken);

  const URD = await ethers.getContractFactory("MusicURD");
  const urd = await URD.connect(deployer).deploy(likesToken);
  await urd.waitForDeployment();

  const urdAddress = await urd.getAddress();
  console.log("MusicURD deployed at:", urdAddress);

  const configuredLikes = await urd.LIKES_TOKEN();
  console.log("MusicURD.LIKES_TOKEN():", configuredLikes);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
