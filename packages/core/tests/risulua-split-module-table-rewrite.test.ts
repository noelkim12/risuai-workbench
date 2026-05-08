import { describe, expect, it } from 'vitest';

import {
  RISULUA_MODULE_TABLE_ASYNC_ACTIONS_PATH,
  RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH,
  RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH,
  RISULUA_MODULE_TABLE_GLOBAL_FUNCTIONS_PATH,
  RISULUA_MODULE_TABLE_RUNTIME_BUTTON_CLICK_PATH,
  RISULUA_MODULE_TABLE_RUNTIME_OUTPUT_PATH,
} from '../src/domain/risulua-split';
import { lines, rewriteFixture } from './helpers/module-table-refactor-map-helpers';

describe('risulua-split module-table top-level rewrite planner', () => {
  it('builds common helper module with forward declarations, bodies, and exports', async () => {
    const result = await rewriteFixture(lines([
      'local function helperTrim(value)',
      '  return value:gsub("^%s+", "")',
      'end',
      '',
      'function onOutput(text)',
      '  return helperTrim(text)',
      'end',
    ]));

    expect(result.ok).toBe(true);

    const commonModule = result.modulePlans.find(
      (m) => m.modulePath === RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH,
    );
    expect(commonModule).toBeDefined();
    expect(commonModule!.exportNames).toEqual(['helperTrim']);

    const body = commonModule!.body;
    expect(body).toContain('local M = {}');
    expect(body).toContain('local helperTrim');
    expect(body).toContain('function helperTrim(value)');
    expect(body).toContain('return value:gsub("^%s+", "")');
    expect(body).toContain('M.helperTrim = helperTrim');
    expect(body).toContain('return M');

    const localMCount = (body.match(/local M = \{\}/g) ?? []).length;
    expect(localMCount).toBe(1);
    const returnMCount = (body.match(/return M/g) ?? []).length;
    expect(returnMCount).toBe(1);
  });

  it('moves runtime handler body to a runtime module and leaves a thin main shim', async () => {
    const result = await rewriteFixture(lines([
      'local function helperTrim(value)',
      '  return value:gsub("^%s+", "")',
      'end',
      '',
      'function onOutput(text)',
      '  return helperTrim(text)',
      'end',
    ]));

    expect(result.ok).toBe(true);
    const main = result.mainRewritePlan.fullMainText;
    expect(main).toContain('local __runtime_output = require("runtime.output")');
    expect(main).toContain('function onOutput(text)');
    expect(main).toContain('return __runtime_output.onOutput(text)');
    expect(main).not.toContain('return helperTrim(text)');

    const runtimeModule = result.modulePlans.find((m) => m.modulePath === RISULUA_MODULE_TABLE_RUNTIME_OUTPUT_PATH);
    expect(runtimeModule).toBeDefined();
    expect(runtimeModule!.body).toContain('local __local_helpers = require("common.local_helpers")');
    expect(runtimeModule!.body).toContain('__local_helpers.helperTrim(text)');
  });

  it('preserves async(function(...)) wrappers when moving runtime handler assignments', async () => {
    const result = await rewriteFixture(lines([
      'local function helperValue(value)',
      '  return value',
      'end',
      '',
      'onButtonClick = async(function(id, data)',
      '  return helperValue(data)',
      'end)',
    ]));

    expect(result.ok).toBe(true);
    const runtimeModule = result.modulePlans.find((m) => m.modulePath === RISULUA_MODULE_TABLE_RUNTIME_BUTTON_CLICK_PATH);
    expect(runtimeModule).toBeDefined();
    expect(runtimeModule!.body).toContain('onButtonClick = async(function(id, data)');
    expect(runtimeModule!.body).not.toContain('onButtonClick = async(id, data)');
    expect(runtimeModule!.body).toContain('end)');
  });

  it('builds direct public global bridge in main', async () => {
    const result = await rewriteFixture(lines([
      'function setLanguage1(lang)',
      '  return lang',
      'end',
    ]));

    expect(result.ok).toBe(true);

    const globalModule = result.modulePlans.find(
      (m) => m.modulePath === RISULUA_MODULE_TABLE_GLOBAL_FUNCTIONS_PATH,
    );
    expect(globalModule).toBeDefined();
    expect(globalModule!.exportNames).toEqual(['setLanguage1']);
    expect(globalModule!.body).toContain('local function setLanguage1(lang)');
    expect(globalModule!.body).toContain('M.setLanguage1 = setLanguage1');

    const main = result.mainRewritePlan.fullMainText;
    expect(main).toContain('setLanguage1 = __host_globals.setLanguage1');
    expect(main).toContain('require("host_globals.global_functions")');
  });

  it('builds button_actions module and main trigger bridges', async () => {
    const result = await rewriteFixture(lines([
      'local html = [[<button type="button" risu-trigger="toggleSidePanel">Open</button>]]',
      'local auto = [[<button type="button" risu-trigger="setAutoSuccess">Auto</button>]]',
      '',
      'local function helperTrim(value)',
      '  return value:gsub("^%s+", "")',
      'end',
      '',
      'local function toggleSidePanel()',
      '  return helperTrim(" opened")',
      'end',
      '',
      'function setAutoSuccess()',
      '  return "auto"',
      'end',
    ]));

    expect(result.ok).toBe(true);

    const buttonModule = result.modulePlans.find((m) => m.modulePath === RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH);
    expect(buttonModule).toBeDefined();
    expect(buttonModule!.category).toBe('button-action');
    expect(buttonModule!.body).toContain('local __local_helpers = require("common.local_helpers")');
    expect(buttonModule!.body).toContain('function toggleSidePanel()');
    expect(buttonModule!.body).toContain('__local_helpers.helperTrim(" opened")');
    expect(buttonModule!.body).toContain('M.toggleSidePanel = toggleSidePanel');
    expect(buttonModule!.body).toContain('local function setAutoSuccess()');
    expect(buttonModule!.body).not.toContain('\nfunction setAutoSuccess()');
    expect(buttonModule!.body).toContain('M.setAutoSuccess = setAutoSuccess');

    const main = result.mainRewritePlan.fullMainText;
    expect(main).toContain('local __button_actions = require("button_actions.actions")');
    expect(main).toContain('toggleSidePanel = __button_actions.toggleSidePanel');
    expect(main).toContain('setAutoSuccess = __button_actions.setAutoSuccess');
    expect(main).not.toContain('local function toggleSidePanel()');
    expect(main).not.toContain('function setAutoSuccess()');
  });

  it('moves the full async button action assignment instead of leaving wrapper fragments in main', async () => {
    const result = await rewriteFixture(lines([
      'local html = [[<button type="button" risu-trigger="removeActionButton">Remove</button>]]',
      '',
      'removeActionButton = async(function(triggerId)',
      '  alertNormal(triggerId)',
      'end)',
    ]));

    expect(result.ok).toBe(true);
    const buttonModule = result.modulePlans.find((m) => m.modulePath === RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH);
    expect(buttonModule).toBeDefined();
    expect(buttonModule!.body).toContain('local removeActionButton = async(function(triggerId)');
    expect(buttonModule!.body).toContain('M.removeActionButton = removeActionButton');

    const main = result.mainRewritePlan.fullMainText;
    expect(main).toContain('removeActionButton = __button_actions.removeActionButton');
    expect(main).not.toContain('removeActionButton = async(');
    expect(main).not.toContain('removeActionButton = async(\nremoveActionButton = __button_actions.removeActionButton');
  });

  it('builds async public global bridge targeting async_actions', async () => {
    const result = await rewriteFixture(lines([
      'setHeroineClothes = async(function(clothes)',
      '  alertNormal(clothes)',
      'end)',
    ]));

    expect(result.ok).toBe(true);

    const asyncModule = result.modulePlans.find(
      (m) => m.modulePath === RISULUA_MODULE_TABLE_ASYNC_ACTIONS_PATH,
    );
    expect(asyncModule).toBeDefined();
    expect(asyncModule!.exportNames).toEqual(['setHeroineClothes']);
    expect(asyncModule!.body).toContain('local setHeroineClothes');
    expect(asyncModule!.body).toContain('M.setHeroineClothes = setHeroineClothes');

    const main = result.mainRewritePlan.fullMainText;
    expect(main).toContain('setHeroineClothes = __async_actions.setHeroineClothes');
  });

  it('preserves unsafe public globals in main unchanged', async () => {
    const result = await rewriteFixture(lines([
      'local outside = 0',
      'local function bumpOutside()',
      '  outside = outside + 1',
      'end',
      'function onOutput(text)',
      '  bumpOutside()',
      '  return text',
      'end',
    ]));

    expect(result.ok).toBe(true);
    const main = result.mainRewritePlan.fullMainText;
    expect(main).toContain('local function bumpOutside()');
    expect(main).toContain('outside = outside + 1');
    expect(main).toContain('return __runtime_output.onOutput(text, bumpOutside)');

    const runtimeModule = result.modulePlans.find((m) => m.modulePath === RISULUA_MODULE_TABLE_RUNTIME_OUTPUT_PATH);
    expect(runtimeModule).toBeDefined();
    expect(runtimeModule!.body).toContain('function onOutput(text, bumpOutside)');
  });

  it('does not rewrite references inside comments', async () => {
    const result = await rewriteFixture(lines([
      'local function helperTrim(value)',
      '  return value:gsub("^%s+", "")',
      'end',
      '',
      '-- helperTrim should not appear rewritten',
      'function onOutput(text)',
      '  return helperTrim(text)',
      'end',
    ]));

    expect(result.ok).toBe(true);
    const main = result.mainRewritePlan.fullMainText;
    expect(main).toContain('-- helperTrim should not appear rewritten');
    expect(main).not.toContain('-- __local_helpers.helperTrim');
  });

  it('does not rewrite references inside strings', async () => {
    const result = await rewriteFixture(lines([
      'local function helperTrim(value)',
      '  return value:gsub("^%s+", "")',
      'end',
      '',
      'function onOutput(text)',
      '  local msg = "call helperTrim here"',
      '  return helperTrim(text)',
      'end',
    ]));

    expect(result.ok).toBe(true);
    const runtimeModule = result.modulePlans.find((m) => m.modulePath === RISULUA_MODULE_TABLE_RUNTIME_OUTPUT_PATH);
    expect(runtimeModule).toBeDefined();
    expect(runtimeModule!.body).toContain('"call helperTrim here"');
    expect(runtimeModule!.body).not.toContain('"call __local_helpers.helperTrim');
  });

  it('does not rewrite table keys', async () => {
    const result = await rewriteFixture(lines([
      'local function helperTrim(value)',
      '  return value:gsub("^%s+", "")',
      'end',
      '',
      'function onOutput(text)',
      '  local t = { helperTrim = "kept" }',
      '  return helperTrim(text)',
      'end',
    ]));

    expect(result.ok).toBe(true);
    const runtimeModule = result.modulePlans.find((m) => m.modulePath === RISULUA_MODULE_TABLE_RUNTIME_OUTPUT_PATH);
    expect(runtimeModule).toBeDefined();
    expect(runtimeModule!.body).toContain('{ helperTrim = "kept" }');
    expect(runtimeModule!.body).not.toContain('{ __local_helpers.helperTrim');
  });

  it('does not rewrite member expressions', async () => {
    const result = await rewriteFixture(lines([
      'local function helperTrim(value)',
      '  return value:gsub("^%s+", "")',
      'end',
      '',
      'function onOutput(text)',
      '  local obj = { helperTrim = function() end }',
      '  obj.helperTrim()',
      '  return helperTrim(text)',
      'end',
    ]));

    expect(result.ok).toBe(true);
    const runtimeModule = result.modulePlans.find((m) => m.modulePath === RISULUA_MODULE_TABLE_RUNTIME_OUTPUT_PATH);
    expect(runtimeModule).toBeDefined();
    expect(runtimeModule!.body).toContain('obj.helperTrim()');
    expect(runtimeModule!.body).not.toContain('obj.__local_helpers.helperTrim');
  });

  it('does not rewrite shadowed identifiers', async () => {
    const result = await rewriteFixture(lines([
      'local function helperTrim(value)',
      '  return value:gsub("^%s+", "")',
      'end',
      '',
      'function onOutput(text)',
      '  local function helperTrim()',
      '    return text',
      '  end',
      '  return helperTrim()',
      'end',
    ]));

    expect(result.ok).toBe(true);
    const runtimeModule = result.modulePlans.find((m) => m.modulePath === RISULUA_MODULE_TABLE_RUNTIME_OUTPUT_PATH);
    expect(runtimeModule).toBeDefined();

    // The nested local function helperTrim shadows the extracted top-level one inside the runtime body.
    expect(runtimeModule!.body).toContain('local function helperTrim()');
    expect(runtimeModule!.body).toContain('return text');

    // Call inside shadowed scope should NOT be rewritten to __local_helpers.helperTrim
    expect(runtimeModule!.body).not.toContain('__local_helpers.helperTrim()');
  });

  it('preserves top-level side-effect statements in original order', async () => {
    const result = await rewriteFixture(lines([
      'local function helperTrim(value)',
      '  return value:gsub("^%s+", "")',
      'end',
      '',
      'function onOutput(text)',
      '  return helperTrim(text)',
      'end',
      '',
      'function onStart()',
      '  local x = getChatVar("init")',
      '  alertNormal(x)',
      'end',
    ]));

    expect(result.ok).toBe(true);
    const main = result.mainRewritePlan.fullMainText;

    const onOutputPos = main.indexOf('function onOutput');
    const onInputPos = main.indexOf('function onStart');
    expect(onOutputPos).toBeGreaterThan(0);
    expect(onInputPos).toBeGreaterThan(onOutputPos);
  });

  it('does not rewrite unbound globals', async () => {
    const result = await rewriteFixture(lines([
      'local function helperTrim(value)',
      '  return value:gsub("^%s+", "")',
      'end',
      '',
      'function onOutput(text)',
      '  print(helperTrim(text))',
      '  return text',
      'end',
    ]));

    expect(result.ok).toBe(true);
    const runtimeModule = result.modulePlans.find((m) => m.modulePath === RISULUA_MODULE_TABLE_RUNTIME_OUTPUT_PATH);
    expect(runtimeModule).toBeDefined();
    expect(runtimeModule!.body).toContain('print(');
    expect(runtimeModule!.body).not.toContain('__local_helpers.print');
  });

  it('inserts require binding only when common helpers exist', async () => {
    const noHelpersResult = await rewriteFixture(lines([
      'function setLanguage1(lang)',
      '  return lang',
      'end',
    ]));

    expect(noHelpersResult.ok).toBe(true);
    expect(noHelpersResult.mainRewritePlan.requireStatements).not.toContain(
      'local __local_helpers = require("common.local_helpers")',
    );

    const withHelpersResult = await rewriteFixture(lines([
      'local function helperTrim(value)',
      '  return value',
      'end',
      '',
      'function onOutput(text)',
      '  return helperTrim(text)',
      'end',
    ]));

    expect(withHelpersResult.ok).toBe(true);
    expect(withHelpersResult.mainRewritePlan.requireStatements).toContain(
      'local __local_helpers = require("common.local_helpers")',
    );
  });

  it('returns empty plans for empty source', async () => {
    const result = await rewriteFixture('');

    expect(result.ok).toBe(true);
    expect(result.modulePlans).toEqual([]);
    expect(result.mainRewritePlan.requireStatements).toEqual([]);
    expect(result.mainRewritePlan.bridgeAssignments).toEqual([]);
  });

  it('handles host global that calls extracted common helper', async () => {
    const result = await rewriteFixture(lines([
      'local function helperTrim(value)',
      '  return value:gsub("^%s+", "")',
      'end',
      '',
      'function setLanguage1(lang)',
      '  return helperTrim(lang)',
      'end',
    ]));

    expect(result.ok).toBe(true);

    const globalModule = result.modulePlans.find(
      (m) => m.modulePath === RISULUA_MODULE_TABLE_GLOBAL_FUNCTIONS_PATH,
    );
    expect(globalModule).toBeDefined();
    expect(globalModule!.internalRequires.length).toBeGreaterThan(0);
    expect(globalModule!.body).toContain('__local_helpers.helperTrim');
    expect(globalModule!.body).toContain('require("common.local_helpers")');
  });

  it('does not extract nested handler helpers or add handler-helper require bindings', async () => {
    const result = await rewriteFixture(lines([
      'local function helperTrim(value)',
      '  return value:gsub("^%s+", "")',
      'end',
      '',
      'function onOutput(text)',
      '  local function processChunk(chunk)',
      '    return helperTrim(chunk)',
      '  end',
      '  return processChunk(text)',
      'end',
    ]));

    expect(result.ok).toBe(true);

    const runtimeModule = result.modulePlans.find((m) => m.modulePath === RISULUA_MODULE_TABLE_RUNTIME_OUTPUT_PATH);
    expect(runtimeModule).toBeDefined();

    // Nested helper 'processChunk' remains with the moved runtime body in this rewrite phase.
    expect(runtimeModule!.body).toContain('local function processChunk(chunk)');
    expect(runtimeModule!.body).toContain('return processChunk(text)');

    // No handler-helper require in main
    for (const req of result.mainRewritePlan.requireStatements) {
      expect(req).not.toContain('handler_helpers');
    }

    // Module plans must NOT contain any handler-helper module
    for (const plan of result.modulePlans) {
      expect(plan.modulePath).not.toContain('handler_helpers');
    }

    // But the top-level helper should still be extracted and rewritten in the runtime body.
    expect(runtimeModule!.body).toContain('__local_helpers.helperTrim');
  });

  it('rewrites helper calls before shadowed scope but not inside it', async () => {
    const result = await rewriteFixture(lines([
      'local function helperTrim(value)',
      '  return value:gsub("^%s+", "")',
      'end',
      '',
      'local x = helperTrim("before")',
      '',
      'function onOutput(text)',
      '  local function helperTrim()',
      '    return text',
      '  end',
      '  return helperTrim()',
      'end',
    ]));

    expect(result.ok).toBe(true);
    const main = result.mainRewritePlan.fullMainText;

    // Call before shadowed scope should be rewritten
    expect(main).toContain('__local_helpers.helperTrim("before")');

    const runtimeModule = result.modulePlans.find((m) => m.modulePath === RISULUA_MODULE_TABLE_RUNTIME_OUTPUT_PATH);
    expect(runtimeModule).toBeDefined();

    // Shadowed declaration should remain unchanged inside the runtime body.
    expect(runtimeModule!.body).toContain('local function helperTrim()');

    // Call inside shadowed scope should NOT be rewritten
    expect(runtimeModule!.body).not.toContain('__local_helpers.helperTrim()');
  });
});
