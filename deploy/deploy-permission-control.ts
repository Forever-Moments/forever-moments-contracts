import { readFileSync } from "fs";
import { ethers } from "hardhat";
import { config as LoadEnv } from "dotenv";
import { ERC725 } from "@erc725/erc725.js";
import LSP4DigitalAssetSchema from "@erc725/erc725.js/schemas/LSP4DigitalAsset.json";
import { PinataSDK } from "pinata-web3";
import { Blob } from "buffer";

LoadEnv();

const {
  UP_ADDRESS,
  IPFS_GATEWAY_URL,
  PINATA_JWT_KEY,
  PERMISSION_CONTROL_NAME,
  PERMISSION_CONTROL_SYMBOL,
  PERMISSION_CONTROL_METADATA_PATH,
} = process.env;

async function uploadToPinata(filePath: string): Promise<string> {
  const pinata = new PinataSDK({
    pinataJwt: PINATA_JWT_KEY as string,
    pinataGateway: IPFS_GATEWAY_URL as string,
  });

  const blob = new Blob([readFileSync(filePath)], { type: "application/json" });
  const uploadResponse = await pinata.upload.file(blob);
  console.log("Pinata upload successful:", uploadResponse);
  return uploadResponse.IpfsHash;
}

async function createVerifiableURI(json: Record<string, unknown>, ipfsHash: string): Promise<string> {
  const erc725 = new ERC725(LSP4DigitalAssetSchema);

  const encodedData = erc725.encodeData([
    {
      keyName: "LSP4Metadata",
      value: {
        json,
        url: `ipfs://${ipfsHash}`,
      },
    },
  ]);

  return encodedData.values[0] as string;
}

/**
 * Deploy PermissionControl (LSP8 collection) the same way as MomentFactoryV3:
 * EOA deployer sends the tx; constructor sets `owner` to your Universal Profile (`UP_ADDRESS`).
 *
 * Run:
 *   npx hardhat run deploy/deploy-permission-control.ts --network lukso_mainnet
 *
 * Env: UP_ADDRESS, PINATA_JWT_KEY, IPFS_GATEWAY_URL (and PRIVATE_KEY in .env for Hardhat accounts).
 */
async function main() {
  if (!UP_ADDRESS) {
    throw new Error("Missing UP_ADDRESS (Universal Profile that will own the collection)");
  }
  if (!PINATA_JWT_KEY || !IPFS_GATEWAY_URL) {
    throw new Error("Missing PINATA_JWT_KEY or IPFS_GATEWAY_URL (needed to upload LSP4 JSON and build VerifiableURI)");
  }

  const metadataPath = PERMISSION_CONTROL_METADATA_PATH ?? "metadata/lsp4-permission-control.json";
  const name = PERMISSION_CONTROL_NAME ?? "Permission Control";
  const symbol = PERMISSION_CONTROL_SYMBOL ?? "PERM";

  console.log("Deploying PermissionControl...");
  console.log("UP (owner):", UP_ADDRESS);
  console.log("Metadata file:", metadataPath);

  const factoryMetadata = JSON.parse(readFileSync(metadataPath, "utf8"));
  const ipfsHash = await uploadToPinata(metadataPath);
  const verifiableURIHex = await createVerifiableURI(factoryMetadata, ipfsHash);
  const collectionMetadataBytes = ethers.getBytes(verifiableURIHex);

  const [deployer] = await ethers.getSigners();
  console.log("Deployer (EOA):", await deployer.getAddress());

  const PermissionControl = await ethers.getContractFactory("PermissionControl");
  const permissionControl = await PermissionControl.connect(deployer).deploy(
    name,
    symbol,
    UP_ADDRESS,
    collectionMetadataBytes
  );
  await permissionControl.waitForDeployment();

  const contractAddress = await permissionControl.getAddress();
  console.log("PermissionControl deployed to:", contractAddress);
  console.log("owner():", await permissionControl.owner());
  console.log("Add to .env: PERMISSION_CONTROL_ADDRESS=" + contractAddress);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
