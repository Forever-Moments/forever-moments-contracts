import { ethers } from "hardhat";

async function main() {
  const network = await ethers.provider.getNetwork();
  const [signer] = await ethers.getSigners();

  const FACTORY_V2 = process.env.MOMENT_FACTORY_V2_ADDRESS;
  if (!FACTORY_V2) throw new Error("Missing env var MOMENT_FACTORY_V2_ADDRESS");

  const factory = await ethers.getContractAt("MomentFactoryV2", FACTORY_V2, signer);

  console.log("network.chainId:", network.chainId.toString());
  console.log("signer:", await signer.getAddress());
  console.log("MomentFactoryV2:", FACTORY_V2);
  console.log("owner():", await factory.owner());
  console.log("momentURD():", await factory.momentURD());
  console.log("collectionRegistry():", await factory.collectionRegistry());
  console.log("momentImplementation():", await factory.momentImplementation());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

