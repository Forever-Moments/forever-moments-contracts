import { ethers } from "hardhat";

/**
 * Test SongToken flow: create a song via MusicFactory, then mint copies.
 *
 * Prerequisites:
 *   - .env: PRIVATE_KEY, MusicFactory=0x...
 *   - Deployer has LYX (for gas + mint payment).
 *
 * Run:
 *   npx hardhat run deploy/test-song-token.ts --network lukso_mainnet
 *   npx hardhat run deploy/test-song-token.ts --network lukso_testnet
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

  const metadataURI = "ipfs://QmTestSongMetadata123";
  const initialMetadataURI = ethers.toUtf8Bytes(metadataURI);
  const contentHash = ethers.keccak256(initialMetadataURI);
  const pricePerMint = ethers.parseEther("0.001");
  const maxSupply = 100n;
  const mintAmount = 2n;

  const musicFactory = await ethers.getContractAt("MusicFactory", musicFactoryAddress, signer);

  console.log("\n1. Creating song via MusicFactory.createSong(...)");
  const txCreate = await musicFactory.createSong(
    "Test Song",
    "TSNG",
    ethers.ZeroAddress, // treasury = signer
    pricePerMint,
    maxSupply,
    initialMetadataURI,
    contentHash,
    0,
    ethers.ZeroAddress
  );
  const receipt = await txCreate.wait();
  if (!receipt) throw new Error("No receipt");
  let songAddress: string | null = null;
  for (const log of receipt.logs) {
    try {
      const parsed = musicFactory.interface.parseLog({ topics: log.topics as string[], data: log.data });
      if (parsed?.name === "SongCreated" && parsed.args) {
        songAddress = (parsed.args as unknown[])[0] as string;
        break;
      }
    } catch {
      continue;
    }
  }
  if (!songAddress) throw new Error("SongCreated event not found in receipt");
  console.log("   SongToken deployed at:", songAddress);

  const song = await ethers.getContractAt("SongToken", songAddress, signer);
  const price = await song.pricePerMint();
  const totalMintedBefore = await song.totalMinted();
  const requiredValue = price * mintAmount;

  console.log("\n2. Minting", mintAmount.toString(), "copies (paying", ethers.formatEther(requiredValue), "LYX)");
  const txMint = await song.mint(mintAmount, { value: requiredValue });
  await txMint.wait();
  const totalMintedAfter = await song.totalMinted();
  const balance = await song.balanceOf(signerAddress);

  console.log("   totalMinted: ", totalMintedBefore.toString(), "->", totalMintedAfter.toString());
  console.log("   Your balance:", balance.toString());
  console.log("\nDone. SongToken create + mint succeeded.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
