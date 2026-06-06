import { expect } from "chai";
import { ethers } from "hardhat";
import { GroovFactory, LikesToken, MusicURD, TrackToken } from "../typechain-types";
import { getAccounts, deployContracts } from "./helpers/fixtures";
import {
  deployGroovFactory,
  deployMusicURD,
  TEST_CONTENT_HASH,
  TEST_METADATA_URI,
} from "./helpers/groovFixtures";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("MusicURD (Groov threaded comments on TrackToken via LIKES)", function () {
  const TYPE_ID_LSP7_RECEIVED =
    "0x20804611b3e2ea21c480dc465142210acf4a2485947541770ec1fb87dee4a55c";

  const COMMENT_MAGIC = "0x47525643"; // bytes4("GRVC")

  const TRACK_PRICE = 1n * 10n ** 18n;
  const MAX_SUPPLY = 100n;

  let accounts: Awaited<ReturnType<typeof getAccounts>>;
  let likesToken: LikesToken;
  let urd: MusicURD;
  let factory: GroovFactory;
  let track: TrackToken;

  let owner: SignerWithAddress;
  let author: SignerWithAddress;
  let operator: SignerWithAddress;
  let treasury: SignerWithAddress;

  beforeEach(async function () {
    accounts = await getAccounts();
    ({ likesToken } = await deployContracts(accounts));

    owner = accounts.owner;
    author = accounts.user1;
    operator = accounts.user2;
    treasury = accounts.treasury;

    const likesAddr = await likesToken.getAddress();
    urd = await deployMusicURD(accounts, likesAddr);
    factory = await deployGroovFactory(accounts, {
      likesToken: likesAddr,
      musicURD: await urd.getAddress(),
    });

    const tx = await factory.connect(owner).createTrack(
      "Test Track",
      "TRK",
      treasury.address,
      TRACK_PRICE,
      MAX_SUPPLY,
      TEST_METADATA_URI,
      TEST_CONTENT_HASH,
      0,
      0,
      0,
      0
    );
    const receipt = await tx.wait();
    const event = receipt!.logs.find(
      (l: { fragment?: { name?: string } }) =>
        (l as { fragment?: { name?: string } }).fragment?.name === "TrackCreated"
    );
    const trackAddress = (event as { args?: [string] })?.args?.[0];
    track = (await ethers.getContractAt("TrackToken", trackAddress)) as unknown as TrackToken;
  });

  function encodeThreadedComment(parentId: bigint, text: string): string {
    return ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes4", "uint8", "uint8", "uint256", "string"],
      [COMMENT_MAGIC, 1, 0, parentId, text]
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
        await track.getAddress(),
        amount,
        true,
        ethers.toUtf8Bytes(legacyText)
      );

    await expect(tx)
      .to.emit(urd, "CommentCreated")
      .withArgs(
        await track.getAddress(),
        1n,
        0n,
        author.address,
        author.address,
        amount,
        legacyText
      );

    expect(await urd.commentCount(await track.getAddress())).to.equal(1n);
  });

  it("supports replying to a comment via parentId (GRVC payload)", async function () {
    const amount = ethers.parseEther("1");
    await likesToken.connect(owner).mint(author.address, amount * 3n, true, "0x");
    await likesToken.connect(owner).mint(operator.address, amount * 3n, true, "0x");

    await expect(
      likesToken
        .connect(author)
        .transfer(
          author.address,
          await track.getAddress(),
          amount,
          true,
          ethers.toUtf8Bytes("root")
        )
    )
      .to.emit(urd, "CommentCreated")
      .withArgs(
        await track.getAddress(),
        1n,
        0n,
        author.address,
        author.address,
        amount,
        "root"
      );

    const replyData = encodeThreadedComment(1n, "reply-1");
    await expect(
      likesToken
        .connect(operator)
        .transfer(
          operator.address,
          await track.getAddress(),
          amount,
          true,
          replyData
        )
    )
      .to.emit(urd, "CommentCreated")
      .withArgs(
        await track.getAddress(),
        2n,
        1n,
        operator.address,
        operator.address,
        amount,
        "reply-1"
      );

    expect(await urd.commentCount(await track.getAddress())).to.equal(2n);
  });

  it("attributes author=from even when operator executes the transfer (operator != from)", async function () {
    const amount = ethers.parseEther("1");
    await likesToken.connect(owner).mint(author.address, amount * 5n, true, "0x");

    await likesToken
      .connect(author)
      .transfer(
        author.address,
        await track.getAddress(),
        amount,
        true,
        ethers.toUtf8Bytes("root")
      );

    await likesToken
      .connect(author)
      .authorizeOperator(operator.address, amount, "0x");

    const replyData = encodeThreadedComment(1n, "nested-reply");
    await expect(
      likesToken
        .connect(operator)
        .transfer(author.address, await track.getAddress(), amount, true, replyData)
    )
      .to.emit(urd, "CommentCreated")
      .withArgs(
        await track.getAddress(),
        2n,
        1n,
        author.address,
        operator.address,
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
          await track.getAddress(),
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
        author.address,
        author.address,
        await track.getAddress(),
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
      .withArgs(author.address, await track.getAddress());
  });

  it("reverts when sender is not the LIKES token", async function () {
    const amount = ethers.parseEther("1");
    const receivedData = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "address", "uint256", "bytes"],
      [
        author.address,
        author.address,
        await track.getAddress(),
        amount,
        ethers.toUtf8Bytes("x"),
      ]
    );

    await expect(
      urd
        .connect(author)
        .universalReceiverDelegate(author.address, 0, TYPE_ID_LSP7_RECEIVED, receivedData)
    )
      .to.be.revertedWithCustomError(urd, "InvalidLikesToken")
      .withArgs(author.address);
  });

  it("reverts for wrong typeId", async function () {
    const amount = ethers.parseEther("1");
    const receivedData = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "address", "uint256", "bytes"],
      [
        author.address,
        author.address,
        await track.getAddress(),
        amount,
        ethers.toUtf8Bytes("x"),
      ]
    );

    const wrongTypeId =
      "0x0000000000000000000000000000000000000000000000000000000000000001";

    await expect(
      urd
        .connect(author)
        .universalReceiverDelegate(await likesToken.getAddress(), 0, wrongTypeId, receivedData)
    )
      .to.be.revertedWithCustomError(urd, "InvalidTypeId")
      .withArgs(wrongTypeId);
  });
});
