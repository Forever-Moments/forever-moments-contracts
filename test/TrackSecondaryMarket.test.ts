import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { GroovFactory, TrackSecondaryMarket, TrackToken } from "../typechain-types";
import { getAccounts } from "./helpers/fixtures";
import { deployGroovFactory, TEST_CONTENT_HASH, TEST_METADATA_URI } from "./helpers/groovFixtures";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("TrackSecondaryMarket", function () {
  const TRACK_PRICE = ethers.parseEther("1");
  const MAX_SUPPLY = 100n;
  const LIST_PRICE = ethers.parseEther("5");

  let factory: GroovFactory;
  let market: TrackSecondaryMarket;
  let owner: SignerWithAddress;
  let seller: SignerWithAddress;
  let buyer: SignerWithAddress;
  let treasury: SignerWithAddress;

  async function deployTrack(
    royaltyArtistBps: number,
    royaltyEarlyBps: number,
    earlySupportersCap: bigint,
    treasuryOverride?: string
  ): Promise<TrackToken> {
    const t = treasuryOverride ?? treasury.address;
    const tx = await factory.connect(owner).createTrack(
      "Groov",
      "GRV",
      t,
      TRACK_PRICE,
      MAX_SUPPLY,
      TEST_METADATA_URI,
      TEST_CONTENT_HASH,
      0,
      earlySupportersCap,
      royaltyArtistBps,
      royaltyEarlyBps
    );
    const receipt = await tx.wait();
    const log = receipt!.logs.find(
      (l) => (l as { fragment?: { name: string } }).fragment?.name === "TrackCreated"
    ) as { args?: [string] } | undefined;
    const trackAddress = log?.args?.[0];
    return (await ethers.getContractAt("TrackToken", trackAddress!)) as unknown as TrackToken;
  }

  async function marketFixture() {
    const acc = await getAccounts();
    const fac = await deployGroovFactory(acc, { platformTreasury: ethers.ZeroAddress });
    const Market = await ethers.getContractFactory("TrackSecondaryMarket");
    const mar = (await Market.connect(acc.deployer).deploy(acc.treasury.address, 100)) as unknown as TrackSecondaryMarket;
    return { accounts: acc, factory: fac, market: mar };
  }

  beforeEach(async function () {
    const { accounts, factory: f, market: m } = await loadFixture(marketFixture);
    factory = f;
    market = m;
    owner = accounts.owner;
    seller = accounts.user1;
    buyer = accounts.user2;
    treasury = accounts.treasury;
  });

  it("full sale: single royalty + platform fee + seller", async function () {
    const track = await deployTrack(500, 0, 0n);
    await track.connect(seller).mint(1, { value: TRACK_PRICE });
    const unit = 10n ** (await track.decimals());
    expect(await track.balanceOf(seller.address)).to.equal(unit);

    await track.connect(seller).authorizeOperator(await market.getAddress(), unit, "0x");
    const listingId = await market.connect(seller).createListing.staticCall(
      await track.getAddress(),
      unit,
      LIST_PRICE,
      0
    );
    await market.connect(seller).createListing(await track.getAddress(), unit, LIST_PRICE, 0);

    const treasuryBefore = await ethers.provider.getBalance(treasury.address);
    const sellerBefore = await ethers.provider.getBalance(seller.address);

    const royaltyWei = (LIST_PRICE * 500n) / 10_000n;
    const platformWei = (LIST_PRICE * 100n) / 10_000n;

    await expect(market.connect(buyer).buy(listingId, { value: LIST_PRICE }))
      .to.emit(market, "Sale")
      .withArgs(
        listingId,
        await track.getAddress(),
        seller.address,
        buyer.address,
        unit,
        LIST_PRICE,
        royaltyWei,
        platformWei
      );

    expect(await track.balanceOf(buyer.address)).to.equal(unit);
    expect(await track.balanceOf(seller.address)).to.equal(0n);

    const sellerWei = LIST_PRICE - royaltyWei - platformWei;
    expect(await ethers.provider.getBalance(treasury.address)).to.equal(treasuryBefore + royaltyWei + platformWei);
    expect(await ethers.provider.getBalance(seller.address)).to.equal(sellerBefore + sellerWei);
  });

  it("splits LSP-18 between treasury and track contract (early pool)", async function () {
    const track = await deployTrack(300, 200, 10n);
    await track.connect(seller).mint(1, { value: TRACK_PRICE });
    const unit = 10n ** (await track.decimals());
    await track.connect(seller).authorizeOperator(await market.getAddress(), unit, "0x");
    const listingId = await market.connect(seller).createListing.staticCall(
      await track.getAddress(),
      unit,
      LIST_PRICE,
      0
    );
    await market.connect(seller).createListing(await track.getAddress(), unit, LIST_PRICE, 0);

    const trackAddr = await track.getAddress();
    const treasuryBefore = await ethers.provider.getBalance(treasury.address);
    const trackBefore = await ethers.provider.getBalance(trackAddr);
    const sellerBefore = await ethers.provider.getBalance(seller.address);

    await market.connect(buyer).buy(listingId, { value: LIST_PRICE });

    const payArtist = (LIST_PRICE * 300n) / 10_000n;
    const payEarly = (LIST_PRICE * 200n) / 10_000n;
    const platformWei = (LIST_PRICE * 100n) / 10_000n;
    const sellerWei = LIST_PRICE - payArtist - payEarly - platformWei;

    expect(await ethers.provider.getBalance(treasury.address)).to.equal(
      treasuryBefore + payArtist + platformWei
    );
    expect(await ethers.provider.getBalance(trackAddr)).to.equal(trackBefore + payEarly);
    expect(await track.balanceOf(buyer.address)).to.equal(unit);
    expect(await ethers.provider.getBalance(seller.address)).to.equal(sellerBefore + sellerWei);
  });

  it("reverts buy if operator allowance revoked", async function () {
    const track = await deployTrack(0, 0, 0n);
    await track.connect(seller).mint(1, { value: TRACK_PRICE });
    const unit = 10n ** (await track.decimals());
    await track.connect(seller).authorizeOperator(await market.getAddress(), unit, "0x");
    await market.connect(seller).createListing(await track.getAddress(), unit, LIST_PRICE, 0);

    await track.connect(seller).revokeOperator(await market.getAddress(), seller.address, false, "0x");

    await expect(market.connect(buyer).buy(1n, { value: LIST_PRICE })).to.be.revertedWithCustomError(
      market,
      "InsufficientOperatorAllowance"
    );
  });

  it("reverts buy after cancel", async function () {
    const track = await deployTrack(0, 0, 0n);
    await track.connect(seller).mint(1, { value: TRACK_PRICE });
    const unit = 10n ** (await track.decimals());
    await track.connect(seller).authorizeOperator(await market.getAddress(), unit, "0x");
    await market.connect(seller).createListing(await track.getAddress(), unit, LIST_PRICE, 0);

    await market.connect(seller).cancelListing(1n);
    await expect(market.connect(buyer).buy(1n, { value: LIST_PRICE })).to.be.revertedWithCustomError(
      market,
      "ListingNotActive"
    );
  });

  it("nonReentrant: nested buy from royalty receiver reverts (surfaces as LYXForwardFailed)", async function () {
    const Reentrant = await ethers.getContractFactory("ReentrantRoyaltyReceiver");
    const reentrant = await Reentrant.deploy(await market.getAddress());
    const track = await deployTrack(500, 0, 0n, await reentrant.getAddress());
    await track.connect(seller).mint(1, { value: TRACK_PRICE });
    const unit = 10n ** (await track.decimals());
    await track.connect(seller).authorizeOperator(await market.getAddress(), unit, "0x");
    const listingId = await market.connect(seller).createListing.staticCall(
      await track.getAddress(),
      unit,
      LIST_PRICE,
      0
    );
    await market.connect(seller).createListing(await track.getAddress(), unit, LIST_PRICE, 0);
    await reentrant.setListingId(listingId);

    // Royalty recipient tries nested buy; inner call hits ReentrancyGuard; outer buy sees failed LYX send.
    await expect(market.connect(buyer).buy(listingId, { value: LIST_PRICE })).to.be.revertedWithCustomError(
      market,
      "LYXForwardFailed"
    );
  });
});
