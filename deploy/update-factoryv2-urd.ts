import { ethers } from "hardhat";

async function main() {
  const network = await ethers.provider.getNetwork();
  const [signer] = await ethers.getSigners();

  const FACTORY_V2 = process.env.MOMENT_FACTORY_V2_ADDRESS;
  const NEW_URD = process.env.MOMENT_URD_V2_ADDRESS;

  if (!FACTORY_V2) {
    throw new Error("Missing env var MOMENT_FACTORY_V2_ADDRESS");
  }
  if (!NEW_URD) {
    throw new Error("Missing env var MOMENT_URD_V2_ADDRESS");
  }

  console.log("network.chainId:", network.chainId.toString());
  console.log("signer:", await signer.getAddress());
  console.log("MomentFactoryV2:", FACTORY_V2);
  console.log("New MomentURD:", NEW_URD);

  const factory = await ethers.getContractAt("MomentFactoryV2", FACTORY_V2, signer);

  const before = await factory.momentURD();
  console.log("momentURD() before:", before);

  const tx = await factory.setMomentURD(NEW_URD);
  console.log("tx:", tx.hash);
  await tx.wait();

  const after = await factory.momentURD();
  console.log("momentURD() after:", after);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

