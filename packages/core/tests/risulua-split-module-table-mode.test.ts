import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  RISULUA_MODULE_TABLE_BUTTON_ACTION_INDEX_PATH,
  RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH,
  RISULUA_MODULE_TABLE_DUPLICATE_GLOBALS_PATH,
  createRisuLuaModuleTableArtifacts,
  RISULUA_MODULE_TABLE_EXPORT_MANIFEST_PATH,
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
    expect(main).not.toContain('local __host_globals = require("host_globals.global_functions")');
    expect(main).not.toContain('local __async_actions = require("host_globals.async_actions")');
    expect(main).not.toContain('setLanguage1 = __host_globals.setLanguage1');
    expect(main).not.toContain('setHeroineClothes = __async_actions.setHeroineClothes');
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
    expect(runtimeOutput).toContain('local __prompt_store = require("prompts.instruction_store")');
    expect(runtimeOutput).toContain('__prompt_store.CHOICE_GENERATION_INSTRUCTION');
    expect(runtimeOutput).toContain('__prompt_store.KOREAN_CHOICE_INSTRUCTION_CONTENT');
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
    expect(main).not.toContain('local __domain_score_deck = require("domain.score_deck")');
    expect(main).toContain('return __runtime_output.onOutput(text)');
    expect(main).not.toContain('local function scoreDeck');

    const runtimeOutput = fileContent(artifacts, 'lua/runtime/output.risulua');
    expect(runtimeOutput).toContain('local __domain_score_deck = require("domain.score_deck")');
    expect(runtimeOutput).toContain('function onOutput(text)');
    expect(runtimeOutput).toContain('return tostring(__domain_score_deck.scoreDeck({ text }))');

    const domainFile = fileContent(artifacts, 'lua/domain/score_deck.risulua');
    expect(domainFile).toContain('local M = {}');
    expect(domainFile).toContain('function scoreDeck(cards)');
    expect(domainFile).toContain('M.scoreDeck = scoreDeck');
    expect(domainFile.trim().endsWith('return M')).toBe(true);
  });

  it('rewrites prompt store captures inside validated domain modules', async () => {
    const source = lines([
      'local STORY_PROMPT_CONTENT = [[Tell a story: ]]',
      '',
      'local function buildPrompt(text)',
      '  return STORY_PROMPT_CONTENT .. text',
      'end',
      '',
      'function onOutput(text)',
      '  return buildPrompt(text)',
      'end',
    ]);

    const artifacts = await createRisuLuaModuleTableArtifacts({
      source,
      sourcePath: 'domain_prompt_store_fixture.risulua',
      domainGeneration: 'validated',
    });

    const domain = fileContent(artifacts, 'lua/domain/build_prompt.risulua');
    expect(domain).toContain('local __prompt_store = require("prompts.instruction_store")');
    expect(domain).toContain('return __prompt_store.STORY_PROMPT_CONTENT .. text');
    expect(domain).not.toContain('return STORY_PROMPT_CONTENT .. text');
  });

  it('does not rewrite prompt store captures shadowed by extracted domain locals', async () => {
    const source = lines([
      'local STORY_PROMPT_CONTENT = [[Outer: ]]',
      '',
      'local function buildPrompt(text)',
      '  local prefix = STORY_PROMPT_CONTENT',
      '  local STORY_PROMPT_CONTENT = "Inner: "',
      '  return prefix .. STORY_PROMPT_CONTENT .. text',
      'end',
      '',
      'function onOutput(text)',
      '  return buildPrompt(text)',
      'end',
    ]);

    const artifacts = await createRisuLuaModuleTableArtifacts({
      source,
      sourcePath: 'domain_prompt_shadow_fixture.risulua',
      domainGeneration: 'validated',
    });

    const domain = fileContent(artifacts, 'lua/domain/build_prompt.risulua');
    expect(domain).toContain('local __prompt_store = require("prompts.instruction_store")');
    expect(domain).toContain('local prefix = __prompt_store.STORY_PROMPT_CONTENT');
    expect(domain).toContain('local STORY_PROMPT_CONTENT = "Inner: "');
    expect(domain).toContain('return prefix .. STORY_PROMPT_CONTENT .. text');
    expect(domain).not.toContain('return prefix .. __prompt_store.STORY_PROMPT_CONTENT .. text');
  });

  it('prunes helper requires from final main when only extracted modules use them', async () => {
    const source = lines([
      'local function helperTrim(value)',
      '  return value:gsub("^%s+", "")',
      'end',
      '',
      'function onOutput(text)',
      '  return helperTrim(text)',
      'end',
    ]);

    const artifacts = await createRisuLuaModuleTableArtifacts({
      source,
      sourcePath: 'unused_main_helper_require_fixture.risulua',
    });

    const main = fileContent(artifacts, 'lua/main.risulua');
    expect(main).toContain('local __runtime_output = require("runtime.output")');
    expect(main).not.toContain('local __local_helpers = require("common.local_helpers")');
    expect(main).not.toContain('local __output_helpers = require("handler_helpers.output_helpers")');
    expect(main).toContain('return __runtime_output.onOutput(text)');

    const runtimeOutput = fileContent(artifacts, 'lua/runtime/output.risulua');
    expect(runtimeOutput).toContain('local __local_helpers = require("common.local_helpers")');
    expect(runtimeOutput).toContain('return __local_helpers.helperTrim(text)');
  });

  it('promotes safe helper and domain captures to module requires without growing runtime handler args', async () => {
    const source = lines([
      'local function trim(value)',
      '  return value:gsub("^%s+", ""):gsub("%s+$", "")',
      'end',
      '',
      'local function splitPipe(value)',
      '  local out = {}',
      '  if not value or value == "" then return out end',
      '  for token in string.gmatch(value, "([^|]+)") do',
      '    table.insert(out, trim(token))',
      '  end',
      '  return out',
      'end',
      '',
      'local function findCharacterCode(triggerId, name)',
      '  return trim(name) .. tostring(triggerId)',
      'end',
      '',
      'local function buildChikanTargetSave(triggerId)',
      '  local code = findCharacterCode(triggerId, " C001 ")',
      '  local parts = splitPipe(code .. "|saved")',
      '  return parts[1]',
      'end',
      '',
      'function onOutput(triggerId)',
      '  return buildChikanTargetSave(triggerId)',
      'end',
    ]);

    const artifacts = await createRisuLuaModuleTableArtifacts({
      source,
      sourcePath: 'domain_dependency_closure_fixture.risulua',
      domainGeneration: 'validated',
    });
    const paths = artifacts.workspaceFiles.map((file) => file.path);

    expect(paths).toEqual(expect.arrayContaining([
      'lua/common/local_helpers.risulua',
      'lua/domain/find_character_code.risulua',
      'lua/domain/build_chikan_target_save.risulua',
      'lua/runtime/output.risulua',
    ]));

    const main = fileContent(artifacts, 'lua/main.risulua');
    expect(main).toContain('return __runtime_output.onOutput(triggerId)');
    expect(main).not.toContain('return __runtime_output.onOutput(triggerId,');
    expect(main).not.toContain('local function splitPipe');
    expect(main).not.toContain('local function buildChikanTargetSave');

    const common = fileContent(artifacts, 'lua/common/local_helpers.risulua');
    expect(common).toContain('function trim(value)');
    expect(common).toContain('function splitPipe(value)');
    expect(common).toContain('table.insert(out, trim(token))');
    expect(common).toContain('M.splitPipe = splitPipe');

    const findCharacterCode = fileContent(artifacts, 'lua/domain/find_character_code.risulua');
    expect(findCharacterCode).toContain('local __local_helpers = require("common.local_helpers")');
    expect(findCharacterCode).toContain('return __local_helpers.trim(name) .. tostring(triggerId)');

    const buildChikanTargetSave = fileContent(artifacts, 'lua/domain/build_chikan_target_save.risulua');
    expect(buildChikanTargetSave).toContain('local __domain_find_character_code = require("domain.find_character_code")');
    expect(buildChikanTargetSave).toContain('local __local_helpers = require("common.local_helpers")');
    expect(buildChikanTargetSave).toContain('local code = __domain_find_character_code.findCharacterCode(triggerId, " C001 ")');
    expect(buildChikanTargetSave).toContain('local parts = __local_helpers.splitPipe(code .. "|saved")');

    const runtimeOutput = fileContent(artifacts, 'lua/runtime/output.risulua');
    expect(runtimeOutput).toContain('local __domain_build_chikan_target_save = require("domain.build_chikan_target_save")');
    expect(runtimeOutput).toContain('function onOutput(triggerId)');
    expect(runtimeOutput).not.toContain('function onOutput(triggerId,');
    expect(runtimeOutput).toContain('return __domain_build_chikan_target_save.buildChikanTargetSave(triggerId)');
  });

  it('keeps setPhase as domain logic and does not grow onButtonClick args', async () => {
    const source = lines([
      'local function trim(value)',
      '  return value:gsub("^%s+", ""):gsub("%s+$", "")',
      'end',
      '',
      'function setPhase(triggerId, value)',
      '  local phase = tonumber(trim(value)) or 0',
      '  setChatVar(triggerId, "phase", phase)',
      '  return phase',
      'end',
      '',
      'onButtonClick = async(function(triggerId, c)',
      '  return setPhase(triggerId, c)',
      'end)',
    ]);

    const artifacts = await createRisuLuaModuleTableArtifacts({
      source,
      sourcePath: 'set_phase_button_fixture.risulua',
      domainGeneration: 'validated',
    });

    const paths = artifacts.workspaceFiles.map((file) => file.path);
    expect(paths).toContain('lua/domain/set_phase.risulua');

    const main = fileContent(artifacts, 'lua/main.risulua');
    expect(main).not.toContain('setPhase = __domain_set_phase.setPhase');
    expect(main).toContain('return __runtime_button.onButtonClick(triggerId, c)');
    expect(main).not.toContain('return __runtime_button.onButtonClick(triggerId, c,');

    const buttonRuntime = fileContent(artifacts, 'lua/runtime/button_click.risulua');
    expect(buttonRuntime).toContain('local __domain_set_phase = require("domain.set_phase")');
    expect(buttonRuntime).toContain('onButtonClick = async(function(triggerId, c)');
    expect(buttonRuntime).not.toContain('onButtonClick = async(function(triggerId, c,');
    expect(buttonRuntime).toContain('return __domain_set_phase.setPhase(triggerId, c)');

    const setPhase = fileContent(artifacts, 'lua/domain/set_phase.risulua');
    expect(setPhase).toContain('local __local_helpers = require("common.local_helpers")');
    expect(setPhase).toContain('local phase = tonumber(__local_helpers.trim(value)) or 0');
    expect(setPhase).toContain('setChatVar(triggerId, "phase", phase)');
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
      buttonActionSources: [{ sourceFile: 'regex/toggle.risuregex', source: '@@@ OUT\n{{button::Toggle::toggleSidePanel}}\n' }],
    });

    const paths = artifacts.workspaceFiles.map((file) => file.path);
    expect(paths).toContain(RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH);
    expect(paths).toContain(RISULUA_MODULE_TABLE_BUTTON_ACTION_INDEX_PATH);
    expect(artifacts.dryRunResult.refactorMap.modules).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH,
        category: 'button-action',
        exports: ['toggleSidePanel'],
      }),
    ]));

    const main = fileContent(artifacts, 'lua/main.risulua');
    expect(main).toContain('local __button_actions = require("button_actions.actions")');
    expect(main).toContain('-- Button action bridge: toggleSidePanel');
    expect(main).toContain('---@source regex/toggle.risuregex:2:0');
    expect(main).toContain('toggleSidePanel = __button_actions.toggleSidePanel');

    const buttonActions = fileContent(artifacts, RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH);
    expect(buttonActions).toContain('function toggleSidePanel()');
    expect(buttonActions).toContain('M.toggleSidePanel = toggleSidePanel');

    const buttonActionIndex = JSON.parse(fileContent(artifacts, RISULUA_MODULE_TABLE_BUTTON_ACTION_INDEX_PATH));
    expect(buttonActionIndex).toMatchObject({
      version: 1,
      mode: 'module-table-button-action-index',
      sourceFile: 'regex_button_fixture.risulua',
      actions: [
        {
          name: 'toggleSidePanel',
          targetModule: RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH,
          declaration: {
            sourceFile: 'regex_button_fixture.risulua',
            classification: 'extract:button-action',
          },
          usages: [
            {
              source: 'cbs-button',
              rawText: '{{button::Toggle::toggleSidePanel}}',
              sourceFile: 'regex/toggle.risuregex',
            },
          ],
        },
      ],
    });
    expect(buttonActionIndex.actions[0].declaration.sourceRange.startLine).toBe(1);
    expect(buttonActionIndex.actions[0].usages[0].sourceRange.startLine).toBe(2);

    const exportManifest = JSON.parse(fileContent(artifacts, RISULUA_MODULE_TABLE_EXPORT_MANIFEST_PATH));
    expect(exportManifest.buttonActions).toBeUndefined();
    expect(exportManifest.actions).toBeUndefined();
  });

  it('groups multiple button trigger usages by action name in the button action index', async () => {
    const source = lines([
      'function generateStartInput(triggerId)',
      '  addChat(triggerId, "user", "Start")',
      'end',
    ]);

    const artifacts = await createRisuLuaModuleTableArtifacts({
      source,
      sourcePath: 'button_index_multi_usage_fixture.risulua',
      buttonActionSources: [
        '@@@ OUT\n<button risu-trigger="generateStartInput">Start</button>\n{{button::Again::generateStartInput}}\n',
      ],
    });

    const buttonActionIndex = JSON.parse(fileContent(artifacts, RISULUA_MODULE_TABLE_BUTTON_ACTION_INDEX_PATH));
    expect(buttonActionIndex.actions).toHaveLength(1);
    expect(buttonActionIndex.actions[0].name).toBe('generateStartInput');
    expect(buttonActionIndex.actions[0].usages).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'risu-trigger-attribute', rawText: 'risu-trigger="generateStartInput"' }),
      expect.objectContaining({ source: 'cbs-button', rawText: '{{button::Again::generateStartInput}}' }),
    ]));
    expect(buttonActionIndex.actions[0].usages).toHaveLength(2);
  });

  it('extracts risuregex async button actions that call generated domain functions', async () => {
    const source = lines([
      'function applySkillSet(triggerId, skillKey, newValue, minValue, maxValue, minChikanLevel)',
      '  local level = tonumber(getChatVar(triggerId, "ct_ChikanLevel") or "1") or 1',
      '  if level < minChikanLevel then return end',
      '  local parsed = tonumber(newValue)',
      '  if not parsed then return end',
      '  if parsed < minValue then parsed = minValue end',
      '  if parsed > maxValue then parsed = maxValue end',
      '  setChatVar(triggerId, skillKey, tostring(parsed))',
      'end',
      '',
      'skill_3_Set = async(function(triggerId)',
      '  local min, max, needLv = 0, 5, 5',
      '  local input = alertInput(triggerId, "스킬 레벨 설정\\n"..min.." ~ "..max):await()',
      '  if not input then return end',
      '  applySkillSet(triggerId, "ct_Skill_3", input, min, max, needLv)',
      'end)',
    ]);

    const artifacts = await createRisuLuaModuleTableArtifacts({
      source,
      sourcePath: 'regex_domain_button_fixture.risulua',
      domainGeneration: 'validated',
      buttonActionSources: [{ sourceFile: 'regex/skill_set.risuregex', source: '@@@ OUT\n<button risu-trigger="skill_3_Set">=</button>\n' }],
    });

    const main = fileContent(artifacts, 'lua/main.risulua');
    expect(main).toContain('local __button_actions = require("button_actions.actions")');
    expect(main).not.toContain('local __domain_apply_skill_set = require("domain.apply_skill_set")');
    expect(main).not.toContain('applySkillSet = __domain_apply_skill_set.applySkillSet');
    expect(main).toContain('-- Button action bridge: skill_3_Set');
    expect(main).toContain('---@source regex/skill_set.risuregex:2:0');
    expect(main).toContain('skill_3_Set = __button_actions.skill_3_Set');
    expect(main).not.toContain('skill_3_Set = async(function(triggerId)');

    const buttonActions = fileContent(artifacts, RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH);
    expect(buttonActions).not.toContain('-- Button action bridge: skill_3_Set');
    expect(buttonActions).not.toContain('---@source regex/skill_set.risuregex:2:0');
    expect(buttonActions).toContain('local __domain_apply_skill_set = require("domain.apply_skill_set")');
    expect(buttonActions).toContain('local skill_3_Set = async(function(triggerId)');
    expect(buttonActions).toContain('__domain_apply_skill_set.applySkillSet(triggerId, "ct_Skill_3", input, min, max, needLv)');
    expect(buttonActions).toContain('M.skill_3_Set = skill_3_Set');

    expect(artifacts.dryRunResult.refactorMap.preserved).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ originalName: 'skill_3_Set' }),
    ]));
  });

  it('keeps main as a host ABI shell while moving button bodies and dependencies to modules', async () => {
    const source = lines([
      'function resetTargetState(triggerId)',
      '  setChatVar(triggerId, "ct_Target_Name", "")',
      'end',
      '',
      'local function adjustSkill(triggerId, skillKey, delta, maxLevel, minChikanLevel)',
      '  local level = tonumber(getChatVar(triggerId, skillKey) or "0") or 0',
      '  local nextLevel = level + delta',
      '  if nextLevel < 0 then nextLevel = 0 end',
      '  if nextLevel > maxLevel then nextLevel = maxLevel end',
      '  setChatVar(triggerId, skillKey, tostring(nextLevel))',
      'end',
      '',
      'function generateStartInput(triggerId)',
      '  resetTargetState(triggerId)',
      '  addChat(triggerId, "user", "Start")',
      'end',
      '',
      'function skill_1_Up(triggerId)',
      '  adjustSkill(triggerId, "ct_Skill_1", 1, 5, 1)',
      'end',
      '',
      'function onOutput(triggerId)',
      '  return tostring(getChatVar(triggerId, "ct_Target_Name") or "")',
      'end',
    ]);

    const artifacts = await createRisuLuaModuleTableArtifacts({
      source,
      sourcePath: 'host_abi_shell_fixture.risulua',
      domainGeneration: 'validated',
      buttonActionSources: ['@@@ OUT\n<button risu-trigger="generateStartInput">Start</button>\n<button risu-trigger="skill_1_Up">+</button>\n'],
    });

    const main = fileContent(artifacts, 'lua/main.risulua');
    expect(main).toContain('local __runtime_output = require("runtime.output")');
    expect(main).not.toContain('local __host_globals = require("host_globals.global_functions")');
    expect(main).toContain('local __button_actions = require("button_actions.actions")');
    expect(main).toContain('function onOutput(triggerId)');
    expect(main).toContain('return __runtime_output.onOutput(triggerId)');
    expect(main).not.toContain('resetTargetState = __host_globals.resetTargetState');
    expect(main).toContain('generateStartInput = __button_actions.generateStartInput');
    expect(main).toContain('skill_1_Up = __button_actions.skill_1_Up');
    expect(main).not.toContain('function generateStartInput(triggerId)');
    expect(main).not.toContain('function skill_1_Up(triggerId)');

    const buttonActions = fileContent(artifacts, RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH);
    expect(buttonActions).toContain('local __host_globals = require("host_globals.global_functions")');
    expect(buttonActions).toContain('local __domain_adjust_skill = require("domain.adjust_skill")');
    expect(buttonActions).toContain('local function generateStartInput(triggerId)');
    expect(buttonActions).toContain('__host_globals.resetTargetState(triggerId)');
    expect(buttonActions).toContain('addChat(triggerId, "user", "Start")');
    expect(buttonActions).toContain('local function skill_1_Up(triggerId)');
    expect(buttonActions).toContain('__domain_adjust_skill.adjustSkill(triggerId, "ct_Skill_1", 1, 5, 1)');
    expect(buttonActions).toContain('M.generateStartInput = generateStartInput');
    expect(buttonActions).toContain('M.skill_1_Up = skill_1_Up');

    const hostGlobals = fileContent(artifacts, 'lua/host_globals/global_functions.risulua');
    expect(hostGlobals).toContain('local function resetTargetState(triggerId)');
    expect(hostGlobals).toContain('setChatVar(triggerId, "ct_Target_Name", "")');
    expect(hostGlobals).toContain('M.resetTargetState = resetTargetState');

    const adjustSkill = fileContent(artifacts, 'lua/domain/adjust_skill.risulua');
    expect(adjustSkill).toContain('function adjustSkill(triggerId, skillKey, delta, maxLevel, minChikanLevel)');
    expect(adjustSkill).toContain('setChatVar(triggerId, skillKey, tostring(nextLevel))');
    expect(adjustSkill).toContain('M.adjustSkill = adjustSkill');
  });

  it('does not move button actions that capture ordinary local scalar state', async () => {
    const source = lines([
      'local counter = 0',
      '',
      'function incrementCounter(triggerId)',
      '  counter = counter + 1',
      '  setChatVar(triggerId, "counter", tostring(counter))',
      'end',
    ]);

    const artifacts = await createRisuLuaModuleTableArtifacts({
      source,
      sourcePath: 'unsafe_button_capture_fixture.risulua',
      buttonActionSources: ['@@@ OUT\n<button risu-trigger="incrementCounter">+</button>\n'],
    });

    const main = fileContent(artifacts, 'lua/main.risulua');
    expect(main).toContain('function incrementCounter(triggerId)');
    expect(artifacts.dryRunResult.refactorMap.preserved).toEqual(expect.arrayContaining([
      expect.objectContaining({
        originalName: 'incrementCounter',
        reason: 'preserve:captures-mutable-state',
      }),
    ]));
    expect(artifacts.workspaceFiles.some((file) => file.path === RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH)).toBe(false);
  });

  it('moves shared restore helpers with host-global captures behind the ABI shell', async () => {
    const source = lines([
      'function resetTargetState(triggerId)',
      '  setChatVar(triggerId, "ct_Target_Name", "")',
      'end',
      '',
      'local function restoreChikanFullSave(triggerId)',
      '  -- reset before loading saved data',
      '  resetTargetState(triggerId)',
      '  setChatVar(triggerId, "ct_Loaded", "1")',
      '  return true',
      'end',
      '',
      'function loadData(triggerId)',
      '  restoreChikanFullSave(triggerId)',
      '  alertNormal(triggerId, "loaded")',
      'end',
      '',
      'onButtonClick = async(function(triggerId, choice)',
      '  if choice == "move" then',
      '    restoreChikanFullSave(triggerId)',
      '  end',
      'end)',
    ]);

    const artifacts = await createRisuLuaModuleTableArtifacts({
      source,
      sourcePath: 'shared_restore_host_capture_fixture.risulua',
      domainGeneration: 'validated',
      buttonActionSources: ['@@@ OUT\n<button risu-trigger="loadData">Load</button>\n'],
    });

    const main = fileContent(artifacts, 'lua/main.risulua');
    expect(main).not.toContain('resetTargetState = __host_globals.resetTargetState');
    expect(main).toContain('loadData = __button_actions.loadData');
    expect(main).toContain('function onButtonClick(triggerId, choice)');
    expect(main).toContain('return __runtime_button.onButtonClick(triggerId, choice)');
    expect(main).not.toContain('local function restoreChikanFullSave(triggerId)');
    expect(main).not.toContain('return __runtime_button.onButtonClick(triggerId, choice, restoreChikanFullSave)');

    const restore = fileContent(artifacts, 'lua/domain/restore_chikan_full_save.risulua');
    expect(restore).toContain('local __host_globals = require("host_globals.global_functions")');
    expect(restore).toContain('function restoreChikanFullSave(triggerId)');
    expect(restore).toContain('__host_globals.resetTargetState(triggerId)');
    expect(restore).toContain('M.restoreChikanFullSave = restoreChikanFullSave');

    const buttonActions = fileContent(artifacts, RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH);
    expect(buttonActions).toContain('local __domain_restore_chikan_full_save = require("domain.restore_chikan_full_save")');
    expect(buttonActions).toContain('__domain_restore_chikan_full_save.restoreChikanFullSave(triggerId)');

    const runtimeButton = fileContent(artifacts, 'lua/runtime/button_click.risulua');
    expect(runtimeButton).toContain('local __domain_restore_chikan_full_save = require("domain.restore_chikan_full_save")');
    expect(runtimeButton).toContain('__domain_restore_chikan_full_save.restoreChikanFullSave(triggerId)');
    expect(runtimeButton).not.toContain('onButtonClick = async(function(triggerId, choice, restoreChikanFullSave)');
  });

  it('rewrites runtime handler host-global helper calls without main bridges', async () => {
    const source = lines([
      'function safeGet(triggerId, key, default)',
      '  return getChatVar(triggerId, key) or default',
      'end',
      '',
      'function onOutput(triggerId)',
      '  return safeGet(triggerId, "ct_Target_Name", "")',
      'end',
    ]);

    const artifacts = await createRisuLuaModuleTableArtifacts({
      source,
      sourcePath: 'runtime_host_global_helper_fixture.risulua',
    });

    const main = fileContent(artifacts, 'lua/main.risulua');
    expect(main).toContain('local __runtime_output = require("runtime.output")');
    expect(main).toContain('return __runtime_output.onOutput(triggerId)');
    expect(main).not.toContain('local __host_globals = require("host_globals.global_functions")');
    expect(main).not.toContain('safeGet = __host_globals.safeGet');

    const runtimeOutput = fileContent(artifacts, 'lua/runtime/output.risulua');
    expect(runtimeOutput).toContain('local __host_globals = require("host_globals.global_functions")');
    expect(runtimeOutput).toContain('return __host_globals.safeGet(triggerId, "ct_Target_Name", "")');

    const hostGlobals = fileContent(artifacts, 'lua/host_globals/global_functions.risulua');
    expect(hostGlobals).toContain('local function safeGet(triggerId, key, default)');
    expect(hostGlobals).toContain('M.safeGet = safeGet');
  });

  it('generates public domain functions without main bridges while rewriting callers', async () => {
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
    expect(main).not.toContain('local __domain_create_random_character = require("domain.create_random_character")');
    expect(main).not.toContain('createRandomCharacter = __domain_create_random_character.createRandomCharacter');
    expect(domainFile).toContain('local __local_helpers = require("common.local_helpers")');
    expect(domainFile).toContain('local name = __local_helpers.safeGet("name")');
    expect(domainFile).toContain('M.createRandomCharacter = createRandomCharacter');
    const runtimeOutput = fileContent(artifacts, 'lua/runtime/output.risulua');
    expect(runtimeOutput).toContain('local __domain_create_random_character = require("domain.create_random_character")');
    expect(runtimeOutput).toContain('return __domain_create_random_character.createRandomCharacter(text)');
    expect(artifacts.dryRunResult.refactorMap.domainCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'createRandomCharacter', generationStatus: 'generated', autoGenerated: true }),
    ]));
  });

  it('generates public domain functions with host UI effects and variable-store captures', async () => {
    const source = lines([
      'local AUTO_EXP_VALUES = {',
      '  easy = 50,',
      '}',
      '',
      'function spendSkillPoint(triggerId, skillName)',
      '  local exp = AUTO_EXP_VALUES.easy',
      '  alertNormal(triggerId, skillName .. exp)',
      '  return exp',
      'end',
      '',
      'function onOutput(triggerId)',
      '  return spendSkillPoint(triggerId, "Melee")',
      'end',
    ]);

    const artifacts = await createRisuLuaModuleTableArtifacts({
      source,
      sourcePath: 'public_domain_ui_fixture.risulua',
      domainGeneration: 'validated',
    });

    const main = fileContent(artifacts, 'lua/main.risulua');
    expect(main).not.toContain('spendSkillPoint = __domain_spend_skill_point.spendSkillPoint');
    expect(main).not.toContain('function spendSkillPoint');
    expect(main).toContain('local AUTO_EXP_VALUES = __variable_store.AUTO_EXP_VALUES');

    const domainFile = fileContent(artifacts, 'lua/domain/spend_skill_point.risulua');
    expect(domainFile).toContain('local __variable_store = require("state.variable_store")');
    expect(domainFile).toContain('local exp = __variable_store.AUTO_EXP_VALUES.easy');
    expect(domainFile).toContain('alertNormal(triggerId, skillName .. exp)');

    const runtimeOutput = fileContent(artifacts, 'lua/runtime/output.risulua');
    expect(runtimeOutput).toContain('local __domain_spend_skill_point = require("domain.spend_skill_point")');
    expect(runtimeOutput).toContain('return __domain_spend_skill_point.spendSkillPoint(triggerId, "Melee")');

    const variableStore = fileContent(artifacts, RISULUA_MODULE_TABLE_VARIABLE_STORE_PATH);
    expect(variableStore).toContain('local AUTO_EXP_VALUES = {');
    expect(variableStore).toContain('M.AUTO_EXP_VALUES = AUTO_EXP_VALUES');
  });

  it('moves variable-store backed start enhancement buttons behind the ABI shell', async () => {
    const source = lines([
      'local constEnhancementType = { attack = 1, defense = 2 }',
      'local html = [[<button type="button" risu-trigger="setStartEnhancementAttack">Attack</button>]]',
      '',
      'local function setStartEnhancementBase(triggerId, enhancementType)',
      '  setChatVar(triggerId, "vg_StartEnhancementBase", enhancementType)',
      'end',
      '',
      'function setStartEnhancementAttack(triggerId) setStartEnhancementBase(triggerId, constEnhancementType.attack) end',
    ]);

    const artifacts = await createRisuLuaModuleTableArtifacts({
      source,
      sourcePath: 'vg_start_enhancement_fixture.risulua',
      domainGeneration: 'validated',
      buttonActionSources: ['@@@ OUT\n<button risu-trigger="setStartEnhancementAttack">Attack</button>\n'],
    });

    const main = fileContent(artifacts, 'lua/main.risulua');
    expect(main).toContain('setStartEnhancementAttack = __button_actions.setStartEnhancementAttack');
    expect(main).not.toContain('function setStartEnhancementAttack(triggerId)');

    const buttonActions = fileContent(artifacts, RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH);
    expect(buttonActions).toContain('local __variable_store = require("state.variable_store")');
    expect(buttonActions).toContain('__variable_store.constEnhancementType.attack');
    expect(buttonActions).toContain('M.setStartEnhancementAttack = setStartEnhancementAttack');
  });

  it('does not require variable_store for unresolved names that only match store naming patterns', async () => {
    const source = lines([
      'function onOutput(text)',
      '  return externalState.marker .. text',
      'end',
    ]);

    const artifacts = await createRisuLuaModuleTableArtifacts({
      source,
      sourcePath: 'unresolved_store_name_fixture.risulua',
    });

    const paths = artifacts.workspaceFiles.map((file) => file.path);
    const main = fileContent(artifacts, 'lua/main.risulua');
    const runtimeOutput = fileContent(artifacts, 'lua/runtime/output.risulua');

    expect(paths).not.toContain(RISULUA_MODULE_TABLE_VARIABLE_STORE_PATH);
    expect(main).toContain('return __runtime_output.onOutput(text)');
    expect(runtimeOutput).toContain('function onOutput(text)');
    expect(runtimeOutput).toContain('return externalState.marker .. text');
    expect(runtimeOutput).not.toContain('require("state.variable_store")');
    expect(runtimeOutput).not.toContain('__variable_store.externalState');
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
    expect(main).toContain('local __duplicate_globals = require("host_globals.duplicate_globals")');
    expect(main).toContain('duplicatedGlobal = __duplicate_globals.duplicatedGlobal__L5');
    expect(main).toContain('duplicatedGlobal = __duplicate_globals.duplicatedGlobal__L6');
    expect(main).not.toContain('function duplicatedGlobal()');
    expect(main).not.toContain('__host_globals.dynamicGlobal');
    expect(main).not.toContain('__host_globals.duplicatedGlobal');
    expect(artifacts.workspaceFiles.some((file) => file.path === 'lua/host_globals/global_functions.risulua')).toBe(false);
    expect(fileContent(artifacts, RISULUA_MODULE_TABLE_DUPLICATE_GLOBALS_PATH)).toContain('local function duplicatedGlobal__L5() return 1 end');
    expect(fileContent(artifacts, RISULUA_MODULE_TABLE_DUPLICATE_GLOBALS_PATH)).toContain('local function duplicatedGlobal__L6() return 2 end');
    expect(artifacts.dryRunResult.refactorMap.preserved).toEqual(expect.arrayContaining([
      expect.objectContaining({ originalName: 'dynamicGlobal', reason: 'preserve:dynamic-global-reference-risk' }),
    ]));
    expect(artifacts.dryRunResult.refactorMap.preserved).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ originalName: 'duplicatedGlobal' }),
    ]));
  });

  it('bridges duplicate public globals through versioned source-order assignments', async () => {
    const source = lines([
      'function ForceRefresh(triggerId)',
      '  setChat(triggerId, 0, "first")',
      'end',
      '',
      'function ForceRefresh(triggerId)',
      '  setChat(triggerId, 0, "second")',
      'end',
    ]);

    const artifacts = await createRisuLuaModuleTableArtifacts({
      source,
      sourcePath: 'duplicate_force_refresh_fixture.risulua',
    });

    const main = fileContent(artifacts, 'lua/main.risulua');
    expect(main).toContain('local __duplicate_globals = require("host_globals.duplicate_globals")');
    expect(main).toContain('ForceRefresh = __duplicate_globals.ForceRefresh__L1');
    expect(main).toContain('ForceRefresh = __duplicate_globals.ForceRefresh__L5');
    expect(main).not.toContain('function ForceRefresh(triggerId)');
    expect(main).not.toContain('setChat(triggerId, 0, "first")');
    expect(main).not.toContain('setChat(triggerId, 0, "second")');

    const duplicateModule = fileContent(artifacts, RISULUA_MODULE_TABLE_DUPLICATE_GLOBALS_PATH);
    expect(duplicateModule).toContain('local function ForceRefresh__L1(triggerId)');
    expect(duplicateModule).toContain('setChat(triggerId, 0, "first")');
    expect(duplicateModule).toContain('local function ForceRefresh__L5(triggerId)');
    expect(duplicateModule).toContain('setChat(triggerId, 0, "second")');
    expect(artifacts.dryRunResult.refactorMap.symbols).toEqual(expect.arrayContaining([
      expect.objectContaining({ originalName: 'ForceRefresh', targetModule: RISULUA_MODULE_TABLE_DUPLICATE_GLOBALS_PATH, exportName: 'ForceRefresh__L1' }),
      expect.objectContaining({ originalName: 'ForceRefresh', targetModule: RISULUA_MODULE_TABLE_DUPLICATE_GLOBALS_PATH, exportName: 'ForceRefresh__L5' }),
    ]));
    expect(artifacts.dryRunResult.refactorMap.preserved).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ originalName: 'ForceRefresh' }),
    ]));
  });

  it('writes a module-table export manifest document', async () => {
    const artifacts = await createRisuLuaModuleTableArtifacts({
      source: lines([
        'function duplicatedGlobal() return 1 end',
        'function duplicatedGlobal() return 2 end',
        'function onOutput(triggerId)',
        '  return triggerId',
        'end',
      ]),
      sourcePath: 'legacy/original.risulua',
      targetName: 'manifest-test',
    });

    const manifestFile = artifacts.workspaceFiles.find((file) => file.path === RISULUA_MODULE_TABLE_EXPORT_MANIFEST_PATH);
    expect(manifestFile).toBeDefined();
    const manifest = JSON.parse(manifestFile!.content) as {
      mode: string;
      duplicateGroups: Array<{ name: string; finalWinner: { line: number } }>;
    };
    expect(manifest.mode).toBe('module-table-export-manifest');
    expect(manifest.duplicateGroups).toEqual([
      expect.objectContaining({
        name: 'duplicatedGlobal',
        finalWinner: expect.objectContaining({ line: 2 }),
      }),
    ]);
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

  it('moves public globals into modules without main bridges unless they are button actions', async () => {
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
    expect(artifacts.dryRunResult.refactorMap.symbols).toEqual(expect.arrayContaining([
      expect.objectContaining({ originalName: 'safeGlobal1', classification: 'extract:host-global-function', globalBridge: false }),
      expect.objectContaining({ originalName: 'safeGlobal2', classification: 'extract:host-global-function', globalBridge: false }),
      expect.objectContaining({ originalName: 'safeAsync', classification: 'extract:host-global-function', globalBridge: false }),
    ]));
    expect(main).not.toContain('safeGlobal1 = __host_globals.safeGlobal1');
    expect(main).not.toContain('safeGlobal2 = __host_globals.safeGlobal2');
    expect(main).not.toContain('safeAsync = __async_actions.safeAsync');
    expect(main).not.toContain('local __host_globals = require("host_globals.global_functions")');
    expect(main).not.toContain('local __async_actions = require("host_globals.async_actions")');
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
