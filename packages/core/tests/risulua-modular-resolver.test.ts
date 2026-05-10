import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  RisuLuaResolverError,
  discoverRisuLuaBundleTarget,
  resolveRisuLuaModularGraph,
  resolveRisuLuaModulePath,
  validateRisuLuaModuleId,
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

describe('risulua modular resolver', () => {
  it('risulua modular resolver builds a deterministic reachable dependency graph from lua/main.risulua', () => {
    const rootDir = createModularRoot();
    writeLua(rootDir, 'main', [
      '-- require("ignored.comment")',
      'local text = "require(\"ignored.string\")"',
      'local variables = require("common.variables")',
      'local feature = require("features.entry")',
      'return feature.run(variables)',
    ].join('\n'));
    writeLua(rootDir, 'common/variables', 'return { hp = 100 }\n');
    writeLua(rootDir, 'features/entry', 'local variables = require("common.variables")\nreturn { run = function() return variables.hp end }\n');
    writeLua(rootDir, 'orphan/module', 'return require("missing.orphan")\n');

    const graph = resolveRisuLuaModularGraph({ target: discoverRisuLuaBundleTarget({ rootDir, mode: 'modular' }) });

    expect(graph.modules.map((module) => module.id)).toEqual([
      'common.variables',
      'features.entry',
      'main',
    ]);
    expect(graph.modules.map((module) => module.relativePath)).toEqual([
      'lua/common/variables.risulua',
      'lua/features/entry.risulua',
      'lua/main.risulua',
    ]);
    expect(graph.edges.map((edge) => `${edge.from}->${edge.to}`)).toEqual([
      'features.entry->common.variables',
      'main->common.variables',
      'main->features.entry',
    ]);
  });

  it('risulua modular resolver rejects invalid module IDs', () => {
    for (const invalidId of [
      '',
      '.',
      'common.',
      '.common',
      'common..variables',
      '../common',
      '/common',
      'common/variables',
      'common.variables.risulua',
    ]) {
      expect(() => validateRisuLuaModuleId(invalidId), invalidId).toThrow(/Invalid RisuLua module ID/u);
    }

    expect(() => validateRisuLuaModuleId('common.variables')).not.toThrow();
    expect(resolveRisuLuaModulePath('/workspace/lua', 'common.variables')).toBe(
      path.resolve('/workspace/lua/common/variables.risulua'),
    );
  });

  it('risulua modular resolver fails deterministically on missing modules', () => {
    const rootDir = createModularRoot();
    writeLua(rootDir, 'main', 'return require("missing.module")\n');

    expectResolverError(rootDir, 'missing_module', /Missing RisuLua module "missing\.module"/u);
  });

  it('risulua modular resolver rejects parse errors', () => {
    const rootDir = createModularRoot();
    writeLua(rootDir, 'main', 'if then\n');

    expectResolverError(rootDir, 'parse_error', /Failed to parse RisuLua module "main"/u);
  });

  it('risulua modular resolver rejects dynamic require calls', () => {
    const rootDir = createModularRoot();
    writeLua(rootDir, 'main', 'local moduleName = "common.variables"\nreturn require(moduleName)\n');
    writeLua(rootDir, 'common/variables', 'return {}\n');

    expectResolverError(rootDir, 'dynamic_require', /Dynamic require is not supported/u);
  });

  it('risulua modular resolver rejects concatenated require calls', () => {
    const rootDir = createModularRoot();
    writeLua(rootDir, 'main', 'return require("common." .. "variables")\n');

    expectResolverError(rootDir, 'dynamic_require', /Dynamic require is not supported/u);
  });

  it('risulua modular resolver rejects require shadowing before extraction', () => {
    const rootDir = createModularRoot();
    writeLua(rootDir, 'main', 'local require = function() end\nreturn require("common.variables")\n');
    writeLua(rootDir, 'common/variables', 'return {}\n');

    expectResolverError(rootDir, 'require_shadowed', /must not shadow require/u);
  });

  it('risulua modular resolver rejects require reassignment before extraction', () => {
    const rootDir = createModularRoot();
    writeLua(rootDir, 'main', 'require = function() end\nreturn require("common.variables")\n');
    writeLua(rootDir, 'common/variables', 'return {}\n');

    expectResolverError(rootDir, 'require_reassigned', /must not reassign require/u);
  });

  it('risulua modular resolver rejects cycles with the cycle path', () => {
    const rootDir = createModularRoot();
    writeLua(rootDir, 'main', 'return require("a")\n');
    writeLua(rootDir, 'a', 'return require("b")\n');
    writeLua(rootDir, 'b', 'return require("a")\n');

    expectResolverError(rootDir, 'cycle', /a -> b -> a/u, ['a', 'b', 'a']);
  });

  it('risulua modular resolver rejects self-require', () => {
    const rootDir = createModularRoot();
    writeLua(rootDir, 'main', 'return require("main")\n');

    expectResolverError(rootDir, 'self_require', /main -> main/u, ['main', 'main']);
  });
});

function createModularRoot(): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risulua-modular-resolver-'));
  tempDirs.push(rootDir);
  writeFile(rootDir, '.risumodule', `${JSON.stringify({
    $schema: RISUMODULE_SCHEMA_URL,
    kind: RISUMODULE_KIND,
    schemaVersion: RISUMODULE_SCHEMA_VERSION,
    id: 'module-id',
    name: 'Resolver Module',
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

function expectResolverError(
  rootDir: string,
  code: string,
  message: RegExp,
  cyclePath?: string[],
): void {
  try {
    resolveRisuLuaModularGraph({ target: discoverRisuLuaBundleTarget({ rootDir, mode: 'modular' }) });
    throw new Error('Expected resolver to throw');
  } catch (error) {
    expect(error).toBeInstanceOf(RisuLuaResolverError);
    const resolverError = error as RisuLuaResolverError;
    expect(resolverError.diagnostic.code).toBe(code);
    expect(resolverError.message).toMatch(message);
    if (cyclePath) {
      expect(resolverError.diagnostic.cyclePath).toEqual(cyclePath);
    }
  }
}
