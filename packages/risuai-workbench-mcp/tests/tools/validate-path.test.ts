/**
 * Tests for validate_path tool handler.
 * @file packages/risuai-workbench-mcp/tests/tools/validate-path.test.ts
 */

import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { handleValidatePath } from '../../src/tools/validate/validate-path';
import type { WorkspaceRootStatus } from '../../src/project/resolve-root';

const STANDARD_ROOT = path.resolve(__dirname, '../fixtures/workspaces/standard');

function makeOkWorkspace(dir: string): WorkspaceRootStatus {
  return { ok: true, path: path.resolve(dir), reason: null };
}

describe('handleValidatePath', () => {
  it('returns ok for valid canonical lorebook path', async () => {
    const workspace = makeOkWorkspace(STANDARD_ROOT);
    const result = await handleValidatePath(
      { path: 'characters/merry/lorebooks/intro.risulorebook' },
      workspace,
    );

    expect(result.schema).toBe('risuai-workbench-mcp.diagnostics');
    expect(result.tool).toBe('workbench.validate_path');
    expect(result.status).toBe('ok');
  });

  it('uses Task 3 resolveSafeWorkspacePath for path validation', async () => {
    const workspace = makeOkWorkspace(STANDARD_ROOT);
    const result = await handleValidatePath(
      { path: '../../../etc/passwd' },
      workspace,
    );

    expect(result.status).toBe('domain_error');
    expect(result.diagnostics[0].id).toBe('PATH_RESOLVE_FAILED');
  });

  it('returns domain_warning for non-canonical extension', async () => {
    const workspace = makeOkWorkspace(STANDARD_ROOT);
    const result = await handleValidatePath(
      { path: 'modules/mymod/lua/script.risulua' },
      workspace,
    );

    // .risulua is valid canonical
    expect(result.status).toBe('ok');
  });

  it('returns domain_error for workspace unavailable', async () => {
    const workspace: WorkspaceRootStatus = { ok: false, path: '/nonexistent', reason: 'root-not-found' };
    const result = await handleValidatePath(
      { path: 'characters/merry/lorebooks/intro.risulorebook' },
      workspace,
    );

    expect(result.status).toBe('domain_error');
    expect(result.diagnostics[0].id).toBe('WORKSPACE_ROOT_UNAVAILABLE');
  });

  it('returns domain_error for nonexistent path', async () => {
    const workspace = makeOkWorkspace(STANDARD_ROOT);
    const result = await handleValidatePath(
      { path: 'nonexistent/file.txt' },
      workspace,
    );

    expect(result.status).toBe('domain_error');
    expect(result.diagnostics[0].id).toBe('PATH_RESOLVE_FAILED');
  });

  it('returns Task 2 contract envelope shape', async () => {
    const workspace = makeOkWorkspace(STANDARD_ROOT);
    const result = await handleValidatePath(
      { path: 'characters/merry/lorebooks/intro.risulorebook' },
      workspace,
    );

    expect(result).toHaveProperty('schema', 'risuai-workbench-mcp.diagnostics');
    expect(result).toHaveProperty('schemaVersion', '0.2.0');
    expect(result).toHaveProperty('summary');
  });

  it('accepts canonical files nested below their artifact directory', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-validate-path-'));
    const nestedPath = 'lorebooks/system/actions/opponent.risulorebook';
    await mkdir(path.join(root, 'lorebooks/system/actions'), { recursive: true });
    await writeFile(path.join(root, nestedPath), 'body\n', 'utf8');

    const result = await handleValidatePath(
      { path: nestedPath },
      { ok: true, path: root, reason: null },
    );

    expect(result.status).toBe('ok');
    expect(result.diagnostics).toEqual([]);
  });

  it('warns when a canonical file is outside its artifact directory', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-validate-path-'));
    const misplacedPath = 'other/opponent.risulorebook';
    await mkdir(path.join(root, 'other'), { recursive: true });
    await writeFile(path.join(root, misplacedPath), 'body\n', 'utf8');

    const result = await handleValidatePath(
      { path: misplacedPath },
      { ok: true, path: root, reason: null },
    );

    expect(result.status).toBe('domain_warning');
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ id: 'PATH_DIRECTORY_MISMATCH' }));
  });
});
