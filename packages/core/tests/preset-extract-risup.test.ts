import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
    expect(existsSync(path.join(outDir, 'AGENTS.md'))).toBe(true);
    expect(existsSync(path.join(outDir, 'docs', 'default-workspace-guide.md'))).toBe(true);
    expect(existsSync(path.join(outDir, 'docs', 'extensions', 'risuprompt.md'))).toBe(true);
    expect(existsSync(path.join(outDir, 'docs', 'reference', 'CBS_FOR_LLM.md'))).toBe(true);
    expect(existsSync(path.join(outDir, 'docs', 'reference', 'LUA_FOR_LLM.md'))).toBe(true);
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
    expect(
      readFileSync(path.join(outDir, 'prompt_template', 'Main_Prompt.risuprompt'), 'utf-8'),
    ).toContain('@@@ TEXT');
    expect(readFileSync(path.join(outDir, 'regex', 'cleanup.risuregex'), 'utf-8')).toContain(
      '@@@ OUT',
    );
    expect(readFileSync(path.join(outDir, 'toggle', 'prompt_template.risutoggle'), 'utf-8')).toBe(
      '<toggle>{{user}}</toggle>',
    );
  });

  it('extracts empty prompt template toggle scaffold when preset toggle is missing', () => {
    const outDir = mkdtempSync(path.join(tmpdir(), 'risu-core-preset-empty-toggle-'));
    tempDirs.push(outDir);

    const sourceDir = mkdtempSync(path.join(tmpdir(), 'risu-core-preset-empty-toggle-source-'));
    tempDirs.push(sourceDir);
    const sourcePath = path.join(sourceDir, 'preset.json');
    writeFileSync(
      sourcePath,
      `${JSON.stringify({ name: 'Preset Empty Toggle', mainPrompt: 'hello' }, null, 2)}\n`,
      'utf-8',
    );

    const code = runPresetExtractWorkflow([sourcePath, '--out', outDir]);

    expect(code).toBe(0);
    expect(readFileSync(path.join(outDir, 'toggle', 'prompt_template.risutoggle'), 'utf-8')).toBe('');
  });
});
