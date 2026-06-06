import { expect } from "chai";
import { ethers } from "hardhat";

/** LSP-2 non-verifiable VerifiableURI: `0x0000` + `0x00000000` + `0x0000` + UTF-8(uri). Must match `PermissionControl._encodeVerifiableURI`. */
function encodeLsp2VerifiableUri(uri: string): string {
  const head = ethers.getBytes("0x0000000000000000");
  return ethers.hexlify(ethers.concat([head, ethers.toUtf8Bytes(uri)]));
}

/** Must match `LSP4Constants._LSP4_METADATA_KEY` in `@lukso/lsp4-contracts`. */
const LSP4_METADATA_KEY = "0x9afb95cacc9f95858ec44aa8c3b685511002e30ae54415823f406128b85b238e";

describe("PermissionControl", function () {
  async function deployPermissionControl() {
    return ethers.deployContract("PermissionControl", [
      "Permission Control",
      "PERM",
      (await ethers.getSigners())[0].address,
      encodeLsp2VerifiableUri("ipfs://permission-control-metadata"),
    ]);
  }

  function templateTokenId(publisherUP: string, templateId: string, version: number): string {
    return ethers.keccak256(
      ethers.solidityPacked(["address", "bytes32", "uint32"], [publisherUP, templateId, version])
    );
  }

  async function publishViaUP(
    mockUP: any,
    permissionControl: any,
    args: {
      templateId: string;
      version: number;
      chainId: bigint;
      permissions: bigint;
      allowedCalls: string;
      allowedERC725YDataKeys: string;
      metadataURI: string;
    },
    value: bigint
  ) {
    const data = permissionControl.interface.encodeFunctionData("publishTemplate", [
      args.templateId,
      args.version,
      args.chainId,
      args.permissions,
      args.allowedCalls,
      args.allowedERC725YDataKeys,
      args.metadataURI,
    ]);

    return mockUP.forward(await permissionControl.getAddress(), value, data, { value });
  }

  async function deprecateViaUP(mockUP: any, permissionControl: any, tokenId: string, deprecated: boolean) {
    const data = permissionControl.interface.encodeFunctionData("deprecateTemplate", [tokenId, deprecated]);
    return mockUP.forward(await permissionControl.getAddress(), 0, data);
  }

  it("rejects non-UP publisher (EOA)", async function () {
    const permissionControl = await deployPermissionControl();

    const templateId = ethers.keccak256(ethers.toUtf8Bytes("forever-moments/gasless"));
    await expect(
      permissionControl.publishTemplate(templateId, 1, 42, 1, "0x", "0x", "ipfs://example", {
        value: ethers.parseEther("10"),
      })
    ).to.be.revertedWithCustomError(permissionControl, "PublisherMustBeUniversalProfile");
  });

  it("requires exact mint fee", async function () {
    const permissionControl = await deployPermissionControl();
    const mockUP = await ethers.deployContract("MockUniversalProfile");

    const templateId = ethers.keccak256(ethers.toUtf8Bytes("forever-moments/gasless"));
    const payload = {
      templateId,
      version: 1,
      chainId: 42n,
      permissions: 1n,
      allowedCalls: "0x",
      allowedERC725YDataKeys: "0x",
      metadataURI: "ipfs://example",
    };

    await expect(publishViaUP(mockUP, permissionControl, payload, ethers.parseEther("9.9")))
      .to.be.revertedWithCustomError(permissionControl, "IncorrectMintFee");
  });

  it("mints template token and stores payload", async function () {
    const permissionControl = await deployPermissionControl();
    const mockUP = await ethers.deployContract("MockUniversalProfile");
    const publisherUP = await mockUP.getAddress();

    const templateId = ethers.keccak256(ethers.toUtf8Bytes("forever-moments/gasless"));
    const payload = {
      templateId,
      version: 1,
      chainId: 42n,
      permissions: 0x1234n,
      allowedCalls: "0x010203",
      allowedERC725YDataKeys: "0x0a0b0c0d",
      metadataURI: "ipfs://QmTemplateMetadataExample",
    };

    const expectedTokenId = templateTokenId(publisherUP, templateId, payload.version);

    await expect(publishViaUP(mockUP, permissionControl, payload, ethers.parseEther("10")))
      .to.emit(permissionControl, "TemplateMinted")
      .withArgs(
        publisherUP,
        templateId,
        payload.version,
        expectedTokenId,
        payload.chainId,
        payload.permissions,
        payload.allowedCalls,
        payload.allowedERC725YDataKeys,
        payload.metadataURI
      );

    expect(await permissionControl.tokenOwnerOf(expectedTokenId)).to.equal(publisherUP);
    expect(await permissionControl.existsTemplate(publisherUP, templateId, payload.version)).to.equal(true);
    expect(await permissionControl.getTemplateTokenId(publisherUP, templateId, payload.version)).to.equal(
      expectedTokenId
    );

    const [storedTemplate, storedTokenId] = await permissionControl.getTemplate(
      publisherUP,
      templateId,
      payload.version
    );
    expect(storedTokenId).to.equal(expectedTokenId);
    expect(storedTemplate.publisherUP).to.equal(publisherUP);
    expect(storedTemplate.templateId).to.equal(templateId);
    expect(storedTemplate.version).to.equal(payload.version);
    expect(storedTemplate.chainId).to.equal(payload.chainId);
    expect(storedTemplate.permissions).to.equal(payload.permissions);
    expect(storedTemplate.allowedCalls).to.equal(payload.allowedCalls);
    expect(storedTemplate.allowedERC725YDataKeys).to.equal(payload.allowedERC725YDataKeys);
    expect(storedTemplate.metadataURI).to.equal(payload.metadataURI);
    expect(storedTemplate.deprecated).to.equal(false);

    const lsp4ForToken = await permissionControl.getDataForTokenId(expectedTokenId, LSP4_METADATA_KEY);
    expect(lsp4ForToken).to.equal(encodeLsp2VerifiableUri(payload.metadataURI));
  });

  it("cannot publish duplicate publisher/template/version", async function () {
    const permissionControl = await deployPermissionControl();
    const mockUP = await ethers.deployContract("MockUniversalProfile");

    const templateId = ethers.keccak256(ethers.toUtf8Bytes("forever-moments/gasless"));
    const payload = {
      templateId,
      version: 1,
      chainId: 42n,
      permissions: 1n,
      allowedCalls: "0x",
      allowedERC725YDataKeys: "0x",
      metadataURI: "ipfs://example",
    };

    await publishViaUP(mockUP, permissionControl, payload, ethers.parseEther("10"));
    await expect(publishViaUP(mockUP, permissionControl, payload, ethers.parseEther("10")))
      .to.be.revertedWithCustomError(permissionControl, "TemplateAlreadyExists");
  });

  it("latest version updates monotonically", async function () {
    const permissionControl = await deployPermissionControl();
    const mockUP = await ethers.deployContract("MockUniversalProfile");
    const publisherUP = await mockUP.getAddress();

    const templateId = ethers.keccak256(ethers.toUtf8Bytes("forever-moments/gasless"));
    const basePayload = {
      templateId,
      chainId: 42n,
      permissions: 1n,
      allowedCalls: "0x",
      allowedERC725YDataKeys: "0x",
      metadataURI: "ipfs://example",
    };

    await publishViaUP(mockUP, permissionControl, { ...basePayload, version: 1 }, ethers.parseEther("10"));
    expect(await permissionControl.getLatestVersion(publisherUP, templateId)).to.equal(1);

    await publishViaUP(mockUP, permissionControl, { ...basePayload, version: 3 }, ethers.parseEther("10"));
    expect(await permissionControl.getLatestVersion(publisherUP, templateId)).to.equal(3);

    await publishViaUP(mockUP, permissionControl, { ...basePayload, version: 2 }, ethers.parseEther("10"));
    expect(await permissionControl.getLatestVersion(publisherUP, templateId)).to.equal(3);
  });

  it("deprecation toggle works and only token owner can call", async function () {
    const permissionControl = await deployPermissionControl();
    const mockUP = await ethers.deployContract("MockUniversalProfile");
    const [_, attacker] = await ethers.getSigners();
    const publisherUP = await mockUP.getAddress();

    const templateId = ethers.keccak256(ethers.toUtf8Bytes("forever-moments/gasless"));
    const payload = {
      templateId,
      version: 1,
      chainId: 42n,
      permissions: 1n,
      allowedCalls: "0x",
      allowedERC725YDataKeys: "0x",
      metadataURI: "ipfs://example",
    };
    const tokenId = templateTokenId(publisherUP, templateId, payload.version);

    await publishViaUP(mockUP, permissionControl, payload, ethers.parseEther("10"));

    await expect(permissionControl.connect(attacker).deprecateTemplate(tokenId, true))
      .to.be.revertedWithCustomError(permissionControl, "NotTemplateOwner");

    await expect(deprecateViaUP(mockUP, permissionControl, tokenId, true))
      .to.emit(permissionControl, "TemplateDeprecated")
      .withArgs(publisherUP, templateId, payload.version, tokenId, true);

    let stored = await permissionControl.getTemplateByTokenId(tokenId);
    expect(stored.deprecated).to.equal(true);

    await deprecateViaUP(mockUP, permissionControl, tokenId, false);
    stored = await permissionControl.getTemplateByTokenId(tokenId);
    expect(stored.deprecated).to.equal(false);
  });

  it("owner can update mint price and withdraw balance", async function () {
    const permissionControl = await deployPermissionControl();
    const mockUP = await ethers.deployContract("MockUniversalProfile");
    const [owner, recipient, nonOwner] = await ethers.getSigners();

    expect(await permissionControl.mintPrice()).to.equal(ethers.parseEther("10"));

    await expect(permissionControl.connect(nonOwner).setMintPrice(ethers.parseEther("12")))
      .to.be.revertedWithCustomError(permissionControl, "OwnableCallerNotTheOwner");

    await expect(permissionControl.setMintPrice(ethers.parseEther("12")))
      .to.emit(permissionControl, "MintPriceUpdated")
      .withArgs(ethers.parseEther("10"), ethers.parseEther("12"));

    const templateId = ethers.keccak256(ethers.toUtf8Bytes("forever-moments/gasless"));
    await publishViaUP(
      mockUP,
      permissionControl,
      {
        templateId,
        version: 1,
        chainId: 42n,
        permissions: 1n,
        allowedCalls: "0x",
        allowedERC725YDataKeys: "0x",
        metadataURI: "ipfs://example",
      },
      ethers.parseEther("12")
    );

    expect(await ethers.provider.getBalance(await permissionControl.getAddress())).to.equal(
      ethers.parseEther("12")
    );

    await expect(permissionControl.connect(nonOwner).withdraw(recipient.address, ethers.parseEther("1")))
      .to.be.revertedWithCustomError(permissionControl, "OwnableCallerNotTheOwner");

    await expect(permissionControl.withdraw(recipient.address, 0))
      .to.emit(permissionControl, "Withdrawal")
      .withArgs(recipient.address, ethers.parseEther("12"));

    expect(await ethers.provider.getBalance(await permissionControl.getAddress())).to.equal(0);
    expect(await permissionControl.owner()).to.equal(owner.address);
  });
});
