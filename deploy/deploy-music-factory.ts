import { ethers } from "hardhat";

/**
 * Deploy Music platform: SongFactory, AlbumFactory, MusicFactory.
 *
 * Order: SongFactory → AlbumFactory → MusicFactory(songFactory, albumFactory, platformTreasury, likesToken, musicURD).
 * MusicFactory is the main entry point for artists to createSong / createAlbum. 1% of each mint goes to platformTreasury.
 *
 * Run:
 *   npx hardhat run deploy/deploy-music-factory.ts --network lukso_testnet
 *   npx hardhat run deploy/deploy-music-factory.ts --network lukso_mainnet
 *
 * Prerequisites:
 *   - PRIVATE_KEY in .env (deployer EOA with LYX for gas)
 * Optional .env: PLATFORM_TREASURY, LIKES_TOKEN or LIKES_CONTRACT_ADDRESS, MUSIC_URD (address(0) if not set)
 */
async function main() {
  const network = await ethers.provider.getNetwork();
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();

  const platformTreasury = process.env.PLATFORM_TREASURY ?? ethers.ZeroAddress;
  const likesToken = process.env.LIKES_TOKEN ?? process.env.LIKES_CONTRACT_ADDRESS ?? ethers.ZeroAddress;
  const musicURD = process.env.MUSIC_URD ?? ethers.ZeroAddress;

  console.log("Network chainId:", network.chainId.toString());
  console.log("Deployer:", deployerAddress);
  console.log("Platform treasury:", platformTreasury);
  console.log("LIKES token:", likesToken);
  console.log("Music URD:", musicURD);

  const SongFactory = await ethers.getContractFactory("SongFactory");
  const songFactory = await SongFactory.connect(deployer).deploy();
  await songFactory.waitForDeployment();
  const songFactoryAddress = await songFactory.getAddress();
  console.log("SongFactory deployed:", songFactoryAddress);

  const AlbumFactory = await ethers.getContractFactory("AlbumFactory");
  const albumFactory = await AlbumFactory.connect(deployer).deploy();
  await albumFactory.waitForDeployment();
  const albumFactoryAddress = await albumFactory.getAddress();
  console.log("AlbumFactory deployed:", albumFactoryAddress);

  const MusicFactory = await ethers.getContractFactory("MusicFactory");
  const musicFactory = await MusicFactory.connect(deployer).deploy(
    songFactoryAddress,
    albumFactoryAddress,
    platformTreasury,
    likesToken,
    musicURD
  );
  await musicFactory.waitForDeployment();
  const musicFactoryAddress = await musicFactory.getAddress();
  console.log("MusicFactory deployed:", musicFactoryAddress);

  console.log("\n--- Summary ---");
  console.log("SongFactory:   ", songFactoryAddress);
  console.log("AlbumFactory:  ", albumFactoryAddress);
  console.log("MusicFactory:  ", musicFactoryAddress);
  console.log("\nArtists use MusicFactory.createSong() / createAlbum(). 1% of each mint goes to platform treasury. Set platformTreasury via setPlatformTreasury() if needed.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
