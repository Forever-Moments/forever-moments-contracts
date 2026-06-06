import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { AlbumNFT } from "../typechain-types";
import { getAccounts } from "./helpers/fixtures";
import { deployAlbumNFT, TEST_CONTENT_HASH, TEST_METADATA_URI } from "./helpers/musicFixtures";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("AlbumNFT", function () {
  let album: AlbumNFT;
  let accounts: Awaited<ReturnType<typeof getAccounts>>;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let treasury: SignerWithAddress;

  const PRICE = 2n * 10n ** 18n;
  const MAX_SUPPLY = 10n;
  const ROYALTY_BPS = 500;

  async function fixture() {
    accounts = await getAccounts();
    album = await deployAlbumNFT(accounts, {
      pricePerMint: PRICE,
      maxSupply: MAX_SUPPLY,
      royaltyBps: ROYALTY_BPS,
    });
    return { album, accounts };
  }

  beforeEach(async function () {
    const f = await loadFixture(fixture);
    album = f.album;
    accounts = f.accounts;
    owner = accounts.owner;
    user1 = accounts.user1;
    treasury = accounts.treasury;
  });

  describe("Deployment", function () {
    it("Should set creator as owner", async function () {
      expect(await album.creator()).to.equal(owner.address);
      expect(await album.owner()).to.equal(owner.address);
    });
    it("Should set treasury, price, maxSupply, contentHash", async function () {
      expect(await album.treasury()).to.equal(treasury.address);
      expect(await album.pricePerMint()).to.equal(PRICE);
      expect(await album.maxSupply()).to.equal(MAX_SUPPLY);
      expect(await album.contentHash()).to.equal(TEST_CONTENT_HASH);
      expect(await album.totalMinted()).to.equal(0);
    });
    it("Should return royalty info", async function () {
      expect(await album.getRoyaltyBps()).to.equal(ROYALTY_BPS);
      expect(await album.getRoyaltyReceiver()).to.equal(owner.address);
      const [receiver, bps] = await album.getRoyaltyInfo(ethers.ZeroHash);
      expect(receiver).to.equal(owner.address);
      expect(bps).to.equal(ROYALTY_BPS);
    });
  });

  describe("mint", function () {
    it("Should mint one copy when paying exact price", async function () {
      await album.connect(user1).mint(1, { value: PRICE });
      expect(await album.totalMinted()).to.equal(1);
      expect(await album.balanceOf(user1.address)).to.equal(1n * 10n ** (await album.decimals()));
    });
    it("Should forward LYX to treasury", async function () {
      const before = await ethers.provider.getBalance(treasury.address);
      await album.connect(user1).mint(1, { value: PRICE });
      const after = await ethers.provider.getBalance(treasury.address);
      expect(after - before).to.equal(PRICE);
    });
    it("Should emit AlbumMinted", async function () {
      await expect(album.connect(user1).mint(1, { value: PRICE }))
        .to.emit(album, "AlbumMinted")
        .withArgs(user1.address, 1, PRICE);
    });
    it("Should revert when payment is wrong", async function () {
      await expect(album.connect(user1).mint(1, { value: PRICE - 1n })).to.be.reverted;
    });
    it("Should enforce maxSupply", async function () {
      await album.connect(user1).mint(Number(MAX_SUPPLY), { value: PRICE * MAX_SUPPLY });
      expect(await album.totalMinted()).to.equal(MAX_SUPPLY);
      await expect(album.connect(user1).mint(1, { value: PRICE })).to.be.reverted;
    });
  });

  describe("reserveMint", function () {
    it("Should allow creator to reserve copies without payment", async function () {
      await album.connect(owner).reserveMint(user1.address, 2);
      expect(await album.totalMinted()).to.equal(2);
      expect(await album.balanceOf(user1.address)).to.equal(2n * 10n ** (await album.decimals()));
    });
    it("Should count reserve toward supply", async function () {
      await album.connect(owner).reserveMint(owner.address, 3);
      await album.connect(user1).mint(1, { value: PRICE });
      expect(await album.totalMinted()).to.equal(4);
      await album.connect(user1).mint(6, { value: PRICE * 6n });
      expect(await album.totalMinted()).to.equal(MAX_SUPPLY);
      await expect(album.connect(user1).mint(1, { value: PRICE })).to.be.reverted;
    });
    it("Should revert when non-creator calls reserveMint", async function () {
      await expect(album.connect(user1).reserveMint(user1.address, 1)).to.be.reverted;
    });
  });

  describe("Admin (only creator)", function () {
    it("Should allow creator to setPrice", async function () {
      const newPrice = 3n * 10n ** 18n;
      await album.connect(owner).setPrice(newPrice);
      expect(await album.pricePerMint()).to.equal(newPrice);
      await album.connect(user1).mint(1, { value: newPrice });
      expect(await album.totalMinted()).to.equal(1);
    });
    it("Should allow creator to setTreasury", async function () {
      await album.connect(owner).setTreasury(user1.address);
      expect(await album.treasury()).to.equal(user1.address);
      await album.connect(owner).reserveMint(user1.address, 1);
      expect(await album.balanceOf(user1.address)).to.equal(1n * 10n ** (await album.decimals()));
    });
    it("Should allow creator to setMetadataURI when not frozen", async function () {
      const newURI = ethers.toUtf8Bytes("ipfs://QmNewAlbum");
      await expect(album.connect(owner).setMetadataURI(newURI)).to.emit(album, "MetadataUpdated");
    });
    it("Should allow creator to freezeMetadata", async function () {
      await album.connect(owner).freezeMetadata();
      expect(await album.metadataFrozen()).to.be.true;
      await expect(album.connect(owner).setMetadataURI(ethers.toUtf8Bytes("ipfs://x"))).to.be.reverted;
    });
    it("Should revert when non-creator calls admin", async function () {
      await expect(album.connect(user1).setPrice(PRICE)).to.be.reverted;
      await expect(album.connect(user1).setTreasury(user1.address)).to.be.reverted;
      await expect(album.connect(user1).setMetadataURI(TEST_METADATA_URI)).to.be.reverted;
      await expect(album.connect(user1).freezeMetadata()).to.be.reverted;
    });
  });
});
