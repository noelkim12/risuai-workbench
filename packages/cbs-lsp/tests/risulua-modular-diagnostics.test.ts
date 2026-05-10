import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';

import { afterEach, describe, expect, it } from 'vitest';

import { DiagnosticCode } from '../src/analyzer/diagnostics/taxonomy';
import {
  collectRisuLuaModularDiagnostics,
  getRisuLuaGeneratedDistMetadata,
} from '../src/analyzer/diagnostics/risulua-modular-diagnostics';
import { buildRisuLuaModuleIdCompletions } from '../src/features/completion/risulua-module-completion';

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('risulua modular diagnostics', () => {
  it('risulua modular diagnostics forbidden patterns', async () => {
    const root = await createWorkspace('modular');
    const source = [
      'local dynamicName = "common"',
      'local a = require(dynamicName)',
      'local b = require("common." .. dynamicName)',
      'local invalidPath = require("common/utils")',
      'local invalidSuffix = require("common.utils.risulua")',
      'package.path = package.path .. ";./?.lua"',
      'package.cpath = "./?.so"',
      'package.searchers[1] = function() end',
      'package.loaders = {}',
      'dofile("legacy.lua")',
      'loadfile("legacy.lua")',
      'local require = customRequire',
      'require = customRequire',
      'local alias = require',
      '-- require(dynamicComment) package.path = "ignored" dofile("ignored.lua")',
      'local ignored = "require(dynamicString) package.cpath = ignored loadfile(ignored)"',
    ].join('\n');
    const filePath = await writeLua(root, 'main.risulua', source);

    const diagnostics = collectRisuLuaModularDiagnostics(filePath, source).map(normalizeDiagnostic);

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      DiagnosticCode.RisuLuaDynamicRequire,
      DiagnosticCode.RisuLuaDynamicRequire,
      DiagnosticCode.RisuLuaInvalidRequire,
      DiagnosticCode.RisuLuaInvalidRequire,
      DiagnosticCode.RisuLuaPackageLoaderMutation,
      DiagnosticCode.RisuLuaPackageLoaderMutation,
      DiagnosticCode.RisuLuaPackageLoaderMutation,
      DiagnosticCode.RisuLuaPackageLoaderMutation,
      DiagnosticCode.RisuLuaForbiddenRuntimeLoad,
      DiagnosticCode.RisuLuaForbiddenRuntimeLoad,
      DiagnosticCode.RisuLuaRequireBindingMutation,
      DiagnosticCode.RisuLuaRequireBindingMutation,
      DiagnosticCode.RisuLuaRequireBindingMutation,
    ]);
    expect(diagnostics.every((diagnostic) => diagnostic.source === 'risulua-modular')).toBe(true);
    expect(diagnostics.every((diagnostic) => diagnostic.message.includes('RisuLua modular mode'))).toBe(true);
    expect(diagnostics.map((diagnostic) => diagnostic.message).join('\n')).not.toContain('dynamicComment');
    expect(diagnostics.map((diagnostic) => diagnostic.message).join('\n')).not.toContain('dynamicString');
  });

  it('risulua classic diagnostics quiet', async () => {
    const source = [
      'local dynamicName = "common"',
      'local a = require(dynamicName)',
      'local b = require("common." .. dynamicName)',
      'local invalidPath = require("common/utils")',
      'package.path = package.path .. ";./?.lua"',
      'package.cpath = "./?.so"',
      'package.searchers[1] = function() end',
      'dofile("legacy.lua")',
      'loadfile("legacy.lua")',
    ].join('\n');
    const classicRoot = await createWorkspace('classic');
    const filePath = await writeLua(classicRoot, 'Classic_Module.risulua', source);

    const diagnostics = collectRisuLuaModularDiagnostics(filePath, source);

    expect(diagnostics.filter((diagnostic) => String(diagnostic.code).startsWith('RISULUA'))).toEqual([]);
  });

  it('risulua modular diagnostics parse errors skip forbidden scan', async () => {
    const root = await createWorkspace('modular');
    const source = 'local value = (\nrequire(dynamicName)\npackage.path = "./?.lua"';
    const filePath = await writeLua(root, 'main.risulua', source);

    const diagnostics = collectRisuLuaModularDiagnostics(filePath, source).map(normalizeDiagnostic);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: DiagnosticCode.RisuLuaParseError,
      source: 'risulua-modular',
    });
    expect(diagnostics[0]?.message).toContain('RisuLua modular mode');
    expect(diagnostics[0]?.message).not.toContain('Lua syntax error');
  });

  it('risulua modular diagnostics allow unicode comments and strings', async () => {
    const root = await createWorkspace('modular');
    const source = [
      '-- 컵케익모듈: 새 메시지 전송 시 실행',
      'local dice = require("common.dice")',
      'print("[dice 시스템] ✓ 모드 활성화됨")',
      'return dice',
    ].join('\n');
    const filePath = await writeLua(root, 'main.risulua', source);

    const diagnostics = collectRisuLuaModularDiagnostics(filePath, source);

    expect(diagnostics.filter((diagnostic) => diagnostic.code === DiagnosticCode.RisuLuaParseError)).toEqual([]);
  });

  it('risulua modular diagnostics fallback stays quiet when marker discovery fails', async () => {
    const source = 'require(dynamicName)\npackage.path = "./?.lua"\ndofile("legacy.lua")';
    const noMarkerRoot = await createWorkspace('no-marker');
    const badMarkerRoot = await createWorkspace('bad-marker');
    const noMarkerPath = await writeLua(noMarkerRoot, 'main.risulua', source);
    const badMarkerPath = await writeLua(badMarkerRoot, 'main.risulua', source);

    expect(collectRisuLuaModularDiagnostics(noMarkerPath, source)).toEqual([]);
    expect(collectRisuLuaModularDiagnostics(badMarkerPath, source)).toEqual([]);
  });

  it('risulua modular diagnostics do not diagnose generated dist files as authored source', async () => {
    const root = await createWorkspace('modular');
    const source = 'require(dynamicName)\npackage.path = "./?.lua"\nloadfile("legacy.lua")';
    const distPath = path.join(root, 'dist', 'Demo_Module.risulua');
    await mkdir(path.dirname(distPath), { recursive: true });
    await writeFile(distPath, source, 'utf8');

    expect(collectRisuLuaModularDiagnostics(distPath, source)).toEqual([]);
    expect(getRisuLuaGeneratedDistMetadata(distPath)).toMatchObject({
      distPath,
      targetName: 'Demo_Module',
    });
  });

  it('risulua module completion suggests dot ids', async () => {
    const root = await createWorkspace('modular');
    await writeLua(root, 'common/variables.risulua', 'return {}');
    await writeLua(root, 'common/orphan.risulua', 'return {}');
    await writeLua(root, 'main.risulua', 'local variables = require("');
    await mkdir(path.join(root, 'dist'), { recursive: true });
    await writeFile(path.join(root, 'dist', 'generated.risulua'), 'return {}', 'utf8');
    const source = 'local variables = require("common';
    const filePath = await writeLua(root, 'feature.risulua', source);

    const completions = buildRisuLuaModuleIdCompletions({
      params: {
        textDocument: { uri: `file://${filePath}` },
        position: { line: 0, character: source.length },
      },
      request: {
        uri: `file://${filePath}`,
        version: 1,
        filePath,
        text: source,
      },
    });

    expect(completions.map((completion) => completion.label)).toEqual([
      'common.orphan',
      'common.variables',
    ]);
  });

  it('risulua module completion excludes main and dist generated files', async () => {
    const root = await createWorkspace('modular');
    await writeLua(root, 'common/variables.risulua', 'return {}');
    await writeLua(root, 'dist/ignored.risulua', 'return {}');
    await mkdir(path.join(root, 'dist'), { recursive: true });
    await writeFile(path.join(root, 'dist', 'Demo_Module.risulua'), 'return {}', 'utf8');
    const source = 'require("';
    const filePath = await writeLua(root, 'main.risulua', source);

    const completions = buildRisuLuaModuleIdCompletions({
      params: {
        textDocument: { uri: `file://${filePath}` },
        position: { line: 0, character: source.length },
      },
      request: {
        uri: `file://${filePath}`,
        version: 1,
        filePath,
        text: source,
      },
    });

    expect(completions.map((completion) => completion.label)).toEqual(['common.variables']);
  });

  it('risulua modular graph diagnostics missing module', async () => {
    const root = await createWorkspace('modular');
    const source = 'local missing = require("common.missing")';
    const filePath = await writeLua(root, 'main.risulua', source);

    const diagnostics = collectRisuLuaModularDiagnostics(filePath, source).map(normalizeDiagnostic);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: DiagnosticCode.RisuLuaMissingModule,
      range: {
        start: { line: 0, character: 25 },
        end: { line: 0, character: 39 },
      },
    });
  });

  it('risulua modular graph diagnostics cycles', async () => {
    const root = await createWorkspace('modular');
    await writeLua(root, 'a.risulua', 'local b = require("b")');
    await writeLua(root, 'b.risulua', 'local a = require("a")');
    const source = 'local a = require("a")';
    const filePath = await writeLua(root, 'main.risulua', source);

    const diagnostics = collectRisuLuaModularDiagnostics(filePath, source).map(normalizeDiagnostic);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: DiagnosticCode.RisuLuaDependencyCycle,
      range: {
        start: { line: 0, character: 19 },
        end: { line: 0, character: 20 },
      },
    });
    expect(diagnostics[0]?.message).toContain('a -> b -> a');
  });
});

async function createWorkspace(mode: 'bad-marker' | 'classic' | 'modular' | 'no-marker'): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cbs-lsp-risulua-modular-'));
  tempRoots.push(root);
  await mkdir(path.join(root, 'lua'), { recursive: true });

  if (mode === 'modular' || mode === 'classic') {
    await writeFile(path.join(root, '.risumodule'), JSON.stringify({
      kind: 'risu.module',
      schemaVersion: 1,
      id: 'demo-module',
      name: mode === 'classic' ? 'Classic Module' : 'Demo Module',
      description: '',
      createdAt: null,
      modifiedAt: null,
      sourceFormat: 'scaffold',
    }), 'utf8');
  }

  if (mode === 'bad-marker') {
    await writeFile(path.join(root, '.risumodule'), '{"kind":"wrong","name":"Broken"}', 'utf8');
  }

  if (mode === 'modular' || mode === 'bad-marker' || mode === 'no-marker') {
    await writeFile(path.join(root, 'lua', 'main.risulua'), 'return true', 'utf8');
  }

  return root;
}

async function writeLua(root: string, relativeLuaPath: string, source: string): Promise<string> {
  const filePath = path.join(root, 'lua', ...relativeLuaPath.split('/'));
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, source, 'utf8');
  return filePath;
}

function normalizeDiagnostic(diagnostic: ReturnType<typeof collectRisuLuaModularDiagnostics>[number]) {
  return {
    code: String(diagnostic.code),
    message: diagnostic.message,
    range: diagnostic.range,
    severity: diagnostic.severity ?? null,
    source: diagnostic.source ?? null,
  };
}
