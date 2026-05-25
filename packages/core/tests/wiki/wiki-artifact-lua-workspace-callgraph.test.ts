import { describe, expect, it } from 'vitest';

import { renderLuaWorkspaceCallgraph } from '@/cli/analyze/shared/wiki/artifact/lua-workspace-callgraph';
import { buildRenderContext } from '@/cli/analyze/shared/wiki/artifact/render-context';
import { EMPTY_WORKSPACE_CONFIG } from '@/cli/analyze/shared/wiki/types';
import { minimalCharxReport } from './fixtures/wiki-minimal-charx-report';

describe('wiki/artifact/lua-workspace-callgraph', () => {
  const ctx = buildRenderContext({
    artifactKey: 'char_test',
    artifactType: 'character',
    wikiRoot: '/tmp/wiki',
    extractDir: '/tmp/character_test',
    workspace: EMPTY_WORKSPACE_CONFIG,
    now: new Date('2026-04-15T12:00:00Z'),
  });

  it('renders namespaced per-file callgraph edges and resolves unique cross-file callees', () => {
    const report = minimalCharxReport();
    const template = report.luaArtifacts[0];
    report.luaArtifacts = [
      {
        ...template,
        relativePath: 'lua/main.risulua',
        splitRole: 'main',
        collected: {
          ...template.collected,
          functions: [
            { ...template.collected.functions[0], name: 'onOutput', displayName: 'onOutput' },
          ],
        },
        analyzePhase: {
          ...template.analyzePhase,
          callGraph: new Map([['onOutput', new Set(['helper'])]]),
        },
      },
      {
        ...template,
        relativePath: 'lua/domain/helper.risulua',
        splitRole: 'domain',
        collected: {
          ...template.collected,
          functions: [
            { ...template.collected.functions[0], name: 'helper', displayName: 'helper' },
          ],
        },
        analyzePhase: {
          ...template.analyzePhase,
          callGraph: new Map([['helper', new Set<string>()]]),
        },
      },
    ];

    const file = renderLuaWorkspaceCallgraph(report, ctx);

    expect(file).not.toBeNull();
    expect(file!.relativePath).toBe('lua-workspace-callgraph.md');
    expect(file!.content).toContain('# Lua Workspace Callgraph');
    expect(file!.content).toContain('- `lua/main.risulua::onOutput` → `lua/domain/helper.risulua::helper`');
    expect(file!.content).toContain('**Files:** 2 · **Functions:** 2 · **Edges:** 1');
  });
});
