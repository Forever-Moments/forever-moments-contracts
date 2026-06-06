import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { SongToken } from "../typechain-types";
import { getAccounts } from "./helpers/fixtures";
import { deploySongToken, TEST_CONTENT_HASH, TEST_METADATA_URI } from "./helpers/musicFixtures";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("SongToken", function () {
  let song: SongToken;
  let accounts: Awaited<ReturnType<typeof getAccounts>>;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let treasury: SignerWithAddress;

  const PRICE = 1n * 10n ** 18n;
  const MAX_SUPPLY = 100n;

  async function fixture() {
    accounts = await getAccounts();
    song = await deploySongToken(accounts, {
      pricePerMint: PRICE,
      maxSupply: MAX_SUPPLY,
    });
    return { song, accounts };
  }

  beforeEach(async function () {
    const f = await loadFixture(fixture);
    song = f.song;
    accounts = f.accounts;
    owner = accounts.owner;
    user1 = accounts.user1;
    treasury = accounts.treasury;
  });

  describe("Deployment", function () {
    it("Should set creator as owner", async function () {
      expect(await song.creator()).to.equal(owner.address);
      expect(await song.owner()).to.equal(owner.address);
    });
    it("Should set treasury, price, maxSupply, contentHash", async function () {
      expect(await song.treasury()).to.equal(treasury.address);
      expect(await song.pricePerMint()).to.equal(PRICE);
      expect(await song.maxSupply()).to.equal(MAX_SUPPLY);
      expect(await song.contentHash()).to.equal(TEST_CONTENT_HASH);
      expect(await song.totalMinted()).to.equal(0);
    });
    it("Should return LSP18 royalty info when set", async function () {
      const songWithRoyalty = await deploySongToken(accounts, {
        pricePerMint: PRICE,
        maxSupply: MAX_SUPPLY,
        royaltyBps: 500,
        royaltyReceiver: owner.address,
      });
      expect(await songWithRoyalty.getRoyaltyBps()).to.equal(500);
      expect(await songWithRoyalty.getRoyaltyReceiver()).to.equal(owner.address);
      const [receiver, bps] = await songWithRoyalty.getRoyaltyInfo(ethers.ZeroHash);
      expect(receiver).to.equal(owner.address);
      expect(bps).to.equal(500);
    });
    it("Should return zero royalty when not set", async function () {
      expect(await song.getRoyaltyBps()).to.equal(0);
      expect(await song.getRoyaltyReceiver()).to.equal(ethers.ZeroAddress);
    });
  });

  describe("Mint", function () {
    it("Should mint when paying exact price * amount", async function () {
      await song.connect(user1).mint(2, { value: PRICE * 2n });
      expect(await song.totalMinted()).to.equal(2);
      expect(await song.balanceOf(user1.address)).to.equal(2n * 10n ** (await song.decimals()));
    });
    it("Should forward LYX to treasury", async function () {
      const before = await ethers.provider.getBalance(treasury.address);
      await song.connect(user1).mint(1, { value: PRICE });
      const after = await ethers.provider.getBalance(treasury.address);
      expect(after - before).to.equal(PRICE);
    });
    it("Should emit SongMinted", async function () {
      await expect(song.connect(user1).mint(1, { value: PRICE }))
        .to.emit(song, "SongMinted")
        .withArgs(user1.address, 1, PRICE);
    });
    it("Should revert when payment is wrong", async function () {
      await expect(song.connect(user1).mint(1, { value: PRICE - 1n })).to.be.reverted;
      await expect(song.connect(user1).mint(2, { value: PRICE })).to.be.reverted;
    });
    it("Should revert when amount is zero", async function () {
      await expect(song.connect(user1).mint(0, { value: 0n })).to.be.reverted;
    });
    it("Should enforce maxSupply", async function () {
      await song.connect(user1).mint(MAX_SUPPLY, { value: PRICE * MAX_SUPPLY });
      await expect(song.connect(user1).mint(1, { value: PRICE })).to.be.reverted;
    });
    it("Should allow unlimited supply when maxSupply is 0", async function () {
      const unlimited = await deploySongToken(accounts, { maxSupply: 0n, pricePerMint: PRICE });
      await unlimited.connect(user1).mint(50, { value: PRICE * 50n });
      expect(await unlimited.totalMinted()).to.equal(50);
      await unlimited.connect(user1).mint(50, { value: PRICE * 50n });
      expect(await unlimited.totalMinted()).to.equal(100);
    });
  });

  describe("Admin (only creator)", function () {
    it("Should allow creator to setPrice", async function () {
      const newPrice = 2n * 10n ** 18n;
      await song.connect(owner).setPrice(newPrice);
      expect(await song.pricePerMint()).to.equal(newPrice);
      await song.connect(user1).mint(1, { value: newPrice });
      expect(await song.totalMinted()).to.equal(1);
    });
    it("Should allow creator to setTreasury", async function () {
      await song.connect(owner).setTreasury(user1.address);
      expect(await song.treasury()).to.equal(user1.address);
      const before = await ethers.provider.getBalance(user1.address);
      await song.connect(owner).mint(1, { value: PRICE });
      const after = await ethers.provider.getBalance(user1.address);
      expect(after - before).to.equal(PRICE);
    });
    it("Should allow creator to setMetadataURI when not frozen", async function () {
      const newURI = ethers.toUtf8Bytes("ipfs://QmNew");
      await expect(song.connect(owner).setMetadataURI(newURI)).to.emit(song, "MetadataURIUpdated");
    });
    it("Should allow creator to freezeMetadata", async function () {
      await song.connect(owner).freezeMetadata();
      expect(await song.metadataFrozen()).to.be.true;
      await expect(song.connect(owner).setMetadataURI(ethers.toUtf8Bytes("ipfs://x"))).to.be.reverted;
    });
    it("Should revert when non-creator calls admin", async function () {
      await expect(song.connect(user1).setPrice(PRICE)).to.be.reverted;
      await expect(song.connect(user1).setTreasury(user1.address)).to.be.reverted;
      await expect(song.connect(user1).setMetadataURI(TEST_METADATA_URI)).to.be.reverted;
      await expect(song.connect(user1).freezeMetadata()).to.be.reverted;
    });
  });
});
