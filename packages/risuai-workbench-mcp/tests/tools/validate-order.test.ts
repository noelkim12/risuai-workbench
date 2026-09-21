/**
 * Tests for validate_order tool handler.
 * @file packages/risuai-workbench-mcp/tests/tools/validate-order.test.ts
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, it, expect } from 'vitest';

import { handleValidateOrder } from '../../src/tools/validate/validate-order';
import type { WorkspaceRootStatus } from '../../src/project/resolve-root';

const STANDARD_ROOT = path.resolve(__dirname, '../fixtures/workspaces/standard');
const MALFORMED_ROOT = path.resolve(__dirname, '../fixtures/workspaces/malformed-order');
const NO_ORDER_ROOT = path.resolve(__dirname, '../fixtures/workspaces/no-order');
const UNLISTED_ROOT = path.resolve(__dirname, '../fixtures/workspaces/unlisted-file');
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeOkWorkspace(dir: string): WorkspaceRootStatus {
  return { ok: true, path: path.resolve(dir), reason: null };
}

function createNestedLorebookFixture(): { root: string; lorebooksDir: string } {
  const root = mkdtempSync(path.join(tmpdir(), 'risu-validate-order-'));
  tempDirs.push(root);
  const lorebooksDir = path.join(root, 'lorebooks');
  mkdirSync(path.join(lorebooksDir, '00_system', 'opponents'), { recursive: true });
  writeFileSync(
    path.join(lorebooksDir, '00_system', 'opponents', 'fixed.risulorebook'),
    '',
    'utf8',
  );
  return { root, lorebooksDir };
}

describe('handleValidateOrder', () => {
  it('malformed: returns domain_error for malformed _order.json', async () => {
    const workspace = makeOkWorkspace(MALFORMED_ROOT);
    const result = await handleValidateOrder(
      { directory: 'characters/broken/lorebooks' },
      workspace,
    );

    expect(result.schema).toBe('risuai-workbench-mcp.diagnostics');
    expect(result.tool).toBe('workbench.validate_order');
    expect(result.status).toBe('domain_error');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].id).toBe('ORDER_FILE_MALFORMED');
    expect(result.diagnostics[0].category).toBe('order');
    expect(result.diagnostics[0].ruleId).toBe('order.malformed');
  });

  it('returns domain_warning for missing listed file', async () => {
    const workspace = makeOkWorkspace(NO_ORDER_ROOT);
    const result = await handleValidateOrder(
      { directory: 'characters/plain/lorebooks' },
      workspace,
    );

    expect(result.status).toBe('domain_warning');
    const missingDiag = result.diagnostics.find((d) => d.id === 'ORDER_LISTS_MISSING_FILE');
    expect(missingDiag).toBeDefined();
    expect(missingDiag!.message).toContain('ghost.risulorebook');
  });

  it('returns domain_warning for unlisted canonical file', async () => {
    const workspace = makeOkWorkspace(UNLISTED_ROOT);
    const result = await handleValidateOrder(
      { directory: 'characters/test/lorebooks' },
      workspace,
    );

    const unlistedDiag = result.diagnostics.find((d) => d.id === 'ORDER_UNLISTED_CANONICAL_FILE');
    expect(unlistedDiag).toBeDefined();
    expect(unlistedDiag!.message).toContain('unlisted.risulorebook');
  });

  it('returns ok for ordered success fixture', async () => {
    const workspace = makeOkWorkspace(STANDARD_ROOT);
    const result = await handleValidateOrder(
      { directory: 'characters/merry/lorebooks' },
      workspace,
    );

    expect(result.status).toBe('ok');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('accepts folders before nested lorebooks and requires every parent folder', async () => {
    const { root, lorebooksDir } = createNestedLorebookFixture();
    writeFileSync(
      path.join(lorebooksDir, '_order.json'),
      `${JSON.stringify([
        '00_system',
        '00_system/opponents',
        '00_system/opponents/fixed.risulorebook',
      ])}\n`,
      'utf8',
    );

    const validResult = await handleValidateOrder(
      { directory: 'lorebooks' },
      makeOkWorkspace(root),
    );
    expect(validResult.status).toBe('ok');

    writeFileSync(
      path.join(lorebooksDir, '_order.json'),
      `${JSON.stringify(['00_system/opponents/fixed.risulorebook'])}\n`,
      'utf8',
    );
    const missingFoldersResult = await handleValidateOrder(
      { directory: 'lorebooks' },
      makeOkWorkspace(root),
    );

    expect(missingFoldersResult.status).toBe('domain_warning');
    expect(
      missingFoldersResult.diagnostics.filter(
        (diagnostic) => diagnostic.id === 'ORDER_UNLISTED_DIRECTORY',
      ),
    ).toHaveLength(2);
  });

  it('warns when a lorebook directory is listed after its contents', async () => {
    const { root, lorebooksDir } = createNestedLorebookFixture();
    writeFileSync(
      path.join(lorebooksDir, '_order.json'),
      `${JSON.stringify([
        '00_system/opponents/fixed.risulorebook',
        '00_system/opponents',
        '00_system',
      ])}\n`,
      'utf8',
    );

    const result = await handleValidateOrder(
      { directory: 'lorebooks' },
      makeOkWorkspace(root),
    );

    expect(result.status).toBe('domain_warning');
    expect(
      result.diagnostics.filter(
        (diagnostic) => diagnostic.id === 'ORDER_DIRECTORY_AFTER_DESCENDANT',
      ),
    ).toHaveLength(2);
  });

  it('returns domain_warning when _order.json is missing', async () => {
    const workspace = makeOkWorkspace(STANDARD_ROOT);
    const result = await handleValidateOrder(
      { directory: 'modules/mymod/lua' },
      workspace,
    );

    expect(result.status).toBe('domain_warning');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].id).toBe('ORDER_FILE_MISSING');
  });

  it('returns Task 2 contract envelope shape', async () => {
    const workspace = makeOkWorkspace(STANDARD_ROOT);
    const result = await handleValidateOrder(
      { directory: 'characters/merry/lorebooks' },
      workspace,
    );

    expect(result).toHaveProperty('schema', 'risuai-workbench-mcp.diagnostics');
    expect(result).toHaveProperty('schemaVersion', '0.2.0');
    expect(result).toHaveProperty('tool', 'workbench.validate_order');
    expect(result).toHaveProperty('summary');
    expect(result.summary).toHaveProperty('errorCount');
    expect(result.summary).toHaveProperty('warningCount');
    expect(result.summary).toHaveProperty('infoCount');
  });

  it('returns domain_error when workspace is unavailable', async () => {
    const workspace: WorkspaceRootStatus = { ok: false, path: '/nonexistent', reason: 'root-not-found' };
    const result = await handleValidateOrder(
      { directory: 'characters/merry/lorebooks' },
      workspace,
    );

    expect(result.status).toBe('domain_error');
    expect(result.diagnostics[0].id).toBe('WORKSPACE_ROOT_UNAVAILABLE');
  });

  it('returns domain_error for path traversal attempt', async () => {
    const workspace = makeOkWorkspace(STANDARD_ROOT);
    const result = await handleValidateOrder(
      { directory: '../../../etc' },
      workspace,
    );

    expect(result.status).toBe('domain_error');
    expect(result.diagnostics[0].category).toBe('path');
    expect(result.diagnostics[0].id).toBe('PATH_RESOLVE_FAILED');
  });
});
