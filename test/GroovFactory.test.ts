import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { GroovFactory, TrackToken } from "../typechain-types";
import { getAccounts } from "./helpers/fixtures";
import {
  deployGroovFactory,
  LSP33_METADATA_KEY,
  LSP4_METADATA_KEY,
  TEST_CONTENT_HASH,
  TEST_METADATA_URI,
} from "./helpers/groovFixtures";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("GroovFactory", function () {
  let factory: GroovFactory;
  let accounts: Awaited<ReturnType<typeof getAccounts>>;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let treasury: SignerWithAddress;

  const TRACK_PRICE = 1n * 10n ** 18n;
  const MAX_SUPPLY = 100n;
  const ROYALTY_BPS = 500;

  async function fixture() {
    accounts = await getAccounts();
    factory = await deployGroovFactory(accounts);
    return { factory, accounts };
  }

  beforeEach(async function () {
    const f = await loadFixture(fixture);
    factory = f.factory;
    accounts = f.accounts;
    owner = accounts.owner;
    user1 = accounts.user1;
    treasury = accounts.treasury;
  });

  describe("createTrack", function () {
    it("should deploy TrackToken with creator = msg.sender", async function () {
      const tx = await factory.connect(owner).createTrack(
        "My Track",
        "TRACK",
        treasury.address,
        TRACK_PRICE,
        MAX_SUPPLY,
        TEST_METADATA_URI,
        TEST_CONTENT_HASH,
        0,
        0,
        0,
        0
      );
      const receipt = await tx.wait();
      const event = receipt!.logs.find(
        (l: { fragment: { name: string } }) =>
          (l as { fragment?: { name: string } }).fragment?.name === "TrackCreated"
      );
      expect(event).to.not.be.undefined;
      const trackAddress = (event as { args?: [string, string, string] })?.args?.[0];
      expect(trackAddress).to.be.properAddress;

      const track = (await ethers.getContractAt(
        "TrackToken",
        trackAddress
      )) as unknown as TrackToken;
      expect(await track.creator()).to.equal(owner.address);
      const supportedStandardsHash = ethers.keccak256(ethers.toUtf8Bytes("SupportedStandards"));
      const lsp33MusicNftHash = ethers.keccak256(ethers.toUtf8Bytes("LSP33MusicNFT"));
      const lsp33SupportedStandardsKey = ethers.concat([
        ethers.dataSlice(supportedStandardsHash, 0, 10),
        "0x0000",
        ethers.dataSlice(lsp33MusicNftHash, 0, 20),
      ]);
      expect(await track.getData(lsp33SupportedStandardsKey)).to.equal(
        ethers.dataSlice(lsp33MusicNftHash, 0, 4)
      );
      expect(await track.treasury()).to.equal(treasury.address);
      expect(await track.pricePerMint()).to.equal(TRACK_PRICE);
      expect(await track.maxSupply()).to.equal(MAX_SUPPLY);
      expect(await track.contentHash()).to.equal(TEST_CONTENT_HASH);
    });

    it("should emit TrackCreated", async function () {
      const trackAddress = await factory.connect(owner).createTrack.staticCall(
        "My Track",
        "TRACK",
        treasury.address,
        TRACK_PRICE,
        MAX_SUPPLY,
        TEST_METADATA_URI,
        TEST_CONTENT_HASH,
        0,
        0,
        0,
        0
      );
      await expect(
        factory.connect(owner).createTrack(
          "My Track",
          "TRACK",
          treasury.address,
          TRACK_PRICE,
          MAX_SUPPLY,
          TEST_METADATA_URI,
          TEST_CONTENT_HASH,
          0,
          0,
          0,
          0
        )
      )
        .to.emit(factory, "TrackCreated")
        .withArgs(trackAddress, owner.address, TEST_METADATA_URI);
    });

    it("should use creator as treasury when treasury is zero", async function () {
      const tx = await factory.connect(owner).createTrack(
        "My Track",
        "TRACK",
        ethers.ZeroAddress,
        TRACK_PRICE,
        MAX_SUPPLY,
        TEST_METADATA_URI,
        TEST_CONTENT_HASH,
        0,
        0,
        0,
        0
      );
      const receipt = await tx.wait();
      const event = receipt!.logs.find(
        (l: { fragment: { name: string } }) =>
          (l as { fragment?: { name: string } }).fragment?.name === "TrackCreated"
      );
      const trackAddress = (event as { args?: [string] })?.args?.[0];
      const track = (await ethers.getContractAt(
        "TrackToken",
        trackAddress
      )) as unknown as TrackToken;
      expect(await track.treasury()).to.equal(owner.address);
    });

    it("should revert when maxSupply is zero", async function () {
      await expect(
        factory.connect(owner).createTrack(
          "My Track",
          "TRACK",
          treasury.address,
          TRACK_PRICE,
          0,
          TEST_METADATA_URI,
          TEST_CONTENT_HASH,
          0,
          0,
          0,
          0
        )
      ).to.be.reverted;
    });

    it("should allow minting on created track", async function () {
      const tx = await factory.connect(owner).createTrack(
        "My Track",
        "TRACK",
        treasury.address,
        TRACK_PRICE,
        MAX_SUPPLY,
        TEST_METADATA_URI,
        TEST_CONTENT_HASH,
        0,
        0,
        0,
        0
      );
      const receipt = await tx.wait();
      const event = receipt!.logs.find(
        (l: { fragment: { name: string } }) =>
          (l as { fragment?: { name: string } }).fragment?.name === "TrackCreated"
      );
      const trackAddress = (event as { args?: [string] })?.args?.[0];
      const track = (await ethers.getContractAt(
        "TrackToken",
        trackAddress
      )) as unknown as TrackToken;
      await track.connect(user1).mint(2, { value: TRACK_PRICE * 2n });
      expect(await track.totalMinted()).to.equal(2);
      expect(await track.balanceOf(user1.address)).to.equal(
        2n * 10n ** (await track.decimals())
      );
    });

    it("should set royalties when provided", async function () {
      const tx = await factory.connect(owner).createTrack(
        "My Track",
        "TRACK",
        treasury.address,
        TRACK_PRICE,
        MAX_SUPPLY,
        TEST_METADATA_URI,
        TEST_CONTENT_HASH,
        0,
        0,
        ROYALTY_BPS,
        0
      );
      const receipt = await tx.wait();
      const event = receipt!.logs.find(
        (l: { fragment: { name: string } }) =>
          (l as { fragment?: { name: string } }).fragment?.name === "TrackCreated"
      );
      const trackAddress = (event as { args?: [string] })?.args?.[0];
      const track = (await ethers.getContractAt(
        "TrackToken",
        trackAddress
      )) as unknown as TrackToken;
      expect(await track.getRoyaltyBps()).to.equal(ROYALTY_BPS);
      expect(await track.getRoyaltyReceiver()).to.equal(treasury.address);
    });

    it("should revert deploy when LSP4 metadata key is missing", async function () {
      const invalidMetadataBatch = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32[]", "bytes[]"],
        [[LSP33_METADATA_KEY], [ethers.toUtf8Bytes("ipfs://only-lsp33")]]
      );

      await expect(
        factory.connect(owner).createTrack(
          "My Track",
          "TRACK",
          treasury.address,
          TRACK_PRICE,
          MAX_SUPPLY,
          invalidMetadataBatch,
          TEST_CONTENT_HASH,
          0,
          0,
          0,
          0
        )
      ).to.be.revertedWithCustomError(
        await ethers.getContractFactory("TrackToken"),
        "MissingLSP4Metadata"
      );
    });

    it("should revert deploy when LSP33 metadata key is missing", async function () {
      const invalidMetadataBatch = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32[]", "bytes[]"],
        [[LSP4_METADATA_KEY], [ethers.toUtf8Bytes("ipfs://only-lsp4")]]
      );

      await expect(
        factory.connect(owner).createTrack(
          "My Track",
          "TRACK",
          treasury.address,
          TRACK_PRICE,
          MAX_SUPPLY,
          invalidMetadataBatch,
          TEST_CONTENT_HASH,
          0,
          0,
          0,
          0
        )
      ).to.be.revertedWithCustomError(
        await ethers.getContractFactory("TrackToken"),
        "MissingLSP33Metadata"
      );
    });
  });

  describe("TrackToken reserveMint", function () {
    it("should let creator reserve mint for free", async function () {
      const tx = await factory.connect(owner).createTrack(
        "My Track",
        "TRACK",
        treasury.address,
        TRACK_PRICE,
        MAX_SUPPLY,
        TEST_METADATA_URI,
        TEST_CONTENT_HASH,
        0,
        0,
        0,
        0
      );
      const receipt = await tx.wait();
      const event = receipt!.logs.find(
        (l: { fragment: { name: string } }) =>
          (l as { fragment?: { name: string } }).fragment?.name === "TrackCreated"
      );
      const trackAddress = (event as { args?: [string] })?.args?.[0];
      const track = (await ethers.getContractAt(
        "TrackToken",
        trackAddress
      )) as unknown as TrackToken;

      await track.connect(owner).reserveMint(user1.address, 3);
      expect(await track.totalMinted()).to.equal(3);
      expect(await track.balanceOf(user1.address)).to.equal(
        3n * 10n ** (await track.decimals())
      );
    });

    it("should revert reserveMint when not owner", async function () {
      const tx = await factory.connect(owner).createTrack(
        "My Track",
        "TRACK",
        treasury.address,
        TRACK_PRICE,
        MAX_SUPPLY,
        TEST_METADATA_URI,
        TEST_CONTENT_HASH,
        0,
        0,
        0,
        0
      );
      const receipt = await tx.wait();
      const event = receipt!.logs.find(
        (l: { fragment: { name: string } }) =>
          (l as { fragment?: { name: string } }).fragment?.name === "TrackCreated"
      );
      const trackAddress = (event as { args?: [string] })?.args?.[0];
      const track = (await ethers.getContractAt(
        "TrackToken",
        trackAddress
      )) as unknown as TrackToken;

      await expect(
        track.connect(user1).reserveMint(user1.address, 1)
      ).to.be.reverted;
    });

    it("should revert reserveMint when would exceed maxSupply", async function () {
      const maxSupply = 5n;
      const tx = await factory.connect(owner).createTrack(
        "My Track",
        "TRACK",
        treasury.address,
        TRACK_PRICE,
        maxSupply,
        TEST_METADATA_URI,
        TEST_CONTENT_HASH,
        0,
        0,
        0,
        0
      );
      const receipt = await tx.wait();
      const event = receipt!.logs.find(
        (l: { fragment: { name: string } }) =>
          (l as { fragment?: { name: string } }).fragment?.name === "TrackCreated"
      );
      const trackAddress = (event as { args?: [string] })?.args?.[0];
      const track = (await ethers.getContractAt(
        "TrackToken",
        trackAddress
      )) as unknown as TrackToken;

      await track.connect(owner).reserveMint(owner.address, 3);
      await expect(
        track.connect(owner).reserveMint(owner.address, 3)
      ).to.be.revertedWithCustomError(track, "MaxSupplyReached");
    });

    it("should enforce maxSupply with mint + reserveMint combined", async function () {
      const maxSupply = 10n;
      const tx = await factory.connect(owner).createTrack(
        "My Track",
        "TRACK",
        treasury.address,
        TRACK_PRICE,
        maxSupply,
        TEST_METADATA_URI,
        TEST_CONTENT_HASH,
        0,
        0,
        0,
        0
      );
      const receipt = await tx.wait();
      const event = receipt!.logs.find(
        (l: { fragment: { name: string } }) =>
          (l as { fragment?: { name: string } }).fragment?.name === "TrackCreated"
      );
      const trackAddress = (event as { args?: [string] })?.args?.[0];
      const track = (await ethers.getContractAt(
        "TrackToken",
        trackAddress
      )) as unknown as TrackToken;

      await track.connect(owner).reserveMint(owner.address, 4);
      await track.connect(user1).mint(5, { value: TRACK_PRICE * 5n });
      expect(await track.totalMinted()).to.equal(9);

      await expect(
        track.connect(user1).mint(2, { value: TRACK_PRICE * 2n })
      ).to.be.revertedWithCustomError(track, "MaxSupplyReached");
    });
  });

  describe("TrackToken creator admin", function () {
    it("should let creator setPrice", async function () {
      const tx = await factory.connect(owner).createTrack(
        "My Track",
        "TRACK",
        treasury.address,
        TRACK_PRICE,
        MAX_SUPPLY,
        TEST_METADATA_URI,
        TEST_CONTENT_HASH,
        0,
        0,
        0,
        0
      );
      const receipt = await tx.wait();
      const event = receipt!.logs.find(
        (l: { fragment: { name: string } }) =>
          (l as { fragment?: { name: string } }).fragment?.name === "TrackCreated"
      );
      const trackAddress = (event as { args?: [string] })?.args?.[0];
      const track = (await ethers.getContractAt(
        "TrackToken",
        trackAddress
      )) as unknown as TrackToken;

      const newPrice = 2n * 10n ** 18n;
      await track.connect(owner).setPrice(newPrice);
      expect(await track.pricePerMint()).to.equal(newPrice);
      await track.connect(user1).mint(1, { value: newPrice });
      expect(await track.totalMinted()).to.equal(1);
    });

    it("should block metadata mutation paths when frozen", async function () {
      const tx = await factory.connect(owner).createTrack(
        "My Track",
        "TRACK",
        treasury.address,
        TRACK_PRICE,
        MAX_SUPPLY,
        TEST_METADATA_URI,
        TEST_CONTENT_HASH,
        0,
        0,
        0,
        0
      );
      const receipt = await tx.wait();
      const event = receipt!.logs.find(
        (l: { fragment: { name: string } }) =>
          (l as { fragment?: { name: string } }).fragment?.name === "TrackCreated"
      );
      const trackAddress = (event as { args?: [string] })?.args?.[0];
      const track = (await ethers.getContractAt(
        "TrackToken",
        trackAddress
      )) as unknown as TrackToken;

      await track.connect(owner).freezeMetadata();

      await expect(track.connect(owner).setMetadataURI(ethers.toUtf8Bytes("ipfs://updated"))).to.be.revertedWithCustomError(
        track,
        "MetadataAlreadyFrozen"
      );

      await expect(
        track.connect(owner).setData(LSP4_METADATA_KEY, ethers.toUtf8Bytes("ipfs://new-lsp4"))
      ).to.be.revertedWithCustomError(track, "MetadataAlreadyFrozen");

      await expect(
        track.connect(owner).setData(LSP33_METADATA_KEY, ethers.toUtf8Bytes("ipfs://new-lsp33"))
      ).to.be.revertedWithCustomError(track, "MetadataAlreadyFrozen");

      await expect(
        track.connect(owner).setDataBatch(
          [LSP4_METADATA_KEY, LSP33_METADATA_KEY],
          [ethers.toUtf8Bytes("ipfs://batch-lsp4"), ethers.toUtf8Bytes("ipfs://batch-lsp33")]
        )
      ).to.be.revertedWithCustomError(track, "MetadataAlreadyFrozen");
    });
  });

  describe("platform fee", function () {
    it("should default to 100 bps and be updatable by owner", async function () {
      expect(await factory.platformFeeBps()).to.equal(100);
      const deployer = accounts.deployer;
      await factory.connect(deployer).setPlatformFeeBps(150);
      expect(await factory.platformFeeBps()).to.equal(150);
    });
  });

  describe("early supporters pool", function () {
    const POOL_MINT_BPS = 900; // 9%
    const EARLY_CAP = 3;
    const ROYALTY_ARTIST_BPS = 500;
    const ROYALTY_EARLY_BPS = 200;

    it("should split mint proceeds and register first N minters as early supporters", async function () {
      const tx = await factory.connect(owner).createTrack(
        "Early Track",
        "EARLY",
        treasury.address,
        TRACK_PRICE,
        MAX_SUPPLY,
        TEST_METADATA_URI,
        TEST_CONTENT_HASH,
        POOL_MINT_BPS,
        EARLY_CAP,
        ROYALTY_ARTIST_BPS,
        ROYALTY_EARLY_BPS
      );
      const receipt = await tx.wait();
      const event = receipt!.logs.find(
        (l: { fragment: { name: string } }) =>
          (l as { fragment?: { name: string } }).fragment?.name === "TrackCreated"
      );
      const trackAddress = (event as { args?: [string] })?.args?.[0];
      const track = (await ethers.getContractAt(
        "TrackToken",
        trackAddress
      )) as unknown as TrackToken;

      expect(await track.earlySupportersCap()).to.equal(EARLY_CAP);
      expect(await track.poolMintBps()).to.equal(POOL_MINT_BPS);
      expect(await track.earlySupportersCount()).to.equal(0);
      expect(await track.totalPoolReceived()).to.equal(0);

      await track.connect(user1).mint(1, { value: TRACK_PRICE });
      expect(await track.isEarlySupporter(user1.address)).to.be.true;
      expect(await track.earlySupportersCount()).to.equal(1);
      const poolFromOne = (TRACK_PRICE * BigInt(POOL_MINT_BPS)) / 10000n;
      expect(await track.totalPoolReceived()).to.equal(poolFromOne);

      const { user2, collectionOwner, deployer } = accounts;
      await track.connect(user2).mint(1, { value: TRACK_PRICE });
      expect(await track.isEarlySupporter(user2.address)).to.be.true;
      expect(await track.earlySupportersCount()).to.equal(2);

      await track.connect(collectionOwner).mint(1, { value: TRACK_PRICE });
      expect(await track.earlySupportersCount()).to.equal(3);

      await track.connect(deployer).mint(1, { value: TRACK_PRICE });
      expect(await track.isEarlySupporter(deployer.address)).to.be.false;
      expect(await track.earlySupportersCount()).to.equal(3);
    });

    it("should let early supporters withdraw equal share of pool", async function () {
      const tx = await factory.connect(owner).createTrack(
        "Early Track",
        "EARLY",
        treasury.address,
        TRACK_PRICE,
        MAX_SUPPLY,
        TEST_METADATA_URI,
        TEST_CONTENT_HASH,
        POOL_MINT_BPS,
        EARLY_CAP,
        ROYALTY_ARTIST_BPS,
        ROYALTY_EARLY_BPS
      );
      const receipt = await tx.wait();
      const event = receipt!.logs.find(
        (l: { fragment: { name: string } }) =>
          (l as { fragment?: { name: string } }).fragment?.name === "TrackCreated"
      );
      const trackAddress = (event as { args?: [string] })?.args?.[0];
      const track = (await ethers.getContractAt(
        "TrackToken",
        trackAddress
      )) as unknown as TrackToken;

      await track.connect(user1).mint(1, { value: TRACK_PRICE });
      await track.connect(accounts.user2).mint(1, { value: TRACK_PRICE });
      const poolTotal = (TRACK_PRICE * 2n * BigInt(POOL_MINT_BPS)) / 10000n;
      expect(await track.totalPoolReceived()).to.equal(poolTotal);

      const sharePerPerson = poolTotal / 2n;
      expect(await track.claimableEarlySupport(user1.address)).to.equal(sharePerPerson);
      expect(await track.claimableEarlySupport(accounts.user2.address)).to.equal(sharePerPerson);

      const balBefore = await ethers.provider.getBalance(user1.address);
      const txWithdraw = await track.connect(user1).withdrawEarlySupport();
      const receiptWithdraw = await txWithdraw.wait();
      const gasUsed = receiptWithdraw!.gasUsed * receiptWithdraw!.gasPrice;
      const balAfter = await ethers.provider.getBalance(user1.address);
      expect(balAfter - balBefore).to.equal(sharePerPerson - gasUsed);
      expect(await track.claimableEarlySupport(user1.address)).to.equal(0);
    });

    it("should revert withdraw when not early supporter", async function () {
      const tx = await factory.connect(owner).createTrack(
        "Early Track",
        "EARLY",
        treasury.address,
        TRACK_PRICE,
        MAX_SUPPLY,
        TEST_METADATA_URI,
        TEST_CONTENT_HASH,
        POOL_MINT_BPS,
        EARLY_CAP,
        0,
        0
      );
      const receipt = await tx.wait();
      const event = receipt!.logs.find(
        (l: { fragment: { name: string } }) =>
          (l as { fragment?: { name: string } }).fragment?.name === "TrackCreated"
      );
      const trackAddress = (event as { args?: [string] })?.args?.[0];
      const track = (await ethers.getContractAt(
        "TrackToken",
        trackAddress
      )) as unknown as TrackToken;

      await track.connect(accounts.user2).mint(1, { value: TRACK_PRICE });
      await expect(
        track.connect(user1).withdrawEarlySupport()
      ).to.be.revertedWithCustomError(track, "NotEarlySupporter");
    });

    it("should not add reserve mint recipients as early supporters", async function () {
      const tx = await factory.connect(owner).createTrack(
        "Early Track",
        "EARLY",
        treasury.address,
        TRACK_PRICE,
        MAX_SUPPLY,
        TEST_METADATA_URI,
        TEST_CONTENT_HASH,
        POOL_MINT_BPS,
        EARLY_CAP,
        0,
        0
      );
      const receipt = await tx.wait();
      const event = receipt!.logs.find(
        (l: { fragment: { name: string } }) =>
          (l as { fragment?: { name: string } }).fragment?.name === "TrackCreated"
      );
      const trackAddress = (event as { args?: [string] })?.args?.[0];
      const track = (await ethers.getContractAt(
        "TrackToken",
        trackAddress
      )) as unknown as TrackToken;

      await track.connect(owner).reserveMint(user1.address, 2);
      expect(await track.isEarlySupporter(user1.address)).to.be.false;
      expect(await track.earlySupportersCount()).to.equal(0);
    });

    it("should credit pool when contract receives LYX (resale royalty)", async function () {
      const tx = await factory.connect(owner).createTrack(
        "Early Track",
        "EARLY",
        treasury.address,
        TRACK_PRICE,
        MAX_SUPPLY,
        TEST_METADATA_URI,
        TEST_CONTENT_HASH,
        POOL_MINT_BPS,
        EARLY_CAP,
        ROYALTY_ARTIST_BPS,
        ROYALTY_EARLY_BPS
      );
      const receipt = await tx.wait();
      const event = receipt!.logs.find(
        (l: { fragment: { name: string } }) =>
          (l as { fragment?: { name: string } }).fragment?.name === "TrackCreated"
      );
      const trackAddress = (event as { args?: [string] })?.args?.[0];
      const track = (await ethers.getContractAt(
        "TrackToken",
        trackAddress
      )) as unknown as TrackToken;

      await track.connect(user1).mint(1, { value: TRACK_PRICE });
      expect(await track.earlySupportersCount()).to.equal(1);
      const mintPool = (TRACK_PRICE * BigInt(POOL_MINT_BPS)) / 10000n;
      expect(await track.totalPoolReceived()).to.equal(mintPool);

      const royaltyLyx = 1n * 10n ** 17n; // 0.1 LYX
      await owner.sendTransaction({ to: trackAddress, value: royaltyLyx });
      expect(await track.totalPoolReceived()).to.equal(mintPool + royaltyLyx);
      expect(await track.claimableEarlySupport(user1.address)).to.equal(mintPool + royaltyLyx);
    });
  });
});
