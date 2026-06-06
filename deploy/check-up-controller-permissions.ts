import { ethers } from "hardhat";

const ERC725Y_ABI = ["function getData(bytes32 key) view returns (bytes value)"];

function key_AddressPermissionsPermissions(controller: string): string {
  // AddressPermissions:Permissions:<address>
  // 0x4b80742de2bf82acb3630000 + <20-byte address>
  return (
    "0x4b80742de2bf82acb3630000" +
    controller.toLowerCase().replace(/^0x/, "")
  );
}

function key_AddressPermissionsAllowedCalls(controller: string): string {
  // AddressPermissions:AllowedCalls:<address>
  // 0x4b80742de2bf393a64c70000 + <20-byte address>
  return (
    "0x4b80742de2bf393a64c70000" +
    controller.toLowerCase().replace(/^0x/, "")
  );
}

async function main() {
  const network = await ethers.provider.getNetwork();
  const [signer] = await ethers.getSigners();

  const UP = process.env.UP_ADDRESS;
  const CONTROLLER = process.env.PUBLIC_KEY || (await signer.getAddress());
  if (!UP) throw new Error("Missing env var UP_ADDRESS");

  const up = new ethers.Contract(UP, ERC725Y_ABI, ethers.provider);

  const permKey = key_AddressPermissionsPermissions(CONTROLLER);
  const allowedCallsKey = key_AddressPermissionsAllowedCalls(CONTROLLER);

  const permsRaw: string = await up.getData(permKey);
  const allowedRaw: string = await up.getData(allowedCallsKey);

  console.log("network.chainId:", network.chainId.toString());
  console.log("UP:", UP);
  console.log("controller:", CONTROLLER);
  console.log("permissionsKey:", permKey);
  console.log("permissions(bytes):", permsRaw);
  console.log("allowedCallsKey:", allowedCallsKey);
  console.log("allowedCalls(bytes):", allowedRaw);
  console.log("allowedCalls.length(bytes):", (allowedRaw.length - 2) / 2);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

