import { ethers } from "hardhat";

/**
 * Deploy TrackSecondaryMarket (singleton LYX secondary market for LSP7 Groov tracks).
 *
 * Constructor: (platformTreasury, platformFeeBps). Fee is in basis points (e.g. 100 = 1%).
 * If platformTreasury is address(0), platform fee is skipped (bps ignored for payouts).
 *
 * The deployer EOA becomes Ownable owner (setPlatformTreasury / setPlatformFeeBps). This matches
 * deploy-groov-factory.ts (PRIVATE_KEY deployer). If the market should be controlled by a
 * Universal Profile, deploy with an EOA then call transferOwnership(upAddress) from that EOA, or
 * deploy via UP.execute (see deploy/update-factoryv2-urd-via-up.ts for KeyManager.execute pattern).
 *
 * Run:
 *   npx hardhat run deploy/deploy-track-secondary-market.ts --network lukso_testnet
 *   npx hardhat run deploy/deploy-track-secondary-market.ts --network lukso_mainnet
 *
 * Prerequisites:
 *   - PRIVATE_KEY in .env (deployer EOA with LYX for gas)
 *
 * Optional .env:
 *   SECONDARY_PLATFORM_TREASURY — marketplace fee recipient (preferred for Groov secondary)
 *   PLATFORM_TREASURY — used if SECONDARY_PLATFORM_TREASURY is unset (same as Groov factory deploy)
 *   SECONDARY_PLATFORM_FEE_BPS — fee bps (0..10000); default 100 when treasury is non-zero, else 0
 *
 * Seller flow (off-chain + on-chain):
 *   1. track.authorizeOperator(market, tokenAmount, "0x")
 *   2. market.createListing(track, tokenAmount, priceWei, expiresAt)
 *   3. Buyer: market.buy(listingId) { value: priceWei }
 */
async function main() {
  const network = await ethers.provider.getNetwork();
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();

  const platformTreasury =
    process.env.SECONDARY_PLATFORM_TREASURY ?? process.env.PLATFORM_TREASURY ?? ethers.ZeroAddress;
  const feeEnv = process.env.SECONDARY_PLATFORM_FEE_BPS;
  const defaultBps = platformTreasury === ethers.ZeroAddress ? 0 : 100;
  const platformFeeBps = feeEnv != null ? parseInt(feeEnv, 10) : defaultBps;

  if (platformFeeBps < 0 || platformFeeBps > 10_000) {
    throw new Error("SECONDARY_PLATFORM_FEE_BPS must be 0..10000");
  }
  if (platformFeeBps > 0 && platformTreasury === ethers.ZeroAddress) {
    throw new Error(
      "Set SECONDARY_PLATFORM_TREASURY or PLATFORM_TREASURY when SECONDARY_PLATFORM_FEE_BPS > 0"
    );
  }

  console.log("Network chainId:", network.chainId.toString());
  console.log("Deployer:", deployerAddress, "(Ownable owner)");
  console.log("Platform treasury:", platformTreasury);
  console.log("Secondary platform fee (bps):", platformFeeBps);

  const Market = await ethers.getContractFactory("TrackSecondaryMarket");
  const market = await Market.connect(deployer).deploy(platformTreasury, platformFeeBps);
  await market.waitForDeployment();
  const marketAddress = await market.getAddress();
  console.log("\nTrackSecondaryMarket deployed:", marketAddress);

  const chainId = Number(network.chainId);
  if (chainId === 42) {
    console.log("Explorer: https://explorer.execution.mainnet.lukso.network/address/" + marketAddress);
  } else if (chainId === 4201) {
    console.log("Explorer: https://explorer.execution.testnet.lukso.network/address/" + marketAddress);
  }

  console.log("\n--- Summary ---");
  console.log("TrackSecondaryMarket:", marketAddress);
  console.log("Owner:", deployerAddress);
  console.log("Royalties: read from each track ERC725Y (LSP-18); market fee is separate from GroovFactory mint fee.");
  console.log("Admin: setPlatformFeeBps / setPlatformTreasury (onlyOwner).");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
