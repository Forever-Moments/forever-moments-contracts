import { ethers } from "hardhat";
import { GroovFactory, MusicURD } from "../../typechain-types";
import { Accounts } from "./fixtures";

export const TEST_CONTENT_HASH = ethers.keccak256(ethers.toUtf8Bytes("test-track-release-v1"));
export const LSP4_METADATA_KEY = "0x9afb95cacc9f95858ec44aa8c3b685511002e30ae54415823f406128b85b238e";
export const LSP33_METADATA_KEY = "0xbecee5b67fa43fb2e96c7c6ccdc23007fffc2b24205416b2122cd7b8d8ef48fa";
export const TEST_METADATA_URI = ethers.AbiCoder.defaultAbiCoder().encode(
  ["bytes32[]", "bytes[]"],
  [
    [LSP4_METADATA_KEY, LSP33_METADATA_KEY],
    [ethers.toUtf8Bytes("ipfs://QmTrackMetadata"), ethers.toUtf8Bytes("ipfs://QmTrackMetadataLSP33")],
  ]
);

/**
 * Deploy MusicURD with the given LIKES token (Groov comment indexing URD).
 */
export async function deployMusicURD(
  accounts: Accounts,
  likesToken: string
): Promise<MusicURD> {
  const MusicURDFactory = await ethers.getContractFactory("MusicURD");
  const urd = await MusicURDFactory.connect(accounts.deployer).deploy(likesToken);
  return urd as unknown as MusicURD;
}

export async function deployGroovFactory(
  accounts: Accounts,
  overrides?: { platformTreasury?: string; likesToken?: string; musicURD?: string }
) {
  const TrackFactoryFactory = await ethers.getContractFactory("TrackFactory");
  const trackFactory = await TrackFactoryFactory.connect(accounts.deployer).deploy();
  const GroovFactoryFactory = await ethers.getContractFactory("GroovFactory");
  const factory = await GroovFactoryFactory.connect(accounts.deployer).deploy(
    await trackFactory.getAddress(),
    overrides?.platformTreasury ?? ethers.ZeroAddress,
    overrides?.likesToken ?? ethers.ZeroAddress,
    overrides?.musicURD ?? ethers.ZeroAddress
  );
  return factory as unknown as GroovFactory;
}
