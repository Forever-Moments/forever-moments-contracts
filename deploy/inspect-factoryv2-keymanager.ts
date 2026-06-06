import { ethers } from "hardhat";

const UP_ABI = [
  // LSP0/ERC725Account owner() returns KeyManager
  "function owner() view returns (address)",
];

const KEY_MANAGER_ABI = [
  "function getPermissionsFor(address controller) view returns (bytes32)",
  "function getAllowedCallsFor(address controller) view returns (bytes)",
];

async function main() {
  const network = await ethers.provider.getNetwork();
  const [signer] = await ethers.getSigners();

  const FACTORY_V2 = process.env.MOMENT_FACTORY_V2_ADDRESS;
  if (!FACTORY_V2) throw new Error("Missing env var MOMENT_FACTORY_V2_ADDRESS");

  const factory = await ethers.getContractAt("MomentFactoryV2", FACTORY_V2, signer);
  const upAddress = await factory.owner();

  const up = new ethers.Contract(upAddress, UP_ABI, ethers.provider);
  const keyManagerAddress: string = await up.owner();

  const keyManager = new ethers.Contract(keyManagerAddress, KEY_MANAGER_ABI, ethers.provider);

  const signerAddress = await signer.getAddress();
  const permissions: string = await keyManager.getPermissionsFor(signerAddress);
  const allowedCalls: string = await keyManager.getAllowedCallsFor(signerAddress);

  console.log("network.chainId:", network.chainId.toString());
  console.log("signer:", signerAddress);
  console.log("MomentFactoryV2:", FACTORY_V2);
  console.log("factory.owner() (UP):", upAddress);
  console.log("UP.owner() (KeyManager):", keyManagerAddress);
  console.log("permissions:", permissions);
  console.log("allowedCalls.length(bytes):", (allowedCalls.length - 2) / 2);
  console.log("allowedCalls.containsFactoryAddress?:", allowedCalls.toLowerCase().includes(FACTORY_V2.toLowerCase().slice(2)));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

