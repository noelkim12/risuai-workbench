import { describe, expect, it } from 'vitest';
import { renderOverview } from '@/cli/analyze/shared/wiki/artifact/overview';
import { buildRenderContext } from '@/cli/analyze/shared/wiki/artifact/render-context';
import { EMPTY_WORKSPACE_CONFIG } from '@/cli/analyze/shared/wiki/types';
import { minimalCharxReport } from './fixtures/wiki-minimal-charx-report';

describe('wiki/artifact/overview', () => {
  const ctx = buildRenderContext({
    artifactKey: 'char_test',
    artifactType: 'character',
    wikiRoot: '/tmp/wiki',
    extractDir: '/tmp/character_test',
    workspace: EMPTY_WORKSPACE_CONFIG,
    now: new Date('2026-04-15T12:00:00Z'),
  });

  it('writes to overview.md', () => {
    const file = renderOverview(minimalCharxReport(), ctx);
    expect(file.relativePath).toBe('overview.md');
  });

  it('includes complete frontmatter', () => {
    const file = renderOverview(minimalCharxReport(), ctx);
    expect(file.content).toContain('source: generated');
    expect(file.content).toContain('page-class: overview');
    expect(file.content).toContain('artifact: char_test');
    expect(file.content).toContain('artifact-type: character');
    expect(file.content).toContain('generated-at: "2026-04-15T12:00:00.000Z"');
    expect(file.content).toContain('generator: "risu-workbench/analyze/wiki@');
  });

  it('includes Quick stats section with lorebook counts', () => {
    const file = renderOverview(minimalCharxReport(), ctx);
    expect(file.content).toContain('## Quick stats');
    expect(file.content).toContain('2 lorebook entries');
    expect(file.content).toContain('1 folders');
    expect(file.content).toContain('constant 1');
    expect(file.content).toContain('keyword 1');
    expect(file.content).toContain('2 variables');
  });

  it('includes Contents section with consolidated links', () => {
    const file = renderOverview(minimalCharxReport(), ctx);
    expect(file.content).toContain('## Contents');
    expect(file.content).toContain('[variables.md](variables.md)');
    expect(file.content).toContain('[lorebook/_index.md](lorebook/_index.md)');
    expect(file.content).toContain('[chains/_index.md](chains/_index.md)');
  });

  it('omits lua and regex links when those sections are empty', () => {
    const withoutLuaOrRegex = minimalCharxReport();
    withoutLuaOrRegex.luaArtifacts = [];
    withoutLuaOrRegex.collected.regexCBS = [];

    const file = renderOverview(withoutLuaOrRegex, ctx);
    expect(file.content).not.toContain('[lua.md]');
    expect(file.content).not.toContain('[regex.md]');
  });

  it('shows "None declared" in DLC section when workspace has no companions for this artifact', () => {
    const file = renderOverview(minimalCharxReport(), ctx);
    expect(file.content).toContain('## DLC / Companions');
    expect(file.content).toContain('None declared');
  });

  it('renders companion links literally when declared in workspace', () => {
    const withCompanions = buildRenderContext({
      artifactKey: 'char_test',
      artifactType: 'character',
      wikiRoot: '/tmp/wiki',
      extractDir: '/tmp/character_test',
      workspace: {
        artifacts: [],
        companions: { char_test: ['module_dlc_a', 'module_dlc_b'] },
        labels: { module_dlc_a: 'Shop DLC' },
      },
      now: new Date('2026-04-15T12:00:00Z'),
    });
    const file = renderOverview(minimalCharxReport(), withCompanions);
    expect(file.content).toContain('[module_dlc_a](../../module_dlc_a/_generated/overview.md) — _"Shop DLC"_');
    expect(file.content).toContain('[module_dlc_b](../../module_dlc_b/_generated/overview.md)');
  });

  it('includes Notes section with dangling link', () => {
    const file = renderOverview(minimalCharxReport(), ctx);
    expect(file.content).toContain('## Notes');
    expect(file.content).toContain('../notes/design-intent.md');
  });
});
