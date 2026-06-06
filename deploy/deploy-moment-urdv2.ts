import { ethers } from "hardhat";

/**
 * Deploy MomentURDv2 to the selected Hardhat network.
 *
 * Requirements:
 * - hardhat.config.ts must have an account configured for the chosen network
 *   (e.g. set PRIVATE_KEY in your environment or .env).
 */
async function main() {
  const network = await ethers.provider.getNetwork();
  const [deployer] = await ethers.getSigners();

  // LIKES token used by MomentFactoryV2 on LUKSO mainnet/testnet (as per Constants/MomentFactoryV2).
  const LIKES_TOKEN = "0x403BfD53617555295347e0F7725CfdA480AB801e";

  console.log("network.chainId:", network.chainId.toString());
  console.log("deployer:", await deployer.getAddress());
  console.log("LIKES_TOKEN:", LIKES_TOKEN);

  const URD = await ethers.getContractFactory("MomentURDv2");
  const urd = await URD.connect(deployer).deploy(LIKES_TOKEN);
  await urd.waitForDeployment();

  const urdAddress = await urd.getAddress();
  console.log("MomentURDv2 deployed at:", urdAddress);

  // Quick sanity check
  const configuredLikes = await urd.LIKES_TOKEN();
  console.log("MomentURDv2.LIKES_TOKEN():", configuredLikes);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

