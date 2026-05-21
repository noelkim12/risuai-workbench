/**
 * Tests for validate_frontmatter tool handler.
 * @file packages/risuai-workbench-mcp/tests/tools/validate-frontmatter.test.ts
 */

import path from 'node:path';
import { describe, it, expect } from 'vitest';

import { handleValidateFrontmatter } from '../../src/tools/validate-frontmatter';
import type { WorkspaceRootStatus } from '../../src/project/resolve-root';

const FM_ROOT = path.resolve(__dirname, '../fixtures/workspaces/frontmatter-test');

function makeOkWorkspace(dir: string): WorkspaceRootStatus {
  return { ok: true, path: path.resolve(dir), reason: null };
}

describe('handleValidateFrontmatter', () => {
  it('returns ok for valid round-trip-safe frontmatter', async () => {
    const workspace = makeOkWorkspace(FM_ROOT);
    const result = await handleValidateFrontmatter(
      { path: 'characters/fm/lorebooks/valid.risulorebook' },
      workspace,
    );

    expect(result.schema).toBe('risuai-workbench-mcp.diagnostics');
    expect(result.tool).toBe('workbench.validate_frontmatter');
    expect(result.status).toBe('ok');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('missing delimiter: returns domain_warning for missing frontmatter', async () => {
    const workspace = makeOkWorkspace(FM_ROOT);
    const result = await handleValidateFrontmatter(
      { path: 'characters/fm/lorebooks/no-delimiter.risulorebook' },
      workspace,
    );

    expect(result.status).toBe('domain_warning');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].id).toBe('FRONTMATTER_MISSING');
    expect(result.diagnostics[0].ruleId).toBe('frontmatter.missing-frontmatter');
  });

  it('malformed field: returns domain_warning for malformed frontmatter field', async () => {
    const workspace = makeOkWorkspace(FM_ROOT);
    const result = await handleValidateFrontmatter(
      { path: 'characters/fm/lorebooks/malformed-field.risulorebook' },
      workspace,
    );

    expect(result.status).toBe('domain_warning');
    const fieldDiag = result.diagnostics.find((d) => d.ruleId === 'frontmatter.malformed-frontmatter');
    expect(fieldDiag).toBeDefined();
    expect(fieldDiag!.message).toContain('missing a colon');
  });

  it('missing close delimiter: returns domain_error for unclosed frontmatter', async () => {
    const workspace = makeOkWorkspace(FM_ROOT);
    const result = await handleValidateFrontmatter(
      { path: 'characters/fm/lorebooks/missing-close.risulorebook' },
      workspace,
    );

    expect(result.status).toBe('domain_error');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].id).toBe('FRONTMATTER_MALFORMED');
    expect(result.diagnostics[0].severity).toBe('error');
  });

  it('preview-only repair diagnostic: returns info for frontmatter parse result', async () => {
    const workspace = makeOkWorkspace(FM_ROOT);
    const result = await handleValidateFrontmatter(
      { path: 'characters/fm/lorebooks/malformed-field.risulorebook' },
      workspace,
    );

    // The result should NOT throw - it returns diagnostic envelope
    expect(result.schema).toBe('risuai-workbench-mcp.diagnostics');
    expect(result.diagnostics.length).toBeGreaterThanOrEqual(1);
  });

  it('returns domain_error for nonexistent file', async () => {
    const workspace = makeOkWorkspace(FM_ROOT);
    const result = await handleValidateFrontmatter(
      { path: 'characters/fm/lorebooks/nonexistent.risulorebook' },
      workspace,
    );

    expect(result.status).toBe('domain_error');
    // resolveSafeWorkspacePath rejects missing targets at boundary layer
    expect(result.diagnostics[0].id).toBe('PATH_RESOLVE_FAILED');
  });

  it('returns domain_error when workspace is unavailable', async () => {
    const workspace: WorkspaceRootStatus = { ok: false, path: '/nonexistent', reason: 'root-not-found' };
    const result = await handleValidateFrontmatter(
      { path: 'characters/fm/lorebooks/valid.risulorebook' },
      workspace,
    );

    expect(result.status).toBe('domain_error');
    expect(result.diagnostics[0].id).toBe('WORKSPACE_ROOT_UNAVAILABLE');
  });

  it('returns Task 2 contract envelope shape', async () => {
    const workspace = makeOkWorkspace(FM_ROOT);
    const result = await handleValidateFrontmatter(
      { path: 'characters/fm/lorebooks/valid.risulorebook' },
      workspace,
    );

    expect(result).toHaveProperty('schema', 'risuai-workbench-mcp.diagnostics');
    expect(result).toHaveProperty('schemaVersion', '0.2.0');
    expect(result).toHaveProperty('summary');
    expect(result.summary).toHaveProperty('errorCount');
    expect(result.summary).toHaveProperty('warningCount');
    expect(result.summary).toHaveProperty('infoCount');
  });

  it('returns domain_error for path traversal attempt', async () => {
    const workspace = makeOkWorkspace(FM_ROOT);
    const result = await handleValidateFrontmatter(
      { path: '../../../etc/passwd' },
      workspace,
    );

    expect(result.status).toBe('domain_error');
    expect(result.diagnostics[0].category).toBe('path');
    expect(result.diagnostics[0].id).toBe('PATH_RESOLVE_FAILED');
  });
});
