# Module Extract Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** `.risum` / `.json` 모듈 파일을 exploded 디렉토리 구조로 추출하는 CLI 워크플로우를 추가한다.

**Architecture:** 기존 캐릭터/프리셋 추출기와 동일한 phase 기반 아키텍처를 따른다. `extract/module/workflow.ts`가 오케스트레이션하고, `extract/module/phases.ts`가 7개 phase 함수를 구현한다. 캐릭터 추출기 `phases.ts`의 lorebook/regex/trigger 패턴을 따르되, 모듈 데이터 구조에 맞게 조정한다.

**Tech Stack:** TypeScript, Node.js fs, fflate (RPack), vitest

**Design doc:** `docs/plans/2026-03-20-module-extract-design.md`

---

### Task 1: RisuModule 타입 정의

**Files:**
- Create: `packages/core/src/types/module.ts`
- Modify: `packages/core/src/types/index.ts`

**Step 1: `types/module.ts` 작성**

```typescript
// packages/core/src/types/module.ts

export interface MCPModule {
  url: string;
}

export interface RisuModule {
  name: string;
  description: string;
  id: string;
  lorebook?: any[];
  regex?: any[];
  trigger?: any[];
  assets?: [string, string, string][];
  lowLevelAccess?: boolean;
  hideIcon?: boolean;
  backgroundEmbedding?: string;
  namespace?: string;
  customModuleToggle?: string;
  mcp?: MCPModule;
  cjs?: string; // 미사용 필드이나 호환성 유지
}
```

참고: `lorebook`, `regex`, `trigger`의 엔트리 타입은 risuai-pork의 `loreBook`, `customscript`, `triggerscript`에 대응한다. 현재 이들의 정확한 타입은 card 추출기에서도 `any`로 처리하고 있으므로 동일하게 `any[]`를 사용한다.

**Step 2: `types/index.ts` barrel export 추가**

```typescript
// 기존 export 뒤에 추가
export { RisuModule, MCPModule } from './module';
```

**Step 3: 빌드 확인**

Run: `cd packages/core && npx tsc --noEmit`
Expected: 에러 없음

**Step 4: Commit**

```
feat(core): add RisuModule type definition
```

---

### Task 2: parsers.ts 확장 — 에셋 바이너리 추출

**Files:**
- Modify: `packages/core/src/cli/extract/parsers.ts`

현재 `parseModuleRisum()`은 JSON 메타데이터만 반환한다. 에셋 바이너리 청크까지 추출하는 `parseModuleRisumFull()` 함수를 추가한다.

**Step 1: `parseModuleRisumFull()` 함수 추가**

`.risum` 바이너리 구조:
```
[magic:0x6F] [version:0x00] [mainLen:u32LE] [RPack(JSON)] [mark:0x01] [assetLen:u32LE] [RPack(asset0)] ... [0x00:EOF]
```

```typescript
export interface ParsedModuleFull {
  module: any;
  assetBuffers: Buffer[];
}

export function parseModuleRisumFull(buf: Buffer): ParsedModuleFull | null {
  if (!initRPack()) return null;

  let pos = 0;

  const readByte = () => {
    const byte = buf[pos];
    pos += 1;
    return byte;
  };
  const readLength = () => {
    const len = buf.readUInt32LE(pos);
    pos += 4;
    return len;
  };
  const readData = (len: number) => {
    const data = buf.subarray(pos, pos + len);
    pos += len;
    return data;
  };

  const magic = readByte();
  if (magic !== 111) {
    console.error(`  ⚠️  module.risum: 잘못된 매직 넘버 (${magic}, 기대: 111)`);
    return null;
  }

  const version = readByte();
  if (version !== 0) {
    console.error(`  ⚠️  module.risum: 지원하지 않는 버전 (${version})`);
    return null;
  }

  const mainLen = readLength();
  if (pos + mainLen > buf.length) {
    console.error('  ⚠️  module.risum: 데이터 크기 불일치');
    return null;
  }

  const mainData = readData(mainLen);
  const decoded = decodeRPackData(mainData);

  let parsed: any;
  try {
    parsed = JSON.parse(decoded.toString('utf-8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  ⚠️  module.risum: JSON 파싱 실패 — ${message}`);
    return null;
  }

  if (parsed.type !== 'risuModule') {
    console.error(`  ⚠️  module.risum: 잘못된 타입 (${parsed.type})`);
    return null;
  }

  // 에셋 바이너리 청크 읽기
  const assetBuffers: Buffer[] = [];
  while (pos < buf.length) {
    const mark = readByte();
    if (mark === 0) break; // EOF
    if (mark !== 1) {
      console.error(`  ⚠️  module.risum: 잘못된 에셋 마커 (${mark})`);
      break;
    }
    const len = readLength();
    const data = readData(len);
    assetBuffers.push(Buffer.from(decodeRPackData(data)));
  }

  return { module: parsed.module, assetBuffers };
}
```

**Step 2: JSON 모듈 파싱 함수 추가**

```typescript
export function parseModuleJson(buf: Buffer): any | null {
  let data: any;
  try {
    data = JSON.parse(buf.toString('utf-8'));
  } catch {
    return null;
  }

  // type: 'risuModule' 래퍼 형태
  if (data.type === 'risuModule' && data.module) {
    return data.module;
  }
  // 직접 모듈 객체 (name + id 필수)
  if (data.name && data.id) {
    return data;
  }
  return null;
}

export function isModuleJson(filePath: string): boolean {
  try {
    const fs = require('node:fs');
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    return (data.type === 'risuModule') || (data.name && data.id && !data.spec && !data.data?.name);
  } catch {
    return false;
  }
}
```

**Step 3: 빌드 확인**

Run: `cd packages/core && npx tsc --noEmit`
Expected: 에러 없음

**Step 4: Commit**

```
feat(core): add parseModuleRisumFull with asset extraction
```

---

### Task 3: module/phases.ts — 추출 phase 함수 구현

**Files:**
- Create: `packages/core/src/cli/extract/module/phases.ts`

캐릭터 추출기의 `character/phases.ts` 패턴을 따른다. 각 phase는 `(module: any, outputDir: string, ...) => number` 시그니처를 가진다.

**Step 1: phase1_parseModule 작성**

```typescript
import fs from 'node:fs';
import path from 'node:path';
import {
  sanitizeFilename,
  ensureDir,
  writeJson,
  writeText,
  writeBinary,
  uniquePath,
  buildFolderMap,
  resolveFolderName,
} from '../../../shared';
import { parseModuleRisumFull, parseModuleJson, decodeRPackData, initRPack } from '../parsers';
import type { ParsedModuleFull } from '../parsers';

export interface ParsedModuleResult {
  module: any;
  assetBuffers: Buffer[];
  sourceFormat: 'risum' | 'json';
}

export function phase1_parseModule(inputPath: string): ParsedModuleResult {
  const ext = path.extname(inputPath).toLowerCase();
  const buf = fs.readFileSync(inputPath);

  console.log('\n  📦 Phase 1: 모듈 파싱');
  console.log(`     입력: ${path.basename(inputPath)} (${(buf.length / 1024).toFixed(1)} KB)`);

  if (ext === '.risum') {
    console.log('     포맷: RisuModule Binary (.risum)');
    const result = parseModuleRisumFull(buf);
    if (!result) {
      throw new Error('module.risum 파싱 실패');
    }
    const mod = result.module;
    console.log(`     이름: ${mod.name || 'unknown'}`);
    console.log(`     ID: ${mod.id || 'unknown'}`);
    if (mod.namespace) console.log(`     네임스페이스: ${mod.namespace}`);
    if (result.assetBuffers.length > 0) {
      console.log(`     에셋: ${result.assetBuffers.length}개`);
    }
    return { module: mod, assetBuffers: result.assetBuffers, sourceFormat: 'risum' };
  }

  if (ext === '.json') {
    console.log('     포맷: JSON');
    const mod = parseModuleJson(buf);
    if (!mod) {
      throw new Error('JSON 모듈 파싱 실패 — type: risuModule 또는 name+id 필드가 필요합니다.');
    }
    console.log(`     이름: ${mod.name || 'unknown'}`);
    console.log(`     ID: ${mod.id || 'unknown'}`);
    return { module: mod, assetBuffers: [], sourceFormat: 'json' };
  }

  throw new Error(`지원하지 않는 모듈 포맷: ${ext} (지원: .risum, .json)`);
}
```

**Step 2: phase2~phase4 (lorebook, regex, trigger) 작성**

캐릭터 `phases.ts`의 패턴을 따르되, 데이터 소스를 모듈 필드에서 읽는다.

```typescript
// ─── Phase 2: Lorebook ──────────────────────────────────────────────────────

// 캐릭터 phases.ts와 동일한 내부 헬퍼
// (getLorebookFolderKey, createLorebookDirAllocator, buildLorebookFolderDirMap, extractLorebookRows)
// 전체 코드는 character/phases.ts의 해당 함수들을 동일하게 포함

export function phase2_extractLorebooks(module: any, outputDir: string): number {
  console.log('\n  📚 Phase 2: Lorebook 추출');
  const entries = module.lorebook;
  if (!Array.isArray(entries) || entries.length === 0) {
    console.log('     (lorebook 없음)');
    return 0;
  }
  console.log(`     lorebook entries: ${entries.length}개`);

  const lorebooksDir = path.join(outputDir, 'lorebooks');
  const orderList: string[] = [];
  const manifestEntries: any[] = [];
  const allocateDir = createLorebookDirAllocator();

  const count = extractLorebookRows(entries, lorebooksDir, 'module', manifestEntries, orderList, allocateDir);

  if (manifestEntries.length > 0) {
    writeJson(path.join(lorebooksDir, 'manifest.json'), { version: 1, entries: manifestEntries });
  }
  if (orderList.length > 0) {
    writeJson(path.join(lorebooksDir, '_order.json'), orderList);
  }

  console.log(`     ✅ ${count}개 lorebook → ${path.relative('.', lorebooksDir)}/`);
  return count;
}

// ─── Phase 3: Regex ─────────────────────────────────────────────────────────

export function phase3_extractRegex(module: any, outputDir: string): number {
  console.log('\n  🔧 Phase 3: Regex(customscript) 추출');
  const scripts = module.regex;
  if (!Array.isArray(scripts) || scripts.length === 0) {
    console.log('     (regex 없음)');
    return 0;
  }
  console.log(`     regex scripts: ${scripts.length}개`);

  const regexDir = path.join(outputDir, 'regex');
  let count = 0;
  const orderList: string[] = [];

  for (let i = 0; i < scripts.length; i += 1) {
    const script = scripts[i];
    const name = sanitizeFilename(script.comment || `regex_${i}`);
    const outPath = uniquePath(regexDir, name, '.json');
    writeJson(outPath, script);
    orderList.push(path.basename(outPath));
    count += 1;
  }

  if (orderList.length > 0) {
    writeJson(path.join(regexDir, '_order.json'), orderList);
  }

  console.log(`     ✅ ${count}개 regex → ${path.relative('.', regexDir)}/`);
  return count;
}

// ─── Phase 4: TriggerLua ────────────────────────────────────────────────────

export function phase4_extractTriggerLua(module: any, outputDir: string): number {
  console.log('\n  🌙 Phase 4: TriggerLua 스크립트 추출');
  const triggers = module.trigger;
  if (!Array.isArray(triggers) || triggers.length === 0) {
    console.log('     (trigger 없음)');
    return 0;
  }
  console.log(`     trigger: ${triggers.length}개`);

  const luaDir = path.join(outputDir, 'lua');
  let luaCount = 0;
  let triggerCount = 0;

  for (let i = 0; i < triggers.length; i += 1) {
    const trigger = triggers[i];
    const effects = trigger.effect || [];

    for (let j = 0; j < effects.length; j += 1) {
      const effect = effects[j];
      if (effect.type === 'triggerlua' && effect.code) {
        triggerCount += 1;
        const baseName = sanitizeFilename(
          trigger.comment || inferLuaFunctionName(effect.code) || `trigger_${i}`,
        );
        const name = effects.filter((e: any) => e.type === 'triggerlua').length > 1
          ? `${baseName}_${j}` : baseName;
        const outPath = uniquePath(luaDir, name, '.lua');

        const header = [
          `-- Extracted from module trigger: ${trigger.comment || '(unnamed)'}`,
          `-- Trigger type: ${trigger.type || 'unknown'}`,
          `-- Low-level access: ${trigger.lowLevelAccess || module.lowLevelAccess ? 'yes' : 'no'}`,
          '',
        ].join('\n');

        writeText(outPath, header + effect.code);
        luaCount += 1;
      }
    }
  }

  if (luaCount === 0) {
    console.log('     (triggerlua 없음)');
  } else {
    console.log(`     ✅ ${luaCount}개 lua 스크립트 (${triggerCount}개 triggerlua) → ${path.relative('.', luaDir)}/`);
  }

  return luaCount;
}
```

**Step 3: phase5_extractAssets 작성**

```typescript
export function phase5_extractAssets(
  module: any,
  outputDir: string,
  assetBuffers: Buffer[],
  sourceFormat: 'risum' | 'json',
): number {
  console.log('\n  🖼️ Phase 5: 에셋 추출');

  if (sourceFormat === 'json') {
    console.log('     (JSON 입력 — 에셋 바이너리 없음, 스킵)');
    return 0;
  }

  const assets = module.assets;
  if (!Array.isArray(assets) || assets.length === 0) {
    console.log('     (에셋 없음)');
    return 0;
  }

  console.log(`     에셋 메타: ${assets.length}개, 바이너리: ${assetBuffers.length}개`);

  const assetsDir = path.join(outputDir, 'assets');
  ensureDir(assetsDir);

  const manifest: any = {
    version: 1,
    total: assets.length,
    extracted: 0,
    assets: [],
  };

  for (let i = 0; i < assets.length; i += 1) {
    const [assetName, , assetType] = assets[i];
    const entry: any = {
      index: i,
      name: assetName || `asset_${i}`,
      type: assetType || 'unknown',
      extracted_path: null,
      status: 'skipped',
      size_bytes: null,
    };

    if (i < assetBuffers.length && assetBuffers[i].length > 0) {
      const baseName = sanitizeFilename(assetName || `asset_${i}`);
      const outPath = uniquePath(assetsDir, baseName, '.bin');
      writeBinary(outPath, assetBuffers[i]);
      entry.extracted_path = path.basename(outPath);
      entry.status = 'extracted';
      entry.size_bytes = assetBuffers[i].length;
      manifest.extracted += 1;
    }

    manifest.assets.push(entry);
  }

  writeJson(path.join(assetsDir, 'manifest.json'), manifest);
  console.log(`     ✅ ${manifest.extracted}개 추출 → ${path.relative('.', assetsDir)}/`);
  return manifest.extracted;
}
```

**Step 4: phase6 (backgroundEmbedding) + phase7 (identity) 작성**

```typescript
export function phase6_extractBackgroundEmbedding(module: any, outputDir: string): number {
  console.log('\n  🌐 Phase 6: BackgroundEmbedding 추출');
  const html = module.backgroundEmbedding;
  if (!html) {
    console.log('     (backgroundEmbedding 없음)');
    return 0;
  }
  const outPath = path.join(outputDir, 'html', 'background.html');
  writeText(outPath, html);
  console.log(`     ✅ html/background.html → ${path.relative('.', path.join(outputDir, 'html'))}`);
  return 1;
}

export function phase7_extractModuleIdentity(module: any, outputDir: string): number {
  console.log('\n  🧾 Phase 7: Module Identity 추출');

  const metadata: any = {
    name: module.name || '',
    description: module.description || '',
    id: module.id || '',
  };

  if (module.namespace) metadata.namespace = module.namespace;
  if (module.lowLevelAccess != null) metadata.lowLevelAccess = module.lowLevelAccess;
  if (module.hideIcon != null) metadata.hideIcon = module.hideIcon;
  if (module.mcp) metadata.mcp = module.mcp;
  if (module.customModuleToggle) metadata.customModuleToggle = module.customModuleToggle;

  const outPath = path.join(outputDir, 'metadata.json');
  writeJson(outPath, metadata);

  const fields = Object.keys(metadata).length;
  console.log(`     ✅ metadata.json (${fields}개 필드) → ${path.relative('.', outPath)}`);
  return fields;
}
```

**Step 5: 빌드 확인**

Run: `cd packages/core && npx tsc --noEmit`
Expected: 에러 없음

**Step 6: Commit**

```
feat(core): add module extract phases (lorebook, regex, trigger, assets, embedding, identity)
```

---

### Task 4: module/workflow.ts — 오케스트레이션

**Files:**
- Create: `packages/core/src/cli/extract/module/workflow.ts`

캐릭터 `character/workflow.ts`의 패턴을 따른다.

**Step 1: workflow.ts 작성**

```typescript
import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, writeJson } from '../../../node/fs-helpers';
import {
  phase1_parseModule,
  phase2_extractLorebooks,
  phase3_extractRegex,
  phase4_extractTriggerLua,
  phase5_extractAssets,
  phase6_extractBackgroundEmbedding,
  phase7_extractModuleIdentity,
} from './phases';

const HELP_TEXT = `
  🐿️ RisuAI Module Extractor

  Usage:  risu-core extract --type module <file.risum|file.json> [options]

  Supported formats:
    .risum        바이너리 모듈 (RPack)
    .json         JSON 모듈 (type: risuModule)

  Options:
    --out <dir>     출력 디렉토리 (기본: ./module_<name>)
    --json-only     Phase 1만 실행 (module.json만 출력)
    -h, --help      도움말

  Phases:
    1. 모듈 파싱 → module.json
    2. Lorebook 추출 → lorebooks/ + manifest.json + _order.json
    3. Regex(customscript) 추출 → regex/ + _order.json
    4. TriggerLua 스크립트 추출 → lua/
    5. 에셋 바이너리 추출 → assets/ + manifest.json (.risum only)
    6. BackgroundEmbedding 추출 → html/background.html
    7. Module Identity 추출 → metadata.json

  Examples:
    risu-core extract --type module my_module.risum
    risu-core extract my_module.risum --out ./extracted
    risu-core extract --type module my_module.json --json-only
`;

const MODULE_EXTENSIONS = new Set(['.risum']);

export function isModuleFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return MODULE_EXTENSIONS.has(ext);
}

export function runExtractWorkflow(argv: readonly string[]): number {
  const helpMode = argv.includes('-h') || argv.includes('--help') || argv.length === 0;
  const jsonOnly = argv.includes('--json-only');
  const outIdx = argv.indexOf('--out');
  const outArg = outIdx >= 0 ? argv[outIdx + 1] : null;
  const filePath = argv.find(
    (value) =>
      !value.startsWith('-') &&
      value !== outArg &&
      value !== '--out' &&
      value !== '--json-only',
  );

  if (helpMode || !filePath) {
    console.log(HELP_TEXT);
    return 0;
  }

  if (!fs.existsSync(filePath)) {
    console.error(`\n  ❌ 파일을 찾을 수 없습니다: ${filePath}\n`);
    return 1;
  }

  try {
    runMain(filePath, outArg, jsonOnly);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n  ❌ ${message}\n`);
    return 1;
  }
}

function runMain(filePath: string, outArg: string | null, jsonOnly: boolean): void {
  console.log('\n  🐿️ RisuAI Module Extractor\n');

  const { module, assetBuffers, sourceFormat } = phase1_parseModule(filePath);

  const safeName = (module.name || 'unnamed')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 50);
  const defaultOutDir = `module_${safeName}`;
  const resolvedOutDir = path.resolve(outArg || defaultOutDir);
  ensureDir(resolvedOutDir);

  const moduleJsonPath = path.join(resolvedOutDir, 'module.json');
  writeJson(moduleJsonPath, module);
  console.log(`\n     ✅ module.json → ${path.relative('.', moduleJsonPath)}`);

  if (jsonOnly) {
    console.log('\n  완료 (--json-only)\n');
    return;
  }

  phase2_extractLorebooks(module, resolvedOutDir);
  phase3_extractRegex(module, resolvedOutDir);
  phase4_extractTriggerLua(module, resolvedOutDir);
  phase5_extractAssets(module, resolvedOutDir, assetBuffers, sourceFormat);
  phase6_extractBackgroundEmbedding(module, resolvedOutDir);
  phase7_extractModuleIdentity(module, resolvedOutDir);

  console.log('\n  ────────────────────────────────────────');
  console.log(`  📊 추출 완료 → ${path.relative('.', resolvedOutDir)}/`);
  console.log('  ────────────────────────────────────────\n');
}
```

**Step 2: 빌드 확인**

Run: `cd packages/core && npx tsc --noEmit`
Expected: 에러 없음

**Step 3: Commit**

```
feat(core): add module extract workflow orchestration
```

---

### Task 5: 라우팅 연결 — extract/workflow.ts + cli/main.ts

**Files:**
- Modify: `packages/core/src/cli/extract/workflow.ts`
- Modify: `packages/core/src/cli/main.ts`

**Step 1: extract/workflow.ts에 모듈 라우팅 추가**

```typescript
// 기존 import 뒤에 추가
import { runExtractWorkflow as runModuleExtract, isModuleFile } from './module/workflow';

// PRESET_ONLY_EXTENSIONS 뒤에 추가
const MODULE_ONLY_EXTENSIONS = new Set(['.risum']);
```

`runExtractWorkflow()` 함수 수정:
- `--type module` 분기 추가 (기존 `preset`, `character` 분기와 동일 패턴)
- 확장자 `.risum` 자동 감지
- `.json` 파일의 경우 `isModuleJson()` 검사 추가 (preset 검사보다 먼저)

```typescript
export function runExtractWorkflow(argv: readonly string[]): number {
  const typeIdx = argv.indexOf('--type');
  const typeArg = typeIdx >= 0 ? argv[typeIdx + 1] : null;

  if (typeArg === 'module') {
    return runModuleExtract(argv.filter((v) => v !== '--type' && v !== typeArg));
  }

  if (typeArg === 'preset') {
    return runPresetExtract(argv.filter((v) => v !== '--type' && v !== typeArg));
  }

  if (typeArg === 'character') {
    return runCharacterExtract(argv.filter((v) => v !== '--type' && v !== typeArg));
  }

  const filePath = argv.find(
    (v) => !v.startsWith('-') && v !== typeArg && v !== '--type' && v !== '--out' && !isOptionValue(argv, v),
  );

  if (filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (MODULE_ONLY_EXTENSIONS.has(ext)) {
      return runModuleExtract(argv);
    }
    if (PRESET_ONLY_EXTENSIONS.has(ext)) {
      return runPresetExtract(argv);
    }
    if (ext === '.json') {
      if (isModuleFile(filePath)) {
        return runModuleExtract(argv);
      }
      if (isPresetFile(filePath)) {
        return runPresetExtract(argv);
      }
    }
  }

  return runCharacterExtract(argv);
}
```

참고: `isModuleFile`은 `module/workflow.ts`에서 export한다. 내부적으로 `.json` 파일일 때 `isModuleJson()`(parsers.ts)을 호출하여 내용 기반 판별을 수행해야 한다. `isModuleFile` 구현을 JSON 검사까지 포함하도록 확장하거나, workflow.ts에서 `isModuleJson`을 직접 호출한다.

**Step 2: cli/main.ts 도움말 업데이트**

`extract` 커맨드 설명에 모듈 지원을 반영한다:

```
extract        캐릭터 카드 / 프리셋 / 모듈 추출 (.charx / .png / .risum / .json)
```

**Step 3: 빌드 확인**

Run: `cd packages/core && npx tsc --noEmit`
Expected: 에러 없음

**Step 4: Commit**

```
feat(core): wire module extract routing (.risum auto-detect, --type module)
```

---

### Task 6: 통합 테스트

**Files:**
- Create: `packages/core/tests/module-extract.test.ts`

테스트 전략: 합성 모듈 데이터를 생성하여 phase 함수와 워크플로우를 검증한다. `.risum` 바이너리 테스트 파일이 없으므로, JSON 모듈 입력과 개별 phase 함수의 단위 테스트에 집중한다.

**Step 1: 테스트 파일 작성**

```typescript
import { describe, expect, it, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('module extract', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'module-extract-'));
  });

  // 1) JSON 모듈 파싱 테스트
  // 2) Phase 2: lorebook 추출 → lorebooks/ 생성 확인
  // 3) Phase 3: regex 추출 → regex/ 생성 확인
  // 4) Phase 4: trigger/lua 추출 → lua/*.lua 생성 확인
  // 5) Phase 6: backgroundEmbedding → html/background.html 확인
  // 6) Phase 7: metadata.json 생성 확인
  // 7) JSON 입력 시 asset phase 스킵 확인
  // 8) 라우팅: .risum 확장자 → 모듈 추출 분기 확인
  // 9) --type module 명시 → 모듈 추출 분기 확인
  // 10) --json-only → module.json만 생성 확인
});
```

각 테스트는 합성 모듈 데이터를 JSON으로 생성 → phase 함수 호출 → 파일시스템 출력 검증 패턴을 따른다.

**Step 2: 테스트 실행**

Run: `cd packages/core && npx vitest run tests/module-extract.test.ts`
Expected: 전체 통과

**Step 3: 기존 테스트 회귀 확인**

Run: `cd packages/core && npx vitest run`
Expected: 기존 테스트 전체 통과 (12개)

**Step 4: Commit**

```
test(core): add module extract integration tests
```

---

### Task 7: TODO.md 갱신

**Files:**
- Modify: `packages/core/../../TODO.md` (워크스페이스 루트의 `risuai-workbench/TODO.md`)

**Step 1: Done 섹션에 추가**

```markdown
- [x] `packages/core` module extract 추가 (`extract/module/` — .risum/.json 모듈 추출, 7-phase pipeline)
```

**Step 2: Commit**

```
docs: update TODO.md with module extract completion
```
