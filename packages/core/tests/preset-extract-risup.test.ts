import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runExtractWorkflow as runPresetExtractWorkflow } from '../src/cli/extract/preset/workflow';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('preset extract binary risup integration', () => {
  it('extracts real .risup samples from test_cases/preset', () => {
    const workspaceRoot = path.resolve(process.cwd(), '..', '..', '..');
    const samples = [
      path.join(workspaceRoot, 'test_cases', 'preset', 'New Preset_preset.risup'),
      path.join(
        workspaceRoot,
        'test_cases',
        'preset',
        '😈소악마 프롬프트 v14-6 [Gem3.1]_preset.risup',
      ),
    ];

    for (const sample of samples) {
      const outDir = mkdtempSync(path.join(tmpdir(), 'risu-core-preset-'));
      tempDirs.push(outDir);

      const code = runPresetExtractWorkflow([sample, '--out', outDir]);

      expect(code).toBe(0);
      expect(existsSync(path.join(outDir, 'preset.json'))).toBe(false);
      expect(existsSync(path.join(outDir, 'metadata.json'))).toBe(true);

      const metadata = JSON.parse(readFileSync(path.join(outDir, 'metadata.json'), 'utf-8'));
      expect(typeof metadata.name).toBe('string');
      expect(metadata.name.length).toBeGreaterThan(0);
      expect(['risuai', 'nai', 'sillytavern', 'unknown']).toContain(metadata.preset_type);

      const promptTemplateDir = path.join(outDir, 'prompt_template');
      if (existsSync(promptTemplateDir)) {
        for (const entry of readdirSync(promptTemplateDir)) {
          if (entry === '_order.json') continue;
          expect(entry.endsWith('.risuprompt')).toBe(true);
        }
      }

      const regexDir = path.join(outDir, 'regex');
      if (existsSync(regexDir)) {
        for (const entry of readdirSync(regexDir)) {
          if (entry === '_order.json') continue;
          expect(entry.endsWith('.risuregex')).toBe(true);
        }
      }
    }
  });

  it('extracts canonical preset artifacts without preset.json duplication', () => {
    const outDir = mkdtempSync(path.join(tmpdir(), 'risu-core-preset-toggle-'));
    tempDirs.push(outDir);

    const sourceDir = mkdtempSync(path.join(tmpdir(), 'risu-core-preset-source-'));
    tempDirs.push(sourceDir);
    const sourcePath = path.join(sourceDir, 'preset.json');
    writeFileSync(
      sourcePath,
      `${JSON.stringify(
        {
          name: 'Preset Toggle Sample',
          mainPrompt: 'hello',
          jailbreak: 'break glass',
          promptTemplate: [
            {
              name: 'Main Prompt',
              type: 'plain',
              type2: 'main',
              role: 'system',
              text: 'Hello {{getvar::persona}}',
            },
          ],
          regex: [
            {
              comment: 'cleanup',
              type: 'editoutput',
              in: 'foo',
              out: '{{setvar::tone::calm}}',
            },
          ],
          customPromptTemplateToggle: '<toggle>{{user}}</toggle>',
        },
        null,
        2,
      )}\n`,
      'utf-8',
    );

    const code = runPresetExtractWorkflow([sourcePath, '--out', outDir]);

    expect(code).toBe(0);
    expect(existsSync(path.join(outDir, 'preset.json'))).toBe(false);
    expect(existsSync(path.join(outDir, 'instruct_settings.json'))).toBe(false);
    expect(existsSync(path.join(outDir, 'prompt_template', '_order.json'))).toBe(true);
    expect(existsSync(path.join(outDir, 'prompt_template', 'Main_Prompt.risuprompt'))).toBe(true);
    expect(existsSync(path.join(outDir, 'regex', '_order.json'))).toBe(true);
    expect(existsSync(path.join(outDir, 'regex', 'cleanup.risuregex'))).toBe(true);
    expect(existsSync(path.join(outDir, 'toggle', 'prompt_template.risutoggle'))).toBe(true);
    expect(
      JSON.parse(readFileSync(path.join(outDir, 'prompt_template', '_order.json'), 'utf-8')),
    ).toEqual(['Main_Prompt.risuprompt']);
    expect(readFileSync(path.join(outDir, 'prompt_template', 'Main_Prompt.risuprompt'), 'utf-8')).toContain(
      '@@@ TEXT',
    );
    expect(readFileSync(path.join(outDir, 'regex', 'cleanup.risuregex'), 'utf-8')).toContain(
      '@@@ OUT',
    );
    expect(readFileSync(path.join(outDir, 'toggle', 'prompt_template.risutoggle'), 'utf-8')).toBe(
      '<toggle>{{user}}</toggle>',
    );
  });
});
