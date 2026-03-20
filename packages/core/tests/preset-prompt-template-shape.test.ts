import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('preset prompt_template extraction shape', () => {
  it('preserves full prompt item fields as item-level JSON artifacts', () => {
    const workDir = mkdtempSync(path.join(tmpdir(), 'risu-core-preset-template-'));
    tempDirs.push(workDir);

    const inputPath = path.join(workDir, 'preset.json');
    const outDir = path.join(workDir, 'out');
    mkdirSync(outDir, { recursive: true });

    writeFileSync(
      inputPath,
      `${JSON.stringify(
        {
          name: 'Prompt Shape Test',
          apiType: 'openai',
          temperature: 80,
          promptTemplate: [
            {
              name: '# System Rule',
              type: 'plain',
              type2: 'main',
              text: 'System text here',
              role: 'system',
            },
            {
              name: 'Recent chat',
              type: 'chat',
              rangeStart: -2,
              rangeEnd: 'end',
              chatAsOriginalOnSystem: true,
            },
            {
              name: 'Memory wrapper',
              type: 'memory',
              innerFormat: '<memory>{{slot}}</memory>',
            },
          ],
        },
        null,
        2,
      )}\n`,
      'utf-8',
    );

    const result = spawnSync(
      'node',
      [path.join(process.cwd(), 'dist', 'cli', 'main.js'), 'extract', inputPath, '--out', outDir],
      {
        cwd: process.cwd(),
        encoding: 'utf-8',
      },
    );

    expect(result.status, result.stderr || result.stdout).toBe(0);

    const order = JSON.parse(readFileSync(path.join(outDir, 'prompt_template', '_order.json'), 'utf-8'));
    expect(order).toEqual([
      'System_Rule.json',
      'Recent_chat.json',
      'Memory_wrapper.json',
    ]);

    const first = JSON.parse(readFileSync(path.join(outDir, 'prompt_template', 'System_Rule.json'), 'utf-8'));
    expect(first).toEqual({
      name: '# System Rule',
      type: 'plain',
      type2: 'main',
      text: 'System text here',
      role: 'system',
    });

    const second = JSON.parse(readFileSync(path.join(outDir, 'prompt_template', 'Recent_chat.json'), 'utf-8'));
    expect(second).toEqual({
      name: 'Recent chat',
      type: 'chat',
      rangeStart: -2,
      rangeEnd: 'end',
      chatAsOriginalOnSystem: true,
    });

    const third = JSON.parse(readFileSync(path.join(outDir, 'prompt_template', 'Memory_wrapper.json'), 'utf-8'));
    expect(third).toEqual({
      name: 'Memory wrapper',
      type: 'memory',
      innerFormat: '<memory>{{slot}}</memory>',
    });
  });
});
