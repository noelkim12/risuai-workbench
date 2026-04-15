import { describe, expect, it } from 'vitest';
import { buildRenderContext } from '@/cli/analyze/shared/wiki/artifact/render-context';
import { EMPTY_WORKSPACE_CONFIG } from '@/cli/analyze/shared/wiki/types';
import { renderPresetOverview } from '@/cli/analyze/preset/wiki/overview';
import { renderPresetVariables } from '@/cli/analyze/preset/wiki/variables';
import { renderPresetRegex } from '@/cli/analyze/preset/wiki/regex';
import { minimalPresetReport } from './fixtures/wiki-minimal-preset-report';

describe('wiki/preset core renderers', () => {
  const ctx = buildRenderContext({
    artifactKey: 'preset_test',
    artifactType: 'preset',
    wikiRoot: '/tmp/wiki',
    extractDir: '/tmp/preset_test',
    workspace: EMPTY_WORKSPACE_CONFIG,
    now: new Date('2026-04-15T12:00:00Z'),
  });

  it('renders overview stats and contents for preset artifacts', () => {
    const file = renderPresetOverview(minimalPresetReport(), ctx);
    expect(file.relativePath).toBe('overview.md');
    expect(file.content).toContain('artifact-type: preset');
    expect(file.content).toContain('1 prompt files');
    expect(file.content).toContain('1 prompt templates');
    expect(file.content).toContain('1 regex scripts');
    expect(file.content).toContain('2 variables');
    expect(file.content).toContain('[prompts.md](prompts.md)');
    expect(file.content).toContain('[prompt-chain.md](prompt-chain.md)');
    expect(file.content).toContain('[variables.md](variables.md)');
    expect(file.content).toContain('[regex.md](regex.md)');
  });

  it('renders preset variables from unifiedGraph defaults', () => {
    const file = renderPresetVariables(minimalPresetReport(), ctx);
    expect(file?.relativePath).toBe('variables.md');
    expect(file?.content).toContain('total-vars: 2');
    expect(file?.content).toContain('default-vars: 1');
    expect(file?.content).toContain('| Name | Default | Readers | Writers | Chain |');
    expect(file?.content).toContain('"persona": "guide"');
  });

  it('renders preset regex registry from collected.regexCBS', () => {
    const file = renderPresetRegex(minimalPresetReport(), ctx);
    expect(file?.relativePath).toBe('regex.md');
    expect(file?.content).toContain('regex-count: 1');
    expect(file?.content).toContain('[preset]/regex/post');
  });
});
