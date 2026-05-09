import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  RISULUA_DIST_GENERATED_HEADER,
  RisuLuaDistError,
  analyzeRisuLuaDistOutput,
  bundleRisuLuaModularGraph,
  discoverRisuLuaBundleTarget,
  resolveRisuLuaModularGraph,
  validateRisuLuaDist,
  writeRisuLuaDist,
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

describe('risulua dist validator', () => {
  it('risulua dist validator accepts generated dist', () => {
    const rootDir = createModularRoot('Dist Module');
    writeLua(rootDir, 'main', [
      'local helpers = require("common.helpers")',
      'function onOutput(data)',
      '  return helpers.echo(data)',
      'end',
    ].join('\n'));
    writeLua(rootDir, 'common/helpers', [
      'return {',
      '  echo = function(data) return data end',
      '}',
    ].join('\n'));
    writeFile(rootDir, 'dist/ignored-extra.risulua', 'require("ignored.extra")\n');

    const target = discoverRisuLuaBundleTarget({ rootDir, mode: 'modular' });
    const bundled = bundleRisuLuaModularGraph({ graph: resolveRisuLuaModularGraph({ target }) });
    const writeResult = writeRisuLuaDist({ target, bundled });
    const validation = validateRisuLuaDist({ target, selectedPaths: [target.distPath] });

    expect(writeResult.distPath).toBe(target.distPath);
    expect(writeResult.distRelativePath).toBe('dist/Dist_Module.risulua');
    expect(fs.existsSync(target.distPath)).toBe(true);
    expect(validation.distPath).toBe(target.distPath);
    expect(validation.distRelativePath).toBe('dist/Dist_Module.risulua');
    expect(validation.code).toBe(writeResult.code);
    expect(validation.code.startsWith(RISULUA_DIST_GENERATED_HEADER)).toBe(true);
    expect(validation.code).toContain('To re-modularize, use lua/main.risulua or legacy/original.risulua instead.');
    expect(validation.code.slice(RISULUA_DIST_GENERATED_HEADER.length)).toBe(bundled.code);
    expect(validation.code).toContain('local helpers = __risulua_loaders["common.helpers"]()');
  });

  it('risulua dist validator rejects missing expected dist', () => {
    const rootDir = createModularRoot('Missing Dist Module');
    writeLua(rootDir, 'main', 'return true\n');
    writeFile(rootDir, 'dist/other.risulua', 'return true\n');

    const target = discoverRisuLuaBundleTarget({ rootDir, mode: 'modular' });

    expectDistError(
      () => validateRisuLuaDist({ target }),
      'missing_dist',
      'Missing RisuLua modular dist',
    );
  });

  it('risulua dist validator rejects forbidden runtime loading', () => {
    const cases = [
      { symbol: 'require', code: 'local dependency = require("common.runtime")' },
      { symbol: 'package.path', code: 'package.path = package.path .. ";./?.lua"' },
      { symbol: 'package.cpath', code: 'package.cpath = "./?.so"' },
      { symbol: 'package.searchers', code: 'package.searchers = {}' },
      { symbol: 'package.loaders', code: 'package.loaders[1] = function() end' },
      { symbol: 'dofile', code: 'dofile("runtime.lua")' },
      { symbol: 'loadfile', code: 'loadfile("runtime.lua")' },
    ];

    for (const forbidden of cases) {
      const rootDir = createModularRoot(`Forbidden ${forbidden.symbol}`);
      writeLua(rootDir, 'main', 'return true\n');
      const target = discoverRisuLuaBundleTarget({ rootDir, mode: 'modular' });
      writeFile(rootDir, target.distRelativePath, `${RISULUA_DIST_GENERATED_HEADER}${forbidden.code}\n`);

      expectDistError(
        () => validateRisuLuaDist({ target }),
        'forbidden_output',
        forbidden.symbol,
      );
    }
  });

  it('risulua dist validator ignores forbidden words in comments and strings', () => {
    const rootDir = createModularRoot('Trivia Module');
    writeLua(rootDir, 'main', 'return true\n');
    const target = discoverRisuLuaBundleTarget({ rootDir, mode: 'modular' });
    writeFile(rootDir, target.distRelativePath, [
      RISULUA_DIST_GENERATED_HEADER,
      '-- require("fake") package.path = "x" dofile("x") loadfile("x")',
      'local text = "require package.path dofile loadfile"',
      'local block = [[package.cpath = "x" require("fake")]]',
      'function onOutput(data)',
      '  return data',
      'end',
    ].join('\n'));

    const validation = validateRisuLuaDist({ target });

    expect(validation.code).toContain('local text = "require package.path dofile loadfile"');
  });

  it('risulua dist validator rejects source lua module selection for modular pack', () => {
    const rootDir = createModularRoot('Selection Module');
    writeLua(rootDir, 'main', 'return true\n');
    const target = discoverRisuLuaBundleTarget({ rootDir, mode: 'modular' });
    writeRisuLuaDist({ target, bundled: 'return true\n' });

    expectDistError(
      () => validateRisuLuaDist({ target, selectedPaths: [path.join(rootDir, 'lua', 'main.risulua')] }),
      'source_path_selected',
      'not source module lua/main.risulua',
    );
  });

  it('risulua dist validator reports parse errors deterministically', () => {
    const rootDir = createModularRoot('Invalid Dist Module');
    writeLua(rootDir, 'main', 'return true\n');
    const target = discoverRisuLuaBundleTarget({ rootDir, mode: 'modular' });
    writeFile(rootDir, target.distRelativePath, `${RISULUA_DIST_GENERATED_HEADER}function broken(\n`);

    expectDistError(
      () => validateRisuLuaDist({ target }),
      'parse_error',
      `Failed to parse RisuLua modular dist ${target.distRelativePath}`,
    );
  });

  it('risulua dist validator allows warning-only local budget diagnostics', () => {
    for (const count of [180, 190]) {
      const rootDir = createModularRoot(`Local Budget ${count}`);
      writeLua(rootDir, 'main', 'return true\n');
      const target = discoverRisuLuaBundleTarget({ rootDir, mode: 'modular' });
      writeFile(rootDir, target.distRelativePath, `${RISULUA_DIST_GENERATED_HEADER}${buildTopLevelLocalChunk(count)}`);

      const diagnostics = analyzeRisuLuaDistOutput({
        code: fs.readFileSync(target.distPath, 'utf-8'),
        distPath: target.distPath,
        distRelativePath: target.distRelativePath,
      });

      expect(diagnostics).toMatchObject([
        { code: 'local_budget', severity: 'warning', localCount: count, symbol: 'local' },
      ]);
      expect(validateRisuLuaDist({ target }).code).toContain(`local v${String(count).padStart(3, '0')} = 1`);
    }
  });

  it('risulua dist validator rejects local budget hard-limit diagnostics', () => {
    const rootDir = createModularRoot('Local Budget Hard Limit');
    writeLua(rootDir, 'main', 'return true\n');
    const target = discoverRisuLuaBundleTarget({ rootDir, mode: 'modular' });
    writeFile(rootDir, target.distRelativePath, `${RISULUA_DIST_GENERATED_HEADER}${buildTopLevelLocalChunk(200)}`);

    expectDistError(
      () => validateRisuLuaDist({ target }),
      'local_budget',
      'declares 200 locals',
    );
  });
});

function expectDistError(action: () => unknown, code: string, messagePart: string): void {
  try {
    action();
    throw new Error(`Expected RisuLuaDistError with code ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(RisuLuaDistError);
    const distError = error as RisuLuaDistError;
    expect(distError.diagnostic.code).toBe(code);
    expect(distError.message).toContain(messagePart);
  }
}

function createModularRoot(name: string): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risulua-dist-validator-'));
  tempDirs.push(rootDir);
  writeFile(rootDir, '.risumodule', `${JSON.stringify({
    $schema: RISUMODULE_SCHEMA_URL,
    kind: RISUMODULE_KIND,
    schemaVersion: RISUMODULE_SCHEMA_VERSION,
    id: 'module-id',
    name,
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
  return `${Array.from({ length: count }, (_value, index) => `local v${String(index + 1).padStart(3, '0')} = 1`).join('\n')}\nreturn v001\n`;
}
