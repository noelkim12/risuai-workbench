const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function parsePngTextChunks(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("유효한 PNG 파일이 아닙니다.");
  }

  const chunks = {};
  let pos = 8;

  while (pos + 12 <= buf.length) {
    const length = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);

    if (pos + 12 + length > buf.length) break;

    const data = buf.subarray(pos + 8, pos + 8 + length);
    pos += 12 + length;

    if (type === "tEXt") {
      const nullIdx = data.indexOf(0);
      if (nullIdx >= 0) {
        const key = data.toString("ascii", 0, nullIdx);
        const value = data.toString("latin1", nullIdx + 1);
        chunks[key] = value;
      }
    }

    if (type === "IEND") break;
  }

  return chunks;
}

function decodeCharacterJsonFromChunks(chunks) {
  if (chunks.ccv3) return { jsonStr: Buffer.from(chunks.ccv3, "base64").toString("utf-8"), source: "ccv3" };
  if (chunks.chara) return { jsonStr: Buffer.from(chunks.chara, "base64").toString("utf-8"), source: "chara" };
  return null;
}

function buildFolderMap(entries, opts) {
  const options = opts || {};
  const nameTransform = typeof options.nameTransform === "function" ? options.nameTransform : (v) => v;
  const fallbackName = typeof options.fallbackName === "string" ? options.fallbackName : "unnamed";
  const map = {};

  for (const entry of entries) {
    if (entry.mode === "folder" && entry.keys && entry.keys.length > 0) {
      const folderKey = entry.keys[0];
      map[folderKey] = nameTransform(entry.name || entry.comment || fallbackName);
    }
  }

  return map;
}

function resolveFolderName(folderRef, folderMap, fallbackTransform) {
  if (!folderRef) return null;
  if (Object.prototype.hasOwnProperty.call(folderMap, folderRef)) return folderMap[folderRef];
  if (typeof fallbackTransform === "function") return fallbackTransform(folderRef);
  return folderRef;
}

function extractCBSVarOps(text) {
  const reads = new Set();
  const writes = new Set();
  if (typeof text !== "string" || text.length === 0) return { reads, writes };

  for (const m of text.matchAll(/\{\{(getvar|setvar|addvar)::([^}:]+)/g)) {
    const op = m[1];
    const key = m[2].trim();
    if (!key) continue;
    if (op === "getvar") reads.add(key);
    else writes.add(key);
  }

  return { reads, writes };
}

module.exports = {
  parsePngTextChunks,
  decodeCharacterJsonFromChunks,
  buildFolderMap,
  resolveFolderName,
  extractCBSVarOps,
};
