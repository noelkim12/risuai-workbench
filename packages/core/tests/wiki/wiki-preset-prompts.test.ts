import { describe, expect, it } from 'vitest';
import { buildRenderContext } from '@/cli/analyze/shared/wiki/artifact/render-context';
import { EMPTY_WORKSPACE_CONFIG } from '@/cli/analyze/shared/wiki/types';
import { renderPresetPromptChain } from '@/cli/analyze/preset/wiki/prompt-chain';
import { renderPresetPrompts } from '@/cli/analyze/preset/wiki/prompts';
import { minimalPresetReport } from './fixtures/wiki-minimal-preset-report';

describe('wiki/preset prompt renderers', () => {
  const ctx = buildRenderContext({
    artifactKey: 'preset_test',
    artifactType: 'preset',
    wikiRoot: '/tmp/wiki',
    extractDir: '/tmp/preset_test',
    workspace: EMPTY_WORKSPACE_CONFIG,
    now: new Date('2026-04-15T12:00:00Z'),
  });

  it('renders consolidated preset prompts across prompt files and templates', () => {
    const file = renderPresetPrompts(minimalPresetReport(), ctx);
    expect(file.relativePath).toBe('prompts.md');
    expect(file.content).toContain('total-prompts: 2');
    expect(file.content).toContain('| Source | Name | Type | Tokens | Reads | Writes |');
    expect(file.content).toContain('prompt');
    expect(file.content).toContain('template');
    expect(file.content).toContain('main');
    expect(file.content).toContain('system');
  });

  it('renders prompt-chain from analyzed promptChain links', () => {
    const file = renderPresetPromptChain(minimalPresetReport(), ctx);
    expect(file.relativePath).toBe('prompt-chain.md');
    expect(file.content).toContain('chain-type: "prompt-flow"');
    expect(file.content).toContain('hops: 2');
    expect(file.content).toContain('### Step 1 — `main`');
    expect(file.content).toContain('unsatisfied: `persona`');
    expect(file.content).toContain('## External dependencies');
    expect(file.content).toContain('## Issues');
  });
});
