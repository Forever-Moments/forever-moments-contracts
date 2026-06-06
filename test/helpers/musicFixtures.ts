import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { SongToken, AlbumNFT, MusicFactory, SongFactory, AlbumFactory } from "../../typechain-types";
import { getAccounts, Accounts } from "./fixtures";

export interface MusicContracts {
  songToken: SongToken;
  albumNFT: AlbumNFT;
  musicFactory: MusicFactory;
  songFactory: SongFactory;
  albumFactory: AlbumFactory;
}

export const TEST_CONTENT_HASH = ethers.keccak256(ethers.toUtf8Bytes("test-release-v1"));
export const TEST_METADATA_URI = ethers.toUtf8Bytes("ipfs://QmSongMetadata");

export async function deploySongToken(accounts: Accounts, overrides?: Partial<{
  creator: string;
  treasury: string;
  platformTreasury: string;
  platformFeeBps: number;
  pricePerMint: bigint;
  maxSupply: bigint;
  royaltyBps: number;
  royaltyReceiver: string;
  likesToken: string;
  musicURD: string;
}>) {
  const creator = overrides?.creator ?? accounts.owner.address;
  const treasury = overrides?.treasury ?? accounts.treasury.address;
  const platformTreasury = overrides?.platformTreasury ?? ethers.ZeroAddress;
  const platformFeeBps = overrides?.platformFeeBps ?? 0;
  const pricePerMint = overrides?.pricePerMint ?? 1n * 10n ** 18n;
  const maxSupply = overrides?.maxSupply ?? 100n;
  const royaltyBps = overrides?.royaltyBps ?? 0;
  const royaltyReceiver = overrides?.royaltyReceiver ?? ethers.ZeroAddress;
  const likesToken = overrides?.likesToken ?? ethers.ZeroAddress;
  const musicURD = overrides?.musicURD ?? ethers.ZeroAddress;

  const SongTokenFactory = await ethers.getContractFactory("SongToken");
  const song = await SongTokenFactory.connect(accounts.deployer).deploy(
    "Test Song",
    "SONG",
    creator,
    treasury,
    platformTreasury,
    platformFeeBps,
    pricePerMint,
    maxSupply,
    TEST_METADATA_URI,
    TEST_CONTENT_HASH,
    royaltyBps,
    royaltyReceiver,
    likesToken,
    musicURD
  );
  return song as unknown as SongToken;
}

export async function deployAlbumNFT(accounts: Accounts, overrides?: Partial<{
  creator: string;
  treasury: string;
  platformTreasury: string;
  platformFeeBps: number;
  pricePerMint: bigint;
  maxSupply: bigint;
  royaltyBps: number;
  royaltyReceiver: string;
  likesToken: string;
  musicURD: string;
}>) {
  const creator = overrides?.creator ?? accounts.owner.address;
  const treasury = overrides?.treasury ?? accounts.treasury.address;
  const platformTreasury = overrides?.platformTreasury ?? ethers.ZeroAddress;
  const platformFeeBps = overrides?.platformFeeBps ?? 0;
  const pricePerMint = overrides?.pricePerMint ?? 2n * 10n ** 18n;
  const maxSupply = overrides?.maxSupply ?? 10n;
  const royaltyBps = overrides?.royaltyBps ?? 500;
  const royaltyReceiver = overrides?.royaltyReceiver ?? accounts.owner.address;
  const likesToken = overrides?.likesToken ?? ethers.ZeroAddress;
  const musicURD = overrides?.musicURD ?? ethers.ZeroAddress;

  const AlbumNFTFactory = await ethers.getContractFactory("AlbumNFT");
  const album = await AlbumNFTFactory.connect(accounts.deployer).deploy(
    "Test Album",
    "ALBUM",
    creator,
    treasury,
    platformTreasury,
    platformFeeBps,
    pricePerMint,
    maxSupply,
    TEST_METADATA_URI,
    TEST_CONTENT_HASH,
    royaltyBps,
    royaltyReceiver,
    likesToken,
    musicURD
  );
  return album as unknown as AlbumNFT;
}

export async function deployMusicFactory(accounts: Accounts, overrides?: { platformTreasury?: string; likesToken?: string; musicURD?: string }) {
  const SongFactoryFactory = await ethers.getContractFactory("SongFactory");
  const songFactory = await SongFactoryFactory.connect(accounts.deployer).deploy();
  const AlbumFactoryFactory = await ethers.getContractFactory("AlbumFactory");
  const albumFactory = await AlbumFactoryFactory.connect(accounts.deployer).deploy();
  const MusicFactoryFactory = await ethers.getContractFactory("MusicFactory");
  const factory = await MusicFactoryFactory.connect(accounts.deployer).deploy(
    await songFactory.getAddress(),
    await albumFactory.getAddress(),
    overrides?.platformTreasury ?? ethers.ZeroAddress,
    overrides?.likesToken ?? ethers.ZeroAddress,
    overrides?.musicURD ?? ethers.ZeroAddress
  );
  return factory as unknown as MusicFactory;
}

export async function deployMusicContracts(accounts: Accounts): Promise<MusicContracts> {
  const songToken = await deploySongToken(accounts);
  const albumNFT = await deployAlbumNFT(accounts);
  const SongFactoryFactory = await ethers.getContractFactory("SongFactory");
  const songFactory = await SongFactoryFactory.connect(accounts.deployer).deploy();
  const AlbumFactoryFactory = await ethers.getContractFactory("AlbumFactory");
  const albumFactory = await AlbumFactoryFactory.connect(accounts.deployer).deploy();
  const MusicFactoryFactory = await ethers.getContractFactory("MusicFactory");
  const musicFactory = await MusicFactoryFactory.connect(accounts.deployer).deploy(
    await songFactory.getAddress(),
    await albumFactory.getAddress(),
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress
  );
  return {
    songToken,
    albumNFT,
    musicFactory,
    songFactory: songFactory as unknown as SongFactory,
    albumFactory: albumFactory as unknown as AlbumFactory,
  };
}
