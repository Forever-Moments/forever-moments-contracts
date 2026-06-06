import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { MusicFactory, SongToken, AlbumNFT } from "../typechain-types";
import { getAccounts } from "./helpers/fixtures";
import { deployMusicFactory, TEST_CONTENT_HASH, TEST_METADATA_URI } from "./helpers/musicFixtures";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("MusicFactory", function () {
  let factory: MusicFactory;
  let accounts: Awaited<ReturnType<typeof getAccounts>>;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let treasury: SignerWithAddress;

  const SONG_PRICE = 1n * 10n ** 18n;
  const ALBUM_PRICE = 2n * 10n ** 18n;
  const MAX_SUPPLY_SONG = 100n;
  const MAX_SUPPLY_ALBUM = 10n;
  const ROYALTY_BPS = 500;

  async function fixture() {
    accounts = await getAccounts();
    factory = await deployMusicFactory(accounts);
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

  describe("createSong", function () {
    it("Should deploy SongToken with creator = msg.sender", async function () {
      const tx = await factory.connect(owner).createSong(
        "My Song",
        "SONG",
        treasury.address,
        SONG_PRICE,
        MAX_SUPPLY_SONG,
        TEST_METADATA_URI,
        TEST_CONTENT_HASH,
        0,
        ethers.ZeroAddress
      );
      const receipt = await tx.wait();
      const event = receipt!.logs.find((l: { fragment: { name: string } }) =>
        (l as { fragment?: { name: string } }).fragment?.name === "SongCreated"
      );
      expect(event).to.not.be.undefined;
      const songAddress = (event as { args?: [string, string, string] })?.args?.[0];
      expect(songAddress).to.be.properAddress;

      const song = await ethers.getContractAt("SongToken", songAddress) as unknown as SongToken;
      expect(await song.creator()).to.equal(owner.address);
      expect(await song.treasury()).to.equal(treasury.address);
      expect(await song.pricePerMint()).to.equal(SONG_PRICE);
      expect(await song.maxSupply()).to.equal(MAX_SUPPLY_SONG);
      expect(await song.contentHash()).to.equal(TEST_CONTENT_HASH);
    });
    it("Should emit SongCreated", async function () {
      const songAddress = await factory.connect(owner).createSong.staticCall(
        "My Song",
        "SONG",
        treasury.address,
        SONG_PRICE,
        MAX_SUPPLY_SONG,
        TEST_METADATA_URI,
        TEST_CONTENT_HASH,
        0,
        ethers.ZeroAddress
      );
      await expect(
        factory.connect(owner).createSong(
          "My Song",
          "SONG",
          treasury.address,
          SONG_PRICE,
          MAX_SUPPLY_SONG,
          TEST_METADATA_URI,
          TEST_CONTENT_HASH,
          0,
          ethers.ZeroAddress
        )
      )
        .to.emit(factory, "SongCreated")
        .withArgs(songAddress, owner.address, TEST_METADATA_URI);
    });
    it("Should use creator as treasury when treasury is zero", async function () {
      const tx = await factory.connect(owner).createSong(
        "My Song",
        "SONG",
        ethers.ZeroAddress,
        SONG_PRICE,
        MAX_SUPPLY_SONG,
        TEST_METADATA_URI,
        TEST_CONTENT_HASH,
        0,
        ethers.ZeroAddress
      );
      const receipt = await tx.wait();
      const event = receipt!.logs.find((l: { fragment: { name: string } }) =>
        (l as { fragment?: { name: string } }).fragment?.name === "SongCreated"
      );
      const songAddress = (event as { args?: [string] })?.args?.[0];
      const song = await ethers.getContractAt("SongToken", songAddress) as unknown as SongToken;
      expect(await song.treasury()).to.equal(owner.address);
    });
    it("Should allow minting on created song", async function () {
      const tx = await factory.connect(owner).createSong(
        "My Song",
        "SONG",
        treasury.address,
        SONG_PRICE,
        MAX_SUPPLY_SONG,
        TEST_METADATA_URI,
        TEST_CONTENT_HASH,
        0,
        ethers.ZeroAddress
      );
      const receipt = await tx.wait();
      const event = receipt!.logs.find((l: { fragment: { name: string } }) =>
        (l as { fragment?: { name: string } }).fragment?.name === "SongCreated"
      );
      const songAddress = (event as { args?: [string] })?.args?.[0];
      const song = await ethers.getContractAt("SongToken", songAddress) as unknown as SongToken;
      await song.connect(user1).mint(2, { value: SONG_PRICE * 2n });
      expect(await song.totalMinted()).to.equal(2);
      expect(await song.balanceOf(user1.address)).to.equal(2n * 10n ** (await song.decimals()));
    });
  });

  describe("createAlbum", function () {
    it("Should deploy AlbumNFT with creator = msg.sender", async function () {
      const tx = await factory.connect(owner).createAlbum(
        "My Album",
        "ALBUM",
        treasury.address,
        ALBUM_PRICE,
        MAX_SUPPLY_ALBUM,
        TEST_METADATA_URI,
        TEST_CONTENT_HASH,
        ROYALTY_BPS,
        owner.address
      );
      const receipt = await tx.wait();
      const event = receipt!.logs.find((l: { fragment: { name: string } }) =>
        (l as { fragment?: { name: string } }).fragment?.name === "AlbumCreated"
      );
      const albumAddress = (event as { args?: [string] })?.args?.[0];
      expect(albumAddress).to.be.properAddress;

      const album = await ethers.getContractAt("AlbumNFT", albumAddress) as unknown as AlbumNFT;
      expect(await album.creator()).to.equal(owner.address);
      expect(await album.treasury()).to.equal(treasury.address);
      expect(await album.pricePerMint()).to.equal(ALBUM_PRICE);
      expect(await album.maxSupply()).to.equal(MAX_SUPPLY_ALBUM);
      expect(await album.getRoyaltyBps()).to.equal(ROYALTY_BPS);
      expect(await album.getRoyaltyReceiver()).to.equal(owner.address);
    });
    it("Should emit AlbumCreated", async function () {
      const albumAddress = await factory.connect(owner).createAlbum.staticCall(
        "My Album",
        "ALBUM",
        treasury.address,
        ALBUM_PRICE,
        MAX_SUPPLY_ALBUM,
        TEST_METADATA_URI,
        TEST_CONTENT_HASH,
        ROYALTY_BPS,
        owner.address
      );
      await expect(
        factory.connect(owner).createAlbum(
          "My Album",
          "ALBUM",
          treasury.address,
          ALBUM_PRICE,
          MAX_SUPPLY_ALBUM,
          TEST_METADATA_URI,
          TEST_CONTENT_HASH,
          ROYALTY_BPS,
          owner.address
        )
      )
        .to.emit(factory, "AlbumCreated")
        .withArgs(albumAddress, owner.address, TEST_METADATA_URI);
    });
    it("Should allow mint on created album", async function () {
      const tx = await factory.connect(owner).createAlbum(
        "My Album",
        "ALBUM",
        treasury.address,
        ALBUM_PRICE,
        MAX_SUPPLY_ALBUM,
        TEST_METADATA_URI,
        TEST_CONTENT_HASH,
        ROYALTY_BPS,
        owner.address
      );
      const receipt = await tx.wait();
      const event = receipt!.logs.find((l: { fragment: { name: string } }) =>
        (l as { fragment?: { name: string } }).fragment?.name === "AlbumCreated"
      );
      const albumAddress = (event as { args?: [string] })?.args?.[0];
      const album = await ethers.getContractAt("AlbumNFT", albumAddress) as unknown as AlbumNFT;
      await album.connect(user1).mint(1, { value: ALBUM_PRICE });
      expect(await album.totalMinted()).to.equal(1);
    });
  });
});
