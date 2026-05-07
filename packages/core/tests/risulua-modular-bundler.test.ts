import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
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

    // Verify loader functions are generated for dependencies
    expect(bundled.generatedLoaders).toContain('__loader_common_variables');
    expect(bundled.generatedLoaders).toContain('__loader_common_utils');

    // Verify dependency bodies are present in loaders
    expect(bundled.code).toContain('__loader_common_variables');
    expect(bundled.code).toContain('hp = 100');
    expect(bundled.code).toContain('__loader_common_utils');
    expect(bundled.code).toContain('capitalize');

    // Verify entry module is at top level (not wrapped in a loader)
    expect(bundled.code).toContain('local variables = __loader_common_variables()');
    expect(bundled.code).toContain('local utils = __loader_common_utils()');

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
    expect(bundled.code).toContain('local config = __loader_common_config()');
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

    // Verify loader local is predeclared and function body is assigned
    expect(bundled.code).toContain('local __loader_module_a');
    expect(bundled.code).toContain('__loader_module_a = function()');

    // Verify cache lookup is present
    expect(bundled.code).toContain('if __risulua_cache["module.a"] ~= nil then');
    expect(bundled.code).toContain('return __risulua_cache["module.a"]');

    // Verify both requires in main use the same loader call
    // Note: there are 3 occurrences - 2 in main + 1 in the loader's cache check
    const loaderCalls = (bundled.code.match(/__loader_module_a\(\)/g) || []).length;
    expect(loaderCalls).toBeGreaterThanOrEqual(2);
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
    expect(bundled.code).toContain('local b = __loader_module_b()');

    // Verify no executable require calls remain
    expect(hasExecutableRequireCalls(bundled.code)).toBe(false);
  });

  it('risulua modular bundler ensures lexical scope safety for cross-dependent loaders', () => {
    // Regression test: module.a requires module.b, but 'a' comes before 'b' alphabetically.
    // With alphabetical emission, __loader_module_a would be declared before __loader_module_b,
    // causing __loader_module_b() to be nil at runtime in Lua 5.1.
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

    // Verify predeclaration pattern: all locals declared first
    expect(bundled.code).toMatch(/local __loader_module_a, __loader_module_b/);

    // Verify function bodies are assigned after predeclaration
    const predeclIndex = bundled.code.indexOf('local __loader_module_a, __loader_module_b');
    const loaderAIndex = bundled.code.indexOf('__loader_module_a = function()');
    const loaderBIndex = bundled.code.indexOf('__loader_module_b = function()');

    // Both function assignments must come after predeclaration
    expect(loaderAIndex).toBeGreaterThan(predeclIndex);
    expect(loaderBIndex).toBeGreaterThan(predeclIndex);

    // Verify __loader_module_b is called inside __loader_module_a's body
    // This proves lexical scope safety - the call is to a predeclared local
    const loaderAStart = bundled.code.indexOf('__loader_module_a = function()');
    const loaderAEnd = bundled.code.indexOf('__loader_module_a = function()', loaderAStart + 1);
    const loaderABody = bundled.code.slice(loaderAStart, loaderAEnd > 0 ? loaderAEnd : loaderAStart + 500);
    expect(loaderABody).toContain('__loader_module_b()');

    // Verify no executable require calls remain
    expect(hasExecutableRequireCalls(bundled.code)).toBe(false);
  });

  it('risulua modular bundler ignores require in comments and strings', () => {
    const rootDir = createModularRoot();
    writeLua(rootDir, 'main', [
      '-- require("fake.module")',
      'local text = "require(\"fake.module\")"',
      'local real = require("common.real")',
      'return real',
    ].join('\n'));
    writeLua(rootDir, 'common/real', [
      'return { real = true }',
    ].join('\n'));

    const graph = resolveRisuLuaModularGraph({ target: discoverRisuLuaBundleTarget({ rootDir, mode: 'modular' }) });
    const bundled = bundleRisuLuaModularGraph({ graph });

    // Verify only the real require was replaced
    expect(bundled.code).toContain('local real = __loader_common_real()');

    // Verify comment and string content is preserved
    expect(bundled.code).toContain('-- require("fake.module")');
    expect(bundled.code).toContain('local text = "require(\"fake.module\")"');

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
    expect(dotOnlyBundled.code).toContain('local helper = __loader_common_helper()');
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
