import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { strToU8, zipSync } from 'fflate';

import { runExtractWorkflow as runCharacterExtractWorkflow } from '../src/cli/extract/character/workflow';
import { runExtractWorkflow as runModuleExtractWorkflow } from '../src/cli/extract/module/workflow';
import { runPackWorkflow as runCharacterPackWorkflow } from '../src/cli/pack/character/workflow';
import { runPackWorkflow as runModulePackWorkflow } from '../src/cli/pack/module/workflow';
import { hasExecutableRequireCalls } from '../src/cli/shared';
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

  it('generates validated domain function files by default for module-table extract', async () => {
    const workDir = createTempDir('module-table-domain');
    const sourceLua = lines([
      'local function scoreDeck(cards)',
      '  return #cards * 10',
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
    expect(fs.existsSync(path.join(outDir, 'lua', 'domain', 'score_deck.risulua'))).toBe(true);
    expect(readFile(outDir, 'lua/main.risulua')).not.toContain('local __domain_score_deck = require("domain.score_deck")');
    expect(readFile(outDir, 'lua/domain/score_deck.risulua')).toContain('M.scoreDeck = scoreDeck');
    const refactorMap = readJson(outDir, 'docs/refactor-map.json') as Record<string, unknown>;
    expect(refactorMap.domainGeneration).toBe('validated');
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
    expect(secondExtractCode).toBe(0);
    expectSameFileBytes(firstOut, secondOut, 'lua/main.risulua');
    expectSameFileBytes(firstOut, secondOut, 'docs/refactor-map.json');
    expectSameFileBytes(firstOut, secondOut, 'lua/button_actions/actions.risulua');
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
    const packedPath = path.join(workDir, 'packed-module.json');
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
      'json',
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
    expect(secondExtractCode).toBe(0);
    expectSameFileBytes(firstOut, secondOut, 'lua/main.risulua');
    expectSameFileBytes(firstOut, secondOut, 'docs/refactor-map.json');
    expectSameFileBytes(firstOut, secondOut, generatedModulePath);
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

function readBytes(root: string, relativePath: string): Buffer {
  return fs.readFileSync(path.join(root, ...relativePath.split('/')));
}

function expectSameFileBytes(firstRoot: string, secondRoot: string, relativePath: string): void {
  expect(readBytes(secondRoot, relativePath)).toEqual(readBytes(firstRoot, relativePath));
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
