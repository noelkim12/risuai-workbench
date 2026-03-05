#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { ensureDir, writeJson } = require("./shared/extract-helpers");
const {
  phase1_parseCard,
  phase2_extractLorebooks,
  phase3_extractRegex,
  phase4_extractTriggerLua,
} = require("./extract/phases");

const argv = process.argv.slice(2);
const helpMode = argv.includes("-h") || argv.includes("--help") || argv.length === 0;
const jsonOnly = argv.includes("--json-only");
const outIdx = argv.indexOf("--out");
const outArg = outIdx >= 0 ? argv[outIdx + 1] : null;
const outDir = outArg || ".";
const filePath = argv.find((a) => !a.startsWith("-") && a !== outArg && a !== "--out" && a !== "--json-only");

if (helpMode || !filePath) {
  console.log(`
  🐿️ RisuAI Character Card Extractor

  Usage:  node extract.js <file.charx|file.png> [options]

  Options:
    --out <dir>     출력 디렉토리 (기본: . 프로젝트 루트)
    --json-only     Phase 1만 실행 (card.json만 출력)
    -h, --help      도움말

  Phases:
    1. 캐릭터 카드 파싱 → card.json
    2. globalLore 추출 → lorebooks/ (폴더 구조 유지)
    3. customscript(regex) 추출 → regex/
    4. triggerlua 스크립트 추출 → lua/

  Examples:
    node extract.js mychar.charx
    node extract.js mychar.png --out ./other-dir
    node extract.js mychar.charx --json-only
`);
  process.exit(0);
}

if (!fs.existsSync(filePath)) {
  console.error(`\n  ❌ 파일을 찾을 수 없습니다: ${filePath}\n`);
  process.exit(1);
}

function runLuaAnalysis(resolvedOutDir, cardJsonPath) {
  const luaDir = path.join(resolvedOutDir, "lua");
  if (!fs.existsSync(luaDir)) return;

  const luaFiles = fs.readdirSync(luaDir).filter((f) => f.endsWith(".lua"));
  if (luaFiles.length === 0) return;

  console.log("\n  ═══ Phase 5: Lua Analysis ═══");
  const analyzeScript = path.join(__dirname, "analyze.js");
  if (!fs.existsSync(analyzeScript)) {
    console.log("     ⚠️ analyze.js를 찾을 수 없습니다: " + analyzeScript);
    return;
  }

  for (const luaFile of luaFiles) {
    const luaPath = path.join(luaDir, luaFile);
    try {
      const { execSync } = require("child_process");
      execSync(`node "${analyzeScript}" "${luaPath}" --card "${cardJsonPath}" --markdown`, {
        stdio: "inherit",
        timeout: 60000,
      });
    } catch (e) {
      console.error(`  ⚠️ analyze.js 실행 실패: ${luaFile} — ${e.message}`);
    }
  }
}

function main() {
  console.log(`\n  🐿️ RisuAI Character Card Extractor\n`);

  const card = phase1_parseCard(filePath);

  const resolvedOutDir = path.resolve(outDir);
  ensureDir(resolvedOutDir);
  const cardJsonPath = path.join(resolvedOutDir, "card.json");
  writeJson(cardJsonPath, card);
  console.log(`\n     ✅ card.json → ${path.relative(".", cardJsonPath)}`);

  if (jsonOnly) {
    console.log("\n  완료 (--json-only)\n");
    return;
  }

  phase2_extractLorebooks(card, resolvedOutDir);
  phase3_extractRegex(card, resolvedOutDir);
  phase4_extractTriggerLua(card, resolvedOutDir);
  runLuaAnalysis(resolvedOutDir, cardJsonPath);

  console.log("\n  ────────────────────────────────────────");
  console.log(`  📊 추출 완료 → ${path.relative(".", resolvedOutDir)}/`);
  console.log("  ────────────────────────────────────────\n");
}

main();
