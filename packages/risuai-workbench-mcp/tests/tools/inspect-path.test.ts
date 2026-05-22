/**
 * Tests for inspect_path tool handler.
 * @file packages/risuai-workbench-mcp/tests/tools/inspect-path.test.ts
 */

import path from 'node:path';
import { describe, it, expect } from 'vitest';

import { handleInspectPath } from '../../src/tools/inspect/inspect-path';
import type { WorkspaceRootStatus } from '../../src/project/resolve-root';

const FIXTURES_ROOT = path.resolve(__dirname, '../fixtures/workspaces/standard');

function makeOkWorkspace(dir: string): WorkspaceRootStatus {
  return { ok: true, path: path.resolve(dir), reason: null };
}

function makeFailWorkspace(dir: string, reason: 'root-not-found' | 'root-not-directory' = 'root-not-found'): WorkspaceRootStatus {
  return { ok: false, path: path.resolve(dir), reason };
}

describe('handleInspectPath', () => {
  it('returns canonical artifact role for a lorebook path', async () => {
    const workspace = makeOkWorkspace(FIXTURES_ROOT);
    const result = await handleInspectPath(
      { path: 'characters/merry/lorebooks/intro.risulorebook' },
      workspace,
    );

    expect(result.schema).toBe('risuai-workbench-mcp.diagnostics');
    expect(result.tool).toBe('workbench.inspect_path');
    expect(result.status).toBe('ok');
    expect(result.data).toBeDefined();
    expect((result.data as { role: string }).role).toBe('canonical-file');
  });

  it('canonical: identifies lorebook artifact with contract info', async () => {
    const workspace = makeOkWorkspace(FIXTURES_ROOT);
    const result = await handleInspectPath(
      { path: 'characters/merry/lorebooks/intro.risulorebook' },
      workspace,
    );

    expect(result.status).toBe('ok');
    expect(result.diagnostics).toHaveLength(0);
    expect(result.schemaVersion).toBe('0.2.0');
    const data = result.data as { artifact: string; contract: { suffix: string }; relativePath: string; role: string };
    expect(data.role).toBe('canonical-file');
    expect(data.relativePath).toBe('characters/merry/lorebooks/intro.risulorebook');
    expect(data.artifact).toBe('lorebook');
    expect(data.contract.suffix).toBe('.risulorebook');
  });

  it('canonical: identifies regex artifact', async () => {
    const workspace = makeOkWorkspace(FIXTURES_ROOT);
    const result = await handleInspectPath(
      { path: 'characters/merry/regex/filter.risuregex' },
      workspace,
    );

    expect(result.status).toBe('ok');
    expect(result.diagnostics).toHaveLength(0);
    const data = result.data as { artifact: string; contract: { suffix: string }; role: string };
    expect(data.role).toBe('canonical-file');
    expect(data.artifact).toBe('regex');
    expect(data.contract.suffix).toBe('.risuregex');
  });

  it('returns order-marker role for _order.json', async () => {
    const workspace = makeOkWorkspace(FIXTURES_ROOT);
    const result = await handleInspectPath(
      { path: 'characters/merry/lorebooks/_order.json' },
      workspace,
    );

    expect(result.status).toBe('ok');
    const data = result.data as { role: string };
    expect(data.role).toBe('order-marker');
  });

  it('returns directory role with entries', async () => {
    const workspace = makeOkWorkspace(FIXTURES_ROOT);
    const result = await handleInspectPath(
      { path: 'characters/merry/lorebooks' },
      workspace,
    );

    expect(result.status).toBe('ok');
    const data = result.data as { directoryEntries: string[]; role: string };
    expect(data.role).toBe('directory');
    expect(data.directoryEntries).toBeDefined();
    expect(data.directoryEntries.length).toBeGreaterThan(0);
  });

  it('returns structured-json role for .json file', async () => {
    const workspace = makeOkWorkspace(FIXTURES_ROOT);
    const result = await handleInspectPath(
      { path: 'characters/merry/lorebooks/_order.json' },
      workspace,
    );

    expect(result.status).toBe('ok');
    const data = result.data as { role: string };
    expect(data.role).toBe('order-marker');
  });

  it('returns domain_error when workspace root is unavailable', async () => {
    const workspace = makeFailWorkspace('/nonexistent');
    const result = await handleInspectPath(
      { path: 'characters/merry/lorebooks/intro.risulorebook' },
      workspace,
    );

    expect(result.status).toBe('domain_error');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].id).toBe('WORKSPACE_ROOT_UNAVAILABLE');
  });

  it('returns domain_error for path traversal attempt', async () => {
    const workspace = makeOkWorkspace(FIXTURES_ROOT);
    const result = await handleInspectPath(
      { path: '../../../etc/passwd' },
      workspace,
    );

    expect(result.status).toBe('domain_error');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].category).toBe('path');
  });

  it('returns domain_error for nonexistent path', async () => {
    const workspace = makeOkWorkspace(FIXTURES_ROOT);
    const result = await handleInspectPath(
      { path: 'nonexistent/file.risulorebook' },
      workspace,
    );

    expect(result.status).toBe('domain_error');
    expect(result.diagnostics[0].id).toBe('PATH_RESOLVE_FAILED');
  });

  it('returns info diagnostic for unknown file role', async () => {
    const workspace = makeOkWorkspace(FIXTURES_ROOT);
    const result = await handleInspectPath(
      { path: 'modules/mymod/lua/script.risulua' },
      workspace,
    );

    expect(result.status).toBe('ok');
  });

  it('returns Task 2 contract envelope shape', async () => {
    const workspace = makeOkWorkspace(FIXTURES_ROOT);
    const result = await handleInspectPath(
      { path: 'characters/merry/lorebooks/intro.risulorebook' },
      workspace,
    );

    expect(result).toHaveProperty('schema', 'risuai-workbench-mcp.diagnostics');
    expect(result).toHaveProperty('schemaVersion', '0.2.0');
    expect(result).toHaveProperty('tool', 'workbench.inspect_path');
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('diagnostics');
    expect(result.summary).toHaveProperty('errorCount');
    expect(result.summary).toHaveProperty('warningCount');
    expect(result.summary).toHaveProperty('infoCount');
  });
});
