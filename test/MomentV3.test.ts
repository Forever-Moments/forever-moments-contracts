import { expect } from "chai";
import { ethers } from "hardhat";
import { MomentV3, LikesToken, MomentURD } from "../typechain-types";
import { getAccounts, deployContracts, TEST_METADATA, PLATFORM_TREASURY } from "./helpers/fixtures";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("MomentV3", function () {
  let accounts: Awaited<ReturnType<typeof getAccounts>>;
  let momentV3: MomentV3;
  let likesToken: LikesToken;
  let momentURD: MomentURD;
  let momentFactory: any; // Mock factory for testing
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let collectionOwner: SignerWithAddress;
  let likesTokenOwner: SignerWithAddress;

  beforeEach(async function () {
    accounts = await getAccounts();
    ({ likesToken, momentURD } = await deployContracts(accounts));
    
    owner = accounts.user1;
    user1 = accounts.user2;
    collectionOwner = accounts.collectionOwner;
    likesTokenOwner = accounts.owner;

    // Deploy MomentV3 implementation
    // ERC725Y requires non-zero owner, use deployer address
    const MomentV3Factory = await ethers.getContractFactory("MomentV3");
    momentV3 = await MomentV3Factory.deploy(accounts.deployer.address);

    // For testing, we'll deploy a minimal factory mock
    // In real tests, you'd use the actual MomentFactoryV3
    const MockFactory = await ethers.getContractFactory("MomentFactoryV3");
    momentFactory = await MockFactory.deploy(
      "Test Factory",
      "TF",
      accounts.owner.address,
      TEST_METADATA,
      await momentURD.getAddress(),
      ethers.ZeroAddress, // Registry
      await momentV3.getAddress()
    );
  });

  describe("Initialization", function () {
    it("Should initialize with correct parameters", async function () {
      await momentV3.initialize(
        owner.address,
        await momentFactory.getAddress(),
        TEST_METADATA,
        await likesToken.getAddress(),
        collectionOwner.address,
        await momentURD.getAddress()
      );

      expect(await momentV3.owner()).to.equal(owner.address);
      expect(await momentV3.MOMENT_FACTORY()).to.equal(await momentFactory.getAddress());
      expect(await momentV3.collectionOwner()).to.equal(collectionOwner.address);
    });

    it("Should revert if initialized twice", async function () {
      await momentV3.initialize(
        owner.address,
        await momentFactory.getAddress(),
        TEST_METADATA,
        await likesToken.getAddress(),
        collectionOwner.address,
        await momentURD.getAddress()
      );

      await expect(
        momentV3.initialize(
          owner.address,
          await momentFactory.getAddress(),
          TEST_METADATA,
          await likesToken.getAddress(),
          collectionOwner.address,
          await momentURD.getAddress()
        )
      ).to.be.revertedWith("Already initialized");
    });
  });

  describe("Metadata", function () {
    beforeEach(async function () {
      await momentV3.initialize(
        owner.address,
        await momentFactory.getAddress(),
        TEST_METADATA,
        await likesToken.getAddress(),
        collectionOwner.address,
        await momentURD.getAddress()
      );
    });

    it("Should allow owner to update metadata", async function () {
      const newMetadata = ethers.toUtf8Bytes("ipfs://QmNewMetadata");
      const tokenId = ethers.zeroPadValue(await momentV3.getAddress(), 32);
      
      await expect(momentV3.connect(owner).setLSP4Metadata(tokenId, newMetadata))
        .to.emit(momentV3, "LSP4MetadataUpdated")
        .withArgs(tokenId, newMetadata);
    });

    it("Should revert if non-owner tries to update metadata", async function () {
      const newMetadata = ethers.toUtf8Bytes("ipfs://QmNewMetadata");
      const tokenId = ethers.zeroPadValue(await momentV3.getAddress(), 32);
      
      await expect(
        momentV3.connect(user1).setLSP4Metadata(tokenId, newMetadata)
      ).to.be.reverted; // OpenZeppelin v5 uses different error format
    });
  });

  describe("Likes Withdrawal", function () {
    beforeEach(async function () {
      await momentV3.initialize(
        owner.address,
        await momentFactory.getAddress(),
        TEST_METADATA,
        await likesToken.getAddress(),
        collectionOwner.address,
        await momentURD.getAddress()
      );

      // Mint some likes to the moment contract
      const amount = ethers.parseEther("100");
      await likesToken.connect(likesTokenOwner).mint(await momentV3.getAddress(), amount, true, "0x");
    });

    it("Should allow owner to withdraw likes", async function () {
      const amount = ethers.parseEther("50");
      const ownerBalanceBefore = await likesToken.balanceOf(owner.address);
      
      await expect(momentV3.connect(owner).withdrawLikes(amount))
        .to.emit(momentV3, "LikesWithdrawn")
        .withArgs(owner.address, amount);

      const ownerBalanceAfter = await likesToken.balanceOf(owner.address);
      expect(ownerBalanceAfter - ownerBalanceBefore).to.equal(amount);
    });

    it("Should revert if non-owner tries to withdraw", async function () {
      const amount = ethers.parseEther("50");
      await expect(
        momentV3.connect(user1).withdrawLikes(amount)
      ).to.be.revertedWith("Owner only");
    });

    it("Should revert if amount is zero", async function () {
      await expect(
        momentV3.connect(owner).withdrawLikes(0)
      ).to.be.revertedWith("Amount > 0");
    });

    it("Should revert if insufficient likes", async function () {
      const amount = ethers.parseEther("200");
      await expect(
        momentV3.connect(owner).withdrawLikes(amount)
      ).to.be.revertedWith("Insufficient LIKES");
    });
  });

  describe("Marketplace - Sale Price", function () {
    beforeEach(async function () {
      await momentV3.initialize(
        owner.address,
        await momentFactory.getAddress(),
        TEST_METADATA,
        await likesToken.getAddress(),
        collectionOwner.address,
        await momentURD.getAddress()
      );
    });

    it("Should allow owner to set sale price", async function () {
      const price = ethers.parseEther("1");
      
      // Owner needs to have likes for listing fee
      await likesToken.connect(likesTokenOwner).mint(owner.address, ethers.parseEther("42"), true, "0x");
      await likesToken.connect(owner).authorizeOperator(await momentV3.getAddress(), ethers.parseEther("42"), "0x");
      
      await expect(momentV3.connect(owner).setSalePrice(price))
        .to.emit(momentV3, "MomentListedForSale")
        .withArgs(price, owner.address);

      expect(await momentV3.salePrice()).to.equal(price);
      expect(await momentV3.isForSale()).to.be.true;
    });

    it("Should allow owner to remove from sale", async function () {
      const price = ethers.parseEther("1");
      
      // Set price first
      await likesToken.connect(likesTokenOwner).mint(owner.address, ethers.parseEther("42"), true, "0x");
      await likesToken.connect(owner).authorizeOperator(await momentV3.getAddress(), ethers.parseEther("42"), "0x");
      await momentV3.connect(owner).setSalePrice(price);
      
      // Remove from sale
      await expect(momentV3.connect(owner).setSalePrice(0))
        .to.emit(momentV3, "MomentRemovedFromSale")
        .withArgs(owner.address);

      expect(await momentV3.salePrice()).to.equal(0);
      expect(await momentV3.isForSale()).to.be.false;
    });

    it("Should revert if non-owner tries to set price", async function () {
      const price = ethers.parseEther("1");
      await expect(
        momentV3.connect(user1).setSalePrice(price)
      ).to.be.revertedWith("Only owner can set price");
    });
  });

  describe("Marketplace - Purchase", function () {
    beforeEach(async function () {
      await momentV3.initialize(
        owner.address,
        await momentFactory.getAddress(),
        TEST_METADATA,
        await likesToken.getAddress(),
        collectionOwner.address,
        await momentURD.getAddress()
      );

      // Set up sale
      const price = ethers.parseEther("1");
      await likesToken.connect(likesTokenOwner).mint(owner.address, ethers.parseEther("42"), true, "0x");
      await likesToken.connect(owner).authorizeOperator(await momentV3.getAddress(), ethers.parseEther("42"), "0x");
      await momentV3.connect(owner).setSalePrice(price);

      // Mint the LSP8 tokenId in the factory so purchaseMoment() can transfer it
      const tokenId = ethers.zeroPadValue(await momentV3.getAddress(), 32);
      await momentFactory.connect(likesTokenOwner).mint(owner.address, tokenId, true, "0x");
      await momentFactory.connect(owner).authorizeOperator(await momentV3.getAddress(), tokenId, "0x");
    });

    it("Should allow purchase with correct payment", async function () {
      const price = ethers.parseEther("1");
      const buyerBalanceBefore = await ethers.provider.getBalance(user1.address);
      
      await expect(
        momentV3.connect(user1).purchaseMoment({ value: price })
      )
        .to.emit(momentV3, "MomentPurchased")
        .withArgs(user1.address, owner.address, price);

      expect(await momentV3.salePrice()).to.equal(0);
    });

    it("Should revert if moment not for sale", async function () {
      // Remove from sale first
      await momentV3.connect(owner).setSalePrice(0);
      
      await expect(
        momentV3.connect(user1).purchaseMoment({ value: ethers.parseEther("1") })
      ).to.be.revertedWith("Moment not for sale");
    });

    it("Should revert if insufficient payment", async function () {
      await expect(
        momentV3.connect(user1).purchaseMoment({ value: ethers.parseEther("0.5") })
      ).to.be.revertedWith("Insufficient payment");
    });

    it("Should revert if owner tries to buy own moment", async function () {
      await expect(
        momentV3.connect(owner).purchaseMoment({ value: ethers.parseEther("1") })
      ).to.be.revertedWith("Cannot buy your own Moment");
    });
  });
});

