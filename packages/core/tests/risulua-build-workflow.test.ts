import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildRisuLuaModularDist,
  runBuildWorkflow,
} from '../src/cli/build/workflow';
import {
  decodeRisuLuaRecoveryBlock,
  RISULUA_DIST_GENERATED_HEADER,
  hasExecutableRequireCalls,
  removeRisuLuaRecoveryBlock,
} from '../src/cli/shared';
import {
  RISUMODULE_KIND,
  RISUMODULE_SCHEMA_URL,
  RISUMODULE_SCHEMA_VERSION,
} from '../src/cli/shared/risumodule';

const tempDirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('risulua build workflow', () => {
  it('risulua build workflow writes dist', () => {
    const rootDir = createWorkspace('Build Workflow Module');
    writeLua(rootDir, 'main', [
      'local helper = require("common.helper")',
      '',
      'function onOutput(data)',
      '  return helper.decorate(data)',
      'end',
    ].join('\n'));
    writeLua(rootDir, 'common/helper', [
      'return {',
      '  decorate = function(data) return "built:" .. tostring(data) end',
      '}',
    ].join('\n'));

    const logs = spyConsole();
    const status = runBuildWorkflow(['--risulua-mode', 'modular', '--in', rootDir]);
    const distPath = path.join(rootDir, 'dist', 'Build_Workflow_Module.risulua');
    const dist = fs.readFileSync(distPath, 'utf-8');

    expect(status).toBe(0);
    expect(dist.startsWith(RISULUA_DIST_GENERATED_HEADER)).toBe(true);
    expect(dist).toContain('decorate = function(data) return "built:" .. tostring(data) end');
    expect(dist).toContain('local helper = __risulua_loaders["common.helper"]()');
    expect(hasExecutableRequireCalls(dist)).toBe(false);
    expect(joinedLogs(logs)).toContain('RisuLua Modular Dist Builder');
    expect(joinedLogs(logs)).toContain('- entry           : lua/main.risulua');
    expect(joinedLogs(logs)).toContain('- dist            : dist/Build_Workflow_Module.risulua');
    expect(joinedLogs(logs)).toContain(`- dist absolute   : ${distPath}`);
  });

  it('risulua build workflow exposes reusable modular dist builder metadata', () => {
    const rootDir = createWorkspace('Reusable Builder Module');
    writeLua(rootDir, 'main', 'function onStart() return true end\n');

    const result = buildRisuLuaModularDist({ rootDir });

    expect(result.summary.rootDir).toBe(rootDir);
    expect(result.summary.entryRelativePath).toBe('lua/main.risulua');
    expect(result.summary.distRelativePath).toBe('dist/Reusable_Builder_Module.risulua');
    expect(result.summary.moduleCount).toBe(1);
    expect(result.summary.edgeCount).toBe(0);
    expect(result.writeResult.distPath).toBe(result.validation.distPath);
    expect(fs.existsSync(result.summary.distPath)).toBe(true);
  });

  it('modular build embeds full-source recovery manifest when requested', () => {
    const rootDir = createWorkspace('Recovery Builder Module');
    writeLua(rootDir, 'main', [
      'local helper = require("common.helper")',
      '',
      'function onOutput(data)',
      '  return helper.decorate(data)',
      'end',
    ].join('\n'));
    writeLua(rootDir, 'common/helper', [
      'return {',
      '  decorate = function(data) return "recovered:" .. tostring(data) end',
      '}',
    ].join('\n'));

    const result = buildRisuLuaModularDist({ rootDir, recovery: 'full-source' });
    const manifest = decodeRisuLuaRecoveryBlock(result.validation.code);
    const strippedCode = removeRisuLuaRecoveryBlock(result.validation.code);

    expect(manifest).not.toBeNull();
    expect(manifest?.manifest.files.map((file) => file.path)).toEqual([
      'lua/common/helper.risulua',
      'lua/main.risulua',
    ]);
    expect(strippedCode).toContain('local helper = __risulua_loaders["common.helper"]()');
    expect(strippedCode).toContain('decorate = function(data) return "recovered:" .. tostring(data) end');
  });

  it('modular build omits recovery manifest by default', () => {
    const rootDir = createWorkspace('Default Recovery Omitted Module');
    writeLua(rootDir, 'main', 'function onStart() return true end\n');

    const result = buildRisuLuaModularDist({ rootDir });

    expect(decodeRisuLuaRecoveryBlock(result.validation.code)).toBeNull();
    expect(removeRisuLuaRecoveryBlock(result.validation.code)).toBe(result.validation.code);
  });

  it('component build workflow remains unchanged by default mode', () => {
    const rootDir = createWorkspace('Default Component Module');
    writeComponentInputs(rootDir);

    const logs = spyConsole();
    const status = runBuildWorkflow(['--in', rootDir]);

    expect(status).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(rootDir, 'regexscript_export.json'), 'utf-8'))).toEqual({
      type: 'regex',
      data: [{ comment: 'rx one', in: 'hello', out: 'world', type: 'editprocess', ableFlag: true }],
    });
    expect(JSON.parse(fs.readFileSync(path.join(rootDir, 'lorebook_export.json'), 'utf-8'))).toMatchObject({
      type: 'risu',
      ver: 1,
      data: [expect.objectContaining({ key: 'alpha', comment: 'lore one', content: 'body' })],
    });
    expect(fs.existsSync(path.join(rootDir, 'dist', 'Default_Component_Module.risulua'))).toBe(false);
    expect(joinedLogs(logs)).toContain('RisuAI Component Builder');
    expect(joinedLogs(logs)).not.toContain('RisuLua Modular Dist Builder');
  });

  it('component build workflow remains unchanged with classic mode stripped', () => {
    const rootDir = createWorkspace('Classic Component Module');
    writeComponentInputs(rootDir);
    writeLua(rootDir, 'Classic_Component_Module', '-- classic single file remains untouched\n');

    const status = runBuildWorkflow(['--risulua-mode', 'classic', '--in', rootDir]);

    expect(status).toBe(0);
    expect(fs.existsSync(path.join(rootDir, 'regexscript_export.json'))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, 'lorebook_export.json'))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, 'dist', 'Classic_Component_Module.risulua'))).toBe(false);
  });
});

function createWorkspace(name: string): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risulua-build-workflow-'));
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

function writeComponentInputs(rootDir: string): void {
  writeFile(rootDir, 'regex/one.json', `${JSON.stringify({
    comment: 'rx one',
    in: 'hello',
    out: 'world',
    type: 'editprocess',
    ableFlag: true,
  }, null, 2)}\n`);
  writeFile(rootDir, 'lorebooks/one.json', `${JSON.stringify({
    key: 'alpha',
    comment: 'lore one',
    content: 'body',
    mode: 'normal',
    alwaysActive: true,
  }, null, 2)}\n`);
}

function writeLua(rootDir: string, modulePath: string, content: string): void {
  writeFile(rootDir, `lua/${modulePath}.risulua`, content);
}

function writeFile(rootDir: string, relativePath: string, content: string): void {
  const absolutePath = path.join(rootDir, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, 'utf-8');
}

function spyConsole(): { logs: string[]; errors: string[]; warnings: string[] } {
  const output = { logs: [] as string[], errors: [] as string[], warnings: [] as string[] };
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    output.logs.push(args.map(String).join(' '));
  });
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    output.errors.push(args.map(String).join(' '));
  });
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    output.warnings.push(args.map(String).join(' '));
  });
  return output;
}

function joinedLogs(output: { logs: string[]; errors: string[]; warnings: string[] }): string {
  return [...output.logs, ...output.errors, ...output.warnings].join('\n');
}
