import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runPackWorkflow } from '../../src/cli/pack/module/workflow';
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

describe('module canonical pack workflow', () => {
  it('rebuilds module payload from canonical artifacts plus metadata.json', () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'module-canonical-pack-'));
    tempDirs.push(workDir);

    fs.writeFileSync(
      path.join(workDir, 'metadata.json'),
      `${JSON.stringify(
        {
          name: 'workflow-module',
          description: 'canonical pack test',
          id: 'module-id',
          namespace: 'module.namespace',
          lowLevelAccess: true,
          hideIcon: false,
        },
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
        comment: 'Lore Entry',
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
      triggerscript: 'function init()\n  return true\nend',
      defaultVariables: {
        hp: '100',
        mana: '50',
      },
      backgroundEmbedding: '<style>.bg { color: red; }</style>',
      customModuleToggle: '<toggle>enabled</toggle>',
    });
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

  it('rejects duplicate toggle ownership when metadata.json and .risutoggle both provide customModuleToggle', () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'module-canonical-pack-dup-toggle-'));
    tempDirs.push(workDir);

    fs.writeFileSync(
      path.join(workDir, 'metadata.json'),
      `${JSON.stringify(
        {
          name: 'workflow-module',
          description: 'duplicate toggle test',
          id: 'module-id',
          customModuleToggle: '<toggle>metadata</toggle>',
        },
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
  });
});
