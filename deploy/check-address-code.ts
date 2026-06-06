import { ethers } from "hardhat";

async function main() {
  const addr = process.env.CHECK_ADDRESS;
  if (!addr) throw new Error("Set env var CHECK_ADDRESS");
  const code = await ethers.provider.getCode(addr);
  console.log("address:", addr);
  console.log("codeLength:", (code.length - 2) / 2);
  console.log("isContract:", code !== "0x");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

