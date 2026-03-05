const fs = require("fs");
const path = require("path");
const toPosix = (p) => p.split(path.sep).join("/");
const {
  sanitizeFilename,
  writeJson,
  writeText,
  uniquePath,
  parsePngChunks,
  buildFolderMap,
  resolveFolderName,
} = require("../shared/extract-helpers");
const { parseCharx, parseModuleRisum } = require("./parsers");

function phase1_parseCard(inputPath) {
  const ext = path.extname(inputPath).toLowerCase();
  const buf = fs.readFileSync(inputPath);

  console.log(`\n  📦 Phase 1: 캐릭터 카드 파싱`);
  console.log(`     입력: ${path.basename(inputPath)} (${(buf.length / 1024).toFixed(1)} KB)`);

  if (ext === ".charx") {
    console.log("     포맷: CharX (ZIP)");

    const { card, moduleData, assets } = parseCharx(buf);
    if (!card) {
      console.error("  ❌ card.json을 찾을 수 없습니다.");
      process.exit(1);
    }

    console.log(`     spec: ${card.spec || "unknown"}`);
    console.log(`     이름: ${card.data?.name || "unknown"}`);

    if (moduleData) {
      console.log(`     module.risum: ${(moduleData.length / 1024).toFixed(1)} KB`);
      const mod = parseModuleRisum(moduleData);
      if (mod) {
        console.log(`     모듈 이름: ${mod.name || "unknown"}`);

        if (mod.trigger && mod.trigger.length > 0) {
          card.data = card.data || {};
          card.data.extensions = card.data.extensions || {};
          card.data.extensions.risuai = card.data.extensions.risuai || {};
          card.data.extensions.risuai.triggerscript = mod.trigger;
          console.log(`     triggerscript: ${mod.trigger.length}개 병합됨`);
        }

        if (mod.regex && mod.regex.length > 0) {
          card.data.extensions = card.data.extensions || {};
          card.data.extensions.risuai = card.data.extensions.risuai || {};
          card.data.extensions.risuai.customScripts = mod.regex;
          console.log(`     customScripts: ${mod.regex.length}개 병합됨`);
        }

        if (mod.lorebook && mod.lorebook.length > 0) {
          card.data.extensions = card.data.extensions || {};
          card.data.extensions.risuai = card.data.extensions.risuai || {};
          card.data.extensions.risuai._moduleLorebook = mod.lorebook;
          console.log(`     lorebook (module): ${mod.lorebook.length}개 병합됨`);
        }
      }
    }

    const assetCount = Object.keys(assets).length;
    if (assetCount > 0) {
      console.log(`     에셋: ${assetCount}개`);
    }

    return card;
  }

  if (ext === ".png") {
    console.log("     포맷: PNG");

    const chunks = parsePngChunks(buf);
    const keys = Object.keys(chunks);
    console.log(`     tEXt 청크: ${keys.join(", ") || "(없음)"}`);

    let jsonStr = null;
    if (chunks.ccv3) {
      jsonStr = Buffer.from(chunks.ccv3, "base64").toString("utf-8");
      console.log("     사용 청크: ccv3 (V3)");
    } else if (chunks.chara) {
      jsonStr = Buffer.from(chunks.chara, "base64").toString("utf-8");
      console.log("     사용 청크: chara (V2)");
    }

    if (!jsonStr) {
      console.error("  ❌ 캐릭터 데이터 청크를 찾을 수 없습니다 (chara/ccv3).");
      process.exit(1);
    }

    let card;
    try {
      card = JSON.parse(jsonStr);
    } catch (e) {
      console.error("  ❌ JSON 파싱 실패:", e.message);
      process.exit(1);
    }

    console.log(`     spec: ${card.spec || "unknown"}`);
    console.log(`     이름: ${card.data?.name || card.name || "unknown"}`);

    return card;
  }

  if (ext === ".json") {
    console.log("     포맷: JSON");
    const card = JSON.parse(buf.toString("utf-8"));
    console.log(`     spec: ${card.spec || "unknown"}`);
    console.log(`     이름: ${card.data?.name || card.name || "unknown"}`);
    return card;
  }

  console.error(`  ❌ 지원하지 않는 파일 포맷: ${ext}`);
  console.error("     지원 포맷: .charx, .png, .json");
  process.exit(1);
}

function phase2_extractLorebooks(card, outputDir) {
  console.log(`\n  📚 Phase 2: Lorebook 추출`);

  const lorebooksDir = path.join(outputDir, "lorebooks");
  let count = 0;
  const orderList = [];

  const charBook = card.data?.character_book;
  if (charBook && charBook.entries && charBook.entries.length > 0) {
    console.log(`     character_book.entries: ${charBook.entries.length}개`);

    const folderMap = buildFolderMap(charBook.entries);

    for (let i = 0; i < charBook.entries.length; i++) {
      const entry = charBook.entries[i];
      const name = sanitizeFilename(entry.name || entry.comment || `entry_${i}`);

      if (entry.mode === "folder") {
        const metaPath = uniquePath(lorebooksDir, `_folder_${name}`, ".json");
        writeJson(metaPath, entry);
        orderList.push(toPosix(path.relative(lorebooksDir, metaPath)));
        count++;
        continue;
      }

      const folderName = resolveFolderName(entry.folder, folderMap);
      const dir = folderName ? path.join(lorebooksDir, folderName) : lorebooksDir;
      const outPath = uniquePath(dir, name, ".json");
      writeJson(outPath, entry);
      orderList.push(toPosix(path.relative(lorebooksDir, outPath)));
      count++;
    }
  }

  const moduleLorebook = card.data?.extensions?.risuai?._moduleLorebook;
  if (moduleLorebook && moduleLorebook.length > 0) {
    console.log(`     module lorebook: ${moduleLorebook.length}개`);

    const folderMap = buildFolderMap(moduleLorebook);

    for (let i = 0; i < moduleLorebook.length; i++) {
      const lore = moduleLorebook[i];
      const name = sanitizeFilename(lore.comment || `lore_${i}`);

      if (lore.mode === "folder") {
        const metaPath = uniquePath(lorebooksDir, `_folder_${name}`, ".json");
        writeJson(metaPath, lore);
        orderList.push(toPosix(path.relative(lorebooksDir, metaPath)));
        count++;
        continue;
      }

      const folderName = resolveFolderName(lore.folder, folderMap);
      const dir = folderName ? path.join(lorebooksDir, folderName) : lorebooksDir;
      const outPath = uniquePath(dir, name, ".json");
      writeJson(outPath, lore);
      orderList.push(toPosix(path.relative(lorebooksDir, outPath)));
      count++;
    }

    delete card.data.extensions.risuai._moduleLorebook;
  }

  if (orderList.length > 0) {
    writeJson(path.join(lorebooksDir, "_order.json"), orderList);
  }

  if (count === 0) {
    console.log("     (lorebook 없음)");
  } else {
    console.log(`     ✅ ${count}개 lorebook → ${path.relative(".", lorebooksDir)}/`);
  }

  return count;
}

function phase3_extractRegex(card, outputDir) {
  console.log(`\n  🔧 Phase 3: Regex(customscript) 추출`);

  const regexDir = path.join(outputDir, "regex");
  const scripts = card.data?.extensions?.risuai?.customScripts;

  if (!scripts || scripts.length === 0) {
    console.log("     (customscript 없음)");
    return 0;
  }

  console.log(`     customScripts: ${scripts.length}개`);

  let count = 0;
  const orderList = [];
  for (let i = 0; i < scripts.length; i++) {
    const script = scripts[i];
    const name = sanitizeFilename(script.comment || `regex_${i}`);
    const outPath = uniquePath(regexDir, name, ".json");
    writeJson(outPath, script);
    orderList.push(path.basename(outPath));
    count++;
  }


  if (orderList.length > 0) {
    writeJson(path.join(regexDir, "_order.json"), orderList);
  }

  console.log(`     ✅ ${count}개 regex → ${path.relative(".", regexDir)}/`);
  return count;
}

function phase4_extractTriggerLua(card, outputDir) {
  console.log(`\n  🌙 Phase 4: TriggerLua 스크립트 추출`);

  const luaDir = path.join(outputDir, "lua");
  const triggers = card.data?.extensions?.risuai?.triggerscript;

  if (!triggers || triggers.length === 0) {
    console.log("     (triggerscript 없음)");
    return 0;
  }

  console.log(`     triggerscript: ${triggers.length}개`);

  let luaCount = 0;
  let triggerCount = 0;

  for (let i = 0; i < triggers.length; i++) {
    const trigger = triggers[i];
    const effects = trigger.effect || [];

    for (let j = 0; j < effects.length; j++) {
      const effect = effects[j];

      if (effect.type === "triggerlua" && effect.code) {
        triggerCount++;
        const baseName = sanitizeFilename(trigger.comment || `trigger_${i}`);
        const name = effects.filter((e) => e.type === "triggerlua").length > 1
          ? `${baseName}_${j}`
          : baseName;
        const outPath = uniquePath(luaDir, name, ".lua");

        const header = [
          `-- Extracted from triggerscript: ${trigger.comment || "(unnamed)"}`,
          `-- Trigger type: ${trigger.type || "unknown"}`,
          `-- Low-level access: ${trigger.lowLevelAccess ? "yes" : "no"}`,
          "",
        ].join("\n");

        writeText(outPath, header + effect.code);
        luaCount++;
      }
    }
  }

  if (luaCount === 0) {
    console.log("     (triggerlua 없음 — triggercode 또는 다른 effect 타입만 존재)");
  } else {
    console.log(`     ✅ ${luaCount}개 lua 스크립트 (${triggerCount}개 triggerlua effect) → ${path.relative(".", luaDir)}/`);
  }

  return luaCount;
}

module.exports = {
  phase1_parseCard,
  phase2_extractLorebooks,
  phase3_extractRegex,
  phase4_extractTriggerLua,
};
