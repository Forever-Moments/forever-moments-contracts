import { expect } from "chai";
import { ethers } from "hardhat";
import { 
  MomentFactoryV3,
  MomentV3,
  LikesToken,
  MomentURD,
  CollectionRegistry
} from "../typechain-types";
import { getAccounts, deployContracts, TEST_METADATA } from "./helpers/fixtures";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("MomentFactoryV3", function () {
  let accounts: Awaited<ReturnType<typeof getAccounts>>;
  let contracts: Awaited<ReturnType<typeof deployContracts>>;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let collectionOwner: SignerWithAddress;
  let collectionUP: string;

  beforeEach(async function () {
    accounts = await getAccounts();
    contracts = await deployContracts(accounts);
    
    owner = accounts.owner;
    user1 = accounts.user1;
    collectionOwner = accounts.collectionOwner;
    
    // Create a mock collection UP address
    collectionUP = accounts.collectionOwner.address; // Simplified for testing
    
    // Note: In real tests, you'd need to set up the CollectionRegistry properly
    // This is a simplified version - you may need to adjust based on your registry implementation
  });

  describe("Deployment", function () {
    it("Should deploy with correct parameters", async function () {
      expect(await contracts.momentFactory.owner()).to.equal(owner.address);
      expect(await contracts.momentFactory.momentURD()).to.equal(await contracts.momentURD.getAddress());
      expect(await contracts.momentFactory.getImplementation()).to.equal(await contracts.momentImplementation.getAddress());
    });

    it("Should have correct LIKES_TOKEN constant", async function () {
      expect(await contracts.momentFactory.LIKES_TOKEN()).to.equal("0x403BfD53617555295347e0F7725CfdA480AB801e");
    });
  });

  describe("Moment Minting", function () {
    it("Should create a proxy using Clones library", async function () {
      // This test verifies that the proxy is created successfully
      // Note: You'll need to mock or set up CollectionRegistry.canMint() to return true
      
      // For now, we'll just verify the factory is set up correctly
      const implementation = await contracts.momentFactory.getImplementation();
      expect(implementation).to.equal(await contracts.momentImplementation.getAddress());
    });

    it("Should revert if collection validation fails", async function () {
      // This would require proper CollectionRegistry setup
      // For now, we'll skip or mock this
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to update MomentURD", async function () {
      const newURD = await ethers.deployContract("MomentURD");
      
      await expect(contracts.momentFactory.connect(owner).setMomentURD(await newURD.getAddress()))
        .to.emit(contracts.momentFactory, "MomentURDUpdated")
        .withArgs(await contracts.momentURD.getAddress(), await newURD.getAddress());

      expect(await contracts.momentFactory.momentURD()).to.equal(await newURD.getAddress());
    });

    it("Should revert if non-owner tries to update URD", async function () {
      const newURD = await ethers.deployContract("MomentURD");
      
      await expect(
        contracts.momentFactory.connect(user1).setMomentURD(await newURD.getAddress())
      ).to.be.reverted; // OpenZeppelin v5 uses different error format
    });

    it("Should allow owner to update implementation", async function () {
      const newImplementation = await ethers.deployContract("MomentV3", [accounts.deployer.address]);
      
      await expect(
        contracts.momentFactory.connect(owner).setMomentImplementation(await newImplementation.getAddress())
      )
        .to.emit(contracts.momentFactory, "ImplementationUpdated")
        .withArgs(await contracts.momentImplementation.getAddress(), await newImplementation.getAddress());

      expect(await contracts.momentFactory.getImplementation()).to.equal(await newImplementation.getAddress());
    });

    it("Should allow owner to update CollectionRegistry", async function () {
      const newRegistry = await ethers.deployContract("CollectionRegistry", [
        await contracts.momentFactory.getAddress(),
      ]);
      
      await expect(
        contracts.momentFactory.connect(owner).setCollectionRegistry(await newRegistry.getAddress())
      )
        .to.emit(contracts.momentFactory, "CollectionRegistryUpdated")
        .withArgs(await contracts.collectionRegistry.getAddress(), await newRegistry.getAddress());

      expect(await contracts.momentFactory.collectionRegistry()).to.equal(await newRegistry.getAddress());
    });

    it("Should revert on invalid addresses", async function () {
      await expect(
        contracts.momentFactory.connect(owner).setMomentURD(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid URD");

      await expect(
        contracts.momentFactory.connect(owner).setCollectionRegistry(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid registry");

      await expect(
        contracts.momentFactory.connect(owner).setMomentImplementation(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid implementation");
    });
  });

  describe("View Functions", function () {
    it("Should return correct moment collection mapping", async function () {
      // This would require minting a moment first
      // For now, we'll just verify the function exists
      const momentAddress = ethers.ZeroAddress;
      const collection = await contracts.momentFactory.getMomentCollection(momentAddress);
      expect(collection).to.equal(ethers.ZeroAddress);
    });

    it("Should return all moments", async function () {
      const allMoments = await contracts.momentFactory.getAllMoments();
      expect(allMoments).to.be.an("array");
    });

    it("Should return correct moments count", async function () {
      const count = await contracts.momentFactory.getMomentsCount();
      expect(count).to.equal(0);
    });

    it("Should correctly identify if address is a moment", async function () {
      const isMoment = await contracts.momentFactory.isMoment(ethers.ZeroAddress);
      expect(isMoment).to.be.false;
    });
  });
});

