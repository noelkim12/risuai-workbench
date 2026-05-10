import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RISULUA_SPLIT_PLAN_PATH,
  RISULUA_SPLIT_REPORT_PATH,
  createRisuLuaPlainCoarseArtifacts,
  writeRisuLuaPlainCoarseWorkspace,
  buildTopLevelInventory,
  classifyAtomForCoarseSplit,
  sliceSourceRange,
  atomToSourceRange,
} from '../src/domain/risulua-split';
import type { RisuLuaSplitPlan } from '../src/domain/risulua-split';

const fixtureRoot = fileURLToPath(new URL('./fixtures/risulua/', import.meta.url));

// ─── helpers ────────────────────────────────────────────────────────────────

function readFixture(relativePath: string): string {
  return fs.readFileSync(fixturePath(relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function fixturePath(relativePath: string): string {
  return path.join(fixtureRoot, ...relativePath.split('/'));
}

function withTempDir(run: (outputRoot: string) => void): void {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'risulua-plain-coarse-'));
  try {
    run(outputRoot);
  } finally {
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
}

function readOutput(outputRoot: string, relativePath: string): string {
  return fs.readFileSync(path.join(outputRoot, ...relativePath.split('/')), 'utf8');
}

function readPlan(outputRoot: string): RisuLuaSplitPlan {
  return JSON.parse(readOutput(outputRoot, RISULUA_SPLIT_PLAN_PATH)) as RisuLuaSplitPlan;
}

function extractRequireIds(source: string): string[] {
  return [...source.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]);
}

function isDotOnlyModuleId(id: string): boolean {
  return !id.includes('/') && !id.startsWith('.') && !id.endsWith('.risulua');
}

function countRequireId(source: string, id: string): number {
  return extractRequireIds(source).filter((requireId) => requireId === id).length;
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe('risulua-split plain coarse planner/writer', () => {
  it('preserves runtime hook shapes and classifies handler targets', () => {
    withTempDir((outputRoot) => {
      const source = readFixture('plain/plain_hooks_only.risulua');
      const sourcePath = fixturePath('plain/plain_hooks_only.risulua');
      const artifacts = createRisuLuaPlainCoarseArtifacts({ source, sourcePath });

      writeRisuLuaPlainCoarseWorkspace(artifacts, { outputRoot, cwd: process.cwd() });

      const plan = readPlan(outputRoot);
      const main = readOutput(outputRoot, 'lua/main.risulua');
      const report = readOutput(outputRoot, RISULUA_SPLIT_REPORT_PATH);

      // Plan structure
      expect(plan).toEqual(expect.objectContaining({
        mode: 'coarse',
        sourceProfile: 'plain-single',
        buildStrategy: 'concat-build-time-require',
        packable: true,
        entryPath: 'lua/main.risulua',
        distPath: 'dist/plain_hooks_only.risulua',
      }));

      // Workspace files exist
      expect(fs.existsSync(path.join(outputRoot, 'lua', 'main.risulua'))).toBe(true);
      expect(fs.existsSync(path.join(outputRoot, 'legacy', 'original.risulua'))).toBe(true);
      expect(fs.existsSync(path.join(outputRoot, ...RISULUA_SPLIT_PLAN_PATH.split('/')))).toBe(true);
      expect(fs.existsSync(path.join(outputRoot, ...RISULUA_SPLIT_REPORT_PATH.split('/')))).toBe(true);

      // Hook shapes preserved exactly
      expect(main).toContain('function onStart()');
      expect(main).toContain('function onOutput(text)');
      expect(main).toContain('setChatVar("booted", "yes")');
      expect(main).toContain('started = true');
      expect(main).toContain('return text .. "\\n[ready]"');

      // Legacy original matches source
      expect(readOutput(outputRoot, 'legacy/original.risulua')).toBe(source);

      // Any requires present must be dot-only
      const requireIds = extractRequireIds(main);
      for (const id of requireIds) {
        expect(isDotOnlyModuleId(id)).toBe(true);
      }

      // Detected roots include hooks
      expect(plan.detectedRoots).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'onStart', kind: 'function' }),
        expect.objectContaining({ name: 'onOutput', kind: 'function' }),
      ]));

      // Scope-unsafe risk present (atoms share the `started` local)
      expect(plan.risks).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'plain-coarse-scope-unsafe-preserved',
          riskFlags: expect.arrayContaining(['scope-unsafe']),
        }),
      ]));

      // Report distinguishes actual output from suggested-but-unsafe candidates.
      expect(report).toContain('- Actual generated Lua source files: `lua/main.risulua`');
      expect(report).toContain('- Actual runtime-required module files: None.');
      expect(report).toContain('## Suggested split map (not automatically applied when marked unsafe)');
      expect(report).toContain('not a guarantee that every listed candidate was generated');
    });
  });

  it('extracts global pure helpers even when unrelated top-level locals exist', () => {
    withTempDir((outputRoot) => {
      const source = [
        'local unrelated = "keep in main"',
        '',
        'function normalizeTags(tags)',
        '  local out = {}',
        '  for i, tag in ipairs(tags) do',
        '    out[i] = string.lower(tag)',
        '  end',
        '  return table.concat(out, ",")',
        'end',
        '',
        'function onStart()',
        '  setState("ready", unrelated)',
        'end',
        '',
      ].join('\n');
      const artifacts = createRisuLuaPlainCoarseArtifacts({
        source,
        sourcePath: 'inline_plain_with_unrelated_local.risulua',
      });

      writeRisuLuaPlainCoarseWorkspace(artifacts, { outputRoot, cwd: process.cwd() });

      const main = readOutput(outputRoot, 'lua/main.risulua');
      const helpers = readOutput(outputRoot, 'lua/common/helpers.risulua');
      const plan = readPlan(outputRoot);

      expect(fs.existsSync(path.join(outputRoot, 'lua', 'common', 'helpers.risulua'))).toBe(true);
      expect(main).toContain('require("common.helpers")');
      expect(main).toContain('local unrelated = "keep in main"');
      expect(main).toContain('function onStart()');
      expect(main).not.toContain('function normalizeTags(tags)');
      expect(helpers).toContain('function normalizeTags(tags)');
      expect(helpers).toContain('string.lower(tag)');
      expect(helpers).toContain('table.concat(out, ",")');
      expect(plan.files).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: 'lua/common/helpers.risulua' }),
      ]));
    });
  });

  it('groups multiple pure helpers into one helper file and one plan entry', () => {
    withTempDir((outputRoot) => {
      const source = [
        'function normalizeName(name)',
        '  return string.lower(name)',
        'end',
        '',
        'function joinTags(tags)',
        '  return table.concat(tags, ",")',
        'end',
        '',
        'function onStart()',
        '  setState("ready", "yes")',
        'end',
        '',
      ].join('\n');
      const artifacts = createRisuLuaPlainCoarseArtifacts({
        source,
        sourcePath: 'inline_many_helpers.risulua',
      });

      writeRisuLuaPlainCoarseWorkspace(artifacts, { outputRoot, cwd: process.cwd() });

      const main = readOutput(outputRoot, 'lua/main.risulua');
      const helpers = readOutput(outputRoot, 'lua/common/helpers.risulua');
      const plan = readPlan(outputRoot);
      const report = readOutput(outputRoot, RISULUA_SPLIT_REPORT_PATH);
      const helperPlanFiles = plan.files.filter((file) => file.path === 'lua/common/helpers.risulua');

      expect(countRequireId(main, 'common.helpers')).toBe(1);
      expect(helperPlanFiles).toHaveLength(1);
      expect(helperPlanFiles[0].sourceRanges).toHaveLength(2);
      expect(helpers).toContain('function normalizeName(name)');
      expect(helpers).toContain('function joinTags(tags)');
      expect(report).toContain('- Actual runtime-required module files: `lua/common/helpers.risulua`');
      expect(report.match(/`lua\/common\/helpers\.risulua`/g)?.length ?? 0).toBeLessThan(5);
    });
  });

  it('extracts top-level local functions as build-time fragments without requiring them', () => {
    withTempDir((outputRoot) => {
      const source = [
        'local function trim(value)',
        '  return (value:gsub("^%s+", ""):gsub("%s+$", ""))',
        'end',
        '',
        'function onOutput(text)',
        '  return trim(text)',
        'end',
        '',
      ].join('\n');

      writeRisuLuaPlainCoarseWorkspace(
        createRisuLuaPlainCoarseArtifacts({ source, sourcePath: 'inline_local_helper_fragment.risulua' }),
        { outputRoot, cwd: process.cwd() },
      );

      const main = readOutput(outputRoot, 'lua/main.risulua');
      const localHelpers = readOutput(outputRoot, 'lua/common/local_helpers.risulua');
      const plan = readPlan(outputRoot);
      const report = readOutput(outputRoot, RISULUA_SPLIT_REPORT_PATH);
      const localFragmentFiles = plan.files.filter((file) => file.path === 'lua/common/local_helpers.risulua');

      expect(main).not.toContain('local function trim(value)');
      expect(main).toContain('function onOutput(text)');
      expect(main).toContain('return trim(text)');
      expect(extractRequireIds(main)).not.toContain('common.local_helpers');
      expect(localHelpers).toContain('local function trim(value)');
      expect(localFragmentFiles).toHaveLength(1);
      expect(localFragmentFiles[0]).toEqual(expect.objectContaining({ kind: 'chunk-fragment' }));
      expect(report).toContain('- Actual build-time local fragment files: `lua/common/local_helpers.risulua`');
      expect(report).toContain('build-time local fragment; not runtime-required from main.');
    });
  });

  it('removes safe-helper leading comments and empty decorative headers from main', () => {
    withTempDir((outputRoot) => {
      const source = [
        '-- ==========================================',
        '-- 공용 모듈',
        '-- ==========================================',
        '-- 숫자 안전 추출',
        'function safeNumber(value)',
        '  return tonumber(value) or 0',
        'end',
        '',
        '-- 이름 → CXXX 코드 찾기',
        'function codeForName(name)',
        '  return string.lower(name)',
        'end',
        '',
        '-- ==========================================',
        '-- Runtime',
        '-- ==========================================',
        'function onStart()',
        '  setState("ready", safeNumber("1"))',
        'end',
        '',
      ].join('\n');

      writeRisuLuaPlainCoarseWorkspace(
        createRisuLuaPlainCoarseArtifacts({ source, sourcePath: 'inline_orphan_comments.risulua' }),
        { outputRoot, cwd: process.cwd() },
      );

      const main = readOutput(outputRoot, 'lua/main.risulua');
      const helpers = readOutput(outputRoot, 'lua/common/helpers.risulua');

      expect(countRequireId(main, 'common.helpers')).toBe(1);
      expect(main).not.toContain('-- 공용 모듈');
      expect(main).not.toContain('-- 숫자 안전 추출');
      expect(main).not.toContain('-- 이름 → CXXX 코드 찾기');
      expect(main).toContain('-- Runtime');
      expect(main).toContain('function onStart()');
      expect(helpers).toContain('function safeNumber(value)');
      expect(helpers).toContain('function codeForName(name)');
      expect(helpers).not.toContain('-- 숫자 안전 추출');
    });
  });

  it('keeps local variable tables in main while extracting global constants once', () => {
    withTempDir((outputRoot) => {
      const source = [
        '-- 변수',
        'local localConfig = {',
        '  key = 1,',
        '}',
        '',
        'GLOBAL_CODES = {',
        '  ready = 1,',
        '}',
        '',
        'function onStart()',
        '  setState("key", localConfig.key)',
        'end',
        '',
      ].join('\n');

      writeRisuLuaPlainCoarseWorkspace(
        createRisuLuaPlainCoarseArtifacts({ source, sourcePath: 'inline_local_tables.risulua' }),
        { outputRoot, cwd: process.cwd() },
      );

      const main = readOutput(outputRoot, 'lua/main.risulua');
      const constants = readOutput(outputRoot, 'lua/schema/constants.risulua');
      const plan = readPlan(outputRoot);
      const report = readOutput(outputRoot, RISULUA_SPLIT_REPORT_PATH);
      const constantsPlanFiles = plan.files.filter((file) => file.path === 'lua/schema/constants.risulua');

      expect(countRequireId(main, 'schema.constants')).toBe(1);
      expect(constantsPlanFiles).toHaveLength(1);
      expect(main).toContain('local localConfig = {');
      expect(main).toContain('setState("key", localConfig.key)');
      expect(main).not.toContain('GLOBAL_CODES = {');
      expect(constants).toContain('GLOBAL_CODES = {');
      expect(report).toContain('Preserved in main because local declarations must remain available in main scope.');
    });
  });

  it('preserves listenEdit registration and onInput hook with dot-only requires', () => {
    withTempDir((outputRoot) => {
      const source = readFixture('plain/plain_listen_edit.risulua');
      const artifacts = createRisuLuaPlainCoarseArtifacts({
        source,
        sourcePath: fixturePath('plain/plain_listen_edit.risulua'),
      });

      writeRisuLuaPlainCoarseWorkspace(artifacts, { outputRoot, cwd: process.cwd() });

      const main = readOutput(outputRoot, 'lua/main.risulua');
      const plan = readPlan(outputRoot);

      // Listener registration preserved exactly
      expect(main).toContain('listenEdit("profile.name", function(value)');
      expect(main).toContain('editCount = editCount + 1');
      expect(main).toContain('setState("last_profile_name", value)');

      // Hook preserved
      expect(main).toContain('function onInput(text)');
      expect(main).toContain('return text');

      // Dot-only requires (if any)
      const requireIds = extractRequireIds(main);
      for (const id of requireIds) {
        expect(isDotOnlyModuleId(id)).toBe(true);
      }

      // Plan has scope-unsafe risk (atoms share editCount local)
      expect(plan.risks.some((r) => r.riskFlags.includes('scope-unsafe'))).toBe(true);

      // Legacy preserved
      expect(readOutput(outputRoot, 'legacy/original.risulua')).toBe(source);
    });
  });

  it('preserves dynamic state key in very-low confidence block with risk reason', () => {
    withTempDir((outputRoot) => {
      const source = readFixture('plain/plain_dynamic_state_key.risulua');
      const artifacts = createRisuLuaPlainCoarseArtifacts({
        source,
        sourcePath: fixturePath('plain/plain_dynamic_state_key.risulua'),
      });

      writeRisuLuaPlainCoarseWorkspace(artifacts, { outputRoot, cwd: process.cwd() });

      const main = readOutput(outputRoot, 'lua/main.risulua');
      const plan = readPlan(outputRoot);
      const report = readOutput(outputRoot, RISULUA_SPLIT_REPORT_PATH);

      // Dynamic state key code preserved exactly
      expect(main).toContain('local key = prefix .. ":" .. slot');
      expect(main).toContain('setState(key, value)');
      expect(main).toContain('function onButtonClick(buttonId)');
      expect(main).toContain('saveMood(buttonId, getChatVar(buttonId) or "neutral")');

      // Very-low confidence atom has a risk entry
      const veryLowRisks = plan.risks.filter(
        (r) => r.riskFlags.includes('very-low-confidence'),
      );
      expect(veryLowRisks.length).toBeGreaterThanOrEqual(1);
      expect(veryLowRisks[0].message).toMatch(/dynamic/i);

      // Report mentions the dynamic pattern or risk
      expect(report).toMatch(/dynamic/i);

      // Scope-unsafe risk present
      expect(plan.risks.some((r) => r.riskFlags.includes('scope-unsafe'))).toBe(true);

      // Legacy preserved
      expect(readOutput(outputRoot, 'legacy/original.risulua')).toBe(source);
    });
  });

  it('preserves giant dispatcher without splitting and does not classify host mutation helpers as pure', () => {
    withTempDir((outputRoot) => {
      const source = readFixture('plain/plain_giant_button_dispatcher.risulua');
      const artifacts = createRisuLuaPlainCoarseArtifacts({
        source,
        sourcePath: fixturePath('plain/plain_giant_button_dispatcher.risulua'),
      });

      writeRisuLuaPlainCoarseWorkspace(artifacts, { outputRoot, cwd: process.cwd() });

      const main = readOutput(outputRoot, 'lua/main.risulua');
      const plan = readPlan(outputRoot);

      // Giant dispatcher preserved — entire `onButtonClick` with dispatch table
      expect(main).toContain('local action = actions[buttonId]');
      expect(main).toContain('function onButtonClick(buttonId)');
      expect(main).toContain('setChatVar("hp", "10")');
      expect(main).toContain('alertNormal("done")');

      // Not split into separate feature files
      expect(fs.existsSync(path.join(outputRoot, 'lua', 'features'))).toBe(false);

      // No host mutation helper classified as pure common helper
      for (const candidate of artifacts.pureCandidates) {
        expect(candidate).not.toContain('setChatVar');
        expect(candidate).not.toContain('alertNormal');
        expect(candidate).not.toContain('actions');
      }

      // Very-low confidence risk for the dispatcher
      const veryLowRisks = plan.risks.filter(
        (r) => r.riskFlags.includes('very-low-confidence'),
      );
      expect(veryLowRisks.length).toBeGreaterThanOrEqual(1);

      // Scope-unsafe risk (actions local shared with onButtonClick)
      expect(plan.risks.some((r) => r.riskFlags.includes('scope-unsafe'))).toBe(true);

      // Dot-only requires (if any)
      const requireIds = extractRequireIds(main);
      for (const id of requireIds) {
        expect(isDotOnlyModuleId(id)).toBe(true);
      }

      // Legacy preserved
      expect(readOutput(outputRoot, 'legacy/original.risulua')).toBe(source);
    });
  });

  it('classifies atoms correctly using text-based host mutation detection', () => {
    // Test the classification directly for the giant dispatcher fixture
    // to verify host mutation helpers are not classified as pure.
    const source = readFixture('plain/plain_giant_button_dispatcher.risulua');
    const inventory = buildTopLevelInventory(source);

    for (const atom of inventory) {
      const sourceSlice = sliceSourceRange(source, atomToSourceRange(atom));
      const classification = classifyAtomForCoarseSplit(atom, sourceSlice);

      // If the source slice contains host mutations, it must NOT be
      // classified as a high-confidence pure helper.
      if (/setChatVar|alertNormal|setState|setChat|addChat/.test(sourceSlice)) {
        expect(classification.confidence).not.toBe('high');
        expect(classification.targetPath).not.toBe('common/helpers.risulua');
      }
    }
  });
});
