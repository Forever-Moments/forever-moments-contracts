import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { 
  MomentFactoryV3,
  MomentV3,
  LikesToken,
  MomentURD,
  CollectionRegistry
} from "../../typechain-types";

export interface Contracts {
  momentFactory: MomentFactoryV3;
  momentImplementation: MomentV3;
  likesToken: LikesToken;
  momentURD: MomentURD;
  collectionRegistry: CollectionRegistry;
}

export interface Accounts {
  deployer: SignerWithAddress;
  owner: SignerWithAddress;
  user1: SignerWithAddress;
  user2: SignerWithAddress;
  collectionOwner: SignerWithAddress;
  treasury: SignerWithAddress;
}

export async function getAccounts(): Promise<Accounts> {
  const [deployer, owner, user1, user2, collectionOwner, treasury] = await ethers.getSigners();
  return {
    deployer,
    owner,
    user1,
    user2,
    collectionOwner,
    treasury,
  };
}

export async function deployContracts(accounts: Accounts): Promise<Contracts> {
  // Deploy LikesToken
  const LikesTokenFactory = await ethers.getContractFactory("LikesToken");
  const likesToken = await LikesTokenFactory.connect(accounts.deployer).deploy(
    "Likes Token",
    "LIKES",
    accounts.owner.address,
    accounts.treasury.address,
    1000000, // 1M initial treasury likes
    ethers.toUtf8Bytes("ipfs://QmTestLikesToken")
  );

  // Deploy MomentURD
  const MomentURDFactory = await ethers.getContractFactory("MomentURD");
  const momentURD = await MomentURDFactory.connect(accounts.deployer).deploy();

  // Deploy MomentV3 Implementation
  // Note: ERC725Y requires a non-zero owner, but for implementation we can use deployer
  // The actual owner will be set during proxy initialization
  const MomentV3Factory = await ethers.getContractFactory("MomentV3");
  const momentImplementation = await MomentV3Factory.connect(accounts.deployer).deploy(
    accounts.deployer.address // Temporary owner for implementation contract
  );

  // Deploy a temporary factory address for CollectionRegistry constructor
  // We'll deploy the actual factory after, but CollectionRegistry needs a non-zero address
  const tempFactoryAddress = accounts.deployer.address; // Use deployer as placeholder

  // Deploy CollectionRegistry
  const CollectionRegistryFactory = await ethers.getContractFactory("CollectionRegistry");
  const collectionRegistry = await CollectionRegistryFactory.connect(accounts.deployer).deploy(
    tempFactoryAddress // CollectionRegistry requires non-zero factory address
  );

  // Deploy MomentFactoryV3
  const MomentFactoryV3Factory = await ethers.getContractFactory("MomentFactoryV3");
  const momentFactory = await MomentFactoryV3Factory.connect(accounts.deployer).deploy(
    "Forever Moments Factory",
    "FM",
    accounts.owner.address,
    ethers.toUtf8Bytes("ipfs://QmTestFactory"),
    await momentURD.getAddress(),
    await collectionRegistry.getAddress(),
    await momentImplementation.getAddress()
  );

  // Note: CollectionRegistry's factory address is set in constructor and can't be changed
  // For testing, this is acceptable as the registry validates against the factory

  return {
    momentFactory,
    momentImplementation,
    likesToken,
    momentURD,
    collectionRegistry,
  };
}

export const TEST_METADATA = ethers.toUtf8Bytes("ipfs://QmTestMetadata");
export const PLATFORM_TREASURY = "0x7dE347bE3EbAED43065182FcABA462796d6f2a83";
export const LIKES_TOKEN_ADDRESS = "0x403BfD53617555295347e0F7725CfdA480AB801e";

