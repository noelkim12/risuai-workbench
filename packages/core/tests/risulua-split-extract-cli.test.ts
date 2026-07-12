import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import { runExtractWorkflow as runCharacterExtractWorkflow } from '../src/cli/extract/character/workflow';
import { parseModuleRisumFull } from '../src/cli/extract/parsers';
import { runExtractWorkflow as runModuleExtractWorkflow } from '../src/cli/extract/module/workflow';
import { runPackWorkflow as runCharacterPackWorkflow } from '../src/cli/pack/character/workflow';
import { runPackWorkflow as runModulePackWorkflow } from '../src/cli/pack/module/workflow';
import {
  decodeRisuLuaRecoveryBlock,
  decodeRisuLuaRecoveryPayload,
  hasExecutableRequireCalls,
  runRisuLuaSplitExtract,
} from '../src/cli/shared';
import {
  RISULUA_RECOVERY_ASSET_TYPE,
} from '../src/cli/shared/lua-bundler/risulua-recovery-asset';
import {
  parseRisuLuaDomainGenerationMode,
  parseRisuLuaSplitMode,
  RISULUA_DOMAIN_GENERATION_FLAG,
  RISULUA_SPLIT_FLAG,
  type RisuLuaDomainGenerationCliMode,
  type RisuLuaSplitCliMode,
} from '../src/cli/shared/risulua-split';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('risulua-split extract CLI integration', () => {
  it('preserves default and explicit none module extract Lua output byte-for-byte', async () => {
    const workDir = createTempDir('none');
    const sourceLua = 'function onOutput(text)\n  return text .. "!"\nend';
    const defaultOut = path.join(workDir, 'default-out');
    const noneOut = path.join(workDir, 'none-out');
    const expectedClassicLua = classicModuleLua(sourceLua);
    const defaultInput = writeModuleJson(workDir, 'default-module.json', 'none-module', sourceLua);
    const noneInput = writeModuleJson(workDir, 'none-module.json', 'none-module', sourceLua);

    const defaultCode = await runModuleExtractWorkflow([defaultInput, '--out', defaultOut]);
    const noneCode = await runModuleExtractWorkflow([
      noneInput,
      '--out',
      noneOut,
      '--risulua-split',
      'none',
    ]);

    expect(defaultCode).toBe(0);
    expect(noneCode).toBe(0);
    expect(readFile(defaultOut, 'lua/none-module.risulua')).toBe(expectedClassicLua);
    expect(readFile(noneOut, 'lua/none-module.risulua')).toBe(expectedClassicLua);
    expect(readFile(noneOut, 'lua/none-module.risulua')).toBe(readFile(defaultOut, 'lua/none-module.risulua'));
    expect(fs.existsSync(path.join(noneOut, 'docs', 'risulua-split-plan.json'))).toBe(false);
    expect(fs.existsSync(path.join(noneOut, 'legacy'))).toBe(false);
    expect(fs.existsSync(path.join(noneOut, 'dist'))).toBe(false);
  });

  it('writes report docs only while preserving .risumodule extraction and classic Lua source', async () => {
    const workDir = createTempDir('report');
    const sourceLua = 'local value = 1\nfunction onStart()\n  return value\nend';
    const input = writeModuleJson(workDir, 'report-module.json', 'report-module', sourceLua);
    const outDir = path.join(workDir, 'report-out');
    const expectedClassicLua = classicModuleLua(sourceLua);

    const exitCode = await runModuleExtractWorkflow([
      input,
      '--out',
      outDir,
      '--risulua-split',
      'report',
    ]);

    expect(exitCode).toBe(0);
    expect(fs.existsSync(path.join(outDir, '.risumodule'))).toBe(true);
    expect(readFile(outDir, 'lua/report-module.risulua')).toBe(expectedClassicLua);
    expect(fs.existsSync(path.join(outDir, 'docs', 'risulua-split-plan.json'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'docs', 'risulua-split-report.md'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'legacy'))).toBe(false);
    expect(fs.existsSync(path.join(outDir, 'dist'))).toBe(false);

    const plan = readJson(outDir, 'docs/risulua-split-plan.json') as Record<string, unknown>;
    expect(plan).toMatchObject({
      mode: 'report',
      files: [],
      distPath: null,
      packable: false,
    });
  });

  it('writes coarse character workspace through temp-then-move and keeps .risuchar metadata', async () => {
    const workDir = createTempDir('character-coarse');
    const sourceLua = 'function onOutput(text)\n  return text\nend';
    const input = path.join(workDir, 'character.charx');
    fs.writeFileSync(input, createCharacterCharx('Split Character', sourceLua));
    const outDir = path.join(workDir, 'character-out');

    const exitCode = await runCharacterExtractWorkflow([
      input,
      '--out',
      outDir,
      '--risulua-mode',
      'modular',
      '--risulua-split',
      'coarse',
    ]);

    expect(exitCode).toBe(0);
    expect(fs.existsSync(path.join(outDir, '.risuchar'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'lua', 'main.risulua'))).toBe(true);
    expect(readFile(outDir, 'legacy/original.risulua')).toBe(sourceLua);
    expect(fs.existsSync(path.join(outDir, 'docs', 'risulua-split-plan.json'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'docs', 'risulua-split-report.md'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'dist', 'Split_Character.risulua'))).toBe(true);

    const plan = readJson(outDir, 'docs/risulua-split-plan.json') as Record<string, unknown>;
    expect(plan).toMatchObject({
      mode: 'coarse',
      sourceProfile: 'plain-single',
      buildStrategy: 'concat-build-time-require',
      validation: expect.objectContaining({ ok: true, wroteDist: true }),
    });
    expect(listTempSplitDirs(path.dirname(outDir), path.basename(outDir))).toEqual([]);
  });

  it('cleans temp split output and keeps original Lua source plus diagnostics on validation failure', async () => {
    const workDir = createTempDir('failure');
    const sourceLua = [
      'package.preload["dup"] = function()',
      '  return { a = 1 }',
      'end',
      'package.preload["dup"] = function()',
      '  return { b = 2 }',
      'end',
    ].join('\n');
    const input = writeModuleJson(workDir, 'failure-module.json', 'failure-module', sourceLua);
    const outDir = path.join(workDir, 'failure-out');

    const exitCode = await runModuleExtractWorkflow([
      input,
      '--out',
      outDir,
      '--risulua-split',
      'coarse',
    ]);

    expect(exitCode).toBe(1);
    expect(readFile(outDir, 'lua/failure-module.risulua')).toBe(classicModuleLua(sourceLua));
    expect(fs.existsSync(path.join(outDir, 'docs', 'risulua-split-plan.json'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'docs', 'risulua-split-report.md'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'lua', 'preload'))).toBe(false);
    expect(fs.existsSync(path.join(outDir, 'legacy'))).toBe(false);
    expect(fs.existsSync(path.join(outDir, 'dist'))).toBe(false);
    expect(listTempSplitDirs(path.dirname(outDir), path.basename(outDir))).toEqual([]);

    const plan = readJson(outDir, 'docs/risulua-split-plan.json') as Record<string, unknown>;
    expect(plan.validation).toEqual(expect.objectContaining({ ok: false }));
    const validation = plan.validation as Record<string, unknown>;
    expect(validation.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'preload-duplicate-id', severity: 'error' }),
    ]));
  });

  it('accepts module-table as valid split mode and generates dry-run docs for plain-single source', async () => {
    const workDir = createTempDir('module-table');
    const sourceLua = 'function onOutput(text)\n  return text\nend';
    const input = writeModuleJson(workDir, 'module-table-test.json', 'module-table-module', sourceLua);
    const outDir = path.join(workDir, 'module-table-out');

    const exitCode = await runModuleExtractWorkflow([
      input,
      '--out',
      outDir,
      '--risulua-split',
      'module-table',
    ]);

    // module-table mode should succeed for plain-single sources
    expect(exitCode).toBe(0);
    // Should generate module-table docs and workspace artifacts
    expect(fs.existsSync(path.join(outDir, '.risumodule'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'lua', 'main.risulua'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'docs', 'risulua-split-plan.json'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'docs', 'risulua-split-report.md'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'docs', 'refactor-map.json'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'docs', 'domain-candidates.json'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'legacy', 'original.risulua'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'dist', 'module-table-module.risulua'))).toBe(true);

    // Verify plan structure
    const plan = readJson(outDir, 'docs/risulua-split-plan.json') as Record<string, unknown>;
    expect(plan).toMatchObject({
      mode: 'module-table',
      sourceProfile: 'plain-single',
      buildStrategy: 'concat-build-time-require',
      distPath: 'dist/module-table-module.risulua',
      packable: true,
      validation: expect.objectContaining({ ok: true, wroteDist: true }),
    });
    const dist = readFile(outDir, 'dist/module-table-module.risulua');
    expect(dist).not.toContain('Build-time local helper fragments');
    expect(hasExecutableRequireCalls(dist)).toBe(false);
  });

  it('keeps module-table workspace when generated dist is blocked by local budget', async () => {
    const workDir = createTempDir('module-table-dist-blocked');
    const sourceLua = lines([
      'local function helper(text)',
      '  return text',
      'end',
      '',
      'function onOutput(text)',
      ...buildLocalDeclarations(200),
      '  return helper(text)',
      'end',
    ]);
    const input = writeModuleJson(workDir, 'blocked-module.json', 'blocked-module', sourceLua);
    const outDir = path.join(workDir, 'blocked-out');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      const exitCode = await runModuleExtractWorkflow([
        input,
        '--out',
        outDir,
        '--risulua-mode',
        'modular',
        '--risulua-split',
        'module-table',
      ]);

      expect(exitCode).toBe(0);
      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('RisuLua split failed; preserving'));
      expect(fs.existsSync(path.join(outDir, 'lua', 'main.risulua'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'lua', 'runtime', 'output.risulua'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'legacy', 'original.risulua'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'docs', 'refactor-map.json'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'dist', 'blocked-module.risulua'))).toBe(false);

      const plan = readJson(outDir, 'docs/risulua-split-plan.json') as Record<string, unknown>;
      expect(plan).toMatchObject({
        mode: 'module-table',
        validation: expect.objectContaining({ ok: false, packable: false, wroteDist: false }),
      });
      const validation = plan.validation as { findings?: Array<Record<string, unknown>> };
      expect(validation.findings).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'local-budget', severity: 'error' }),
      ]));
      expect(readFile(outDir, 'docs/risulua-split-report.md')).toContain('error: local-budget');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('emits private implementation tables for validated domain modules', async () => {
    const workDir = createTempDir('module-table-domain');
    const sourceLua = lines([
      'local function normalizeDeck(cards)',
      '  return cards or {}',
      'end',
      '',
      'local function scoreDeck(cards)',
      '  return #normalizeDeck(cards) * 10',
      'end',
      '',
      'function onOutput(text)',
      '  return tostring(scoreDeck({ text }))',
      'end',
    ]);
    const input = writeModuleJson(workDir, 'domain-module.json', 'domain-module', sourceLua);
    const outDir = path.join(workDir, 'domain-out');

    const exitCode = await runModuleExtractWorkflow([
      input,
      '--out',
      outDir,
      '--risulua-mode',
      'modular',
      '--risulua-split',
      'module-table',
    ]);

    expect(exitCode).toBe(0);
    expect(fs.existsSync(path.join(outDir, 'lua', 'domain', 'deck.risulua'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'lua', 'domain', 'score_deck.risulua'))).toBe(false);
    const domainDeck = readFile(outDir, 'lua/domain/deck.risulua');
    expect(domainDeck).toContain('local __impl = {}');
    expect(domainDeck).toContain('function __impl.normalizeDeck(cards)');
    expect(domainDeck).toContain('function __impl.scoreDeck(cards)');
    expect(domainDeck).toContain('M.normalizeDeck = __impl.normalizeDeck');
    expect(domainDeck).toContain('M.scoreDeck = __impl.scoreDeck');
    expect(domainDeck).not.toMatch(/^local\s+(?:normalizeDeck|scoreDeck)\b/gm);
    const runtimeOutput = readFile(outDir, 'lua/runtime/output.risulua');
    expect(runtimeOutput).toContain('local __domain_deck = require("domain.deck")');
    expect(runtimeOutput).toContain('__domain_deck.scoreDeck({ text })');
    const refactorMap = readJson(outDir, 'docs/refactor-map.json') as Record<string, unknown>;
    expect(refactorMap.domainGeneration).toBe('validated');
    expect(moduleExports(refactorMap, 'lua/domain/deck.risulua')).toEqual([
      'normalizeDeck',
      'scoreDeck',
    ]);

    const exportManifest = readJson(outDir, 'docs/risulua-export-manifest.json') as Record<string, unknown>;
    expect(publicExportNames(refactorMap)).toEqual(publicExportNames(exportManifest));
    expect(publicExportNames(exportManifest)).toEqual([]);
  });

  it('verifies 히메둥드_0.57 validated domains in temporary output only', async () => {
    const fixtureRoot = path.resolve(process.cwd(), '..', '..', 'test_suites', '히메둥드_0.57');
    const sourcePath = path.join(fixtureRoot, 'legacy', 'original.risulua');
    expect(fs.existsSync(sourcePath)).toBe(true);

    const workDir = createTempDir('hime-fixture');
    const outDir = path.join(workDir, '히메둥드_0.57');
    const sourceLua = fs.readFileSync(sourcePath, 'utf8');

    await runRisuLuaSplitExtract({
      mode: 'module-table',
      outputRoot: outDir,
      source: sourceLua,
      sourcePath,
      targetName: '히메둥드_0.57ver',
      cwd: process.cwd(),
      domainGeneration: 'validated',
    });

    const refactorMap = readJson(outDir, 'docs/refactor-map.json') as Record<string, unknown>;
    const domainModules = domainFunctionModules(refactorMap);
    expect(domainModules.length).toBeGreaterThan(0);

    for (const moduleContract of domainModules) {
      const domainModule = readFile(outDir, moduleContract.path);
      expect(domainModule).toContain('local __impl = {}');
      for (const exportName of moduleContract.exports) {
        expect(domainModule).toContain(`function __impl.${exportName}(`);
        expect(domainModule).toContain(`M.${exportName} = __impl.${exportName}`);
        expect(domainModule).not.toMatch(new RegExp(`^local\\s+${escapeRegExp(exportName)}\\b`, 'm'));
      }
    }

    const report = readFile(outDir, 'docs/risulua-split-report.md');
    expect(report).not.toContain('243 active locals');
    const exportManifest = readJson(outDir, 'docs/risulua-export-manifest.json') as Record<string, unknown>;
    expect(publicExportNames(refactorMap)).toEqual(publicExportNames(exportManifest));
    expect(fs.existsSync(path.join(fixtureRoot, 'docs', 'refactor-map.json'))).toBe(true);
  });

  it('keeps domain candidates report-only when module-table domain generation is explicitly disabled', async () => {
    const workDir = createTempDir('module-table-domain-report');
    const sourceLua = lines([
      'local function scoreDeck(cards)',
      '  return #cards * 10',
      'end',
      'function onOutput(text) return tostring(scoreDeck({ text })) end',
    ]);
    const input = writeModuleJson(workDir, 'domain-report-module.json', 'domain-report-module', sourceLua);
    const outDir = path.join(workDir, 'domain-report-out');

    const exitCode = await runModuleExtractWorkflow([
      input,
      '--out',
      outDir,
      '--risulua-mode',
      'modular',
      '--risulua-split',
      'module-table',
      '--risulua-domain-generation',
      'report',
    ]);

    expect(exitCode).toBe(0);
    expect(fs.existsSync(path.join(outDir, 'lua', 'domain', 'score_deck.risulua'))).toBe(false);
    const candidates = readJson(outDir, 'docs/domain-candidates.json') as { candidates: Array<Record<string, unknown>> };
    expect(candidates.candidates).toEqual([
      expect.objectContaining({ name: 'scoreDeck', generationStatus: 'report-only', autoGenerated: false }),
    ]);
  });

  it('fails closed for module-table on unsupported source profiles with diagnostics', async () => {
    const workDir = createTempDir('module-table-unsupported');
    // Create a preload-bundle style source
    const sourceLua = [
      'package.preload["helpers"] = function()',
      '  return { helper = function() end }',
      'end',
      'local h = require("helpers")',
    ].join('\n');
    const input = writeModuleJson(workDir, 'preload-module.json', 'preload-module', sourceLua);
    const outDir = path.join(workDir, 'preload-out');

    const exitCode = await runModuleExtractWorkflow([
      input,
      '--out',
      outDir,
      '--risulua-split',
      'module-table',
    ]);

    // Should fail for preload-bundle profile
    expect(exitCode).toBe(1);
    // Should still generate docs with error info
    expect(fs.existsSync(path.join(outDir, '.risumodule'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'docs', 'risulua-split-plan.json'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'docs', 'risulua-split-report.md'))).toBe(true);
    // No workspace artifacts
    expect(fs.existsSync(path.join(outDir, 'lua', 'main.risulua'))).toBe(false);
    expect(fs.existsSync(path.join(outDir, 'legacy'))).toBe(false);
    expect(fs.existsSync(path.join(outDir, 'dist'))).toBe(false);

    // Verify plan shows failure
    const plan = readJson(outDir, 'docs/risulua-split-plan.json') as Record<string, unknown>;
    expect(plan.mode).toBe('module-table');
    expect(plan.validation).toEqual(expect.objectContaining({ ok: false }));
  });

  it('rejects invalid split mode with exit code 1 and prints helpful error including module-table', async () => {
    const workDir = createTempDir('invalid-mode');
    const sourceLua = 'function onOutput(text)\n  return text\nend';
    const input = writeModuleJson(workDir, 'invalid-mode-test.json', 'invalid-mode-module', sourceLua);
    const outDir = path.join(workDir, 'invalid-mode-out');

    const exitCode = await runModuleExtractWorkflow([
      input,
      '--out',
      outDir,
      '--risulua-split',
      'invalid-mode',
    ]);

    // Invalid mode should return exit code 1 (error handled by workflow)
    expect(exitCode).toBe(1);
    // No output files should be generated for invalid mode
    expect(fs.existsSync(path.join(outDir, '.risumodule'))).toBe(false);
    expect(fs.existsSync(path.join(outDir, 'docs'))).toBe(false);
  });

  it('accepts module-table for character extraction with plain-single source', async () => {
    const workDir = createTempDir('char-module-table');
    const sourceLua = 'function onOutput(text)\n  return text\nend';
    const input = path.join(workDir, 'character.charx');
    fs.writeFileSync(input, createCharacterCharx('ModuleTableChar', sourceLua));
    const outDir = path.join(workDir, 'char-out');

    const exitCode = await runCharacterExtractWorkflow([
      input,
      '--out',
      outDir,
      '--risulua-mode',
      'modular',
      '--risulua-split',
      'module-table',
    ]);

    // module-table mode should succeed for plain-single character sources
    expect(exitCode).toBe(0);
    // Should generate module-table docs and workspace artifacts
    expect(fs.existsSync(path.join(outDir, '.risuchar'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'lua', 'main.risulua'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'docs', 'risulua-split-plan.json'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'docs', 'risulua-split-report.md'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'docs', 'refactor-map.json'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'docs', 'domain-candidates.json'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'legacy', 'original.risulua'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'dist', 'ModuleTableChar.risulua'))).toBe(true);

    // Verify plan structure
    const plan = readJson(outDir, 'docs/risulua-split-plan.json') as Record<string, unknown>;
    expect(plan).toMatchObject({
      mode: 'module-table',
      sourceProfile: 'plain-single',
      buildStrategy: 'concat-build-time-require',
      distPath: 'dist/ModuleTableChar.risulua',
      packable: true,
      validation: expect.objectContaining({ ok: true, wroteDist: true }),
    });
    const dist = readFile(outDir, 'dist/ModuleTableChar.risulua');
    expect(dist).not.toContain('Build-time local helper fragments');
    expect(hasExecutableRequireCalls(dist)).toBe(false);
  });

  it('omits declaration-only source paths in module-table main bridge navigation comments', async () => {
    const workDir = createTempDir('char-module-table-navigation');
    const sourceLua = lines([
      'local html = [[<button type="button" risu-trigger="toggleSidePanel">Open</button>]]',
      '',
      'function toggleSidePanel()',
      '  return "ok"',
      'end',
    ]);
    const input = path.join(workDir, 'character.charx');
    fs.writeFileSync(input, createCharacterCharx('ModuleTableNavigationChar', sourceLua));
    const outDir = path.join(workDir, 'char-navigation-out');

    const exitCode = await runCharacterExtractWorkflow([
      input,
      '--out',
      outDir,
      '--risulua-mode',
      'modular',
      '--risulua-split',
      'module-table',
    ]);

    expect(exitCode).toBe(0);
    const main = readFile(outDir, 'lua/main.risulua');
    expect(main).not.toContain('-- Button action bridge: toggleSidePanel');
    expect(main).not.toContain('---@source lua/main.risulua:3:0');
    expect(main).toContain('toggleSidePanel = __button_actions.toggleSidePanel');
    expect(main).not.toContain(outDir);

    const buttonActions = readFile(outDir, 'lua/button_actions/actions.risulua');
    expect(buttonActions).not.toContain('-- Button action bridge:');
    expect(buttonActions).not.toContain('---@source');
  });

  it('restores character module-table files after extract pack extract with full-source recovery', async () => {
    const workDir = createTempDir('char-round-trip-recovery');
    const sourceLua = lines([
      'local html = [[<button type="button" risu-trigger="toggleSidePanel">Open</button>]]',
      '',
      'local function renderLabel(value)',
      '  return "label:" .. tostring(value)',
      'end',
      '',
      'function toggleSidePanel()',
      '  return renderLabel(html)',
      'end',
      '',
      'function onOutput(text)',
      '  return toggleSidePanel() .. text',
      'end',
    ]);
    const input = path.join(workDir, 'round-trip-character.charx');
    fs.writeFileSync(input, createCharacterCharx('RoundTripCharacter', sourceLua));
    const firstOut = path.join(workDir, 'first-extract');
    const packedPath = path.join(workDir, 'packed.charx');
    const repackedFullSourcePath = path.join(workDir, 'repacked-full-source.charx');
    const repackedNonePath = path.join(workDir, 'repacked-none.charx');
    const secondOut = path.join(workDir, 'second-extract');

    const firstExtractCode = await runCharacterExtractWorkflow([
      input,
      '--out',
      firstOut,
      '--risulua-mode',
      'modular',
      '--risulua-split',
      'module-table',
    ]);
    const packCode = runCharacterPackWorkflow([
      '--in',
      firstOut,
      '--format',
      'charx',
      '--out',
      packedPath,
      '--risulua-mode',
      'modular',
      '--risulua-recovery',
      'full-source',
    ]);
    const secondExtractCode = await runCharacterExtractWorkflow([
      packedPath,
      '--out',
      secondOut,
      '--risulua-mode',
      'modular',
      '--risulua-recovery',
      'full-source',
    ]);

    expect(firstExtractCode).toBe(0);
    expect(packCode).toBe(0);
    expectPackedCharxRecoveryAssetCount(packedPath, 1);
    expect(secondExtractCode).toBe(0);
    expectSameFileBytesForPaths(firstOut, secondOut, [
      'lua/main.risulua',
      'lua/button_actions/actions.risulua',
      'docs/refactor-map.json',
      'docs/domain-candidates.json',
      'docs/risulua-button-action-index.json',
      'docs/risulua-export-manifest.json',
      'docs/risulua-split-plan.json',
      'docs/risulua-split-report.md',
    ]);

    const repackFullSourceCode = runCharacterPackWorkflow([
      '--in',
      secondOut,
      '--format',
      'charx',
      '--out',
      repackedFullSourcePath,
      '--risulua-mode',
      'modular',
      '--risulua-recovery',
      'full-source',
    ]);
    const repackNoneCode = runCharacterPackWorkflow([
      '--in',
      secondOut,
      '--format',
      'charx',
      '--out',
      repackedNonePath,
      '--risulua-mode',
      'modular',
      '--risulua-recovery',
      'none',
    ]);

    expect(repackFullSourceCode).toBe(0);
    expectPackedCharxRecoveryAssetCount(repackedFullSourcePath, 1);
    expect(repackNoneCode).toBe(0);
    expectPackedCharxRecoveryAssetCount(repackedNonePath, 0);
  });

  it('restores module-table module files after extract pack extract with full-source recovery', async () => {
    const workDir = createTempDir('module-round-trip-recovery');
    const sourceLua = lines([
      'function onOutput(text)',
      'local transientState = {',
      '  count = 1,',
      '}',
      '  transientState.count = transientState.count + #text',
      '  return text .. tostring(transientState.count)',
      'end',
    ]);
    const input = writeModuleJson(workDir, 'round-trip-module.json', 'round-trip-module', sourceLua);
    const firstOut = path.join(workDir, 'first-extract');
    const packedPath = path.join(workDir, 'packed-module.risum');
    const repackedFullSourcePath = path.join(workDir, 'repacked-full-source.risum');
    const repackedNonePath = path.join(workDir, 'repacked-none.risum');
    const secondOut = path.join(workDir, 'second-extract');

    const firstExtractCode = await runModuleExtractWorkflow([
      input,
      '--out',
      firstOut,
      '--risulua-mode',
      'modular',
      '--risulua-split',
      'module-table',
    ]);
    const packCode = runModulePackWorkflow([
      '--in',
      firstOut,
      '--out',
      packedPath,
      '--format',
      'risum',
      '--risulua-mode',
      'modular',
      '--risulua-recovery',
      'full-source',
    ]);
    const secondExtractCode = await runModuleExtractWorkflow([
      packedPath,
      '--out',
      secondOut,
      '--risulua-mode',
      'modular',
      '--risulua-recovery',
      'full-source',
    ]);
    const generatedModulePath = chooseGeneratedLuaModulePath(firstOut);

    expect(firstExtractCode).toBe(0);
    expect(packCode).toBe(0);
    expectPackedRisumRecoveryAssetCount(packedPath, 1);
    expect(secondExtractCode).toBe(0);
    expectSameFileBytesForPaths(firstOut, secondOut, [
      'lua/main.risulua',
      generatedModulePath,
      'docs/refactor-map.json',
      'docs/domain-candidates.json',
      'docs/risulua-button-action-index.json',
      'docs/risulua-export-manifest.json',
      'docs/risulua-split-plan.json',
      'docs/risulua-split-report.md',
    ]);

    const repackFullSourceCode = runModulePackWorkflow([
      '--in',
      secondOut,
      '--out',
      repackedFullSourcePath,
      '--format',
      'risum',
      '--risulua-mode',
      'modular',
      '--risulua-recovery',
      'full-source',
    ]);
    const repackNoneCode = runModulePackWorkflow([
      '--in',
      secondOut,
      '--out',
      repackedNonePath,
      '--format',
      'risum',
      '--risulua-mode',
      'modular',
      '--risulua-recovery',
      'none',
    ]);

    expect(repackFullSourceCode).toBe(0);
    expectPackedRisumRecoveryAssetCount(repackedFullSourcePath, 1);
    expect(repackNoneCode).toBe(0);
    expectPackedRisumRecoveryAssetCount(repackedNonePath, 0);
  });
});

// ── Parser unit tests ─────────────────────────────────────────────────

describe('parseRisuLuaSplitMode', () => {
  it('returns null when --risulua-split is absent', () => {
    const result = parseRisuLuaSplitMode(['--in', '.', '--out', 'out.json']);
    expect(result.mode).toBeNull();
    expect(result.strippedArgv).toEqual(['--in', '.', '--out', 'out.json']);
  });

  it('parses module-table mode to exact string module-table', () => {
    const result = parseRisuLuaSplitMode(['--risulua-split', 'module-table']);
    expect(result.mode).toBe('module-table');
    const _typeCheck: RisuLuaSplitCliMode = result.mode as RisuLuaSplitCliMode;
    expect(_typeCheck).toBe('module-table');
  });

  it('parses all valid modes correctly', () => {
    const none = parseRisuLuaSplitMode(['--risulua-split', 'none']);
    expect(none.mode).toBe('none');

    const report = parseRisuLuaSplitMode(['--risulua-split', 'report']);
    expect(report.mode).toBe('report');

    const coarse = parseRisuLuaSplitMode(['--risulua-split', 'coarse']);
    expect(coarse.mode).toBe('coarse');

    const moduleTable = parseRisuLuaSplitMode(['--risulua-split', 'module-table']);
    expect(moduleTable.mode).toBe('module-table');
  });

  it('strips --risulua-split and its value from argv', () => {
    const result = parseRisuLuaSplitMode([
      '--in',
      '.',
      '--risulua-split',
      'module-table',
      '--out',
      'out.json',
    ]);
    expect(result.mode).toBe('module-table');
    expect(result.strippedArgv).toEqual(['--in', '.', '--out', 'out.json']);
  });

  it('rejects invalid values with error containing all valid modes', () => {
    expect(() => parseRisuLuaSplitMode(['--risulua-split', 'invalid'])).toThrow(
      `Invalid ${RISULUA_SPLIT_FLAG} value: "invalid". Must be "none", "report", "coarse", or "module-table".`,
    );
  });

  it('rejects missing value (flag is last arg)', () => {
    expect(() => parseRisuLuaSplitMode(['--risulua-split'])).toThrow(
      `Invalid ${RISULUA_SPLIT_FLAG} value: "". Must be "none", "report", "coarse", or "module-table".`,
    );
  });
});

describe('parseRisuLuaDomainGenerationMode', () => {
  it('returns null when --risulua-domain-generation is absent', () => {
    const result = parseRisuLuaDomainGenerationMode(['--in', '.', '--out', 'out.json']);
    expect(result.mode).toBeNull();
    expect(result.strippedArgv).toEqual(['--in', '.', '--out', 'out.json']);
  });

  it('parses and strips validated domain generation mode', () => {
    const result = parseRisuLuaDomainGenerationMode([
      '--risulua-domain-generation',
      'validated',
      '--out',
      'out.json',
    ]);
    expect(result.mode).toBe('validated');
    const _typeCheck: RisuLuaDomainGenerationCliMode = result.mode as RisuLuaDomainGenerationCliMode;
    expect(_typeCheck).toBe('validated');
    expect(result.strippedArgv).toEqual(['--out', 'out.json']);
  });

  it('rejects invalid domain generation values', () => {
    expect(() => parseRisuLuaDomainGenerationMode(['--risulua-domain-generation', 'always'])).toThrow(
      `Invalid ${RISULUA_DOMAIN_GENERATION_FLAG} value: "always". Must be "report" or "validated".`,
    );
  });
});

function createTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `risulua-split-extract-${prefix}-`));
  tempDirs.push(dir);
  return dir;
}

function writeModuleJson(workDir: string, fileName: string, moduleName: string, sourceLua: string): string {
  const filePath = path.join(workDir, fileName);
  fs.writeFileSync(
    filePath,
    JSON.stringify({
      type: 'risuModule',
      module: {
        name: moduleName,
        id: `${moduleName}-id`,
        trigger: [{ comment: 'init', effect: [{ type: 'triggerlua', code: sourceLua }] }],
      },
    }),
    'utf8',
  );
  return filePath;
}

function createCharacterCharx(name: string, sourceLua: string): Buffer {
  return Buffer.from(zipSync({
    'charx.json': strToU8(JSON.stringify({
      spec: 'chara_card_v3',
      spec_version: '3.0',
      data: {
        name,
        description: 'split character',
        first_mes: 'hello',
        extensions: {
          risuai: {
            triggerscript: [{ comment: 'entry', effect: [{ type: 'triggerlua', code: sourceLua }] }],
            customScripts: [],
          },
        },
      },
    })),
  }, { level: 0 }));
}

function readFile(root: string, relativePath: string): string {
  return fs.readFileSync(path.join(root, ...relativePath.split('/')), 'utf8');
}

function readJson(root: string, relativePath: string): unknown {
  return JSON.parse(readFile(root, relativePath));
}

function moduleExports(refactorMap: Record<string, unknown>, modulePath: string): string[] {
  const modules = refactorMap.modules as Array<Record<string, unknown>> | undefined;
  const moduleContract = modules?.find((module) => module.path === modulePath);
  expect(moduleContract).toBeDefined();
  return moduleContract?.exports as string[];
}

function domainFunctionModules(refactorMap: Record<string, unknown>): Array<{ path: string; exports: string[] }> {
  const modules = refactorMap.modules as Array<Record<string, unknown>> | undefined;
  return (modules ?? [])
    .filter((moduleContract) => moduleContract.category === 'domain-function')
    .map((moduleContract) => ({
      path: moduleContract.path as string,
      exports: moduleContract.exports as string[],
    }));
}

function publicExportNames(document: Record<string, unknown>): string[] {
  const symbols = document.symbols as Array<Record<string, unknown>> | undefined;
  if (symbols) {
    return symbols
      .filter((symbol) => symbol.globalBridge === true)
      .map((symbol) => symbol.originalName as string);
  }

  const entries = document.hostVisibleGlobals as Array<Record<string, unknown>> | undefined;
  return entries?.map((entry) => entry.name as string) ?? [];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readBytes(root: string, relativePath: string): Buffer {
  return fs.readFileSync(path.join(root, ...relativePath.split('/')));
}

function expectSameFileBytes(firstRoot: string, secondRoot: string, relativePath: string): void {
  expect(readBytes(secondRoot, relativePath)).toEqual(readBytes(firstRoot, relativePath));
}

function expectSameFileBytesForPaths(
  firstRoot: string,
  secondRoot: string,
  relativePaths: readonly string[],
): void {
  for (const relativePath of relativePaths) {
    expectSameFileBytes(firstRoot, secondRoot, relativePath);
  }
}

function expectPackedCharxRecoveryAssetCount(packedPath: string, expectedCount: number): void {
  const archive = unzipSync(fs.readFileSync(packedPath));
  const charxEntry = archive['charx.json'];
  if (!charxEntry) throw new Error('Expected packed charx.json');

  const packedCharx: unknown = JSON.parse(strFromU8(charxEntry));
  const packedLua = readPackedCharxLua(packedCharx);
  const recoveryAssets = readPackedCharxAssetRecords(packedCharx).filter(
    (asset) => asset['type'] === RISULUA_RECOVERY_ASSET_TYPE,
  );

  expect(decodeRisuLuaRecoveryBlock(packedLua)).toBeNull();
  expect(recoveryAssets).toHaveLength(expectedCount);
  for (const asset of recoveryAssets) {
    decodeRisuLuaRecoveryPayload(readEmbededCharxAssetPayload(archive, asset));
  }
}

function expectPackedRisumRecoveryAssetCount(packedPath: string, expectedCount: number): void {
  const parsed = parseModuleRisumFull(fs.readFileSync(packedPath));
  if (parsed === null) throw new Error('Expected packed RISUM to parse');
  const moduleValue: unknown = parsed.module;
  if (!isRecord(moduleValue)) throw new Error('Expected packed RISUM module object');

  const packedLua = readPackedModuleLua(moduleValue);
  const assets = Array.isArray(moduleValue['assets']) ? moduleValue['assets'] : [];
  const recoveryAssetBuffers = assets.flatMap((asset, index) => {
    if (!isRecoveryRisumAssetTuple(asset)) return [];
    const buffer = parsed.assetBuffers[index];
    if (!buffer) throw new Error('Expected recovery RISUM asset buffer');
    return [buffer];
  });

  expect(decodeRisuLuaRecoveryBlock(packedLua)).toBeNull();
  expect(recoveryAssetBuffers).toHaveLength(expectedCount);
  for (const buffer of recoveryAssetBuffers) {
    decodeRisuLuaRecoveryPayload(buffer);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readPackedCharxAssetRecords(packedCharx: unknown): Array<Record<string, unknown>> {
  if (!isRecord(packedCharx)) throw new Error('Expected packed CharX object');
  const data = packedCharx['data'];
  if (!isRecord(data)) throw new Error('Expected packed CharX data object');
  const assets = data['assets'];
  if (!Array.isArray(assets)) return [];
  return assets.filter(isRecord);
}

function readPackedCharxLua(packedCharx: unknown): string {
  if (!isRecord(packedCharx)) throw new Error('Expected packed CharX object');
  const data = packedCharx['data'];
  if (!isRecord(data)) throw new Error('Expected packed CharX data object');
  return readPackedModuleLua(data);
}

function readPackedModuleLua(moduleValue: Record<string, unknown>): string {
  const triggers = moduleValue['trigger'] ?? readNestedRisuaiValue(moduleValue, 'triggerscript');
  if (!Array.isArray(triggers)) throw new Error('Expected packed Lua triggers');
  const trigger = triggers[0];
  if (!isRecord(trigger)) throw new Error('Expected packed Lua trigger object');
  const effects = trigger['effect'];
  if (!Array.isArray(effects)) throw new Error('Expected packed Lua effect list');
  const effect = effects[0];
  if (!isRecord(effect)) throw new Error('Expected packed Lua effect object');
  const code = effect['code'];
  if (typeof code !== 'string') throw new Error('Expected packed Lua code string');
  return code;
}

function readNestedRisuaiValue(moduleValue: Record<string, unknown>, key: string): unknown {
  const extensions = moduleValue['extensions'];
  if (!isRecord(extensions)) return undefined;
  const risuai = extensions['risuai'];
  if (!isRecord(risuai)) return undefined;
  return risuai[key];
}

function readEmbededCharxAssetPayload(
  archive: Record<string, Uint8Array>,
  asset: Record<string, unknown>,
): Buffer {
  const uri = asset['uri'];
  if (typeof uri !== 'string') throw new Error('Expected embedded asset uri');
  const entryName = uri.replace(/^embeded:\/\//, '');
  const entry = archive[entryName];
  if (!entry) throw new Error(`Expected embedded asset payload for ${entryName}`);
  return Buffer.from(entry);
}

function isRecoveryRisumAssetTuple(value: unknown): boolean {
  return Array.isArray(value) && value.length === 3 && value[2] === RISULUA_RECOVERY_ASSET_TYPE;
}

function chooseGeneratedLuaModulePath(root: string): string {
  const preferredPath = 'lua/runtime/output.risulua';
  if (fs.existsSync(path.join(root, ...preferredPath.split('/')))) return preferredPath;

  const refactorMap = readJson(root, 'docs/refactor-map.json');
  const candidates = collectStringValues(refactorMap)
    .filter((value) => value.startsWith('lua/') && value.endsWith('.risulua') && value !== 'lua/main.risulua')
    .filter((value) => fs.existsSync(path.join(root, ...value.split('/'))))
    .sort();

  expect(candidates.length).toBeGreaterThan(0);
  return candidates[0];
}

function collectStringValues(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((item) => collectStringValues(item));
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap((item) => collectStringValues(item));
  }
  return [];
}

function classicModuleLua(sourceLua: string): string {
  return `-- Trigger: init\n${sourceLua}\n`;
}

function buildLocalDeclarations(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `  local v${String(index + 1).padStart(3, '0')} = ${index + 1}`);
}

function lines(sourceLines: string[]): string {
  return `${sourceLines.join('\n')}\n`;
}

function listTempSplitDirs(parentDir: string, outputBaseName: string): string[] {
  const prefix = `.tmp-risulua-split-${outputBaseName}-`;
  if (!fs.existsSync(parentDir)) return [];
  return fs.readdirSync(parentDir).filter((entry) => entry.startsWith(prefix));
}
