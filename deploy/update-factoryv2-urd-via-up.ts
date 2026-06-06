import { ethers } from "hardhat";

// Minimal ABIs (avoid needing local artifacts for external contracts)
const UP_ABI = [
  "function owner() view returns (address)",
  "function execute(uint256 operationType, address to, uint256 value, bytes data) payable returns (bytes)",
];
const KEY_MANAGER_ABI = ["function execute(bytes payload) payable returns (bytes)"];

async function main() {
  const network = await ethers.provider.getNetwork();
  const [signer] = await ethers.getSigners();

  const FACTORY_V2 = process.env.MOMENT_FACTORY_V2_ADDRESS;
  const NEW_URD = process.env.MOMENT_URD_V2_ADDRESS;
  if (!FACTORY_V2) throw new Error("Missing env var MOMENT_FACTORY_V2_ADDRESS");
  if (!NEW_URD) throw new Error("Missing env var MOMENT_URD_V2_ADDRESS");

  const factory = await ethers.getContractAt("MomentFactoryV2", FACTORY_V2, signer);
  const upAddress = await factory.owner(); // Ownable owner for MomentFactoryV2

  console.log("network.chainId:", network.chainId.toString());
  console.log("signer:", await signer.getAddress());
  console.log("MomentFactoryV2:", FACTORY_V2);
  console.log("factory.owner() (UP/treasury):", upAddress);
  console.log("new URD:", NEW_URD);
  console.log("momentURD() before:", await factory.momentURD());

  // If the owner is a Universal Profile, its owner() should be the Key Manager address.
  const up = new ethers.Contract(upAddress, UP_ABI, ethers.provider);
  const keyManagerAddress: string = await up.owner();
  console.log("UP.owner() (KeyManager):", keyManagerAddress);

  const setUrdCalldata = factory.interface.encodeFunctionData("setMomentURD", [NEW_URD]);

  // KeyManager.execute expects the FULL calldata to call the UP (including the selector),
  // i.e. UP.execute(OPERATION_CALL=0, to=factory, value=0, data=setMomentURD(...))
  const upInterface = new ethers.Interface(UP_ABI);
  const upExecutePayload = upInterface.encodeFunctionData("execute", [0n, FACTORY_V2, 0n, setUrdCalldata]);

  const keyManager = new ethers.Contract(keyManagerAddress, KEY_MANAGER_ABI, signer);
  const tx = await keyManager.execute(upExecutePayload);
  console.log("tx:", tx.hash);
  await tx.wait();

  console.log("momentURD() after:", await factory.momentURD());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

