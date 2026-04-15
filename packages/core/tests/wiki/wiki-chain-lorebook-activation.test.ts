import { describe, expect, it } from 'vitest';
import { renderLorebookActivationChains } from '@/cli/analyze/shared/wiki/artifact/chains/lorebook-activation';
import { buildRenderContext } from '@/cli/analyze/shared/wiki/artifact/render-context';
import { EMPTY_WORKSPACE_CONFIG } from '@/cli/analyze/shared/wiki/types';
import { minimalCharxReport } from './fixtures/wiki-minimal-charx-report';

describe('wiki/chains/lorebook-activation render', () => {
  const ctx = buildRenderContext({
    artifactKey: 'char_test',
    artifactType: 'character',
    wikiRoot: '/tmp/wiki',
    extractDir: '/tmp/character_test',
    workspace: EMPTY_WORKSPACE_CONFIG,
    now: new Date('2026-04-15T12:00:00Z'),
  });

  it('produces chain files under chains/lorebook-activation/', () => {
    const files = renderLorebookActivationChains(minimalCharxReport(), ctx);
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((f) => f.relativePath.startsWith('chains/lorebook-activation/'))).toBe(true);
  });

  it('chain file has chain frontmatter fields', () => {
    const files = renderLorebookActivationChains(minimalCharxReport(), ctx);
    const first = files[0];
    expect(first.content).toContain('chain-type:');
    expect(first.content).toContain('lorebook-activation');
    expect(first.content).toContain('entry-point:');
    expect(first.content).toContain('hops:');
    expect(first.content).toContain('has-cycles:');
  });

  it('includes Walk section with numbered steps', () => {
    const files = renderLorebookActivationChains(minimalCharxReport(), ctx);
    const first = files[0];
    expect(first.content).toContain('## Walk');
    expect(first.content).toContain('### Step 1');
  });
});
