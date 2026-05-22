/**
 * Tests for wiki preview tools and generated boundary diagnostics.
 * @file packages/risuai-workbench-mcp/tests/tools/wiki-patch-preview.test.ts
 */

import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { handleDiffWiki, handlePlanWikiUpdate } from '../../src/tools/wiki/wiki-patch-preview';
import type { WorkspaceRootStatus } from '../../src/project/resolve-root';

const STANDARD_ROOT = path.resolve(__dirname, '../fixtures/workspaces/standard');

/**
 * makeOkWorkspace 함수.
 * fixture root를 WorkspaceRootStatus로 감쌈.
 *
 * @param dir - fixture workspace root
 * @returns ok workspace status
 */
function makeOkWorkspace(dir: string): WorkspaceRootStatus {
  return { ok: true, path: path.resolve(dir), reason: null };
}

describe('wiki patch preview tools', () => {
  it('plan_wiki_update returns generated-only preview scope', async () => {
    const result = await handlePlanWikiUpdate({ artifactKey: 'merry' }, makeOkWorkspace(STANDARD_ROOT));

    expect(result.status).toBe('ok');
    const data = result.data as { patchPlan: { safety: { touchesGeneratedOnly: boolean; touchesSourceArtifacts: boolean } }; targets: string[]; protectedPaths: string[] };
    expect(data.patchPlan.safety.touchesGeneratedOnly).toBe(true);
    expect(data.patchPlan.safety.touchesSourceArtifacts).toBe(false);
    expect(data.targets).toContain('wiki/artifacts/merry/_generated/**');
    expect(data.protectedPaths).toContain('wiki/domain/**');
  });

  it('diff_wiki rejects protected manual wiki paths without writes', async () => {
    const result = await handleDiffWiki(
      { paths: ['wiki/artifacts/merry/_generated/summary.md', 'wiki/domain/manual.md', 'workspace.yaml'] },
      makeOkWorkspace(STANDARD_ROOT),
    );

    expect(result.status).toBe('domain_error');
    expect(result.diagnostics.map((diagnostic) => diagnostic.path)).toEqual(['wiki/domain/manual.md', 'workspace.yaml']);
    const data = result.data as { allowedPaths: string[]; protectedPaths: string[]; writePolicy: string };
    expect(data.allowedPaths).toEqual(['wiki/artifacts/merry/_generated/summary.md']);
    expect(data.writePolicy).toBe('preview-only');
  });
});
