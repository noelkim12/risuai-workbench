import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH,
  createRisuLuaModuleTableArtifacts,
  RISULUA_MODULE_TABLE_PROMPT_STORE_PATH,
  RISULUA_MODULE_TABLE_VARIABLE_STORE_PATH,
  serializeRisuLuaModuleTableDomainCandidates,
  serializeRisuLuaModuleTableRefactorMap,
  writeRisuLuaModuleTableWorkspace,
} from '../src/domain/risulua-split';
import { lines } from './helpers/module-table-refactor-map-helpers';

describe('risulua-split module-table artifact writer', () => {
  it('generates final workspace artifacts from dry-run refactor-map output', async () => {
    const source = moduleTableFixture();
    const artifacts = await createRisuLuaModuleTableArtifacts({
      source,
      sourcePath: 'fixtures/module_table.risulua',
      targetName: 'module_table',
      cwd: process.cwd(),
    });

    const paths = artifacts.workspaceFiles.map((file) => file.path);
    expect(paths).toEqual(expect.arrayContaining([
      'lua/main.risulua',
      'lua/common/local_helpers.risulua',
      'lua/handler_helpers/output_helpers.risulua',
      'lua/host_globals/global_functions.risulua',
      'lua/host_globals/async_actions.risulua',
      'legacy/original.risulua',
      'docs/risulua-split-plan.json',
      'docs/risulua-split-report.md',
      'docs/refactor-map.json',
      'docs/domain-candidates.json',
    ]));
    expect(paths).not.toContain('lua/features/output_helpers.risulua');
    expect(paths.some((filePath) => filePath.startsWith('lua/domain/'))).toBe(false);
    expect(artifacts.plan).toEqual(expect.objectContaining({
      buildStrategy: 'concat-build-time-require',
      distPath: 'dist/module_table.risulua',
      packable: true,
    }));

    const refactorMapDoc = fileContent(artifacts, 'docs/refactor-map.json');
    const domainDoc = fileContent(artifacts, 'docs/domain-candidates.json');
    expect(refactorMapDoc).toBe(serializeRisuLuaModuleTableRefactorMap(artifacts.dryRunResult.refactorMap, { cwd: process.cwd() }));
    expect(domainDoc).toBe(serializeRisuLuaModuleTableDomainCandidates(artifacts.dryRunResult.refactorMap.domainCandidates, { cwd: process.cwd() }));

    const main = fileContent(artifacts, 'lua/main.risulua');
    expect(main).toContain('local __local_helpers = require("common.local_helpers")');
    expect(main).toContain('local __output_helpers = require("handler_helpers.output_helpers")');
    expect(main).toContain('local __host_globals = require("host_globals.global_functions")');
    expect(main).toContain('local __async_actions = require("host_globals.async_actions")');
    expect(main).toContain('setLanguage1 = __host_globals.setLanguage1');
    expect(main).toContain('setHeroineClothes = __async_actions.setHeroineClothes');
    expect(main).toContain('__output_helpers.decorate(text, __local_helpers.helperTrim)');
    expect(main).not.toContain('local function decorate');

    const common = fileContent(artifacts, 'lua/common/local_helpers.risulua');
    expect(count(common, 'local M = {}')).toBe(1);
    expect(count(common, 'return M')).toBe(1);
    expect(common).toContain('M.helperTrim = helperTrim');

    for (const file of artifacts.workspaceFiles.filter((item) => item.path.startsWith('lua/') && item.path !== 'lua/main.risulua')) {
      expect(file.content.trim().length).toBeGreaterThan(0);
    }
    expect(artifacts.plan.files.filter((file) => file.path.includes('/handler_helpers/')).every((file) => file.kind !== 'chunk-fragment')).toBe(true);
  });

  it('extracts top-level local state tables into a separate variable-store risulua', async () => {
    const source = lines([
      'local vgContext = {',
      '  mood = "neutral",',
      '  stats = { hp = 10 },',
      '}',
      '',
      'local function helperTrim(value)',
      '  return value:gsub("^%s+", "")',
      'end',
      '',
      'function onOutput(text)',
      '  vgContext.mood = helperTrim(text)',
      '  return vgContext.mood',
      'end',
    ]);

    const artifacts = await createRisuLuaModuleTableArtifacts({ source, sourcePath: 'variable_store_fixture.risulua' });
    const paths = artifacts.workspaceFiles.map((file) => file.path);

    expect(paths).toContain(RISULUA_MODULE_TABLE_VARIABLE_STORE_PATH);
    expect(artifacts.dryRunResult.refactorMap.modules).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: RISULUA_MODULE_TABLE_VARIABLE_STORE_PATH,
        requireId: 'state.variable_store',
        alias: '__variable_store',
        category: 'state-store',
        exports: ['vgContext'],
      }),
    ]));

    const main = fileContent(artifacts, 'lua/main.risulua');
    expect(main).toContain('local __variable_store = require("state.variable_store")');
    expect(main).toContain('local vgContext = __variable_store.vgContext');
    expect(main).not.toContain('local vgContext = {');

    const variableStore = fileContent(artifacts, RISULUA_MODULE_TABLE_VARIABLE_STORE_PATH);
    expect(variableStore).toContain('-- risulua-split=module-table variable-store');
    expect(variableStore).toContain('local vgContext = {');
    expect(variableStore).toContain('stats = { hp = 10 }');
    expect(variableStore).toContain('M.vgContext = vgContext');
    expect(variableStore.trim().endsWith('return M')).toBe(true);
  });

  it('does not extract column-zero local tables from inside functions into the variable store', async () => {
    const source = lines([
      'function onOutput(text)',
      'local transientState = {',
      '  count = 1,',
      '}',
      '  return text .. tostring(transientState.count)',
      'end',
    ]);

    const artifacts = await createRisuLuaModuleTableArtifacts({ source, sourcePath: 'function_local_state.risulua' });
    const paths = artifacts.workspaceFiles.map((file) => file.path);
    const main = fileContent(artifacts, 'lua/main.risulua');
    const runtimeOutput = fileContent(artifacts, 'lua/runtime/output.risulua');

    expect(paths).not.toContain(RISULUA_MODULE_TABLE_VARIABLE_STORE_PATH);
    expect(runtimeOutput).toContain('local transientState = {');
    expect(main).not.toContain('__variable_store.transientState');
  });

  it('preserves top-level state table ranges containing long bracket braces', async () => {
    const source = lines([
      'local storyState = {',
      '  template = [[keeps } inside long string]],',
      '  note = [=[also keeps } inside nested long string]=],',
      '  marker = "ok",',
      '}',
      '',
      'function onOutput(text)',
      '  return storyState.marker .. text',
      'end',
    ]);

    const artifacts = await createRisuLuaModuleTableArtifacts({ source, sourcePath: 'long_bracket_state.risulua' });
    const variableStore = fileContent(artifacts, RISULUA_MODULE_TABLE_VARIABLE_STORE_PATH);
    const main = fileContent(artifacts, 'lua/main.risulua');

    expect(variableStore).toContain('template = [[keeps } inside long string]]');
    expect(variableStore).toContain('note = [=[also keeps } inside nested long string]=]');
    expect(variableStore).toContain('marker = "ok"');
    expect(variableStore).toContain('M.storyState = storyState');
    expect(main).toContain('local storyState = __variable_store.storyState');
    expect(main).not.toContain('template = [[keeps } inside long string]]');
  });

  it('extracts top-level prompt string constants into a dedicated prompt store', async () => {
    const source = lines([
      'local CHOICE_GENERATION_INSTRUCTION = [[',
      '## Assistant Guidance',
      '한국어 안내와 ] ] 비슷한 텍스트를 보존합니다.',
      ']]',
      '',
      'local KOREAN_CHOICE_INSTRUCTION_CONTENT = [=[',
      '현재 언어는 Korean입니다.',
      ']=]',
      '',
      'local storyState = {',
      '  marker = "ok",',
      '}',
      '',
      'function onOutput(text)',
      '  local INNER_PROMPT_TEMPLATE = [[keep function scope]]',
      '  return CHOICE_GENERATION_INSTRUCTION .. KOREAN_CHOICE_INSTRUCTION_CONTENT .. storyState.marker .. INNER_PROMPT_TEMPLATE .. text',
      'end',
    ]);

    const artifacts = await createRisuLuaModuleTableArtifacts({ source, sourcePath: 'prompt_store_fixture.risulua' });
    const paths = artifacts.workspaceFiles.map((file) => file.path);

    expect(paths).toContain(RISULUA_MODULE_TABLE_PROMPT_STORE_PATH);
    expect(paths).toContain(RISULUA_MODULE_TABLE_VARIABLE_STORE_PATH);
    expect(artifacts.dryRunResult.refactorMap.modules).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: RISULUA_MODULE_TABLE_PROMPT_STORE_PATH,
        requireId: 'prompts.instruction_store',
        alias: '__prompt_store',
        category: 'prompt-store',
        exports: ['CHOICE_GENERATION_INSTRUCTION', 'KOREAN_CHOICE_INSTRUCTION_CONTENT'],
      }),
    ]));

    const main = fileContent(artifacts, 'lua/main.risulua');
    const runtimeOutput = fileContent(artifacts, 'lua/runtime/output.risulua');
    expect(main).toContain('local __prompt_store = require("prompts.instruction_store")');
    expect(main).toContain('local CHOICE_GENERATION_INSTRUCTION = __prompt_store.CHOICE_GENERATION_INSTRUCTION');
    expect(main).toContain('local KOREAN_CHOICE_INSTRUCTION_CONTENT = __prompt_store.KOREAN_CHOICE_INSTRUCTION_CONTENT');
    expect(main).not.toContain('## Assistant Guidance');
    expect(runtimeOutput).toContain('local INNER_PROMPT_TEMPLATE = [[keep function scope]]');
    expect(main).toContain('local storyState = __variable_store.storyState');

    const promptStore = fileContent(artifacts, RISULUA_MODULE_TABLE_PROMPT_STORE_PATH);
    expect(promptStore).toContain('-- risulua-split=module-table prompt-store');
    expect(promptStore).toContain('local CHOICE_GENERATION_INSTRUCTION = [[');
    expect(promptStore).toContain('한국어 안내와 ] ] 비슷한 텍스트를 보존합니다.');
    expect(promptStore).toContain('local KOREAN_CHOICE_INSTRUCTION_CONTENT = [=[');
    expect(promptStore).toContain('M.CHOICE_GENERATION_INSTRUCTION = CHOICE_GENERATION_INSTRUCTION');
    expect(promptStore.trim().endsWith('return M')).toBe(true);

    const variableStore = fileContent(artifacts, RISULUA_MODULE_TABLE_VARIABLE_STORE_PATH);
    expect(variableStore).toContain('local storyState = {');
    expect(variableStore).not.toContain('CHOICE_GENERATION_INSTRUCTION');
  });

  it('generates one domain file per validated safe domain function', async () => {
    const source = lines([
      'local function scoreDeck(cards)',
      '  return #cards * 10',
      'end',
      '',
      'function onOutput(text)',
      '  return tostring(scoreDeck({ text }))',
      'end',
    ]);

    const artifacts = await createRisuLuaModuleTableArtifacts({
      source,
      sourcePath: 'domain_generation_fixture.risulua',
      domainGeneration: 'validated',
    });
    const paths = artifacts.workspaceFiles.map((file) => file.path);

    expect(paths).toContain('lua/domain/score_deck.risulua');
    expect(artifacts.dryRunResult.refactorMap.domainCandidates).toEqual([
      expect.objectContaining({
        name: 'scoreDeck',
        generationStatus: 'generated',
        generatedPath: 'lua/domain/score_deck.risulua',
        autoGenerated: true,
      }),
    ]);

    const main = fileContent(artifacts, 'lua/main.risulua');
    expect(main).toContain('local __domain_score_deck = require("domain.score_deck")');
    expect(main).toContain('return __runtime_output.onOutput(text, __domain_score_deck.scoreDeck)');
    expect(main).not.toContain('local function scoreDeck');

    const domainFile = fileContent(artifacts, 'lua/domain/score_deck.risulua');
    expect(domainFile).toContain('local M = {}');
    expect(domainFile).toContain('function scoreDeck(cards)');
    expect(domainFile).toContain('M.scoreDeck = scoreDeck');
    expect(domainFile.trim().endsWith('return M')).toBe(true);
  });

  it('uses risuregex button triggers when generating button_actions artifacts', async () => {
    const source = lines([
      'local function toggleSidePanel()',
      '  return "ok"',
      'end',
    ]);

    const artifacts = await createRisuLuaModuleTableArtifacts({
      source,
      sourcePath: 'regex_button_fixture.risulua',
      buttonActionSources: ['@@@ OUT\n{{button::Toggle::toggleSidePanel}}\n'],
    });

    const paths = artifacts.workspaceFiles.map((file) => file.path);
    expect(paths).toContain(RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH);
    expect(artifacts.dryRunResult.refactorMap.modules).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH,
        category: 'button-action',
        exports: ['toggleSidePanel'],
      }),
    ]));

    const main = fileContent(artifacts, 'lua/main.risulua');
    expect(main).toContain('local __button_actions = require("button_actions.actions")');
    expect(main).toContain('toggleSidePanel = __button_actions.toggleSidePanel');

    const buttonActions = fileContent(artifacts, RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH);
    expect(buttonActions).toContain('function toggleSidePanel()');
    expect(buttonActions).toContain('M.toggleSidePanel = toggleSidePanel');
  });

  it('generates host-visible public domain functions with bridge assignments and helper rewrites', async () => {
    const source = lines([
      'local function safeGet(key)',
      '  return getChatVar(key)',
      'end',
      '',
      'function createRandomCharacter(code)',
      '  local name = safeGet("name")',
      '  setChatVar("last", name)',
      '  return code .. name',
      'end',
      '',
      'function onOutput(text)',
      '  return createRandomCharacter(text)',
      'end',
    ]);

    const artifacts = await createRisuLuaModuleTableArtifacts({
      source,
      sourcePath: 'public_domain_generation_fixture.risulua',
      domainGeneration: 'validated',
    });

    const main = fileContent(artifacts, 'lua/main.risulua');
    const domainFile = fileContent(artifacts, 'lua/domain/create_random_character.risulua');
    expect(main).toContain('local __domain_create_random_character = require("domain.create_random_character")');
    expect(main).toContain('createRandomCharacter = __domain_create_random_character.createRandomCharacter');
    expect(domainFile).toContain('local __local_helpers = require("common.local_helpers")');
    expect(domainFile).toContain('local name = __local_helpers.safeGet("name")');
    expect(domainFile).toContain('M.createRandomCharacter = createRandomCharacter');
    expect(artifacts.dryRunResult.refactorMap.domainCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'createRandomCharacter', generationStatus: 'generated', autoGenerated: true }),
    ]));
  });

  it('does not write empty modules when the refactor map has no module entries', async () => {
    const source = 'function onOutput(text)\n  return text\nend\n';
    const artifacts = await createRisuLuaModuleTableArtifacts({ source, sourcePath: 'empty_modules.risulua' });
    const paths = artifacts.workspaceFiles.map((file) => file.path);
    expect(paths).toEqual(expect.arrayContaining([
      'lua/main.risulua',
      'legacy/original.risulua',
      'docs/refactor-map.json',
      'docs/domain-candidates.json',
    ]));
    expect(paths).not.toContain('lua/common/local_helpers.risulua');
    expect(paths.some((filePath) => filePath.startsWith('lua/handler_helpers/'))).toBe(false);
    expect(paths.some((filePath) => filePath.startsWith('lua/host_globals/'))).toBe(false);
    expect(artifacts.plan.buildStrategy).toBe('concat-build-time-require');
    expect(artifacts.plan.distPath).toBe('dist/empty_modules.risulua');
  });

  it('validates before final write and leaves no partial module-table output on failure', async () => {
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'risulua-module-table-atomic-'));
    try {
      const artifacts = await createRisuLuaModuleTableArtifacts({
        source: moduleTableFixture(),
        sourcePath: 'atomic_failure.risulua',
      });

      expect(() => writeRisuLuaModuleTableWorkspace(artifacts, {
        outputRoot,
        validateBeforeWrite: () => ['forced validation failure'],
      })).toThrow(/forced validation failure/);

      expect(fs.existsSync(path.join(outputRoot, 'lua', 'handler_helpers'))).toBe(false);
      expect(fs.existsSync(path.join(outputRoot, 'lua', 'host_globals'))).toBe(false);
      expect(fs.existsSync(path.join(outputRoot, 'docs'))).toBe(false);
    } finally {
      fs.rmSync(outputRoot, { recursive: true, force: true });
    }
  });

  it('preserves unsafe public globals in main.risulua with reasons, does not bridge them', async () => {
    const source = lines([
      'function dynamicGlobal(name)',
      '  return _G[name]',
      'end',
      '',
      'function duplicatedGlobal() return 1 end',
      'function duplicatedGlobal() return 2 end',
      '',
      'function onOutput(text)',
      '  return text',
      'end',
    ]);
    const artifacts = await createRisuLuaModuleTableArtifacts({ source, sourcePath: 'unsafe_globals.risulua' });
    const main = fileContent(artifacts, 'lua/main.risulua');

    expect(main).toContain('function dynamicGlobal(name)');
    expect(main).toContain('function duplicatedGlobal()');
    expect(main).not.toContain('__host_globals.dynamicGlobal');
    expect(main).not.toContain('__host_globals.duplicatedGlobal');
    expect(artifacts.workspaceFiles.some((file) => file.path === 'lua/host_globals/global_functions.risulua')).toBe(false);
    expect(artifacts.dryRunResult.refactorMap.preserved).toEqual(expect.arrayContaining([
      expect.objectContaining({ originalName: 'dynamicGlobal', reason: 'preserve:dynamic-global-reference-risk' }),
      expect.objectContaining({ originalName: 'duplicatedGlobal', reason: 'preserve:host-visible-global-unsafe-bridge' }),
    ]));
  });

  it('handles comment-only source producing minimal artifacts without helper modules', async () => {
    const source = lines([
      '-- This is a comment-only file',
      '--[[ block comment with fake code: function onOutput() end ]]',
      '-- local function notReal() return 1 end',
    ]);
    const artifacts = await createRisuLuaModuleTableArtifacts({ source, sourcePath: 'comment_only.risulua' });
    const paths = artifacts.workspaceFiles.map((file) => file.path);

    expect(paths).toEqual(expect.arrayContaining([
      'lua/main.risulua',
      'legacy/original.risulua',
      'docs/refactor-map.json',
      'docs/domain-candidates.json',
    ]));
    expect(paths.some((filePath) => filePath.startsWith('lua/common/'))).toBe(false);
    expect(paths.some((filePath) => filePath.startsWith('lua/handler_helpers/'))).toBe(false);
    expect(paths.some((filePath) => filePath.startsWith('lua/host_globals/'))).toBe(false);
    expect(artifacts.dryRunResult.refactorMap.symbols).toEqual([]);
    expect(artifacts.dryRunResult.refactorMap.preserved).toEqual([]);
  });

  it('verifies every moved public global has direct-assignment bridge in main.risulua', async () => {
    const source = lines([
      'local function helper1(v) return v end',
      '',
      'function safeGlobal1(x)',
      '  return helper1(x)',
      'end',
      '',
      'function safeGlobal2(y)',
      '  return helper1(y) .. "!"',
      'end',
      '',
      'safeAsync = async(function(msg)',
      '  alertNormal(msg)',
      'end)',
      '',
      'function onOutput(text)',
      '  return safeGlobal1(text)',
      'end',
    ]);
    const artifacts = await createRisuLuaModuleTableArtifacts({ source, sourcePath: 'multi_bridge.risulua' });
    const main = fileContent(artifacts, 'lua/main.risulua');
    const bridgeSymbols = artifacts.dryRunResult.refactorMap.symbols.filter(
      (symbol) => symbol.globalBridge && symbol.bridge?.required,
    );

    expect(bridgeSymbols.length).toBeGreaterThanOrEqual(3);
    for (const symbol of bridgeSymbols) {
      expect(symbol.bridge?.kind).toBe('direct_assignment');
      expect(symbol.bridge?.mainAssignment?.shape).toBe('direct_assignment');
      const bridgeText = symbol.bridge!.mainAssignment!.text;
      expect(main).toContain(bridgeText);
      expect(bridgeText).toMatch(/^\w+ = __\w+\.\w+$/);
    }
    expect(main).toContain('safeGlobal1 = __host_globals.safeGlobal1');
    expect(main).toContain('safeGlobal2 = __host_globals.safeGlobal2');
    expect(main).toContain('safeAsync = __async_actions.safeAsync');
    expect(main).not.toContain('function safeGlobal1(');
    expect(main).not.toContain('function safeGlobal2(');
  });
});

function moduleTableFixture(): string {
  return lines([
    'local function helperTrim(value)',
    '  return value:gsub("^%s+", "")',
    'end',
    '',
    'function setLanguage1(lang)',
    '  return helperTrim(lang)',
    'end',
    '',
    'setHeroineClothes = async(function(clothes)',
    '  alertNormal(clothes)',
    'end)',
    '',
    'function onOutput(text)',
    '  local function decorate(value)',
    '    return helperTrim(value) .. "!"',
    '  end',
    '  return decorate(text)',
    'end',
    '',
    'local function scoreDeck(cards)',
    '  return #cards * 10',
    'end',
  ]);
}

function fileContent(artifacts: { workspaceFiles: Array<{ path: string; content: string }> }, relativePath: string): string {
  const file = artifacts.workspaceFiles.find((item) => item.path === relativePath);
  expect(file).toBeDefined();
  return file!.content;
}

function count(text: string, value: string): number {
  return text.split(value).length - 1;
}
