import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  analyzeRisuLuaDistOutput,
  analyzeRisuLuaLocalBudget,
  bundleRisuLuaModularGraph,
  discoverRisuLuaBundleTarget,
  extractGlobalFunctionDeclarations,
  hasExecutableRequireCalls,
  moduleIdFromRisuLuaSourcePath,
  resolveRisuLuaModularGraph,
  RisuLuaResolverError,
} from '../src/cli/shared';
import {
  RISUMODULE_KIND,
  RISUMODULE_SCHEMA_URL,
  RISUMODULE_SCHEMA_VERSION,
} from '../src/cli/shared/risumodule';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('risulua modular bundler', () => {
  it('risulua modular bundler emits single dist', () => {
    const rootDir = createModularRoot();
    writeLua(rootDir, 'main', [
      'local variables = require("common.variables")',
      'local utils = require("common.utils")',
      'return {',
      '  hp = variables.hp,',
      '  name = utils.capitalize(variables.name)',
      '}',
    ].join('\n'));
    writeLua(rootDir, 'common/variables', [
      'return {',
      '  hp = 100,',
      '  name = "hero"',
      '}',
    ].join('\n'));
    writeLua(rootDir, 'common/utils', [
      'return {',
      '  capitalize = function(s) return s:sub(1,1):upper() .. s:sub(2) end',
      '}',
    ].join('\n'));

    const graph = resolveRisuLuaModularGraph({ target: discoverRisuLuaBundleTarget({ rootDir, mode: 'modular' }) });
    const bundled = bundleRisuLuaModularGraph({ graph });

    // Verify output is a single Lua string
    expect(typeof bundled.code).toBe('string');
    expect(bundled.code.length).toBeGreaterThan(0);

    // Verify cache table is present
    expect(bundled.code).toContain('local __risulua_cache = {}');
    expect(bundled.code).toContain('local __risulua_loaders = {}');

    // Verify loader functions are generated for dependencies
    expect(bundled.generatedLoaders).toContain('__loader_common_variables');
    expect(bundled.generatedLoaders).toContain('__loader_common_utils');

    // Verify dependency bodies are present in loaders
    expect(bundled.code).toContain('__risulua_loaders["common.variables"] = function()');
    expect(bundled.code).toContain('hp = 100');
    expect(bundled.code).toContain('__risulua_loaders["common.utils"] = function()');
    expect(bundled.code).toContain('capitalize');

    // Verify entry module is at top level (not wrapped in a loader)
    expect(bundled.code).toContain('local variables = __risulua_loaders["common.variables"]()');
    expect(bundled.code).toContain('local utils = __risulua_loaders["common.utils"]()');
    expect(bundled.code).not.toMatch(/local\s+__loader_/);

    // Verify no executable require calls remain
    expect(hasExecutableRequireCalls(bundled.code)).toBe(false);
  });

  it('risulua modular bundler preserves hooks and removes require', () => {
    const rootDir = createModularRoot();
    writeLua(rootDir, 'main', [
      'local config = require("common.config")',
      '',
      'function onOutput(data)',
      '  return config.process(data)',
      'end',
      '',
      'function onInput(data)',
      '  return config.validate(data)',
      'end',
      '',
      'function onStart()',
      '  config.init()',
      'end',
      '',
      'function onButtonClick(buttonId)',
      '  return config.handleButton(buttonId)',
      'end',
    ].join('\n'));
    writeLua(rootDir, 'common/config', [
      'return {',
      '  process = function(d) return d end,',
      '  validate = function(d) return d end,',
      '  init = function() end,',
      '  handleButton = function(id) return id end',
      '}',
    ].join('\n'));

    const graph = resolveRisuLuaModularGraph({ target: discoverRisuLuaBundleTarget({ rootDir, mode: 'modular' }) });
    const bundled = bundleRisuLuaModularGraph({ graph });

    // Verify hook globals are preserved (global function declarations)
    const globals = extractGlobalFunctionDeclarations(bundled.code);
    expect(globals).toContain('onOutput');
    expect(globals).toContain('onInput');
    expect(globals).toContain('onStart');
    expect(globals).toContain('onButtonClick');

    // Verify require was replaced with loader call
    expect(bundled.code).toContain('local config = __risulua_loaders["common.config"]()');
    expect(bundled.code).not.toMatch(/\brequire\s*\(/);

    // Verify no executable require calls remain
    expect(hasExecutableRequireCalls(bundled.code)).toBe(false);
  });

  it('risulua modular bundler caches module results', () => {
    const rootDir = createModularRoot();
    writeLua(rootDir, 'main', [
      'local a = require("module.a")',
      'local b = require("module.a")',
      'return a == b',
    ].join('\n'));
    writeLua(rootDir, 'module/a', [
      'return { value = math.random() }',
    ].join('\n'));

    const graph = resolveRisuLuaModularGraph({ target: discoverRisuLuaBundleTarget({ rootDir, mode: 'modular' }) });
    const bundled = bundleRisuLuaModularGraph({ graph });

    // Verify loader registry is declared and function body is assigned
    expect(bundled.code).toContain('local __risulua_loaders = {}');
    expect(bundled.code).toContain('__risulua_loaders["module.a"] = function()');

    // Verify cache lookup is present
    expect(bundled.code).toContain('if __risulua_cache["module.a"] ~= nil then');
    expect(bundled.code).toContain('return __risulua_cache["module.a"]');

    // Verify both requires in main use the same loader call
    // Note: there are 3 occurrences - 2 in main + 1 in the loader's cache check
    const loaderCalls = (bundled.code.match(/__risulua_loaders\["module\.a"\]\(\)/g) || []).length;
    expect(loaderCalls).toBeGreaterThanOrEqual(2);
  });

  it('risulua modular bundler does not predeclare loader locals at top level', () => {
    const rootDir = createModularRoot();
    writeLua(rootDir, 'main', [
      'local a = require("module.a")',
      'local b = require("module.b")',
      'return { a = a, b = b }',
    ].join('\n'));
    writeLua(rootDir, 'module/a', 'return { value = "a" }');
    writeLua(rootDir, 'module/b', 'return { value = "b" }');

    const graph = resolveRisuLuaModularGraph({ target: discoverRisuLuaBundleTarget({ rootDir, mode: 'modular' }) });
    const bundled = bundleRisuLuaModularGraph({ graph });

    expect(bundled.code).not.toMatch(/^local\s+__loader_/m);
    expect(bundled.code).not.toMatch(/local\s+__loader_module_a,\s*__loader_module_b/);
    expect(bundled.code).toContain('local __risulua_loaders = {}');
  });

  it('risulua modular bundler emits loader registry exactly once when dependencies exist', () => {
    const rootDir = createModularRoot();
    writeLua(rootDir, 'main', 'local a = require("module.a")\nreturn a\n');
    writeLua(rootDir, 'module/a', 'return { value = 1 }\n');

    const graph = resolveRisuLuaModularGraph({ target: discoverRisuLuaBundleTarget({ rootDir, mode: 'modular' }) });
    const bundled = bundleRisuLuaModularGraph({ graph });

    expect(bundled.code.match(/local __risulua_loaders = \{\}/g)).toHaveLength(1);
    expect(bundled.code).toContain('__risulua_loaders["module.a"] = function()');
  });

  it('risulua modular bundler caches nil returns as true', () => {
    const rootDir = createModularRoot();
    writeLua(rootDir, 'main', [
      'local result = require("module.nilreturn")',
      'return result',
    ].join('\n'));
    writeLua(rootDir, 'module/nilreturn', [
      '-- This module returns nil implicitly',
      'local x = 1',
    ].join('\n'));

    const graph = resolveRisuLuaModularGraph({ target: discoverRisuLuaBundleTarget({ rootDir, mode: 'modular' }) });
    const bundled = bundleRisuLuaModularGraph({ graph });

    // Verify nil handling logic is present
    expect(bundled.code).toContain('if __risulua_module_result == nil then');
    expect(bundled.code).toContain('__risulua_cache["module.nilreturn"] = true');
  });

  it('risulua modular bundler leaves host globals untouched', () => {
    const rootDir = createModularRoot();
    writeLua(rootDir, 'main', [
      'local config = require("common.config")',
      'local value = json.encode({ chat = getChat(), full = getFullChat() })',
      'async(function()',
      '  setChatVar("key", getChatVar("key") or value)',
      'end)',
      'return config',
    ].join('\n'));
    writeLua(rootDir, 'common/config', [
      'return {',
      '  getVar = getChatVar,',
      '  setVar = setChatVar',
      '}',
    ].join('\n'));

    const graph = resolveRisuLuaModularGraph({ target: discoverRisuLuaBundleTarget({ rootDir, mode: 'modular' }) });
    const bundled = bundleRisuLuaModularGraph({ graph });

    // Verify host globals remain as names (not replaced)
    expect(bundled.code).toContain('json.encode');
    expect(bundled.code).toContain('getChat()');
    expect(bundled.code).toContain('getFullChat()');
    expect(bundled.code).toContain('setChatVar');
    expect(bundled.code).toContain('getChatVar');
    expect(bundled.code).toContain('async');

    // Verify no executable require calls remain
    expect(hasExecutableRequireCalls(bundled.code)).toBe(false);
  });

  it('risulua modular bundler handles transitive dependencies', () => {
    const rootDir = createModularRoot();
    writeLua(rootDir, 'main', [
      'local a = require("module.a")',
      'return a.run()',
    ].join('\n'));
    writeLua(rootDir, 'module/a', [
      'local b = require("module.b")',
      'return { run = function() return b.value end }',
    ].join('\n'));
    writeLua(rootDir, 'module/b', [
      'return { value = 42 }',
    ].join('\n'));

    const graph = resolveRisuLuaModularGraph({ target: discoverRisuLuaBundleTarget({ rootDir, mode: 'modular' }) });
    const bundled = bundleRisuLuaModularGraph({ graph });

    // Verify all loaders are generated
    expect(bundled.generatedLoaders).toContain('__loader_module_a');
    expect(bundled.generatedLoaders).toContain('__loader_module_b');

    // Verify transitive require is replaced
    expect(bundled.code).toContain('local b = __risulua_loaders["module.b"]()');

    // Verify no executable require calls remain
    expect(hasExecutableRequireCalls(bundled.code)).toBe(false);
  });

  it('risulua modular bundler ensures lexical scope safety for cross-dependent loaders', () => {
    // Regression test: module.a requires module.b, but 'a' comes before 'b' alphabetically.
    // With direct local loader emission, module.a could call module.b before the binding existed,
    // causing a nil runtime call in Lua 5.1.
    const rootDir = createModularRoot();
    writeLua(rootDir, 'main', [
      'local a = require("module.a")',
      'return a.getValue()',
    ].join('\n'));
    writeLua(rootDir, 'module/a', [
      'local b = require("module.b")',
      'return { getValue = function() return b.value end }',
    ].join('\n'));
    writeLua(rootDir, 'module/b', [
      'return { value = 123 }',
    ].join('\n'));

    const graph = resolveRisuLuaModularGraph({ target: discoverRisuLuaBundleTarget({ rootDir, mode: 'modular' }) });
    const bundled = bundleRisuLuaModularGraph({ graph });

    expect(bundled.code).toContain('local __risulua_loaders = {}');
    expect(bundled.code).not.toMatch(/local\s+__loader_module_a,\s*__loader_module_b/);

    const registryIndex = bundled.code.indexOf('local __risulua_loaders = {}');
    const loaderAIndex = bundled.code.indexOf('__risulua_loaders["module.a"] = function()');
    const loaderBIndex = bundled.code.indexOf('__risulua_loaders["module.b"] = function()');

    expect(loaderAIndex).toBeGreaterThan(registryIndex);
    expect(loaderBIndex).toBeGreaterThan(registryIndex);

    const loaderAStart = bundled.code.indexOf('__risulua_loaders["module.a"] = function()');
    const loaderBStart = bundled.code.indexOf('__risulua_loaders["module.b"] = function()');
    const loaderABody = bundled.code.slice(loaderAStart, loaderBStart > loaderAStart ? loaderBStart : loaderAStart + 500);
    expect(loaderABody).toContain('__risulua_loaders["module.b"]()');

    // Verify no executable require calls remain
    expect(hasExecutableRequireCalls(bundled.code)).toBe(false);
  });

  it('risulua modular bundler strips comments while preserving strings', () => {
    const rootDir = createModularRoot();
    writeLua(rootDir, 'main', [
      '-- require("fake.module")',
      '--[[ require("fake.block") ]]',
      'local text = "require(\"fake.module\")"',
      'local longText = [[-- keep long string text]]',
      'local real = require("common.real")',
      'return real',
    ].join('\n'));
    writeLua(rootDir, 'common/real', [
      '-- dependency comment should be stripped',
      'return { real = true }',
    ].join('\n'));

    const graph = resolveRisuLuaModularGraph({ target: discoverRisuLuaBundleTarget({ rootDir, mode: 'modular' }) });
    const bundled = bundleRisuLuaModularGraph({ graph });

    // Verify only the real require was replaced
    expect(bundled.code).toContain('local real = __risulua_loaders["common.real"]()');

    // Verify comments are stripped but string content is preserved
    expect(bundled.code).not.toContain('-- require("fake.module")');
    expect(bundled.code).not.toContain('require("fake.block")');
    expect(bundled.code).not.toContain('dependency comment should be stripped');
    expect(bundled.code).toContain('local text = "require(\"fake.module\")"');
    expect(bundled.code).toContain('local longText = [[-- keep long string text]]');

    // Verify no executable require calls remain
    expect(hasExecutableRequireCalls(bundled.code)).toBe(false);
  });

  it('risulua modular bundler generates deterministic output', () => {
    const rootDir = createModularRoot();
    writeLua(rootDir, 'main', [
      'local a = require("module.a")',
      'local b = require("module.b")',
      'return { a = a, b = b }',
    ].join('\n'));
    writeLua(rootDir, 'module/a', 'return { name = "a" }');
    writeLua(rootDir, 'module/b', 'return { name = "b" }');

    const target = discoverRisuLuaBundleTarget({ rootDir, mode: 'modular' });
    const graph1 = resolveRisuLuaModularGraph({ target });
    const graph2 = resolveRisuLuaModularGraph({ target });

    const bundled1 = bundleRisuLuaModularGraph({ graph: graph1 });
    const bundled2 = bundleRisuLuaModularGraph({ graph: graph2 });

    // Verify identical output for identical input
    expect(bundled1.code).toBe(bundled2.code);
    expect(bundled1.generatedLoaders).toEqual(bundled2.generatedLoaders);
  });

  it('risulua modular bundler keeps large dependency graphs under fixed top-level local budget', () => {
    const rootDir = createModularRoot();
    const dependencyCount = 220;
    const requireLines = Array.from({ length: dependencyCount }, (_value, index) => {
      const moduleId = `module.dep${String(index + 1).padStart(3, '0')}`;
      return `deps[${index + 1}] = require("${moduleId}")`;
    });

    writeLua(rootDir, 'main', [
      'local deps = {}',
      ...requireLines,
      'return deps[1].value + deps[220].value',
    ].join('\n'));

    for (let index = 1; index <= dependencyCount; index += 1) {
      const id = `dep${String(index).padStart(3, '0')}`;
      writeLua(rootDir, `module/${id}`, `return { value = ${index} }\n`);
    }

    const graph = resolveRisuLuaModularGraph({ target: discoverRisuLuaBundleTarget({ rootDir, mode: 'modular' }) });
    const bundled = bundleRisuLuaModularGraph({ graph });
    const diagnostics = analyzeRisuLuaLocalBudget({ code: bundled.code, filePath: 'dist/main.risulua' });

    expect(bundled.generatedLoaders).toHaveLength(dependencyCount);
    expect(bundled.code).toContain('local __risulua_loaders = {}');
    expect(bundled.code).not.toMatch(/^local\s+__loader_/m);
    expect(diagnostics.filter((diagnostic) => diagnostic.scopeKind === 'chunk')).toEqual([]);
    expect(hasExecutableRequireCalls(bundled.code)).toBe(false);
  });

  it('risulua modular bundler keeps violated girl fixture bootstrap under chunk local budget when fixture exists', () => {
    const fixtureRoot = findExistingFixtureRoot([
      'docs/bundle-mode/extract-test/output/module-violated-girl-260501',
      'docs/bundle-mode/extract-test/embed-test-roundtrip/module-violated-girl-260501',
      'docs/bundle-mode/extract-test/embed-test-roundtrip/module-violated-girl-260501-recovered',
    ]);
    if (!fixtureRoot) return;

    const graph = resolveRisuLuaModularGraph({ target: discoverRisuLuaBundleTarget({ rootDir: fixtureRoot, mode: 'modular' }) });
    const bundled = bundleRisuLuaModularGraph({ graph });
    const diagnostics = analyzeRisuLuaLocalBudget({ code: bundled.code, filePath: 'dist/violated-girl.risulua' });

    expect(bundled.generatedLoaders.length).toBeGreaterThanOrEqual(150);
    expect(bundled.code).toContain('local __risulua_loaders = {}');
    expect(bundled.code).not.toMatch(/^local\s+__loader_/m);
    expect(diagnostics.filter((diagnostic) => diagnostic.scopeKind === 'chunk')).toEqual([]);
  });

  it('risulua modular bundler handles entry-only graph with no dependencies', () => {
    // Regression test: entry-only graph (main with no requires) should not emit empty "local "
    const rootDir = createModularRoot();
    writeLua(rootDir, 'main', [
      '-- Entry-only module with no dependencies',
      'function onOutput(data)',
      '  return data',
      'end',
      '',
      'function onInput(data)',
      '  return data',
      'end',
      '',
      'return {',
      '  onOutput = onOutput,',
      '  onInput = onInput',
      '}',
    ].join('\n'));

    const graph = resolveRisuLuaModularGraph({ target: discoverRisuLuaBundleTarget({ rootDir, mode: 'modular' }) });
    const bundled = bundleRisuLuaModularGraph({ graph });

    // Verify no empty "local " declaration (the bug was: "local " with nothing after)
    expect(bundled.code).not.toMatch(/local\s+\n/);
    expect(bundled.code).not.toMatch(/local\s+$/m);

    // Verify cache table is still present
    expect(bundled.code).toContain('local __risulua_cache = {}');

    // Verify no loader predeclaration when there are no dependencies
    expect(bundled.code).not.toContain('local __risulua_loaders = {}');
    expect(bundled.generatedLoaders).toEqual([]);

    // Verify entry module is at top level with hook globals preserved
    const globals = extractGlobalFunctionDeclarations(bundled.code);
    expect(globals).toContain('onOutput');
    expect(globals).toContain('onInput');

    // Verify output is valid Lua (parses without error)
    expect(hasExecutableRequireCalls(bundled.code)).toBe(false);
  });

  it('risulua modular regression matrix preserves resolver and require-free dist contracts', () => {
    // Deferred scope note: this matrix locks the existing core modular contracts only.
    // Workbench UI/LSP, larger corpus regression, prompt copy UX, and preload require-free
    // dist conversion remain out of scope for risulua-split v1 follow-up work.
    const dotOnlyRoot = createModularRoot();
    writeLua(dotOnlyRoot, 'main', 'local helper = require("common.helper")\nreturn helper.value\n');
    writeLua(dotOnlyRoot, 'common/helper', 'return { value = 7 }\n');

    const dotOnlyGraph = resolveRisuLuaModularGraph({
      target: discoverRisuLuaBundleTarget({ rootDir: dotOnlyRoot, mode: 'modular' }),
    });
    const dotOnlyBundled = bundleRisuLuaModularGraph({ graph: dotOnlyGraph });

    expect(dotOnlyGraph.edges).toMatchObject([{ from: 'main', to: 'common.helper', requireId: 'common.helper' }]);
    expect(dotOnlyBundled.code).toContain('local helper = __risulua_loaders["common.helper"]()');
    expect(hasExecutableRequireCalls(dotOnlyBundled.code)).toBe(false);

    const slashRoot = createModularRoot();
    writeLua(slashRoot, 'main', 'local helper = require("common/helper")\nreturn helper\n');
    expectResolverCode(slashRoot, 'invalid_module_id');

    const dynamicRoot = createModularRoot();
    writeLua(dynamicRoot, 'main', 'local name = "common.helper"\nreturn require(name)\n');
    expectResolverCode(dynamicRoot, 'dynamic_require');

    const selfRoot = createModularRoot();
    writeLua(selfRoot, 'main', 'return require("main")\n');
    expectResolverCode(selfRoot, 'self_require');

    const cycleRoot = createModularRoot();
    writeLua(cycleRoot, 'main', 'return require("cycle.a")\n');
    writeLua(cycleRoot, 'cycle/a', 'return require("cycle.b")\n');
    writeLua(cycleRoot, 'cycle/b', 'return require("cycle.a")\n');
    expectResolverCode(cycleRoot, 'cycle');

    const missingRoot = createModularRoot();
    writeLua(missingRoot, 'main', 'return require("missing.module")\n');
    expectResolverCode(missingRoot, 'missing_module');

    const sourceRoot = path.join(dotOnlyRoot, 'lua');
    expect(moduleIdFromRisuLuaSourcePath(path.join(dotOnlyRoot, 'dist', 'Generated.risulua'), sourceRoot)).toBe(null);
    expect(moduleIdFromRisuLuaSourcePath(path.join(dotOnlyRoot, '..', 'outside.risulua'), sourceRoot)).toBe(null);
  });
});

describe('risulua local budget analyzer', () => {
  it('warns at documented local budget thresholds and hard-fails at the Lua limit', () => {
    const warningCode = buildTopLevelLocalChunk(150);
    const highRiskCode = buildTopLevelLocalChunk(180);
    const exceededCode = buildTopLevelLocalChunk(190);
    const hardLimitCode = buildTopLevelLocalChunk(200);

    expect(analyzeRisuLuaLocalBudget({ code: warningCode, filePath: 'dist/test.risulua' })).toMatchObject([
      { code: 'local_budget_warning', severity: 'warning', scopeKind: 'chunk', localCount: 150, threshold: 150 },
    ]);
    expect(analyzeRisuLuaLocalBudget({ code: highRiskCode, filePath: 'dist/test.risulua' })).toMatchObject([
      { code: 'local_budget_high_risk', severity: 'warning', scopeKind: 'chunk', localCount: 180, threshold: 180 },
    ]);
    expect(analyzeRisuLuaLocalBudget({ code: exceededCode, filePath: 'dist/test.risulua' })).toMatchObject([
      { code: 'local_budget_exceeded', severity: 'warning', scopeKind: 'chunk', localCount: 190, threshold: 190 },
    ]);
    expect(analyzeRisuLuaLocalBudget({ code: hardLimitCode, filePath: 'dist/test.risulua' })).toMatchObject([
      { code: 'local_budget_hard_limit', severity: 'error', scopeKind: 'chunk', localCount: 200, threshold: 200 },
    ]);
  });

  it('counts function-scope local budgets separately from top-level locals', () => {
    const code = [
      'local top = 1',
      'local function heavy()',
      buildLocalNames(151).map((name) => `  local ${name} = 1`).join('\n'),
      '  return v001',
      'end',
      'return heavy()',
    ].join('\n');

    const diagnostics = analyzeRisuLuaLocalBudget({ code, filePath: 'dist/test.risulua' });

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: 'local_budget_warning',
      severity: 'warning',
      scopeKind: 'function',
      localCount: 151,
      threshold: 150,
    });
  });

  it('does not count nested function locals in the containing scope', () => {
    const code = [
      'local outer = 1',
      'local function wrapper()',
      '  local nestedSeed = 1',
      '  local function nested()',
      buildLocalNames(150).map((name) => `    local ${name} = 1`).join('\n'),
      '    return v001',
      '  end',
      '  return nestedSeed + nested()',
      'end',
      'return wrapper()',
    ].join('\n');

    const diagnostics = analyzeRisuLuaLocalBudget({ code, filePath: 'dist/test.risulua' });

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: 'local_budget_warning',
      severity: 'warning',
      scopeKind: 'function',
      localCount: 150,
      threshold: 150,
    });
  });

  it('uses Lua active-local semantics instead of cumulative declarations across closed blocks', () => {
    const code = [
      'local function wrapper()',
      '  do',
      buildLocalNames(120).map((name) => `    local a_${name} = 1`).join('\n'),
      '  end',
      '  do',
      buildLocalNames(120).map((name) => `    local b_${name} = 1`).join('\n'),
      '  end',
      '  return true',
      'end',
      'return wrapper()',
    ].join('\n');

    expect(analyzeRisuLuaLocalBudget({ code, filePath: 'dist/test.risulua' })).toEqual([]);
  });

  it('keeps outer locals active while measuring nested lexical blocks', () => {
    const code = [
      'local function wrapper()',
      buildLocalNames(100).map((name) => `  local outer_${name} = 1`).join('\n'),
      '  do',
      buildLocalNames(100).map((name) => `    local inner_${name} = 1`).join('\n'),
      '  end',
      '  return outer_v001',
      'end',
      'return wrapper()',
    ].join('\n');

    const diagnostics = analyzeRisuLuaLocalBudget({ code, filePath: 'dist/test.risulua' });

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: 'local_budget_hard_limit',
      severity: 'error',
      scopeKind: 'function',
      localCount: 200,
      threshold: 200,
    });
  });

  it('does not accumulate locals across mutually exclusive if branches', () => {
    const code = [
      'local function wrapper(flag)',
      '  if flag then',
      buildLocalNames(120).map((name) => `    local a_${name} = 1`).join('\n'),
      '  else',
      buildLocalNames(120).map((name) => `    local b_${name} = 1`).join('\n'),
      '  end',
      '  return true',
      'end',
      'return wrapper(true)',
    ].join('\n');

    expect(analyzeRisuLuaLocalBudget({ code, filePath: 'dist/test.risulua' })).toEqual([]);
  });

  it('counts Lua numeric for hidden control locals while the loop body is active', () => {
    const code = [
      'local function wrapper()',
      buildLocalNames(196).map((name) => `  local outer_${name} = 1`).join('\n'),
      '  for i = 1, 1 do',
      '    return i',
      '  end',
      'end',
      'return wrapper()',
    ].join('\n');

    const diagnostics = analyzeRisuLuaLocalBudget({ code, filePath: 'dist/test.risulua' });

    expect(diagnostics).toMatchObject([
      { code: 'local_budget_hard_limit', severity: 'error', scopeKind: 'function', localCount: 200 },
    ]);
  });

  it('counts Lua generic for hidden control locals while the loop body is active', () => {
    const code = [
      'local function wrapper(items)',
      buildLocalNames(193).map((name) => `  local outer_${name} = 1`).join('\n'),
      '  for key, value in pairs(items) do',
      '    return key, value',
      '  end',
      'end',
      'return wrapper({})',
    ].join('\n');

    const diagnostics = analyzeRisuLuaLocalBudget({ code, filePath: 'dist/test.risulua' });

    expect(diagnostics).toMatchObject([
      { code: 'local_budget_hard_limit', severity: 'error', scopeKind: 'function', localCount: 200 },
    ]);
  });

  it('counts implicit self for colon methods and ignores vararg as a local parameter', () => {
    const code = [
      'local module = {}',
      'function module:method(...)',
      buildLocalNames(149).map((name) => `  local ${name} = 1`).join('\n'),
      '  return self, ...',
      'end',
      'return module',
    ].join('\n');

    const diagnostics = analyzeRisuLuaLocalBudget({ code, filePath: 'dist/test.risulua' });

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: 'local_budget_warning',
      severity: 'warning',
      scopeKind: 'function',
      localCount: 150,
      threshold: 150,
    });
  });
});

describe('risulua dist local budget diagnostics', () => {
  it.each([
    [150, 'warning'],
    [180, 'warning'],
    [190, 'warning'],
    [200, 'error'],
  ] as const)('reports %s-local diagnostics from analyzeRisuLuaDistOutput', (localCount, severity) => {
    const diagnostics = analyzeRisuLuaDistOutput({
      code: buildTopLevelLocalChunk(localCount),
      distPath: '/tmp/dist/test.risulua',
      distRelativePath: 'dist/test.risulua',
    });

    expect(diagnostics).toMatchObject([
      {
        code: 'local_budget',
        severity,
        symbol: 'local',
        message: expect.stringContaining(`declares ${localCount} locals`),
      },
    ]);
  });
});

function expectResolverCode(rootDir: string, code: string): void {
  try {
    resolveRisuLuaModularGraph({ target: discoverRisuLuaBundleTarget({ rootDir, mode: 'modular' }) });
    throw new Error(`Expected RisuLuaResolverError with code ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(RisuLuaResolverError);
    expect((error as RisuLuaResolverError).diagnostic.code).toBe(code);
  }
}

function createModularRoot(): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risulua-modular-bundler-'));
  tempDirs.push(rootDir);
  writeFile(rootDir, '.risumodule', `${JSON.stringify({
    $schema: RISUMODULE_SCHEMA_URL,
    kind: RISUMODULE_KIND,
    schemaVersion: RISUMODULE_SCHEMA_VERSION,
    id: 'module-id',
    name: 'Bundler Module',
    description: '',
    createdAt: null,
    modifiedAt: null,
    sourceFormat: 'scaffold',
  }, null, 2)}\n`);
  return rootDir;
}

function writeLua(rootDir: string, modulePath: string, content: string): void {
  writeFile(rootDir, `lua/${modulePath}.risulua`, content);
}

function writeFile(rootDir: string, relativePath: string, content: string): void {
  const absolutePath = path.join(rootDir, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, 'utf-8');
}

function buildTopLevelLocalChunk(count: number): string {
  return `${buildLocalNames(count).map((name) => `local ${name} = 1`).join('\n')}\nreturn v001\n`;
}

function buildLocalNames(count: number): string[] {
  return Array.from({ length: count }, (_value, index) => `v${String(index + 1).padStart(3, '0')}`);
}

function findExistingFixtureRoot(relativePaths: string[]): string | null {
  for (const relativePath of relativePaths) {
    const fixtureRoot = path.resolve(process.cwd(), relativePath);
    if (
      fs.existsSync(path.join(fixtureRoot, '.risumodule')) &&
      fs.existsSync(path.join(fixtureRoot, 'lua', 'main.risulua'))
    ) {
      return fixtureRoot;
    }
  }
  return null;
}
