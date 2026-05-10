import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  RisuLuaResolverError,
  analyzeRisuLuaForbiddenPatterns,
  discoverRisuLuaBundleTarget,
  resolveRisuLuaModularGraph,
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

describe('risulua forbidden patterns', () => {
  it('risulua forbidden patterns reports dynamic require and require ambiguity', () => {
    const diagnostics = analyze([
      'local moduleName = "common.variables"',
      'require(moduleName)',
      'require("common." .. moduleName)',
      'local require = function() end',
      'require = function() end',
      'local alias = require',
    ].join('\n'));

    expect(codes(diagnostics)).toEqual(expect.arrayContaining([
      'dynamic_require',
      'require_shadowed',
      'require_reassigned',
      'require_alias_or_wrapper',
    ]));
    expect(diagnostics.filter((diagnostic) => diagnostic.code === 'dynamic_require')).toHaveLength(2);
  });

  it('risulua forbidden patterns reports runtime loading', () => {
    const diagnostics = analyze([
      'package.path = package.path .. ";./?.lua"',
      'package.cpath = "./?.so"',
      'package.searchers = {}',
      'package.loaders[1] = function() end',
      'dofile("runtime.lua")',
      'loadfile("runtime.lua")',
    ].join('\n'));

    expect(symbols(diagnostics)).toEqual(expect.arrayContaining([
      'package.path',
      'package.cpath',
      'package.searchers',
      'package.loaders',
      'dofile',
      'loadfile',
    ]));
    expect(codes(diagnostics)).toEqual(expect.arrayContaining([
      'package_loader_mutation',
      'forbidden_runtime_load',
    ]));
  });

  it('risulua forbidden patterns ignores trivia', () => {
    const diagnostics = analyze([
      '-- require(moduleName) package.path = "x" dofile("x") loadfile("x")',
      'local text = "require(moduleName) package.path dofile loadfile"',
      'local block = [[',
      '  require("common." .. name)',
      '  package.cpath = "x"',
      '  dofile("x")',
      ']]',
      'local value = json.encode({ async = async, chat = getChat(), full = getFullChat() })',
      'setChatVar("safe", getChatVar("safe") or value)',
    ].join('\n'));

    expect(diagnostics).toEqual([]);
  });

  it('risulua forbidden patterns allows safe static require and host globals', () => {
    const diagnostics = analyze([
      'local variables = require("common.variables")',
      'local value = json.encode({ chat = getChat(), full = getFullChat() })',
      'async(function() setChatVar("safe", getChatVar("safe") or value) end)',
      'return variables',
    ].join('\n'));

    expect(diagnostics).toEqual([]);
  });

  it('risulua forbidden patterns allows unicode comments and strings while preserving static require checks', () => {
    const diagnostics = analyze([
      '-- 컵케익모듈: 새 메시지 전송 시 실행',
      'local dice = require("common.dice")',
      'print("[dice 시스템] ✓ 모드 활성화됨")',
      'return dice',
    ].join('\n'));

    expect(diagnostics).toEqual([]);
  });

  it('risulua forbidden patterns blocks resolver before accepting static graph', () => {
    const rootDir = createModularRoot();
    writeLua(rootDir, 'main', [
      'local variables = require("common.variables")',
      'dofile("runtime.lua")',
      'return variables',
    ].join('\n'));
    writeLua(rootDir, 'common/variables', 'return { hp = 100 }\n');

    try {
      resolveRisuLuaModularGraph({ target: discoverRisuLuaBundleTarget({ rootDir, mode: 'modular' }) });
      throw new Error('Expected resolver to reject forbidden runtime loading');
    } catch (error) {
      expect(error).toBeInstanceOf(RisuLuaResolverError);
      const resolverError = error as RisuLuaResolverError;
      expect(resolverError.diagnostic.code).toBe('forbidden_runtime_load');
      expect(resolverError.diagnostic.moduleId).toBe('main');
    }
  });
});

function analyze(source: string) {
  return analyzeRisuLuaForbiddenPatterns({
    source,
    filePath: '/workspace/lua/main.risulua',
    moduleId: 'main',
  });
}

function codes(diagnostics: ReturnType<typeof analyze>): string[] {
  return diagnostics.map((diagnostic) => diagnostic.code);
}

function symbols(diagnostics: ReturnType<typeof analyze>): string[] {
  return diagnostics.map((diagnostic) => diagnostic.symbol).filter((symbol): symbol is string => Boolean(symbol));
}

function createModularRoot(): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risulua-forbidden-patterns-'));
  tempDirs.push(rootDir);
  writeFile(rootDir, '.risumodule', `${JSON.stringify({
    $schema: RISUMODULE_SCHEMA_URL,
    kind: RISUMODULE_KIND,
    schemaVersion: RISUMODULE_SCHEMA_VERSION,
    id: 'module-id',
    name: 'Forbidden Pattern Module',
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
