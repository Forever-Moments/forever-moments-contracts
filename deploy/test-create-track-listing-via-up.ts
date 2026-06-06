import { ethers } from "hardhat";

/**
 * List a Groov TrackToken (LSP7) on TrackSecondaryMarket using a Universal Profile as seller.
 *
 * Flow: UP.execute → track.authorizeOperator(market, amount, "0x")
 *       UP.execute → market.createListing(track, tokenAmount, price, expiresAt)
 *
 * Prerequisites:
 *   - PRIVATE_KEY: controller that can sign KeyManager.execute for UP_ADDRESS
 *   - UP_ADDRESS: Universal Profile that owns the LSP7 balance on the track
 *   - Controller must have CALL permission to the track + market on the UP (see deploy/check-up-controller-permissions.ts)
 *
 * Env:
 *   UP_ADDRESS (required)
 *   TRACK_ADDRESS (default: 0x36d9Ee8Aa9E2Fd0db24212AB667462cdA0f0Afd3)
 *   TRACK_SECONDARY_MARKET_ADDRESS (default: mainnet deployment 0xF2ba854fDAeB8a084D0F2eaF351DeF2DF11d8eD5)
 *   LISTING_PRICE_WEI (default: 1 ether in wei — set explicitly for real listings)
 *   LISTING_TOKEN_AMOUNT (optional raw LSP7 units; default: 10**decimals = one edition)
 *   LISTING_EXPIRES_AT (optional uint64 unix; default 0 = no expiry)
 *
 * Run:
 *   LISTING_PRICE_WEI=5000000000000000000 npx hardhat run deploy/test-create-track-listing-via-up.ts --network lukso_mainnet
 */
const UP_ABI = [
  "function owner() view returns (address)",
  "function execute(uint256 operationType, address to, uint256 value, bytes data) payable returns (bytes)",
];
const KEY_MANAGER_ABI = ["function execute(bytes payload) payable returns (bytes)"];

const OPERATION_CALL = 0n;

const DEFAULT_TRACK = "0x36d9Ee8Aa9E2Fd0db24212AB667462cdA0f0Afd3";
const DEFAULT_MARKET_MAINNET = "0xF2ba854fDAeB8a084D0F2eaF351DeF2DF11d8eD5";

async function main() {
  const upAddress = process.env.UP_ADDRESS;
  if (!upAddress) {
    throw new Error("Missing UP_ADDRESS");
  }

  const trackAddress = process.env.TRACK_ADDRESS ?? DEFAULT_TRACK;
  const marketAddress = process.env.TRACK_SECONDARY_MARKET_ADDRESS ?? DEFAULT_MARKET_MAINNET;

  const priceEnv = process.env.LISTING_PRICE_WEI;
  const priceWei = priceEnv != null ? BigInt(priceEnv) : ethers.parseEther("1");

  const expiresAt =
    process.env.LISTING_EXPIRES_AT != null ? BigInt(process.env.LISTING_EXPIRES_AT) : 0n;

  const [signer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  const track = await ethers.getContractAt("TrackToken", trackAddress, ethers.provider);
  const market = await ethers.getContractAt("TrackSecondaryMarket", marketAddress, ethers.provider);

  const decimals = await track.decimals();
  const unit = 10n ** BigInt(decimals);
  const balance = await track.balanceOf(upAddress);

  const tokenAmountEnv = process.env.LISTING_TOKEN_AMOUNT;
  const tokenAmount = tokenAmountEnv != null ? BigInt(tokenAmountEnv) : unit;

  if (tokenAmount === 0n) {
    throw new Error("LISTING_TOKEN_AMOUNT / unit is zero");
  }
  if (balance < tokenAmount) {
    throw new Error(
      `UP balance ${balance.toString()} < tokenAmount ${tokenAmount.toString()} (raw LSP7 units)`
    );
  }

  console.log("chainId:", network.chainId.toString());
  console.log("signer (controller):", await signer.getAddress());
  console.log("UP (seller):", upAddress);
  console.log("track:", trackAddress);
  console.log("market:", marketAddress);
  console.log("decimals:", decimals.toString());
  console.log("tokenAmount (raw):", tokenAmount.toString());
  console.log("price (wei):", priceWei.toString());
  console.log("expiresAt:", expiresAt.toString());

  const up = new ethers.Contract(upAddress, UP_ABI, ethers.provider);
  const keyManagerAddress: string = await up.owner();
  console.log("KeyManager:", keyManagerAddress);

  const trackInterface = new ethers.Interface([
    "function authorizeOperator(address operator, uint256 amount, bytes operatorNotificationData) external",
  ]);
  const marketInterface = new ethers.Interface([
    "function createListing(address track, uint256 tokenAmount, uint256 price, uint64 expiresAt) external returns (uint256 listingId)",
  ]);

  const authCalldata = trackInterface.encodeFunctionData("authorizeOperator", [
    marketAddress,
    tokenAmount,
    "0x",
  ]);

  const listingCalldata = marketInterface.encodeFunctionData("createListing", [
    trackAddress,
    tokenAmount,
    priceWei,
    expiresAt,
  ]);

  const upContract = new ethers.Contract(upAddress, UP_ABI, signer);
  const upExecuteIface = new ethers.Interface(UP_ABI);

  const upInterface = new ethers.Interface(UP_ABI);
  const authPayload = upInterface.encodeFunctionData("execute", [
    OPERATION_CALL,
    trackAddress,
    0n,
    authCalldata,
  ]);

  const listingPayload = upInterface.encodeFunctionData("execute", [
    OPERATION_CALL,
    marketAddress,
    0n,
    listingCalldata,
  ]);

  const keyManager = new ethers.Contract(keyManagerAddress, KEY_MANAGER_ABI, signer);

  console.log("\n1) authorizeOperator on track via UP...");
  const tx1 = await keyManager.execute(authPayload);
  console.log("tx:", tx1.hash);
  await tx1.wait();
  const allowed = await track.authorizedAmountFor(marketAddress, upAddress);
  console.log("authorizedAmountFor(market, UP):", allowed.toString());

  const nextBefore = await market.nextListingId();
  console.log("\n2) createListing via UP...");
  const tx2 = await keyManager.execute(listingPayload);
  console.log("tx:", tx2.hash);
  const receipt = await tx2.wait();

  const nextAfter = await market.nextListingId();
  const listingId = nextAfter - 1n;
  console.log("nextListingId before/after:", nextBefore.toString(), nextAfter.toString());
  console.log("listingId (new):", listingId.toString());

  const l = await market.listings(listingId);
  console.log("\nListing:", {
    track: l.track,
    seller: l.seller,
    tokenAmount: l.tokenAmount.toString(),
    price: l.price.toString(),
    expiresAt: l.expiresAt.toString(),
    active: l.active,
  });

  if (l.seller.toLowerCase() !== upAddress.toLowerCase()) {
    console.warn("Warning: listing.seller != UP_ADDRESS (unexpected)");
  }

  console.log("\nBuyer can call market.buy with value = price wei (from listing).");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
