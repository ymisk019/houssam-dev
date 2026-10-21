"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { deflateRawSync } = require("node:zlib");
const { inspectArchive } = require("../archive");

const crcTable = Array.from({ length: 256 }, (_, number) => {
  let value = number;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function makeZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const content = Buffer.from(entry.content || "");
    const method = entry.method || 0;
    const packed = method === 8 ? deflateRawSync(content) : content;
    const checksum = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(((entry.mode || 0) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + packed.length;
  }
  const localData = Buffer.concat(localParts);
  const centralData = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralData.length, 12);
  end.writeUInt32LE(localData.length, 16);
  return Buffer.concat([localData, centralData, end]);
}

test("inspects a valid browser archive without executing its files", async () => {
  const archive = makeZip([
    { name: "index.html", content: "<script src='game.js'></script>" },
    { name: "game.js", content: "fetch('https://example.test/telemetry');" }
  ]);
  const report = await inspectArchive(archive, true);
  assert.equal(report.rootHtml, true);
  assert.equal(report.fileCount, 2);
  assert.equal(report.evidenceComplete, true);
  assert.equal(report.files.find(file => file.path === "game.js").content.toString(), "fetch('https://example.test/telemetry');");
  assert.ok(report.staticFindings.some(finding => finding.filePath === "game.js"));
});

test("rejects path traversal and duplicate file names", async () => {
  await assert.rejects(inspectArchive(makeZip([{ name: "../index.html", content: "x" }]), true), /relative path|unsafe or invalid file path/);
  await assert.rejects(inspectArchive(makeZip([
    { name: "index.html", content: "a" },
    { name: "INDEX.HTML", content: "b" }
  ]), true), /duplicate file names/);
});

test("rejects excessive compression, unsupported browser files, and symbolic links", async () => {
  await assert.rejects(inspectArchive(makeZip([{ name: "index.html", content: "A".repeat(5000), method: 8 }]), true), /compression ratio/);
  await assert.rejects(inspectArchive(makeZip([{ name: "index.html", content: "x" }, { name: "tool.exe", content: "x" }]), true), /Unsupported browser-game file type/);
  await assert.rejects(inspectArchive(makeZip([{ name: "index.html", content: "x", mode: 0xa1ff }]), true), /Symbolic links/);
});

test("marks incomplete text evidence and only accepts a root lowercase index.html", async () => {
  const missingRoot = await inspectArchive(makeZip([{ name: "Game/index.html", content: "<html></html>" }]), true);
  const uppercaseRoot = await inspectArchive(makeZip([{ name: "INDEX.HTML", content: "<html></html>" }]), true);
  assert.equal(missingRoot.rootHtml, false);
  assert.equal(uppercaseRoot.rootHtml, false);
  assert.equal(uppercaseRoot.evidenceComplete, true);
});

test("rejects archives with an invalid ZIP signature", async () => {
  await assert.rejects(inspectArchive(Buffer.from("not a zip"), true), /not a valid ZIP/);
});

test("rejects an archive larger than the configured compressed-size limit before parsing", async () => {
  const oversized = Buffer.alloc(25 * 1024 * 1024 + 1);
  Buffer.from([0x50, 0x4b, 0x03, 0x04]).copy(oversized);
  await assert.rejects(inspectArchive(oversized, true), /size limit/);
});
