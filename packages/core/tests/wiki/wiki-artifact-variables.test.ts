import { describe, expect, it } from 'vitest';
import { renderVariables } from '@/cli/analyze/shared/wiki/artifact/variables';
import { buildRenderContext } from '@/cli/analyze/shared/wiki/artifact/render-context';
import { EMPTY_WORKSPACE_CONFIG } from '@/cli/analyze/shared/wiki/types';
import { minimalCharxReport } from './fixtures/wiki-minimal-charx-report';

describe('wiki/artifact/variables', () => {
  const ctx = buildRenderContext({
    artifactKey: 'char_test',
    artifactType: 'character',
    wikiRoot: '/tmp/wiki',
    extractDir: '/tmp/character_test',
    workspace: EMPTY_WORKSPACE_CONFIG,
    now: new Date('2026-04-15T12:00:00Z'),
  });

  it('writes to variables.md', () => {
    const file = renderVariables(minimalCharxReport(), ctx);
    expect(file.relativePath).toBe('variables.md');
  });

  it('includes totals from unifiedGraph and defaultVariables', () => {
    const file = renderVariables(minimalCharxReport(), ctx);
    expect(file.content).toContain('total-vars: 2');
    expect(file.content).toContain('default-vars: 2');
    expect(file.content).toContain('2 total');
  });

  it('renders the registry table header', () => {
    const file = renderVariables(minimalCharxReport(), ctx);
    expect(file.content).toContain('| Name | Default | Readers | Writers | Chain |');
  });

  it('lists every variable with readers and writers', () => {
    const file = renderVariables(minimalCharxReport(), ctx);
    expect(file.content).toContain('`hp`');
    expect(file.content).toContain('`affinity_NPC`');
  });

  it('includes the Defaults JSON block', () => {
    const file = renderVariables(minimalCharxReport(), ctx);
    expect(file.content).toContain('## Defaults');
    expect(file.content).toContain('```json');
    expect(file.content).toContain('"hp": "100"');
  });

  it('includes Notes back-link', () => {
    const file = renderVariables(minimalCharxReport(), ctx);
    expect(file.content).toContain('## Notes');
    expect(file.content).toContain('../notes/variables.md');
  });
});
