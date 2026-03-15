#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { zipSync } = require("fflate");

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_1X1_TRANSPARENT = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+3xQAAAAASUVORK5CYII=",
  "base64"
);
const JPEG_1X1 = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBAQEA8PDw8PDw8PDw8PDw8PDw8PFREWFhURFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMsNygtLisBCgoKDQ0NDg0NDisZFRkrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrK//AABEIAAEAAQMBIgACEQEDEQH/xAAXAAEBAQEAAAAAAAAAAAAAAAAAAQID/8QAFhEBAQEAAAAAAAAAAAAAAAAAABEh/8QAFQEBAQAAAAAAAAAAAAAAAAAAAQL/xAAVEQEBAAAAAAAAAAAAAAAAAAABAP/aAAwDAQACEQMRAD8A0QAAAP/Z",
  "base64"
);

let _rpackEncodeMap = null;
let _crcTable = null;

const argv = process.argv.slice(2);
const helpMode = argv.includes("-h") || argv.includes("--help") || argv.length === 0;
const inDir = argValue("--in") || ".";
const outArg = argValue("--out");
const formatArg = (argValue("--format") || "").toLowerCase();
const coverArg = argValue("--cover");
const nameArg = argValue("--name");

if (helpMode) {
  console.log(`
  🐿️ RisuAI Character Card Packer

  Usage: node pack.js [options]

  Options:
    --in <dir>          입력 디렉토리 (기본: .)
    --out <path|dir>    출력 파일 경로 또는 디렉토리
    --format <type>     png | charx | charx-jpg (기본: assets/manifest.json 기반 auto)
    --cover <file>      커버 이미지 경로 (png 또는 jpg)
    --name <name>       출력 파일명 기본값 (확장자 제외)
    -h, --help          도움말

  Notes:
    - card.json은 필수입니다.
    - lorebooks/, regex/, assets/, html/, variables/, character/가 있으면 card.json 위에 병합합니다.
    - lua/*.lua는 자동 역변환하지 않습니다 (기존 card.json의 triggerscript 유지).
    - 현재는 chara_card_v3만 지원합니다.
    - cover를 지정하지 않으면 png/jpg는 1x1 fallback 이미지를 사용합니다.
`);
  process.exit(0);
}

main();

function argValue(name) {
  const idx = argv.indexOf(name);
  if (idx < 0) return null;
  return argv[idx + 1] || null;
}

function main() {
  const resolvedIn = path.resolve(inDir);
  const cardPath = path.join(resolvedIn, "card.json");
  if (!fs.existsSync(cardPath)) {
    fail(`card.json을 찾을 수 없습니다: ${cardPath}`);
  }

  const card = readJson(cardPath);
  if (!card || card.spec !== "chara_card_v3") {
    fail("현재 pack.js는 spec=chara_card_v3 카드만 지원합니다.");
  }

  console.log("\n  🐿️ RisuAI Character Card Packer\n");
  console.log(`  입력: ${path.relative(".", resolvedIn)}`);

  const mergedCard = mergeExtractedComponents(card, resolvedIn);
  const targetFormat = resolveTargetFormat(resolvedIn, formatArg);
  const { outPath, baseName } = resolveOutputPath({ inRoot: resolvedIn, outArg, nameArg, card: mergedCard, format: targetFormat });
  ensureDir(path.dirname(outPath));

  if (targetFormat === "png") {
    const pngBuf = buildPngCardBuffer(mergedCard, resolvedIn, coverArg);
    fs.writeFileSync(outPath, pngBuf);
  } else if (targetFormat === "charx") {
    const charxBuf = buildCharxBuffer(mergedCard, resolvedIn);
    fs.writeFileSync(outPath, charxBuf);
  } else if (targetFormat === "charx-jpg") {
    const charxBuf = buildCharxBuffer(mergedCard, resolvedIn);
    const jpegCover = resolveCoverBytes(resolvedIn, coverArg, [".jpg", ".jpeg"], JPEG_1X1);
    fs.writeFileSync(outPath, Buffer.concat([jpegCover, charxBuf]));
  } else {
    fail(`지원하지 않는 format: ${targetFormat}`);
  }

  console.log(`\n  ✅ 패킹 완료 (${targetFormat}) → ${path.relative(".", outPath)}`);
  console.log(`  출력 이름: ${baseName}\n`);
}

function mergeExtractedComponents(card, inRoot) {
  const next = structuredClone(card);
  next.data = next.data || {};
  next.data.extensions = next.data.extensions || {};
  next.data.extensions.risuai = next.data.extensions.risuai || {};

  mergeLorebooks(next, inRoot);
  mergeRegex(next, inRoot);
  mergeBackgroundHtml(next, inRoot);
  mergeDefaultVariables(next, inRoot);
  mergeCharacter(next, inRoot);

  return next;
}

function mergeLorebooks(card, inRoot) {
  const loreDir = path.join(inRoot, "lorebooks");
  if (!isDir(loreDir)) return;

  const rebuilt = readLorebookEntries(loreDir);
  if (!rebuilt) return;

  card.data.character_book = card.data.character_book || {};
  card.data.character_book.entries = rebuilt.characterEntries;

  if (rebuilt.moduleEntries.length > 0) {
    card.data.extensions.risuai._moduleLorebook = rebuilt.moduleEntries;
  } else {
    delete card.data.extensions.risuai._moduleLorebook;
  }
}

function readLorebookEntries(loreDir) {
  const manifestPath = path.join(loreDir, "manifest.json");

  if (fs.existsSync(manifestPath)) {
    const manifest = readJson(manifestPath);
    if (!manifest || !Array.isArray(manifest.entries)) {
      fail(`잘못된 lorebooks/manifest.json 형식: ${manifestPath}`);
    }

    const out = { characterEntries: [], moduleEntries: [] };
    for (const item of manifest.entries) {
      if (!item || typeof item !== "object") continue;

      if (item.type === "folder") {
        if (!item.data || typeof item.data !== "object") continue;
        if (item.source === "module") out.moduleEntries.push(item.data);
        else out.characterEntries.push(item.data);
        continue;
      }

      if (item.type === "entry" && typeof item.path === "string" && item.path.length > 0) {
        const filePath = path.join(loreDir, fromPosix(item.path));
        if (!fs.existsSync(filePath)) {
          console.warn(`  ⚠️ lorebooks/manifest.json 참조 파일 없음 (skip): ${item.path}`);
          continue;
        }

        const entry = readJson(filePath);
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          fail(`잘못된 lorebook 엔트리 JSON: ${filePath}`);
        }

        if (item.source === "module") out.moduleEntries.push(entry);
        else out.characterEntries.push(entry);
      }
    }

    return out;
  }

  const orderedFiles = resolveOrderedFiles(loreDir, listJsonFilesRecursive(loreDir));
  if (orderedFiles.length === 0) return { characterEntries: [], moduleEntries: [] };

  const fallbackEntries = [];
  for (const abs of orderedFiles) {
    const entry = readJson(abs);
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      fail(`잘못된 lorebook 엔트리 JSON: ${abs}`);
    }
    fallbackEntries.push(entry);
  }

  return { characterEntries: fallbackEntries, moduleEntries: [] };
}

function mergeRegex(card, inRoot) {
  const regexDir = path.join(inRoot, "regex");
  if (!isDir(regexDir)) return;

  const files = resolveOrderedFiles(regexDir, listJsonFilesFlat(regexDir));
  if (files.length === 0) {
    card.data.extensions.risuai.customScripts = [];
    return;
  }

  const scripts = [];
  for (const abs of files) {
    const raw = readJson(abs);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      fail(`잘못된 regex JSON: ${abs}`);
    }
    scripts.push(raw);
  }

  card.data.extensions.risuai.customScripts = scripts;
}

function mergeBackgroundHtml(card, inRoot) {
  const htmlPath = path.join(inRoot, "html", "background.html");
  if (!fs.existsSync(htmlPath)) return;
  card.data.extensions.risuai.backgroundHTML = fs.readFileSync(htmlPath, "utf-8");
}

function mergeDefaultVariables(card, inRoot) {
  const txtPath = path.join(inRoot, "variables", "default.txt");
  if (!fs.existsSync(txtPath)) return;
  card.data.extensions.risuai.defaultVariables = fs.readFileSync(txtPath, "utf-8");
}

function mergeCharacter(card, inRoot) {
  const characterDir = path.join(inRoot, "character");
  if (!isDir(characterDir)) return;

  const textFieldMap = {
    "description.txt": ["data", "description"],
    "first_mes.txt": ["data", "first_mes"],
    "system_prompt.txt": ["data", "system_prompt"],
    "post_history_instructions.txt": ["data", "post_history_instructions"],
    "creator_notes.txt": ["data", "creator_notes"],
    "additional_text.txt": ["data", "extensions", "risuai", "additionalText"],
  };

  for (const [fileName, targetPath] of Object.entries(textFieldMap)) {
    const filePath = path.join(characterDir, fileName);
    if (!fs.existsSync(filePath)) continue;
    setNestedValue(card, targetPath, fs.readFileSync(filePath, "utf-8"));
  }

  const greetingsPath = path.join(characterDir, "alternate_greetings.json");
  if (fs.existsSync(greetingsPath)) {
    const greetings = readJson(greetingsPath);
    if (!Array.isArray(greetings)) {
      fail(`잘못된 alternate_greetings.json 형식: ${greetingsPath}`);
    }
    card.data.alternate_greetings = greetings;
  }

  const metadataPath = path.join(characterDir, "metadata.json");
  if (!fs.existsSync(metadataPath)) return;

  const metadata = readJson(metadataPath);
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    fail(`잘못된 metadata.json 형식: ${metadataPath}`);
  }

  const stringMetadataFields = {
    name: ["data", "name"],
    creator: ["data", "creator"],
    character_version: ["data", "character_version"],
    creation_date: ["data", "creation_date"],
    modification_date: ["data", "modification_date"],
  };

  for (const [key, targetPath] of Object.entries(stringMetadataFields)) {
    if (typeof metadata[key] === "string" || metadata[key] === null) {
      setNestedValue(card, targetPath, metadata[key]);
    }
  }

  if (typeof metadata.utilityBot === "boolean") {
    card.data.extensions.risuai.utilityBot = metadata.utilityBot;
  }
  if (typeof metadata.lowLevelAccess === "boolean") {
    card.data.extensions.risuai.lowLevelAccess = metadata.lowLevelAccess;
  }
}

function resolveTargetFormat(inRoot, formatArgValue) {
  if (["png", "charx", "charx-jpg"].includes(formatArgValue)) return formatArgValue;

  const manifestPath = path.join(inRoot, "assets", "manifest.json");
  if (fs.existsSync(manifestPath)) {
    try {
      const m = readJson(manifestPath);
      if (m.source_format === "png") return "png";
      if (m.source_format === "charx") return "charx";
    } catch {
    }
  }

  return "charx";
}

function resolveOutputPath({ inRoot, outArg: rawOut, nameArg: rawName, card, format }) {
  const defaultBase = sanitizeFilename(rawName || card.data?.name || "character", "character");
  const ext = format === "png" ? ".png" : format === "charx-jpg" ? ".jpg" : ".charx";
  const defaultFile = path.join(inRoot, `${defaultBase}_repack${ext}`);

  if (!rawOut) {
    return { outPath: defaultFile, baseName: `${defaultBase}_repack` };
  }

  const resolved = path.resolve(rawOut);
  const asDir = fs.existsSync(resolved) && fs.statSync(resolved).isDirectory();
  if (asDir) {
    const file = path.join(resolved, `${defaultBase}_repack${ext}`);
    return { outPath: file, baseName: `${defaultBase}_repack` };
  }

  if (!fs.existsSync(resolved) && path.extname(resolved) === "") {
    const file = path.join(resolved, `${defaultBase}_repack${ext}`);
    return { outPath: file, baseName: `${defaultBase}_repack` };
  }

  const parsed = path.parse(resolved);
  const finalName = parsed.name || `${defaultBase}_repack`;
  const finalExt = parsed.ext || ext;
  return {
    outPath: path.join(parsed.dir || ".", `${finalName}${finalExt}`),
    baseName: finalName,
  };
}

function buildPngCardBuffer(card, inRoot, coverArgPath) {
  const work = structuredClone(card);
  const assetBlobs = collectAssetBuffers(work, inRoot);

  let cover = resolveCoverBytes(inRoot, coverArgPath, [".png"], PNG_1X1_TRANSPARENT, {
    allowFromAsset: true,
    card: work,
    assetBlobs,
  });

  if (!isPng(cover)) {
    console.warn("  ⚠️ PNG 커버를 찾지 못해 1x1 투명 PNG를 사용합니다.");
    cover = PNG_1X1_TRANSPARENT;
  }

  const chunks = [];

  let idx = 0;
  for (const asset of work.data.assets || []) {
    idx++;
    if (!asset || typeof asset !== "object") continue;

    const uri = typeof asset.uri === "string" ? asset.uri : "";
    if (uri === "ccdefault:" || uri.startsWith("http://") || uri.startsWith("https://") || uri.startsWith("data:")) {
      continue;
    }

    const blob = assetBlobs.get(idx);
    if (!blob) continue;

    asset.uri = `__asset:${idx}`;
    chunks.push({ key: `chara-ext-asset_:${idx}`, value: blob.toString("base64") });
  }

  chunks.unshift({ key: "ccv3", value: Buffer.from(JSON.stringify(work), "utf-8").toString("base64") });

  return writePngTextChunks(cover, chunks);
}

function buildCharxBuffer(card, inRoot) {
  const work = structuredClone(card);
  const assetBlobs = collectAssetBuffers(work, inRoot);
  const zipEntries = {};
  const usedPaths = new Set();

  const assets = Array.isArray(work.data.assets) ? work.data.assets : [];
  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    if (!asset || typeof asset !== "object") continue;

    const idx = i + 1;
    const blob = assetBlobs.get(idx);
    if (!blob) continue;

    const uri = typeof asset.uri === "string" ? asset.uri : "";
    if (uri.startsWith("http://") || uri.startsWith("https://") || uri.startsWith("data:")) {
      continue;
    }

    const assetType = sanitizeFilename(asset.type || "asset", "asset").toLowerCase();
    const extClass = classifyAssetExt(asset.ext || "bin");
    const ext = normalizeExt(asset.ext || "bin");
    const stem = sanitizeFilename(asset.name || `asset_${idx}`, `asset_${idx}`);

    let rel = `assets/${assetType}/${extClass}/${stem}.${ext}`;
    let serial = 1;
    while (usedPaths.has(rel)) {
      rel = `assets/${assetType}/${extClass}/${stem}_${serial}.${ext}`;
      serial++;
    }
    usedPaths.add(rel);

    asset.uri = `embeded://${toPosix(rel)}`;
    zipEntries[toPosix(rel)] = new Uint8Array(blob);
  }

  const module = buildModuleFromCard(work);
  delete work.data.extensions.risuai.triggerscript;
  delete work.data.extensions.risuai.customScripts;
  delete work.data.extensions.risuai._moduleLorebook;

  zipEntries["card.json"] = Buffer.from(`${JSON.stringify(work, null, 2)}\n`, "utf-8");
  zipEntries["module.risum"] = encodeModuleRisum(module);

  return Buffer.from(zipSync(zipEntries, { level: 0 }));
}

function buildModuleFromCard(card) {
  const name = card.data?.name || "Character";
  const risu = card.data?.extensions?.risuai || {};
  return {
    name: `${name} Module`,
    description: `Module for ${name}`,
    id: crypto.randomUUID(),
    trigger: Array.isArray(risu.triggerscript) ? risu.triggerscript : [],
    regex: Array.isArray(risu.customScripts) ? risu.customScripts : [],
    lorebook: Array.isArray(risu._moduleLorebook) ? risu._moduleLorebook : [],
    assets: [],
  };
}

function encodeModuleRisum(moduleObj) {
  const payload = Buffer.from(
    JSON.stringify({ module: moduleObj, type: "risuModule" }, null, 2),
    "utf-8"
  );
  const encodedMain = encodeRPack(payload);

  const out = [];
  out.push(Buffer.from([111, 0]));
  const len = Buffer.alloc(4);
  len.writeUInt32LE(encodedMain.length, 0);
  out.push(len);
  out.push(encodedMain);
  out.push(Buffer.from([0]));
  return Buffer.concat(out);
}

function encodeRPack(data) {
  const map = loadRPackEncodeMap();
  const src = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const out = Buffer.alloc(src.length);
  for (let i = 0; i < src.length; i++) {
    out[i] = map[src[i]];
  }
  return out;
}

function loadRPackEncodeMap() {
  if (_rpackEncodeMap) return _rpackEncodeMap;
  const candidates = [
    path.join(__dirname, "rpack_map.bin"),
    path.resolve(__dirname, "..", "..", "..", "assets", "rpack_map.bin"),
    path.join(process.cwd(), "assets", "rpack_map.bin"),
  ];
  const mapPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!mapPath) {
    fail(`rpack_map.bin을 찾을 수 없습니다: ${candidates.join(", ")}`);
  }
  const data = fs.readFileSync(mapPath);
  if (data.length < 512) {
    fail(`rpack_map.bin이 손상되었습니다: ${mapPath}`);
  }
  _rpackEncodeMap = data.subarray(0, 256);
  return _rpackEncodeMap;
}

function collectAssetBuffers(card, inRoot) {
  const out = new Map();
  const assetDir = path.join(inRoot, "assets");
  const manifestPath = path.join(assetDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) return out;

  const manifest = readJson(manifestPath);
  if (!manifest || !Array.isArray(manifest.assets)) return out;

  for (const rec of manifest.assets) {
    if (!rec || typeof rec !== "object") continue;
    if (!Number.isFinite(rec.index)) continue;
    if (typeof rec.extracted_path !== "string" || rec.extracted_path.length === 0) continue;

    const filePath = path.join(assetDir, rec.extracted_path);
    if (!fs.existsSync(filePath)) continue;
    out.set(Number(rec.index) + 1, fs.readFileSync(filePath));
  }

  for (let i = 0; i < (card.data.assets || []).length; i++) {
    const idx = i + 1;
    if (out.has(idx)) continue;
    const asset = card.data.assets[i];
    if (!asset || typeof asset.uri !== "string") continue;

    if (asset.uri.startsWith("embeded://") || asset.uri.startsWith("embedded://")) {
      const rel = asset.uri.replace(/^embeded:\/\//, "").replace(/^embedded:\/\//, "");
      const p = path.join(inRoot, rel);
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        out.set(idx, fs.readFileSync(p));
      }
    }
  }

  return out;
}

function resolveCoverBytes(inRoot, coverArgPath, exts, fallback, opts = {}) {
  if (coverArgPath) {
    const abs = path.resolve(coverArgPath);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      const ext = path.extname(abs).toLowerCase();
      if (exts.includes(ext)) return fs.readFileSync(abs);
      console.warn(`  ⚠️ cover 확장자가 기대와 다릅니다 (${ext}) — fallback 사용`);
    } else {
      console.warn(`  ⚠️ cover 파일을 찾을 수 없습니다: ${abs}`);
    }
  }

  const card = opts.card;
  const blobs = opts.assetBlobs;
  if (opts.allowFromAsset && card && blobs) {
    const assets = Array.isArray(card.data?.assets) ? card.data.assets : [];
    for (let i = 0; i < assets.length; i++) {
      const a = assets[i];
      if (!a || a.type !== "icon" || a.name !== "main") continue;
      const blob = blobs.get(i + 1);
      if (!blob) continue;
      if (exts.includes(`.${String(a.ext || "").toLowerCase().replace(/^\./, "")}`)) {
        return blob;
      }
      if (isPng(blob) && exts.includes(".png")) return blob;
      if (isJpeg(blob) && (exts.includes(".jpg") || exts.includes(".jpeg"))) return blob;
    }
  }

  const defaultCandidates = [
    path.join(inRoot, "cover.png"),
    path.join(inRoot, "cover.jpg"),
    path.join(inRoot, "cover.jpeg"),
    path.join(inRoot, "assets", "cover.png"),
    path.join(inRoot, "assets", "cover.jpg"),
    path.join(inRoot, "assets", "cover.jpeg"),
  ];

  for (const p of defaultCandidates) {
    if (!fs.existsSync(p) || !fs.statSync(p).isFile()) continue;
    const ext = path.extname(p).toLowerCase();
    if (exts.includes(ext)) return fs.readFileSync(p);
  }

  return fallback;
}

function writePngTextChunks(pngBuf, records) {
  const chunks = parsePngChunks(pngBuf);
  if (!chunks) {
    fail("유효한 PNG 커버를 읽지 못했습니다.");
  }

  const kept = chunks.filter((c) => c.type !== "tEXt" && c.type !== "iTXt" && c.type !== "zTXt" && c.type !== "IEND");
  const iend = chunks.find((c) => c.type === "IEND");
  if (!iend) fail("PNG IEND chunk가 없습니다.");

  const out = [PNG_SIGNATURE];
  for (const c of kept) out.push(encodeChunk(c.type, c.data));
  for (const r of records) out.push(encodeTextChunk(r.key, r.value));
  out.push(encodeChunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(out);
}

function parsePngChunks(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  let pos = 8;
  const out = [];
  while (pos + 12 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const dataStart = pos + 8;
    const dataEnd = dataStart + len;
    const crcEnd = dataEnd + 4;
    if (crcEnd > buf.length) break;
    out.push({ type, data: buf.subarray(dataStart, dataEnd) });
    pos = crcEnd;
    if (type === "IEND") break;
  }
  return out;
}

function encodeTextChunk(key, value) {
  const keyBuf = Buffer.from(String(key), "latin1");
  const valBuf = Buffer.from(String(value), "latin1");
  const payload = Buffer.concat([keyBuf, Buffer.from([0]), valBuf]);
  return encodeChunk("tEXt", payload);
}

function encodeChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  const crcVal = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crcVal >>> 0, 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function crc32(buf) {
  if (!_crcTable) {
    _crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      _crcTable[i] = c >>> 0;
    }
  }

  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = _crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function listJsonFilesRecursive(rootDir) {
  if (!isDir(rootDir)) return [];
  const out = [];

  function walk(cur) {
    const entries = fs.readdirSync(cur, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      const abs = path.join(cur, e.name);
      if (e.isDirectory()) walk(abs);
      else if (e.isFile() && e.name.toLowerCase().endsWith(".json") && e.name !== "_order.json" && e.name !== "manifest.json") out.push(abs);
    }
  }

  walk(rootDir);
  out.sort((a, b) => toPosix(path.relative(rootDir, a)).localeCompare(toPosix(path.relative(rootDir, b))));
  return out;
}

function listJsonFilesFlat(rootDir) {
  if (!isDir(rootDir)) return [];
  return fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".json") && e.name !== "_order.json")
    .map((e) => path.join(rootDir, e.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

function resolveOrderedFiles(dir, files) {
  const orderPath = path.join(dir, "_order.json");
  if (!fs.existsSync(orderPath)) return files;

  let order;
  try {
    order = readJson(orderPath);
  } catch {
    return files;
  }
  if (!Array.isArray(order)) return files;

  const m = new Map();
  for (const f of files) m.set(toPosix(path.relative(dir, f)), f);

  const ordered = [];
  for (const rel of order) {
    if (m.has(rel)) {
      ordered.push(m.get(rel));
      m.delete(rel);
    }
  }

  const rest = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [, abs] of rest) ordered.push(abs);
  return ordered;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function setNestedValue(root, keys, value) {
  let cur = root;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!cur[key] || typeof cur[key] !== "object" || Array.isArray(cur[key])) {
      cur[key] = {};
    }
    cur = cur[key];
  }
  cur[keys[keys.length - 1]] = value;
}

function isDir(p) {
  return fs.existsSync(p) && fs.statSync(p).isDirectory();
}

function sanitizeFilename(name, fallback = "unnamed") {
  if (!name || typeof name !== "string") return fallback;
  const cleaned = [...name]
    .map((ch) => (/[<>:"/\\|?*]/.test(ch) || ch.charCodeAt(0) < 32 ? "_" : ch))
    .join("")
    .replace(/\.\./g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+|[._]+$/g, "")
    .substring(0, 100);
  return cleaned || fallback;
}

function classifyAssetExt(extValue) {
  const ext = normalizeExt(extValue);
  if (["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"].includes(ext)) return "image";
  if (["mp3", "wav", "ogg", "flac", "aac", "m4a"].includes(ext)) return "audio";
  if (["mp4", "webm", "mov", "avi", "mkv"].includes(ext)) return "video";
  if (["otf", "ttf", "woff", "woff2"].includes(ext)) return "fonts";
  if (["mmd", "obj", "fbx", "glb", "gltf"].includes(ext)) return "model";
  if (["js", "ts", "lua", "json", "py"].includes(ext)) return "code";
  if (["safetensors", "ckpt", "onnx"].includes(ext)) return "ai";
  return "other";
}

function normalizeExt(extValue) {
  return String(extValue || "bin").toLowerCase().replace(/^\./, "") || "bin";
}

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function fromPosix(p) {
  return p.split("/").join(path.sep);
}

function isPng(buf) {
  return Buffer.isBuffer(buf) && buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE);
}

function isJpeg(buf) {
  return Buffer.isBuffer(buf) && buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8;
}

function fail(msg) {
  console.error(`\n  ❌ ${msg}\n`);
  process.exit(1);
}
