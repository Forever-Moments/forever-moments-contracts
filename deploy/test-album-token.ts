import { ethers } from "hardhat";

/**
 * Test AlbumNFT flow: create an album via MusicFactory, then mint editions.
 *
 * Prerequisites:
 *   - .env: PRIVATE_KEY, MusicFactory=0x...
 *   - Deployer has LYX (for gas + mint payment).
 *
 * Run:
 *   npx hardhat run deploy/test-album-token.ts --network lukso_mainnet
 *   npx hardhat run deploy/test-album-token.ts --network lukso_testnet
 */
async function main() {
  const musicFactoryAddress = process.env.MusicFactory;
  if (!musicFactoryAddress) {
    throw new Error("Set MusicFactory in .env (deployed MusicFactory address)");
  }

  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();
  const network = await ethers.provider.getNetwork();

  console.log("Network chainId:", network.chainId.toString());
  console.log("Signer:", signerAddress);
  console.log("MusicFactory:", musicFactoryAddress);

  const metadataURI = "ipfs://QmTestAlbumMetadata456";
  const initialMetadataURI = ethers.toUtf8Bytes(metadataURI);
  const contentHash = ethers.keccak256(initialMetadataURI);
  const pricePerMint = ethers.parseEther("0.002");
  const maxSupply = 10n;
  const mintEditions = 2; // mint 2 editions

  const musicFactory = await ethers.getContractAt("MusicFactory", musicFactoryAddress, signer);

  console.log("\n1. Creating album via MusicFactory.createAlbum(...)");
  const txCreate = await musicFactory.createAlbum(
    "Test Album",
    "TALB",
    ethers.ZeroAddress,
    pricePerMint,
    maxSupply,
    initialMetadataURI,
    contentHash,
    0,
    ethers.ZeroAddress
  );
  const receipt = await txCreate.wait();
  if (!receipt) throw new Error("No receipt");
  let albumAddress: string | null = null;
  for (const log of receipt.logs) {
    try {
      const parsed = musicFactory.interface.parseLog({ topics: log.topics as string[], data: log.data });
      if (parsed?.name === "AlbumCreated" && parsed.args) {
        albumAddress = (parsed.args as unknown[])[0] as string;
        break;
      }
    } catch {
      continue;
    }
  }
  if (!albumAddress) throw new Error("AlbumCreated event not found in receipt");
  console.log("   AlbumNFT deployed at:", albumAddress);

  const album = await ethers.getContractAt("AlbumNFT", albumAddress, signer);
  const price = await album.pricePerMint();

  const mintAmount = BigInt(mintEditions);
  const requiredValue = price * mintAmount;
  console.log("\n2. Minting", mintEditions, "copy/copies (paying", ethers.formatEther(requiredValue), "LYX)");
  const txMint = await album.mint(mintAmount, { value: requiredValue });
  await txMint.wait();
  console.log("   Minted", mintEditions, "copy/copies");

  const totalMinted = await album.totalMinted();
  const balance = await album.balanceOf(signerAddress);
  console.log("   totalMinted:", totalMinted.toString());
  console.log("   Your balance:", balance.toString());
  console.log("\nDone. AlbumNFT create + mint succeeded.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
