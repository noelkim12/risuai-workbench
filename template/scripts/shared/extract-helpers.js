const fs = require("fs");
const path = require("path");
const {
  parsePngTextChunks,
  buildFolderMap: buildRisuFolderMap,
  resolveFolderName: resolveRisuFolderName,
} = require("./risu-api");

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

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf-8");
}

function uniquePath(dir, baseName, ext) {
  let candidate = path.join(dir, `${baseName}${ext}`);
  let counter = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${baseName}_${counter}${ext}`);
    counter++;
  }
  return candidate;
}

function parsePngChunks(buf) {
  return parsePngTextChunks(buf);
}

function buildFolderMap(entries) {
  return buildRisuFolderMap(entries, {
    nameTransform: sanitizeFilename,
    fallbackName: "unnamed_folder",
  });
}

function resolveFolderName(folderRef, folderMap) {
  return resolveRisuFolderName(folderRef, folderMap, sanitizeFilename);
}

module.exports = {
  sanitizeFilename,
  ensureDir,
  writeJson,
  writeText,
  uniquePath,
  parsePngChunks,
  buildFolderMap,
  resolveFolderName,
};
