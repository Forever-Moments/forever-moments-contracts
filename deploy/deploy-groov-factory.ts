import { ethers } from "hardhat";

/**
 * Deploy Groov platform: TrackFactory, GroovFactory.
 *
 * Order: TrackFactory → GroovFactory(trackFactory, platformTreasury, likesToken, musicURD).
 * GroovFactory is the main entry point for artists to createTrack.
 *
 * - Platform fee: default 1% (100 bps), updatable by owner via setPlatformFeeBps() for future tracks.
 * - Early supporters: artist sets poolMintBps (mint % to pool) and earlySupportersCap (first N addresses) at creation; resale royalty can include early pool (royaltyArtistBps + royaltyEarlyBps).
 * - createTrack(name, symbol, treasury, pricePerMint, maxSupply, initialMetadataURI, contentHash, poolMintBps, earlySupportersCap, royaltyArtistBps, royaltyEarlyBps)
 *
 * Run:
 *   npx hardhat run deploy/deploy-groov-factory.ts --network lukso_testnet
 *   npx hardhat run deploy/deploy-groov-factory.ts --network lukso_mainnet
 *
 * Prerequisites:
 *   - PRIVATE_KEY in .env (deployer EOA with LYX for gas)
 * Optional .env: PLATFORM_TREASURY, PLATFORM_FEE_BPS (default 100), LIKES_TOKEN or LIKES_CONTRACT_ADDRESS, MUSIC_URD (address(0) if not set)
 */
async function main() {
  const network = await ethers.provider.getNetwork();
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();

  const platformTreasury = process.env.PLATFORM_TREASURY ?? ethers.ZeroAddress;
  const platformFeeBpsEnv = process.env.PLATFORM_FEE_BPS;
  const platformFeeBps = platformFeeBpsEnv != null ? parseInt(platformFeeBpsEnv, 10) : null;
  const likesToken = process.env.LIKES_TOKEN ?? process.env.LIKES_CONTRACT_ADDRESS ?? ethers.ZeroAddress;
  const musicURD = process.env.MUSIC_URD ?? ethers.ZeroAddress;

  console.log("Network chainId:", network.chainId.toString());
  console.log("Deployer:", deployerAddress);
  console.log("Platform treasury:", platformTreasury);
  console.log("Platform fee (bps):", platformFeeBps ?? "100 (default)");
  console.log("LIKES token:", likesToken);
  console.log("Music URD:", musicURD);

  const TrackFactory = await ethers.getContractFactory("TrackFactory");
  const trackFactory = await TrackFactory.connect(deployer).deploy();
  await trackFactory.waitForDeployment();
  const trackFactoryAddress = await trackFactory.getAddress();
  console.log("TrackFactory deployed:", trackFactoryAddress);

  const GroovFactory = await ethers.getContractFactory("GroovFactory");
  const groovFactory = await GroovFactory.connect(deployer).deploy(
    trackFactoryAddress,
    platformTreasury,
    likesToken,
    musicURD
  );
  await groovFactory.waitForDeployment();
  const groovFactoryAddress = await groovFactory.getAddress();
  console.log("GroovFactory deployed:", groovFactoryAddress);

  if (platformFeeBps != null && platformFeeBps >= 0 && platformFeeBps <= 10000) {
    const current = await groovFactory.platformFeeBps();
    if (Number(current) !== platformFeeBps) {
      const tx = await groovFactory.connect(deployer).setPlatformFeeBps(platformFeeBps);
      await tx.wait();
      console.log("Platform fee set to", platformFeeBps, "bps");
    }
  }

  console.log("\n--- Summary ---");
  console.log("TrackFactory:  ", trackFactoryAddress);
  console.log("GroovFactory:  ", groovFactoryAddress);
  console.log("\nArtists use GroovFactory.createTrack(name, symbol, treasury, pricePerMint, maxSupply, initialMetadataURI, contentHash, poolMintBps, earlySupportersCap, royaltyArtistBps, royaltyEarlyBps).");
  console.log("Platform fee is", (await groovFactory.platformFeeBps()).toString(), "bps; owner can change via setPlatformFeeBps().");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
