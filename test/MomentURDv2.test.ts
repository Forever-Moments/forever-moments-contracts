import { expect } from "chai";
import { ethers } from "hardhat";
import { LikesToken, MomentURDv2, MomentV2 } from "../typechain-types";
import { getAccounts, deployContracts, TEST_METADATA } from "./helpers/fixtures";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("MomentURDv2 (threaded comments via LIKES)", function () {
  const TYPE_ID_LSP7_RECEIVED =
    "0x20804611b3e2ea21c480dc465142210acf4a2485947541770ec1fb87dee4a55c";

  const COMMENT_MAGIC = "0x464d434d"; // bytes4("FMCM")
  const VERSION = 1;
  const ACTION_CREATE = 0;

  let accounts: Awaited<ReturnType<typeof getAccounts>>;
  let likesToken: LikesToken;
  let urd: MomentURDv2;
  let moment: MomentV2;

  let owner: SignerWithAddress;
  let author: SignerWithAddress;
  let operator: SignerWithAddress;
  let collectionOwner: SignerWithAddress;

  beforeEach(async function () {
    accounts = await getAccounts();
    ({ likesToken } = await deployContracts(accounts));

    owner = accounts.owner;
    author = accounts.user1;
    operator = accounts.user2;
    collectionOwner = accounts.collectionOwner;

    const URDFactory = await ethers.getContractFactory("MomentURDv2");
    urd = (await URDFactory.connect(accounts.deployer).deploy(
      await likesToken.getAddress()
    )) as unknown as MomentURDv2;

    const MomentV2Factory = await ethers.getContractFactory("MomentV2");
    moment = (await MomentV2Factory.connect(accounts.deployer).deploy(
      accounts.deployer.address
    )) as unknown as MomentV2;

    await moment.initialize(
      owner.address,
      accounts.deployer.address, // mock factory address
      TEST_METADATA,
      await likesToken.getAddress(),
      collectionOwner.address,
      await urd.getAddress()
    );
  });

  function encodeThreadedComment(parentId: bigint, text: string): string {
    return ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes4", "uint8", "uint8", "uint256", "string"],
      [COMMENT_MAGIC, VERSION, ACTION_CREATE, parentId, text]
    );
  }

  it("emits CommentCreated for legacy root comments (raw string bytes)", async function () {
    const amount = ethers.parseEther("1");
    await likesToken.connect(owner).mint(author.address, amount, true, "0x");

    const legacyText = "hello world";
    const tx = likesToken
      .connect(author)
      .transfer(
        author.address,
        await moment.getAddress(),
        amount,
        true,
        ethers.toUtf8Bytes(legacyText)
      );

    await expect(tx)
      .to.emit(urd, "CommentCreated")
      .withArgs(
        await moment.getAddress(),
        1n,
        0n,
        author.address,
        author.address,
        amount,
        legacyText
      );

    expect(await urd.commentCount(await moment.getAddress())).to.equal(1n);
  });

  it("supports replying to a comment via parentId", async function () {
    const amount = ethers.parseEther("1");
    await likesToken.connect(owner).mint(author.address, amount * 3n, true, "0x");
    await likesToken.connect(owner).mint(operator.address, amount * 3n, true, "0x");

    // Root comment (legacy)
    await expect(
      likesToken
        .connect(author)
        .transfer(
          author.address,
          await moment.getAddress(),
          amount,
          true,
          ethers.toUtf8Bytes("root")
        )
    )
      .to.emit(urd, "CommentCreated")
      .withArgs(
        await moment.getAddress(),
        1n,
        0n,
        author.address,
        author.address,
        amount,
        "root"
      );

    // Reply (structured)
    const replyData = encodeThreadedComment(1n, "reply-1");
    await expect(
      likesToken
        .connect(operator)
        .transfer(
          operator.address,
          await moment.getAddress(),
          amount,
          true,
          replyData
        )
    )
      .to.emit(urd, "CommentCreated")
      .withArgs(
        await moment.getAddress(),
        2n,
        1n,
        operator.address,
        operator.address,
        amount,
        "reply-1"
      );

    expect(await urd.commentCount(await moment.getAddress())).to.equal(2n);
  });

  it("attributes author=from even when operator executes the transfer (operator != from)", async function () {
    const amount = ethers.parseEther("1");
    await likesToken.connect(owner).mint(author.address, amount * 5n, true, "0x");

    // Root comment by author (operator == author)
    await likesToken
      .connect(author)
      .transfer(
        author.address,
        await moment.getAddress(),
        amount,
        true,
        ethers.toUtf8Bytes("root")
      );

    // Author authorizes operator to transfer on their behalf
    await likesToken
      .connect(author)
      .authorizeOperator(operator.address, amount, "0x");

    // Operator sends a reply on behalf of author
    const replyData = encodeThreadedComment(1n, "nested-reply");
    await expect(
      likesToken
        .connect(operator)
        .transfer(
          author.address, // from
          await moment.getAddress(),
          amount,
          true,
          replyData
        )
    )
      .to.emit(urd, "CommentCreated")
      .withArgs(
        await moment.getAddress(),
        2n,
        1n,
        author.address, // author (from)
        operator.address, // operator (msg.sender)
        amount,
        "nested-reply"
      );
  });

  it("reverts for invalid parent ids", async function () {
    const amount = ethers.parseEther("1");
    await likesToken.connect(owner).mint(author.address, amount, true, "0x");

    const badReply = encodeThreadedComment(999n, "nope");
    await expect(
      likesToken
        .connect(author)
        .transfer(
          author.address,
          await moment.getAddress(),
          amount,
          true,
          badReply
        )
    )
      .to.be.revertedWithCustomError(urd, "InvalidParentId")
      .withArgs(999n);
  });

  it("prevents forged calls (decoded to must equal msg.sender)", async function () {
    const amount = ethers.parseEther("1");
    const fakeReceivedData = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "address", "uint256", "bytes"],
      [
        author.address, // operator
        author.address, // from
        await moment.getAddress(), // to (moment)
        amount,
        ethers.toUtf8Bytes("forged"),
      ]
    );

    await expect(
      urd
        .connect(author)
        .universalReceiverDelegate(
          await likesToken.getAddress(),
          0,
          TYPE_ID_LSP7_RECEIVED,
          fakeReceivedData
        )
    )
      .to.be.revertedWithCustomError(urd, "InvalidReceiver")
      .withArgs(author.address, await moment.getAddress());
  });
});

