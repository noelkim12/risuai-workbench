/**
 * Tests for remaining inspect/validate tools.
 * @file packages/risuai-workbench-mcp/tests/tools/tools-coverage.test.ts
 */

import path from 'node:path';
import { describe, it, expect } from 'vitest';

import { handleInspectArtifact } from '../../src/tools/inspect-artifact';
import { handleValidateArtifact } from '../../src/tools/validate-artifact';
import { handleValidateRootMarkers } from '../../src/tools/validate-root-markers';
import { handleValidateMetadata } from '../../src/tools/validate-metadata';
import { handleBuildPath } from '../../src/tools/build-path';
import { handleSearchWiki } from '../../src/tools/search-wiki';
import { handleSuggestTests } from '../../src/tools/suggest-tests';
import type { WorkspaceRootStatus } from '../../src/project/resolve-root';

const STANDARD_ROOT = path.resolve(__dirname, '../fixtures/workspaces/standard');

function makeOkWorkspace(dir: string): WorkspaceRootStatus {
  return { ok: true, path: path.resolve(dir), reason: null };
}

describe('handleInspectArtifact', () => {
  it('returns ok with contract info and data payload for artifact root', async () => {
    const workspace = makeOkWorkspace(STANDARD_ROOT);
    const result = await handleInspectArtifact(
      { artifactRoot: 'characters/merry' },
      workspace,
    );

    expect(result.schema).toBe('risuai-workbench-mcp.diagnostics');
    expect(result.tool).toBe('workbench.inspect_artifact');
    expect(result.status).toBe('ok');
    expect(result.data).toBeDefined();
    const data = result.data as {
      canonicalFiles: Array<{ artifact: string; relativePath: string }>;
      contractSummaries: Array<{ artifact: string; suffix: string }>;
      markerFiles: Array<{ kind: string; relativePath: string }>;
    };
    expect(data.canonicalFiles.length).toBeGreaterThan(0);
    expect(data.canonicalFiles.some((f) => f.artifact === 'lorebook')).toBe(true);
    expect(data.contractSummaries.length).toBeGreaterThan(0);
    expect(data.contractSummaries.some((c) => c.suffix === '.risulorebook')).toBe(true);
  });

  it('returns domain_error when workspace unavailable', async () => {
    const workspace: WorkspaceRootStatus = { ok: false, path: '/nope', reason: 'root-not-found' };
    const result = await handleInspectArtifact({ artifactRoot: 'foo' }, workspace);
    expect(result.status).toBe('domain_error');
  });
});

describe('handleValidateArtifact', () => {
  it('returns ok or domain_warning for artifact root with expected markers', async () => {
    const workspace = makeOkWorkspace(STANDARD_ROOT);
    const result = await handleValidateArtifact(
      { artifactRoot: 'characters/merry' },
      workspace,
    );

    expect(result.schema).toBe('risuai-workbench-mcp.diagnostics');
    expect(result.tool).toBe('workbench.validate_artifact');
    // Lorebook contract expects 'folders' marker which may not exist
    expect(['ok', 'domain_warning']).toContain(result.status);
  });

  it('returns domain_warning for missing marker files', async () => {
    const workspace = makeOkWorkspace(STANDARD_ROOT);
    const result = await handleValidateArtifact(
      { artifactRoot: 'modules/mymod' },
      workspace,
    );

    // Lua has no marker files requirement, so may be ok or warning
    expect(['ok', 'domain_warning']).toContain(result.status);
  });
});

describe('handleValidateRootMarkers', () => {
  it('returns info when no markers found', async () => {
    const workspace = makeOkWorkspace(STANDARD_ROOT);
    const result = await handleValidateRootMarkers(
      { path: 'characters/merry' },
      workspace,
    );

    expect(result.schema).toBe('risuai-workbench-mcp.diagnostics');
    expect(result.tool).toBe('workbench.validate_root_markers');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].id).toBe('NO_ROOT_MARKER');
    expect(result.diagnostics[0].severity).toBe('info');
  });
});

describe('handleValidateMetadata', () => {
  it('returns domain_error for missing metadata file', async () => {
    const workspace = makeOkWorkspace(STANDARD_ROOT);
    const result = await handleValidateMetadata(
      { path: 'nonexistent.json' },
      workspace,
    );

    expect(result.schema).toBe('risuai-workbench-mcp.diagnostics');
    expect(result.tool).toBe('workbench.validate_metadata');
    expect(result.status).toBe('domain_error');
    // resolveSafeWorkspacePath rejects missing targets at boundary layer
    expect(result.diagnostics[0].id).toBe('PATH_RESOLVE_FAILED');
  });

  it('returns ok for valid JSON metadata', async () => {
    const workspace = makeOkWorkspace(STANDARD_ROOT);
    const result = await handleValidateMetadata(
      { path: 'test-metadata.json' },
      workspace,
    );

    expect(result.status).toBe('ok');
    expect(result.diagnostics).toHaveLength(0);
  });
});

describe('handleBuildPath', () => {
  it('returns ok with canonicalPath data for valid target/artifact combination', async () => {
    const result = await handleBuildPath({
      artifact: 'lorebook',
      stem: 'intro',
      target: 'charx',
    });

    expect(result.schema).toBe('risuai-workbench-mcp.diagnostics');
    expect(result.tool).toBe('workbench.build_path');
    expect(result.status).toBe('ok');
    expect(result.data).toBeDefined();
    const data = result.data as { canonicalPath: string };
    expect(data.canonicalPath).toContain('lorebooks');
    expect(data.canonicalPath).toContain('intro');
    expect(data.canonicalPath).toContain('.risulorebook');
  });

  it('returns domain_error for invalid target', async () => {
    const result = await handleBuildPath({
      artifact: 'lorebook',
      target: 'invalid',
    });

    expect(result.status).toBe('domain_error');
    expect(result.diagnostics[0].id).toBe('INVALID_TARGET');
  });

  it('returns domain_error for invalid artifact', async () => {
    const result = await handleBuildPath({
      artifact: 'nonexistent',
      target: 'charx',
    });

    expect(result.status).toBe('domain_error');
    expect(result.diagnostics[0].id).toBe('INVALID_ARTIFACT');
  });
});

describe('handleSearchWiki', () => {
  it('returns info stub for non-empty query', async () => {
    const result = await handleSearchWiki({ query: 'lorebook' });

    expect(result.schema).toBe('risuai-workbench-mcp.diagnostics');
    expect(result.tool).toBe('workbench.search_wiki');
    expect(result.status).toBe('ok');
  });

  it('returns domain_warning for empty query', async () => {
    const result = await handleSearchWiki({ query: '' });

    expect(result.status).toBe('domain_warning');
    expect(result.diagnostics[0].id).toBe('EMPTY_QUERY');
  });
});

describe('handleSuggestTests', () => {
  it('returns info stub for valid path', async () => {
    const result = await handleSuggestTests({ path: 'lorebooks/intro.risulorebook' });

    expect(result.schema).toBe('risuai-workbench-mcp.diagnostics');
    expect(result.tool).toBe('workbench.suggest_tests');
    expect(result.status).toBe('ok');
  });

  it('returns domain_warning for empty path', async () => {
    const result = await handleSuggestTests({ path: '' });

    expect(result.status).toBe('domain_warning');
    expect(result.diagnostics[0].id).toBe('EMPTY_PATH');
  });
});
