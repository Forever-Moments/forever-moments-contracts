import { expect } from "chai";
import { ethers } from "hardhat";
import { deployContracts, getAccounts, TEST_METADATA } from "./helpers/fixtures";
import { MomentFactoryV2, MomentURDv2, MomentV2 } from "../typechain-types";

describe("MomentFactoryV2 - MomentURD wiring", function () {
  it("owner can set MomentURDv2 for future mints", async function () {
    const accounts = await getAccounts();
    const { likesToken } = await deployContracts(accounts);

    const MomentV2Factory = await ethers.getContractFactory("MomentV2");
    const momentImplementation = (await MomentV2Factory.deploy(
      accounts.deployer.address
    )) as unknown as MomentV2;

    const URDv2Factory = await ethers.getContractFactory("MomentURDv2");
    const urd1 = (await URDv2Factory.deploy(
      await likesToken.getAddress()
    )) as unknown as MomentURDv2;
    const urd2 = (await URDv2Factory.deploy(
      await likesToken.getAddress()
    )) as unknown as MomentURDv2;

    const FactoryV2 = await ethers.getContractFactory("MomentFactoryV2");
    const factory = (await FactoryV2.deploy(
      "Forever Moments Factory V2",
      "FM2",
      accounts.owner.address,
      TEST_METADATA,
      await urd1.getAddress(),
      ethers.ZeroAddress, // registry (not needed for this admin test)
      await momentImplementation.getAddress()
    )) as unknown as MomentFactoryV2;

    await expect(factory.connect(accounts.owner).setMomentURD(await urd2.getAddress()))
      .to.emit(factory, "MomentURDUpdated")
      .withArgs(await urd1.getAddress(), await urd2.getAddress());

    expect(await factory.momentURD()).to.equal(await urd2.getAddress());
  });

  it("non-owner cannot set MomentURD", async function () {
    const accounts = await getAccounts();
    const { likesToken } = await deployContracts(accounts);

    const URDv2Factory = await ethers.getContractFactory("MomentURDv2");
    const urd = (await URDv2Factory.deploy(
      await likesToken.getAddress()
    )) as unknown as MomentURDv2;

    const MomentV2Factory = await ethers.getContractFactory("MomentV2");
    const momentImplementation = (await MomentV2Factory.deploy(
      accounts.deployer.address
    )) as unknown as MomentV2;

    const FactoryV2 = await ethers.getContractFactory("MomentFactoryV2");
    const factory = (await FactoryV2.deploy(
      "Forever Moments Factory V2",
      "FM2",
      accounts.owner.address,
      TEST_METADATA,
      await urd.getAddress(),
      ethers.ZeroAddress,
      await momentImplementation.getAddress()
    )) as unknown as MomentFactoryV2;

    await expect(factory.connect(accounts.user1).setMomentURD(await urd.getAddress()))
      .to.be.reverted; // OpenZeppelin v5 uses different error format
  });
});

