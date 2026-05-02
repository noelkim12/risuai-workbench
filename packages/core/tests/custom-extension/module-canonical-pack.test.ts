import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  runPackWorkflow,
  buildModuleFromCanonicalDirectory,
} from '../../src/cli/pack/module/workflow';
import {
  serializeLorebookContent,
  serializeLorebookOrder,
} from '../../src/domain/custom-extension/extensions/lorebook';
import { serializeRegexContent } from '../../src/domain/regex';
import { serializeVariableContent } from '../../src/domain/custom-extension/extensions/variable';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeRisumodule(partial: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    $schema: 'https://risuai-workbench.dev/schemas/risumodule.schema.json',
    kind: 'risu.module',
    schemaVersion: 1,
    id: 'module-id',
    name: 'workflow-module',
    description: 'canonical pack test',
    createdAt: null,
    modifiedAt: null,
    sourceFormat: 'json',
    ...partial,
  };
}

describe('module canonical pack workflow', () => {
  it('rebuilds module payload from canonical artifacts plus .risumodule', () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'module-canonical-pack-'));
    tempDirs.push(workDir);

    fs.writeFileSync(
      path.join(workDir, '.risumodule'),
      `${JSON.stringify(
        makeRisumodule({
          namespace: 'module.namespace',
          lowLevelAccess: true,
          hideIcon: false,
        }),
        null,
        2,
      )}\n`,
      'utf-8',
    );

    fs.mkdirSync(path.join(workDir, 'lorebooks'), { recursive: true });
    fs.writeFileSync(
      path.join(workDir, 'lorebooks', 'entry.risulorebook'),
      serializeLorebookContent({
        name: 'Lore Entry',
        comment: 'Reference-only lore metadata',
        mode: 'normal',
        constant: true,
        selective: false,
        insertion_order: 100,
        case_sensitive: false,
        use_regex: false,
        keys: ['alpha', 'beta'],
        secondary_keys: ['gamma'],
        content: 'Lore body',
      }),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(workDir, 'lorebooks', '_order.json'),
      serializeLorebookOrder(['entry.risulorebook']),
      'utf-8',
    );

    fs.mkdirSync(path.join(workDir, 'regex'), { recursive: true });
    fs.writeFileSync(
      path.join(workDir, 'regex', 'display_filter.risuregex'),
      serializeRegexContent({
        comment: 'display_filter',
        type: 'editdisplay',
        in: 'foo',
        out: 'bar',
      }),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(workDir, 'regex', '_order.json'),
      `${JSON.stringify(['display_filter.risuregex'], null, 2)}\n`,
      'utf-8',
    );

    fs.mkdirSync(path.join(workDir, 'lua'), { recursive: true });
    fs.writeFileSync(
      path.join(workDir, 'lua', 'workflow-module.risulua'),
      'function init()\n  return true\nend',
      'utf-8',
    );

    fs.mkdirSync(path.join(workDir, 'variables'), { recursive: true });
    fs.writeFileSync(
      path.join(workDir, 'variables', 'workflow-module.risuvar'),
      serializeVariableContent({
        hp: '100',
        mana: '50',
      }),
      'utf-8',
    );

    fs.mkdirSync(path.join(workDir, 'html'), { recursive: true });
    fs.writeFileSync(
      path.join(workDir, 'html', 'background.risuhtml'),
      '<style>.bg { color: red; }</style>',
      'utf-8',
    );

    fs.mkdirSync(path.join(workDir, 'toggle'), { recursive: true });
    fs.writeFileSync(
      path.join(workDir, 'toggle', 'workflow-module.risutoggle'),
      '<toggle>enabled</toggle>',
      'utf-8',
    );

    const outPath = path.join(workDir, 'packed-module.json');
    const exitCode = runPackWorkflow(['--in', workDir, '--out', outPath, '--format', 'json']);

    expect(exitCode).toBe(0);
    expect(fs.existsSync(outPath)).toBe(true);

    const payload = JSON.parse(fs.readFileSync(outPath, 'utf-8')) as {
      type: string;
      module: Record<string, unknown>;
    };

    expect(payload.type).toBe('risuModule');
    expect(payload.module).toMatchObject({
      name: 'workflow-module',
      description: 'canonical pack test',
      id: 'module-id',
      namespace: 'module.namespace',
      lowLevelAccess: true,
      hideIcon: false,
      defaultVariables: {
        hp: '100',
        mana: '50',
      },
      backgroundEmbedding: '<style>.bg { color: red; }</style>',
      customModuleToggle: '<toggle>enabled</toggle>',
    });
    expect(payload.module.trigger).toEqual([
      {
        comment: 'Canonical Lua Trigger',
        type: 'manual',
        conditions: [],
        effect: [
          {
            type: 'triggerlua',
            code: 'function init()\n  return true\nend',
          },
        ],
      },
    ]);
    expect(payload.module.regex).toEqual([
      {
        comment: 'display_filter',
        type: 'editdisplay',
        in: 'foo',
        out: 'bar',
      },
    ]);
    expect(payload.module.lorebook).toEqual([
      {
        key: 'alpha, beta',
        secondkey: 'gamma',
        comment: 'Lore Entry',
        content: 'Lore body',
        mode: 'normal',
        alwaysActive: true,
        selective: false,
        insertorder: 100,
        useRegex: false,
        extentions: {
          risu_case_sensitive: false,
        },
      },
    ]);
  });

  it('rejects .risumodule containing customModuleToggle', () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'module-canonical-pack-marker-toggle-'));
    tempDirs.push(workDir);

    fs.writeFileSync(
      path.join(workDir, '.risumodule'),
      `${JSON.stringify(
        makeRisumodule({ customModuleToggle: '<toggle>marker</toggle>' }),
        null,
        2,
      )}\n`,
      'utf-8',
    );

    fs.mkdirSync(path.join(workDir, 'toggle'), { recursive: true });
    fs.writeFileSync(
      path.join(workDir, 'toggle', 'workflow-module.risutoggle'),
      '<toggle>file</toggle>',
      'utf-8',
    );

    const outPath = path.join(workDir, 'packed-module.json');
    const exitCode = runPackWorkflow(['--in', workDir, '--out', outPath, '--format', 'json']);

    expect(exitCode).toBe(1);
    expect(fs.existsSync(outPath)).toBe(false);
    expect(() => buildModuleFromCanonicalDirectory(workDir)).toThrow(/customModuleToggle.*toggle\/\*\.risutoggle/);
  });

  it('fails when only metadata.json exists and .risumodule is missing', () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'module-canonical-pack-meta-only-'));
    tempDirs.push(workDir);

    fs.writeFileSync(
      path.join(workDir, 'metadata.json'),
      `${JSON.stringify({ name: 'legacy-module', id: 'legacy-id' }, null, 2)}\n`,
      'utf-8',
    );

    const outPath = path.join(workDir, 'packed-module.json');
    const exitCode = runPackWorkflow(['--in', workDir, '--out', outPath, '--format', 'json']);

    expect(exitCode).toBe(1);
    expect(fs.existsSync(outPath)).toBe(false);
    expect(() => buildModuleFromCanonicalDirectory(workDir)).toThrow('Missing .risumodule');
  });

  it('ignores metadata.json when both .risumodule and metadata.json exist', () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'module-canonical-pack-both-files-'));
    tempDirs.push(workDir);

    fs.writeFileSync(
      path.join(workDir, '.risumodule'),
      `${JSON.stringify(
        makeRisumodule({
          name: 'risumodule-name',
          description: 'risumodule-desc',
          id: 'risumodule-id',
          namespace: 'risumodule.ns',
        }),
        null,
        2,
      )}\n`,
      'utf-8',
    );

    fs.writeFileSync(
      path.join(workDir, 'metadata.json'),
      `${JSON.stringify({
        name: 'metadata-name',
        description: 'metadata-desc',
        id: 'metadata-id',
        namespace: 'metadata.ns',
      }, null, 2)}\n`,
      'utf-8',
    );

    const outPath = path.join(workDir, 'packed-module.json');
    const exitCode = runPackWorkflow(['--in', workDir, '--out', outPath, '--format', 'json']);

    expect(exitCode).toBe(0);
    expect(fs.existsSync(outPath)).toBe(true);

    const payload = JSON.parse(fs.readFileSync(outPath, 'utf-8')) as {
      type: string;
      module: Record<string, unknown>;
    };

    expect(payload.type).toBe('risuModule');
    expect(payload.module.name).toBe('risumodule-name');
    expect(payload.module.description).toBe('risumodule-desc');
    expect(payload.module.id).toBe('risumodule-id');
    expect(payload.module.namespace).toBe('risumodule.ns');
  });

  it('fails on invalid .risumodule JSON', () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'module-canonical-pack-invalid-json-'));
    tempDirs.push(workDir);

    fs.writeFileSync(path.join(workDir, '.risumodule'), '{ broken json', 'utf-8');

    const outPath = path.join(workDir, 'packed-module.json');
    const exitCode = runPackWorkflow(['--in', workDir, '--out', outPath, '--format', 'json']);

    expect(exitCode).toBe(1);
    expect(fs.existsSync(outPath)).toBe(false);
    expect(() => buildModuleFromCanonicalDirectory(workDir)).toThrow('Invalid .risumodule JSON');
  });

  it('fails on wrong .risumodule kind', () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'module-canonical-pack-wrong-kind-'));
    tempDirs.push(workDir);

    fs.writeFileSync(
      path.join(workDir, '.risumodule'),
      `${JSON.stringify(makeRisumodule({ kind: 'wrong.kind' }), null, 2)}\n`,
      'utf-8',
    );

    const outPath = path.join(workDir, 'packed-module.json');
    const exitCode = runPackWorkflow(['--in', workDir, '--out', outPath, '--format', 'json']);

    expect(exitCode).toBe(1);
    expect(fs.existsSync(outPath)).toBe(false);
    expect(() => buildModuleFromCanonicalDirectory(workDir)).toThrow(/kind.*risu\.module/);
  });

  it('fails on unsupported .risumodule schemaVersion', () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'module-canonical-pack-bad-version-'));
    tempDirs.push(workDir);

    fs.writeFileSync(
      path.join(workDir, '.risumodule'),
      `${JSON.stringify(makeRisumodule({ schemaVersion: 99 }), null, 2)}\n`,
      'utf-8',
    );

    const outPath = path.join(workDir, 'packed-module.json');
    const exitCode = runPackWorkflow(['--in', workDir, '--out', outPath, '--format', 'json']);

    expect(exitCode).toBe(1);
    expect(fs.existsSync(outPath)).toBe(false);
    expect(() => buildModuleFromCanonicalDirectory(workDir)).toThrow(/schemaVersion.*1/);
  });
});
