import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectPresetSources } from '@/cli/analyze/preset/collectors';
import { runAnalyzePresetWorkflow } from '@/cli/analyze/preset/workflow';
import { runExtractWorkflow as runPresetExtractWorkflow } from '@/cli/extract/preset/workflow';

describe('preset analyze collectors and workflow', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preset-analyze-'));

    fs.mkdirSync(path.join(tempDir, 'prompts'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'prompts', 'main.txt'),
      'You are {{getvar::persona}}. Respond in {{getvar::lang}}.',
      'utf-8',
    );
    fs.writeFileSync(
      path.join(tempDir, 'prompts', 'jailbreak.txt'),
      '{{setvar::tone::sharp}}',
      'utf-8',
    );

    fs.mkdirSync(path.join(tempDir, 'prompt_template'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'prompt_template', '_order.json'),
      `${JSON.stringify(['system.json'], null, 2)}\n`,
      'utf-8',
    );
    fs.writeFileSync(
      path.join(tempDir, 'prompt_template', 'system.json'),
      `${JSON.stringify({ name: 'system', text: '{{setvar::lang::ko}}', type: 'plain' }, null, 2)}\n`,
      'utf-8',
    );

    fs.mkdirSync(path.join(tempDir, 'regex'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'regex', '_order.json'),
      `${JSON.stringify(['post.json'], null, 2)}\n`,
      'utf-8',
    );
    fs.writeFileSync(
      path.join(tempDir, 'regex', 'post.json'),
      `${JSON.stringify(
        {
          comment: 'post',
          in: '{{getvar::lang}}',
          out: '{{setvar::persona::guide}}',
        },
        null,
        2,
      )}\n`,
      'utf-8',
    );

    fs.writeFileSync(
      path.join(tempDir, 'preset.json'),
      `${JSON.stringify({ name: 'test_preset', description: 'test preset' }, null, 2)}\n`,
      'utf-8',
    );
    fs.writeFileSync(
      path.join(tempDir, 'model.json'),
      `${JSON.stringify({ apiType: 'openai', model: 'gpt-4.1' }, null, 2)}\n`,
      'utf-8',
    );
    fs.writeFileSync(
      path.join(tempDir, 'parameters.json'),
      `${JSON.stringify({ temperature: 0.7, maxContext: 8000 }, null, 2)}\n`,
      'utf-8',
    );
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('collects prompt sources from extracted preset directory', () => {
    const result = collectPresetSources(tempDir);
    expect(result.prompts.map((prompt) => prompt.name)).toContain('main');
    expect(result.prompts.find((prompt) => prompt.name === 'main')?.reads.has('persona')).toBe(true);
  });

  it('collects prompt template sources', () => {
    const result = collectPresetSources(tempDir);
    expect(result.promptTemplates.length).toBeGreaterThan(0);
    expect(result.promptTemplates[0]?.writes.has('lang')).toBe(true);
  });

  it('collects regex/model/parameter data from extracted preset directory', () => {
    const result = collectPresetSources(tempDir);
    expect(result.regexCBS[0]?.writes.has('persona')).toBe(true);
    expect(result.model?.model).toBe('gpt-4.1');
    expect(result.parameters?.maxContext).toBe(8000);
  });

  it('writes preset analysis markdown report', () => {
    const code = runAnalyzePresetWorkflow([tempDir]);
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(tempDir, 'analysis', 'preset-analysis.md'))).toBe(true);
  });

  it('writes preset analysis html report', () => {
    const code = runAnalyzePresetWorkflow([tempDir]);
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(tempDir, 'analysis', 'preset-analysis.html'))).toBe(true);
  });

  it('runs preset-wide analysis automatically after extract', () => {
    const sourcePath = path.join(tempDir, 'preset-source.json');
    const outDir = path.join(tempDir, 'extracted-preset');

    fs.writeFileSync(
      sourcePath,
      `${JSON.stringify(
        {
          name: 'auto_preset',
          mainPrompt: 'You are {{getvar::persona}}.',
          jailbreak: '{{setvar::tone::sharp}}',
          globalNote: 'Note {{getvar::lang}}',
          promptTemplate: [{ name: 'system', text: '{{setvar::lang::ko}}', type: 'plain' }],
          temperature: 0.7,
        },
        null,
        2,
      )}\n`,
      'utf-8',
    );

    const code = runPresetExtractWorkflow([sourcePath, '--out', outDir]);

    expect(code).toBe(0);
    expect(fs.existsSync(path.join(outDir, 'analysis', 'preset-analysis.md'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'analysis', 'preset-analysis.html'))).toBe(true);
  });

  it('skips preset-wide analysis on --json-only extract', () => {
    const sourcePath = path.join(tempDir, 'preset-json-only.json');
    const outDir = path.join(tempDir, 'json-only-preset');

    fs.writeFileSync(
      sourcePath,
      `${JSON.stringify(
        {
          name: 'json_only_preset',
          mainPrompt: 'hello',
          temperature: 0.8,
        },
        null,
        2,
      )}\n`,
      'utf-8',
    );

    const code = runPresetExtractWorkflow([sourcePath, '--out', outDir, '--json-only']);

    expect(code).toBe(0);
    expect(fs.existsSync(path.join(outDir, 'preset.json'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'analysis'))).toBe(false);
  });
});
