"use strict";

const yauzl = require("yauzl");

function positiveLimit(name, fallback, ceiling) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, ceiling) : fallback;
}

const limits = {
  maxZipBytes: positiveLimit("MAX_ZIP_BYTES", 25 * 1024 * 1024, 25 * 1024 * 1024),
  maxExtractedBytes: positiveLimit("MAX_EXTRACTED_BYTES", 100 * 1024 * 1024, 100 * 1024 * 1024),
  maxEntryBytes: positiveLimit("MAX_ENTRY_BYTES", 5 * 1024 * 1024, 5 * 1024 * 1024),
  maxEntries: positiveLimit("MAX_ARCHIVE_ENTRIES", 200, 200),
  maxDepth: positiveLimit("MAX_ARCHIVE_DEPTH", 12, 12)
};
const MAX_SOURCE_CHARS = 120000;
const MAX_AI_CHUNKS = 4;
const AI_CHUNK_CHARS = 30000;
const TEXT_EXTENSIONS = new Set([".html", ".htm", ".js", ".mjs", ".css", ".json", ".txt", ".md", ".xml", ".svg", ".webmanifest"]);
const ASSET_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".mp3", ".ogg", ".wav", ".mp4", ".webm", ".woff", ".woff2", ".ttf", ".otf", ".wasm", ".json", ".css", ".js", ".mjs", ".html", ".htm", ".txt", ".xml", ".webmanifest", ".ico"]);
const EXECUTABLE_EXTENSIONS = new Set([".exe", ".dll", ".com", ".bat", ".cmd", ".ps1", ".sh", ".app", ".apk", ".dmg", ".msi", ".scr", ".jar"]);

function openZip(buffer) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, decodeStrings: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => {
      if (error) reject(error);
      else resolve(zip);
    });
  });
}

function readZipEntry(zip, entry) {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error) return reject(error);
      const chunks = [];
      let size = 0;
      stream.on("data", chunk => {
        size += chunk.length;
        if (size > limits.maxEntryBytes) {
          stream.destroy(new Error("Archive entry exceeds the allowed size."));
          return;
        }
        chunks.push(chunk);
      });
      stream.on("error", reject);
      stream.on("end", () => resolve(Buffer.concat(chunks)));
    });
  });
}

function safeEntryPath(raw) {
  if (!raw || raw.startsWith("/") || raw.includes("\\") || raw.includes("\0") || /^[a-zA-Z]:/.test(raw)) return false;
  const parts = raw.split("/");
  if (parts.some(part => !part || part === "." || part === ".." || part.startsWith(".") && part.length > 100 || /[<>:"|?*\x00-\x1f]/.test(part))) return false;
  return parts.length <= limits.maxDepth;
}

async function inspectArchive(buffer, browserBuild = false) {
  if (buffer.length < 4 || buffer.subarray(0, 4).toString("hex") !== "504b0304") throw new Error("The uploaded archive is not a valid ZIP file.");
  if (buffer.length > limits.maxZipBytes) throw new Error("The uploaded ZIP exceeds the configured size limit.");
  const zip = await openZip(buffer);
  const files = [];
  const names = new Set();
  let extractedSize = 0;
  let fileCount = 0;
  let rootHtml = false;
  const staticFindings = [];
  const sources = [];
  try {
    await new Promise((resolve, reject) => {
      zip.on("error", reject);
      zip.on("end", resolve);
      zip.on("entry", async entry => {
        try {
          if (/\/$/.test(entry.fileName)) { zip.readEntry(); return; }
          fileCount++;
          if (fileCount > limits.maxEntries) throw new Error(`The ZIP contains more than ${limits.maxEntries} files.`);
          if (!safeEntryPath(entry.fileName)) throw new Error("The ZIP contains an unsafe or invalid file path.");
          const name = entry.fileName.normalize("NFKC");
          const folded = name.toLocaleLowerCase("en-US");
          if (names.has(folded)) throw new Error("The ZIP contains duplicate file names.");
          names.add(folded);
          const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
          if ((mode & 0xf000) === 0xa000) throw new Error("Symbolic links are not allowed in ZIP uploads.");
          if (entry.uncompressedSize > limits.maxEntryBytes) throw new Error("A ZIP entry exceeds the per-file size limit.");
          extractedSize += entry.uncompressedSize;
          if (extractedSize > limits.maxExtractedBytes) throw new Error("The ZIP expands beyond the configured extracted-size limit.");
          if ((entry.compressedSize === 0 && entry.uncompressedSize > 0) || (entry.compressedSize > 0 && entry.uncompressedSize / entry.compressedSize > 100)) throw new Error("The ZIP contains an unsafe compression ratio.");
          const extIndex = name.lastIndexOf(".");
          const ext = extIndex >= 0 ? name.slice(extIndex).toLowerCase() : "";
          if (EXECUTABLE_EXTENSIONS.has(ext)) staticFindings.push({ severity: "high", filePath: name, evidence: "Executable or command file included in upload.", confidence: 0.98 });
          if (!ASSET_EXTENSIONS.has(ext)) {
            if (browserBuild) throw new Error(`Unsupported browser-game file type: ${ext || "file without an extension"}.`);
            staticFindings.push({ severity: "medium", filePath: name, evidence: "File type is not in the supported web-game asset list.", confidence: 0.92 });
          }
          if (ext === ".wasm") staticFindings.push({ severity: "medium", filePath: name, evidence: "WebAssembly module can execute code in the browser; inspect its purpose and imports.", confidence: 0.9 });
          if (name === "index.html") rootHtml = true;
          const content = await readZipEntry(zip, entry);
          files.push({ path: name, content });
          if (TEXT_EXTENSIONS.has(ext) && sources.reduce((total, source) => total + source.text.length, 0) < MAX_SOURCE_CHARS) {
            const text = content.toString("utf8").slice(0, 24000);
            sources.push({ path: name, text });
            const suspicious = [
              [/document\.cookie|localStorage\.getItem\s*\(\s*["'](?:token|auth|session)/i, "Reads browser credentials or session data."],
              [/(?:atob\s*\(|fromCharCode\s*\(|eval\s*\(|new Function\s*\()/i, "Uses dynamic execution or encoded code; review in context."],
              [/(?:window\.location|location\.href)\s*=/i, "Changes the browser destination; inspect redirect behavior."],
              [/(?:fetch|XMLHttpRequest|WebSocket)\s*\(/i, "Makes network requests; verify destinations and purpose."],
              [/<script[^>]+src=["']https?:\/\//i, "Loads an external script; verify the publisher and necessity."]
            ];
            for (const [pattern, evidence] of suspicious) if (pattern.test(text)) staticFindings.push({ severity: "medium", filePath: name, evidence, confidence: 0.7 });
          }
          zip.readEntry();
        } catch (error) { zip.close(); reject(error); }
      });
      zip.readEntry();
    });
  } finally { try { zip.close(); } catch {} }
  if (fileCount === 0) throw new Error("The ZIP archive is empty.");
  const textFiles = files.filter(file => TEXT_EXTENSIONS.has(file.path.slice(file.path.lastIndexOf(".")).toLowerCase()));
  const sourcePaths = new Set(sources.map(source => source.path));
  const evidenceComplete = textFiles.length > 0 && textFiles.length === sources.length
    && sources.every(source => source.text.length < 24000)
    && sources.reduce((total, source) => total + source.text.length, 0) <= AI_CHUNK_CHARS * MAX_AI_CHUNKS;
  return { files, sources, staticFindings, fileCount, extractedSize, rootHtml, evidenceComplete, textFileCount: textFiles.length, unreviewedTextFiles: textFiles.filter(file => !sourcePaths.has(file.path)).map(file => file.path) };
}

module.exports = { inspectArchive, limits };
