import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runPackWorkflow } from '../../src/cli/pack/workflow';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('preset canonical pack workflow', () => {
  it('rebuilds a preset from canonical artifacts and structured metadata without preset.json', () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preset-canonical-pack-'));
    tempDirs.push(workDir);

    fs.mkdirSync(path.join(workDir, 'prompts'), { recursive: true });
    fs.mkdirSync(path.join(workDir, 'prompt_template'), { recursive: true });
    fs.mkdirSync(path.join(workDir, 'regex'), { recursive: true });
    fs.mkdirSync(path.join(workDir, 'toggle'), { recursive: true });
    fs.mkdirSync(path.join(workDir, 'provider'), { recursive: true });

    fs.writeFileSync(
      path.join(workDir, 'metadata.json'),
      `${JSON.stringify(
        {
          name: 'Preset From Canonical',
          preset_type: 'risuai',
          source_format: 'json',
          import_format: 'json',
        },
        null,
        2,
      )}\n`,
      'utf-8',
    );
    fs.writeFileSync(path.join(workDir, 'prompts', 'main.txt'), 'MAIN {{getvar::persona}}', 'utf-8');
    fs.writeFileSync(path.join(workDir, 'prompts', 'global_note.txt'), 'GLOBAL {{getvar::lang}}', 'utf-8');
    fs.writeFileSync(
      path.join(workDir, 'prompt_template', '_order.json'),
      `${JSON.stringify(['System.risuprompt', 'Followup.risuprompt'], null, 2)}\n`,
      'utf-8',
    );
    fs.writeFileSync(
      path.join(workDir, 'prompt_template', 'System.risuprompt'),
      [
        '---',
        'type: plain',
        'type2: main',
        'role: system',
        'name: System',
        '---',
        '@@@ TEXT',
        'SYSTEM {{setvar::lang::ko}}',
        '',
      ].join('\n'),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(workDir, 'prompt_template', 'Followup.risuprompt'),
      [
        '---',
        'type: plain',
        'type2: normal',
        'role: user',
        'name: Followup',
        '---',
        '@@@ TEXT',
        'FOLLOWUP {{getvar::lang}}',
        '',
      ].join('\n'),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(workDir, 'regex', '_order.json'),
      `${JSON.stringify(['cleanup.risuregex'], null, 2)}\n`,
      'utf-8',
    );
    fs.writeFileSync(
      path.join(workDir, 'regex', 'cleanup.risuregex'),
      [
        '---',
        'comment: cleanup',
        'type: editoutput',
        '---',
        '@@@ IN',
        'foo',
        '@@@ OUT',
        '{{setvar::tone::calm}}',
        '',
      ].join('\n'),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(workDir, 'toggle', 'prompt_template.risutoggle'),
      '<toggle>{{getvar::mode}}</toggle>',
      'utf-8',
    );
    fs.writeFileSync(
      path.join(workDir, 'parameters.json'),
      `${JSON.stringify({ temperature: 33, top_p: 0.42 }, null, 2)}\n`,
      'utf-8',
    );
    fs.writeFileSync(
      path.join(workDir, 'model.json'),
      `${JSON.stringify({ apiType: 'openai', aiModel: 'gpt-4.1-mini' }, null, 2)}\n`,
      'utf-8',
    );
    fs.writeFileSync(
      path.join(workDir, 'prompt_settings.json'),
      `${JSON.stringify({ assistantPrefill: 'prefill', sendName: true }, null, 2)}\n`,
      'utf-8',
    );
    fs.writeFileSync(
      path.join(workDir, 'instruct_settings.json'),
      `${JSON.stringify(
        {
          useInstructPrompt: true,
          templateDefaultVariables: 'lang=ko',
          promptPreprocess: true,
        },
        null,
        2,
      )}\n`,
      'utf-8',
    );
    fs.writeFileSync(
      path.join(workDir, 'provider', 'ain.json'),
      `${JSON.stringify({ top_p: 0.9, top_k: 42 }, null, 2)}\n`,
      'utf-8',
    );

    const outPath = path.join(workDir, 'packed-preset.json');
    const code = runPackWorkflow(['--in', workDir, '--format', 'preset', '--out', outPath]);

    expect(code).toBe(0);
    const packed = JSON.parse(fs.readFileSync(outPath, 'utf-8')) as Record<string, unknown>;

    expect(packed.name).toBe('Preset From Canonical');
    expect(packed.mainPrompt).toBe('MAIN {{getvar::persona}}');
    expect(packed.globalNote).toBe('GLOBAL {{getvar::lang}}');
    expect(packed.temperature).toBe(33);
    expect(packed.top_p).toBe(0.42);
    expect(packed.apiType).toBe('openai');
    expect(packed.aiModel).toBe('gpt-4.1-mini');
    expect(packed.localNetworkTimeoutSec).toBe(600);
    expect(packed.maxResponse).toBe(300);
    expect(packed.customPromptTemplateToggle).toBe('<toggle>{{getvar::mode}}</toggle>');
    expect(packed.promptSettings).toEqual({ assistantPrefill: 'prefill', sendName: true });
    expect(packed.useInstructPrompt).toBe(true);
    expect(packed.templateDefaultVariables).toBe('lang=ko');
    expect(packed.promptPreprocess).toBe(true);
    expect(packed.ainconfig).toEqual({ top_p: 0.9, top_k: 42 });
    expect(packed.promptTemplate).toEqual([
      {
        type: 'plain',
        type2: 'main',
        role: 'system',
        name: 'System',
        text: 'SYSTEM {{setvar::lang::ko}}',
      },
      {
        type: 'plain',
        type2: 'normal',
        role: 'user',
        name: 'Followup',
        text: 'FOLLOWUP {{getvar::lang}}',
      },
    ]);
    expect(packed.regex).toEqual([
      {
        comment: 'cleanup',
        type: 'editoutput',
        in: 'foo',
        out: '{{setvar::tone::calm}}',
      },
    ]);
  });
});
