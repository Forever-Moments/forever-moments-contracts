import { ethers } from "hardhat";

const UP_ABI = [
  "function owner() view returns (address)",
  "function execute(uint256 operationType, address to, uint256 value, bytes data) payable returns (bytes)",
];

async function main() {
  const [signer] = await ethers.getSigners();

  const FACTORY_V2 = process.env.MOMENT_FACTORY_V2_ADDRESS;
  const NEW_URD = process.env.MOMENT_URD_V2_ADDRESS;
  if (!FACTORY_V2) throw new Error("Missing env var MOMENT_FACTORY_V2_ADDRESS");
  if (!NEW_URD) throw new Error("Missing env var MOMENT_URD_V2_ADDRESS");

  const factory = await ethers.getContractAt("MomentFactoryV2", FACTORY_V2, signer);
  const upAddress = await factory.owner();
  const up = new ethers.Contract(upAddress, UP_ABI, ethers.provider);
  const keyManagerAddress: string = await up.owner();

  const setUrdCalldata = factory.interface.encodeFunctionData("setMomentURD", [NEW_URD]);

  const upInterface = new ethers.Interface(UP_ABI);
  const upExecutePayload = upInterface.encodeFunctionData("execute", [0n, FACTORY_V2, 0n, setUrdCalldata]);

  console.log("MomentFactoryV2:", FACTORY_V2);
  console.log("NewURD:", NEW_URD);
  console.log("factory.owner() (UP):", upAddress);
  console.log("UP.owner() (KeyManager):", keyManagerAddress);
  console.log("setMomentURD calldata:", setUrdCalldata);
  console.log("KeyManager.execute payload:", upExecutePayload);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

