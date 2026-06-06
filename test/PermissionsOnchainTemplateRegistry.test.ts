import { expect } from "chai";
import { ethers } from "hardhat";

describe("PermissionsOnchainTemplateRegistry", function () {
  const PREFIX_CHAIN_ID = "0x8433c0f99c6b469e58fe0000";
  const PREFIX_PERMISSIONS = "0x1ae13c51d491d18cf2340000";
  const PREFIX_ALLOWED_CALLS = "0x2543223386ce66feaf200000";
  const PREFIX_ALLOWED_ERC725Y_DATA_KEYS = "0x5cc3ff3dc8d6531e51af0000";
  const PREFIX_METADATA_URI = "0x5a5a852a7f77281fc9670000";
  const PREFIX_DEPRECATED = "0xa00359bcbbd4510c9ea20000";
  const PREFIX_EXISTS = "0xf7f8309273b315c453670000";
  const PREFIX_LATEST_VERSION = "0x27ce4d041e3b14bc47de0000";

  function lsp2MappingKey(prefix12: string, logicalKey: string): string {
    const inner = ethers.keccak256(ethers.solidityPacked(["bytes32"], [logicalKey]));
    const suffix20 = "0x" + inner.slice(-40); // lower 20 bytes
    return (prefix12 + suffix20.slice(2)).toLowerCase();
  }

  function templateKey(publisherUP: string, templateId: string, version: number): string {
    return ethers.keccak256(
      ethers.solidityPacked(["address", "bytes32", "uint32"], [publisherUP, templateId, version])
    );
  }

  function seriesKey(publisherUP: string, templateId: string): string {
    return ethers.keccak256(ethers.solidityPacked(["address", "bytes32"], [publisherUP, templateId]));
  }

  async function publishViaUP(
    mockUP: any,
    registry: any,
    args: {
      templateId: string;
      version: number;
      chainId: bigint;
      permissions: bigint;
      allowedCalls: string;
      allowedERC725YDataKeys: string;
      metadataURI: string;
    }
  ) {
    const data = registry.interface.encodeFunctionData("publishTemplate", [
      args.templateId,
      args.version,
      args.chainId,
      args.permissions,
      args.allowedCalls,
      args.allowedERC725YDataKeys,
      args.metadataURI,
    ]);
    return mockUP.forward(await registry.getAddress(), 0, data);
  }

  async function deprecateViaUP(
    mockUP: any,
    registry: any,
    templateId: string,
    version: number,
    deprecated: boolean
  ) {
    const data = registry.interface.encodeFunctionData("deprecateTemplate", [
      templateId,
      version,
      deprecated,
    ]);
    return mockUP.forward(await registry.getAddress(), 0, data);
  }

  it("rejects non-UP publisher (EOA)", async function () {
    const registry = await ethers.deployContract("PermissionsOnchainTemplateRegistry");

    const templateId = ethers.keccak256(ethers.toUtf8Bytes("forever-moments/gasless"));
    await expect(
      registry.publishTemplate(templateId, 1, 42, 1, "0x", "0x", "ipfs://example")
    )
      .to.be.revertedWithCustomError(registry, "PublisherMustBeUniversalProfile");
  });

  it("publishes a template and getTemplate returns identical payload", async function () {
    const registry = await ethers.deployContract("PermissionsOnchainTemplateRegistry");
    const mockUP = await ethers.deployContract("MockUniversalProfile");

    const templateId = ethers.keccak256(ethers.toUtf8Bytes("forever-moments/gasless"));
    const payload = {
      templateId,
      version: 1,
      chainId: 42n,
      permissions: 0x00000000000000000000000000000000000000000000000000000000000000ffn,
      allowedCalls: "0x11223344aabbcc",
      allowedERC725YDataKeys: "0xdeadbeef",
      metadataURI: "ipfs://QmTemplateMetadataExample",
    };

    await expect(publishViaUP(mockUP, registry, payload))
      .to.emit(registry, "TemplatePublished")
      .withArgs(
        await mockUP.getAddress(),
        templateId,
        payload.version,
        payload.chainId,
        payload.permissions,
        payload.allowedCalls,
        payload.allowedERC725YDataKeys,
        payload.metadataURI
      );

    const res = await registry.getTemplate(await mockUP.getAddress(), templateId, payload.version);
    expect(res.chainId).to.equal(payload.chainId);
    expect(res.permissions).to.equal(payload.permissions);
    expect(res.allowedCalls).to.equal(payload.allowedCalls);
    expect(res.allowedERC725YDataKeys).to.equal(payload.allowedERC725YDataKeys);
    expect(res.metadataURI).to.equal(payload.metadataURI);
    expect(res.deprecated).to.equal(false);
  });

  it("cannot republish same version", async function () {
    const registry = await ethers.deployContract("PermissionsOnchainTemplateRegistry");
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

    await publishViaUP(mockUP, registry, payload);

    await expect(publishViaUP(mockUP, registry, payload))
      .to.be.revertedWithCustomError(registry, "TemplateAlreadyExists");
  });

  it("deprecate toggles and emits event", async function () {
    const registry = await ethers.deployContract("PermissionsOnchainTemplateRegistry");
    const mockUP = await ethers.deployContract("MockUniversalProfile");

    const templateId = ethers.keccak256(ethers.toUtf8Bytes("forever-moments/gasless"));
    await publishViaUP(mockUP, registry, {
      templateId,
      version: 1,
      chainId: 42n,
      permissions: 1n,
      allowedCalls: "0x",
      allowedERC725YDataKeys: "0x",
      metadataURI: "ipfs://example",
    });

    await expect(deprecateViaUP(mockUP, registry, templateId, 1, true))
      .to.emit(registry, "TemplateDeprecated")
      .withArgs(await mockUP.getAddress(), templateId, 1, true);

    let res = await registry.getTemplate(await mockUP.getAddress(), templateId, 1);
    expect(res.deprecated).to.equal(true);

    await expect(deprecateViaUP(mockUP, registry, templateId, 1, false))
      .to.emit(registry, "TemplateDeprecated")
      .withArgs(await mockUP.getAddress(), templateId, 1, false);

    res = await registry.getTemplate(await mockUP.getAddress(), templateId, 1);
    expect(res.deprecated).to.equal(false);
  });

  it("latestVersion updates correctly and never decreases", async function () {
    const registry = await ethers.deployContract("PermissionsOnchainTemplateRegistry");
    const mockUP = await ethers.deployContract("MockUniversalProfile");

    const templateId = ethers.keccak256(ethers.toUtf8Bytes("forever-moments/gasless"));
    const base = {
      templateId,
      chainId: 42n,
      permissions: 1n,
      allowedCalls: "0x",
      allowedERC725YDataKeys: "0x",
      metadataURI: "ipfs://example",
    };

    await publishViaUP(mockUP, registry, { ...base, version: 1 });
    expect(await registry.getLatestVersion(await mockUP.getAddress(), templateId)).to.equal(1);

    await publishViaUP(mockUP, registry, { ...base, version: 3 });
    expect(await registry.getLatestVersion(await mockUP.getAddress(), templateId)).to.equal(3);

    await publishViaUP(mockUP, registry, { ...base, version: 2 });
    expect(await registry.getLatestVersion(await mockUP.getAddress(), templateId)).to.equal(3);
  });

  it("deterministic keys: offchain LSP2 keys match getData stored bytes", async function () {
    const registry = await ethers.deployContract("PermissionsOnchainTemplateRegistry");
    const mockUP = await ethers.deployContract("MockUniversalProfile");

    const publisherUP = await mockUP.getAddress();
    const templateId = ethers.keccak256(ethers.toUtf8Bytes("forever-moments/gasless"));
    const version = 7;
    const chainId = 42n;
    const permissions = 0x1234n;
    const allowedCalls = "0x010203";
    const allowedKeys = "0x0a0b0c0d";
    const metadataURI = "ipfs://QmTemplateMetadataExample";

    await publishViaUP(mockUP, registry, {
      templateId,
      version,
      chainId,
      permissions,
      allowedCalls,
      allowedERC725YDataKeys: allowedKeys,
      metadataURI,
    });

    const tKey = templateKey(publisherUP, templateId, version);

    const existsKey = lsp2MappingKey(PREFIX_EXISTS, tKey);
    expect(await registry.getData(existsKey)).to.equal("0x01");

    const chainIdKey = lsp2MappingKey(PREFIX_CHAIN_ID, tKey);
    expect(await registry.getData(chainIdKey)).to.equal(ethers.zeroPadValue(ethers.toBeHex(chainId), 32));

    const permissionsKey = lsp2MappingKey(PREFIX_PERMISSIONS, tKey);
    expect(await registry.getData(permissionsKey)).to.equal(
      ethers.zeroPadValue(ethers.toBeHex(permissions), 32)
    );

    const allowedCallsKey = lsp2MappingKey(PREFIX_ALLOWED_CALLS, tKey);
    expect(await registry.getData(allowedCallsKey)).to.equal(allowedCalls);

    const allowedKeysKey = lsp2MappingKey(PREFIX_ALLOWED_ERC725Y_DATA_KEYS, tKey);
    expect(await registry.getData(allowedKeysKey)).to.equal(allowedKeys);

    const metadataKey = lsp2MappingKey(PREFIX_METADATA_URI, tKey);
    expect(await registry.getData(metadataKey)).to.equal(ethers.hexlify(ethers.toUtf8Bytes(metadataURI)));

    const deprecatedKey = lsp2MappingKey(PREFIX_DEPRECATED, tKey);
    expect(await registry.getData(deprecatedKey)).to.equal("0x00");

    const sKey = seriesKey(publisherUP, templateId);
    const latestKey = lsp2MappingKey(PREFIX_LATEST_VERSION, sKey);
    expect(await registry.getData(latestKey)).to.equal(
      ethers.zeroPadValue(ethers.toBeHex(version), 32)
    );
  });
});

