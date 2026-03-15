#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { buildFolderMap: buildRisuFolderMap, resolveFolderName: resolveRisuFolderName } = require("./shared/risu-api");

const argv = process.argv.slice(2);
const helpMode = argv.includes("-h") || argv.includes("--help");

function argValue(name) {
  const idx = argv.indexOf(name);
  if (idx < 0) return null;
  return argv[idx + 1] || null;
}

if (helpMode) {
  console.log(`
RisuAI Component Builder

Usage:
  node build-components.js [options]

Options:
  --in <dir>            Base input directory containing regex/ and lorebooks/ (default: .)
  --regex-dir <dir>     Regex directory override (default: <in>/regex)
  --lorebooks-dir <dir> Lorebooks directory override (default: <in>/lorebooks)
  --out <dir>           Output directory (default: <in>)
  --regex-only          Build regexscript_export.json only
  --lorebook-only       Build lorebook_export.json only
  --no-dedupe           Keep duplicate lorebook entries
  -h, --help            Show help

Outputs:
  regexscript_export.json  -> { type: "regex", data: [...] }
  lorebook_export.json     -> { type: "risu", ver: 1, data: [...] }

Lorebook input rules:
  1) lorebooks/manifest.json가 있으면 이를 우선 사용
  2) 없으면 기존 _order.json + 파일 스캔 방식으로 fallback
`);
  process.exit(0);
}

const inDir = path.resolve(argValue("--in") || ".");
const regexDir = path.resolve(argValue("--regex-dir") || path.join(inDir, "regex"));
const lorebooksDir = path.resolve(argValue("--lorebooks-dir") || path.join(inDir, "lorebooks"));
const outDir = path.resolve(argValue("--out") || inDir);
const dedupeLorebook = !argv.includes("--no-dedupe");
const regexOnly = argv.includes("--regex-only");
const lorebookOnly = argv.includes("--lorebook-only");

if (regexOnly && lorebookOnly) {
  console.error("\nERROR: --regex-only and --lorebook-only cannot be used together.\n");
  process.exit(1);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function listJsonFilesRecursive(rootDir) {
  if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) return [];

  const out = [];
  function walk(curDir) {
    const entries = fs.readdirSync(curDir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const e of entries) {
      const full = path.join(curDir, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (
        e.isFile()
        && e.name.toLowerCase().endsWith(".json")
        && e.name !== "_order.json"
        && e.name !== "manifest.json"
      ) {
        out.push(full);
      }
    }
  }

  walk(rootDir);
  out.sort((a, b) => toPosix(path.relative(rootDir, a)).localeCompare(toPosix(path.relative(rootDir, b))));
  return out;
}

function listJsonFilesFlat(rootDir) {
  if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) return [];
  return fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".json") && e.name !== "_order.json")
    .map((e) => path.join(rootDir, e.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

function resolveOrderedFiles(dir, files) {
  const manifestPath = path.join(dir, "_order.json");
  if (!fs.existsSync(manifestPath)) return files;

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  } catch {
    console.warn("  ⚠️  _order.json 파싱 실패 — 알파벳순 정렬 사용");
    return files;
  }

  if (!Array.isArray(manifest)) return files;

  const fileMap = new Map();
  for (const f of files) {
    const rel = toPosix(path.relative(dir, f));
    fileMap.set(rel, f);
  }

  const ordered = [];

  for (const rel of manifest) {
    if (fileMap.has(rel)) {
      ordered.push(fileMap.get(rel));
      fileMap.delete(rel);
    } else {
      console.warn(`  ⚠️  _order.json: 파일 없음 (skip): ${rel}`);
    }
  }

  if (fileMap.size > 0) {
    const orphans = [...fileMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [rel, abs] of orphans) {
      console.warn(`  ⚠️  _order.json에 없는 파일 (끝에 추가): ${rel}`);
      ordered.push(abs);
    }
  }

  return ordered;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readLorebookRowsFromManifest() {
  const manifestPath = path.join(lorebooksDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) return null;

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  } catch {
    console.warn("  ⚠️  lorebooks/manifest.json 파싱 실패 — 기존 파일 스캔 방식으로 진행");
    return null;
  }

  if (!isPlainObject(manifest) || !Array.isArray(manifest.entries)) {
    console.warn("  ⚠️  lorebooks/manifest.json 형식이 잘못되었습니다 — 기존 파일 스캔 방식으로 진행");
    return null;
  }

  const files = listJsonFilesRecursive(lorebooksDir);
  const fileMap = new Map();
  for (const filePath of files) {
    const rel = toPosix(path.relative(lorebooksDir, filePath));
    fileMap.set(rel, filePath);
  }

  const usedFiles = new Set();
  const rows = [];

  for (const rec of manifest.entries) {
    if (!isPlainObject(rec)) {
      console.warn("  ⚠️  lorebooks/manifest.json: 잘못된 엔트리 (skip)");
      continue;
    }

    if (rec.type === "folder") {
      if (!isPlainObject(rec.data)) {
        console.warn("  ⚠️  lorebooks/manifest.json: folder 엔트리 data 누락 (skip)");
        continue;
      }

      rows.push({ raw: rec.data, relDir: "." });
      continue;
    }

    if (rec.type !== "entry" || typeof rec.path !== "string" || rec.path.length === 0) {
      console.warn("  ⚠️  lorebooks/manifest.json: entry 엔트리 path 누락 (skip)");
      continue;
    }

    const rel = toPosix(rec.path);
    if (!fileMap.has(rel)) {
      console.warn(`  ⚠️  lorebooks/manifest.json: 파일 없음 (skip): ${rel}`);
      continue;
    }

    const filePath = fileMap.get(rel);
    const raw = readJson(filePath);
    if (!isPlainObject(raw)) {
      throw new Error(`Invalid lorebook JSON object: ${filePath}`);
    }

    rows.push({ raw, relDir: toPosix(path.dirname(rel)) });
    usedFiles.add(rel);
  }

  const orphans = [...fileMap.keys()]
    .filter((rel) => !usedFiles.has(rel))
    .sort((a, b) => a.localeCompare(b));
  for (const rel of orphans) {
    const filePath = fileMap.get(rel);
    const raw = readJson(filePath);
    if (!isPlainObject(raw)) {
      throw new Error(`Invalid lorebook JSON object: ${filePath}`);
    }

    console.warn(`  ⚠️  lorebooks/manifest.json에 없는 파일 (끝에 추가): ${rel}`);
    rows.push({ raw, relDir: toPosix(path.dirname(rel)) });
  }

  return rows;
}

function pickKnownRegexFields(raw) {
  const out = {
    comment: typeof raw.comment === "string" ? raw.comment : "",
    in: typeof raw.in === "string" ? raw.in : "",
    out: typeof raw.out === "string" ? raw.out : "",
    type: typeof raw.type === "string" ? raw.type : "editprocess",
    ableFlag: typeof raw.ableFlag === "boolean" ? raw.ableFlag : false,
  };

  if (typeof raw.flag === "string" && raw.flag.length > 0) {
    out.flag = raw.flag;
  }

  const known = new Set(["comment", "in", "out", "type", "ableFlag", "flag"]);
  const extras = Object.keys(raw)
    .filter((k) => !known.has(k))
    .sort();
  for (const k of extras) {
    out[k] = raw[k];
  }

  return out;
}

function normalizeLorebookEntry(raw, relDirPosix, folderMap) {
  const insertorder = Number.isFinite(raw.insertorder)
    ? raw.insertorder
    : Number.isFinite(raw.insertion_order)
      ? raw.insertion_order
      : 100;

  let key = "";
  if (typeof raw.key === "string") {
    key = raw.key;
  } else if (Array.isArray(raw.keys)) {
    key = raw.keys.join(", ");
  }

  const normalized = {
    key,
    secondkey: typeof raw.secondkey === "string" ? raw.secondkey : "",
    insertorder,
    comment: typeof raw.comment === "string" ? raw.comment : (typeof raw.name === "string" ? raw.name : ""),
    content: typeof raw.content === "string" ? raw.content : "",
    mode: typeof raw.mode === "string" ? raw.mode : "normal",
    alwaysActive: typeof raw.alwaysActive === "boolean" ? raw.alwaysActive : !!raw.constant,
    selective: typeof raw.selective === "boolean" ? raw.selective : false,
    useRegex: typeof raw.useRegex === "boolean" ? raw.useRegex : !!raw.use_regex,
    bookVersion: Number.isFinite(raw.bookVersion) ? raw.bookVersion : 2,
  };

  const folderRef = typeof raw.folder === "string" && raw.folder.length > 0 ? raw.folder : "";
  const folder = folderRef
    ? resolveRisuFolderName(folderRef, folderMap, (v) => v)
    : relDirPosix !== "."
      ? relDirPosix
      : "";
  if (folder) normalized.folder = folder;

  const known = new Set([
    "key", "keys", "secondkey", "insertorder", "insertion_order", "comment", "name", "content", "mode",
    "alwaysActive", "constant", "selective", "useRegex", "use_regex", "bookVersion", "folder",
    "enabled", "extensions", "case_sensitive",
  ]);
  const extras = Object.keys(raw)
    .filter((k) => !known.has(k))
    .sort();
  for (const k of extras) {
    normalized[k] = raw[k];
  }

  return normalized;
}

function lorebookDedupeKey(entry) {
  const keyObj = {
    key: entry.key,
    secondkey: entry.secondkey,
    insertorder: entry.insertorder,
    comment: entry.comment,
    content: entry.content,
    mode: entry.mode,
    alwaysActive: entry.alwaysActive,
    selective: entry.selective,
    useRegex: entry.useRegex,
    bookVersion: entry.bookVersion,
  };
  return JSON.stringify(keyObj);
}

function buildRegexExport() {
  const files = resolveOrderedFiles(regexDir, listJsonFilesFlat(regexDir));
  const items = [];

  for (const filePath of files) {
    const raw = readJson(filePath);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Invalid regex JSON object: ${filePath}`);
    }
    items.push(pickKnownRegexFields(raw));
  }

  return { type: "regex", data: items };
}

function buildLorebookExport() {
  let rows = readLorebookRowsFromManifest();

  if (!rows) {
    const files = resolveOrderedFiles(lorebooksDir, listJsonFilesRecursive(lorebooksDir));
    rows = [];

    for (const filePath of files) {
      const raw = readJson(filePath);
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error(`Invalid lorebook JSON object: ${filePath}`);
      }

      const rel = toPosix(path.relative(lorebooksDir, filePath));
      const relDir = toPosix(path.dirname(rel));
      rows.push({ raw, relDir });
    }
  }

  const folderMap = buildRisuFolderMap(rows.map((r) => r.raw), { fallbackName: "unnamed" });
  const items = rows.map((r) => normalizeLorebookEntry(r.raw, r.relDir, folderMap));

  let data = items;
  if (dedupeLorebook) {
    const seen = new Set();
    data = items.filter((item) => {
      const key = lorebookDedupeKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  return { type: "risu", ver: 1, data };
}

function main() {
  console.log("\nRisuAI Component Builder\n");
  console.log(`- input base      : ${inDir}`);
  console.log(`- regex dir       : ${regexDir}`);
  console.log(`- lorebooks dir   : ${lorebooksDir}`);
  console.log(`- output dir      : ${outDir}`);
  console.log(`- lorebook dedupe : ${dedupeLorebook ? "on" : "off"}`);

  const shouldBuildRegex = !lorebookOnly;
  const shouldBuildLorebook = !regexOnly;

  let regexExport = null;
  let lorebookExport = null;

  if (shouldBuildRegex) {
    regexExport = buildRegexExport();
    const regexOut = path.join(outDir, "regexscript_export.json");
    writeJson(regexOut, regexExport);
  }

  if (shouldBuildLorebook) {
    lorebookExport = buildLorebookExport();
    const lorebookOut = path.join(outDir, "lorebook_export.json");
    writeJson(lorebookOut, lorebookExport);
  }

  console.log("\nBuild complete:");
  if (regexExport) {
    console.log(`- ${path.relative(process.cwd(), path.join(outDir, "regexscript_export.json"))} (${regexExport.data.length} entries)`);
  }
  if (lorebookExport) {
    console.log(`- ${path.relative(process.cwd(), path.join(outDir, "lorebook_export.json"))} (${lorebookExport.data.length} entries)`);
  }
  console.log("");
}

try {
  main();
} catch (err) {
  console.error(`\nERROR: ${err && err.message ? err.message : String(err)}\n`);
  process.exit(1);
}
