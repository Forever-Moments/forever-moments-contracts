import { ethers } from "hardhat";

/**
 * Deploy PermissionsOnchainTemplateRegistry + a mock UP, then publish an example template
 * where the registry sees `msg.sender == UP`.
 *
 * Run:
 * - local:   npx hardhat run deploy/deploy-permissions-template-registry.ts
 * - testnet: npx hardhat run deploy/deploy-permissions-template-registry.ts --network lukso_testnet
 * - mainnet: npx hardhat run deploy/deploy-permissions-template-registry.ts --network lukso_mainnet
 */
async function main() {
  const network = await ethers.provider.getNetwork();
  const [deployer] = await ethers.getSigners();

  console.log("network.chainId:", network.chainId.toString());
  console.log("deployer:", await deployer.getAddress());

  const registry = await ethers.deployContract("PermissionsOnchainTemplateRegistry");
  await registry.waitForDeployment();
  console.log("PermissionsOnchainTemplateRegistry:", await registry.getAddress());

  // Mainnet safety: only deploy the registry by default.
  // To also deploy a demo UP + publish an example template, set DEMO_PUBLISH=1.
  const demoPublish = process.env.DEMO_PUBLISH === "1";
  if (!demoPublish) return;

  // In production, publishing will be done by a real Universal Profile (via its KeyManager -> UP.execute).
  // This mock is only to demonstrate & test the flow.
  const mockUP = await ethers.deployContract("MockUniversalProfile");
  await mockUP.waitForDeployment();
  console.log("MockUniversalProfile (test UP):", await mockUP.getAddress());

  const templateId = ethers.keccak256(ethers.toUtf8Bytes("forever-moments/gasless"));

  const publishCalldata = registry.interface.encodeFunctionData("publishTemplate", [
    templateId,
    1, // version
    42, // intended chainId
    0xff, // permissions bitmap (example)
    "0x", // allowedCalls (CompactBytesArray bytes)
    "0x", // allowedERC725YDataKeys (CompactBytesArray bytes)
    "ipfs://QmTemplateMetadataExample", // metadataURI (ipfs://... JSON)
  ]);

  const tx = await mockUP.forward(await registry.getAddress(), 0, publishCalldata);
  await tx.wait();
  console.log("Published example template via mock UP. tx:", tx.hash);

  const latest = await registry.getLatestVersion(await mockUP.getAddress(), templateId);
  console.log("latestVersion:", latest.toString());

  const tpl = await registry.getTemplate(await mockUP.getAddress(), templateId, latest);
  console.log("getTemplate:", tpl);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

