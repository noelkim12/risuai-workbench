/**
 * Creative session store persistence tests.
 * @file packages/risuai-workbench-mcp/tests/creative/session-store.test.ts
 */

import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CREATIVE_SCHEMA_VERSION } from '../../src/contracts/creative';
import {
  createCreativeSessionInStore,
  CREATIVE_SESSION_METADATA_DIR,
  getCreativeSessionRelativePath,
  loadCreativeSessionFromStore,
  updateCreativeSessionInStore,
} from '../../src/creative';

async function createWorkspace(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-creative-session-'));
}

function expectSingleDiagnosticId(result: { diagnostics: readonly { id: string }[] }, id: string): void {
  expect(result.diagnostics).toHaveLength(1);
  expect(result.diagnostics[0]?.id).toBe(id);
}

describe('creative session store', () => {
  it('creates, loads, and updates workspace-local schema-versioned sessions only when helpers are called', async () => {
    const workspaceRoot = await createWorkspace();

    const created = await createCreativeSessionInStore({
      createdAt: '2026-05-22T00:00:00.000Z',
      ideas: [
        {
          assumptions: ['prototype only'],
          evidence: ['docs/mcp/reference.md'],
          id: 'idea-1',
          summary: 'Keep creative memory explicit and local.',
          title: 'Local explicit memory',
        },
      ],
      rankings: { 'idea-1': { mutationReadiness: 'needs-validation', score: 0.7 } },
      sessionId: 'session-1',
      sourceInputs: [{ artifactKey: 'characters/merry', resourceLinks: ['risuai-workbench://wiki/merry'] }],
      title: 'Session One',
      workspaceRoot,
    });

    expect(created.status).toBe('ok');
    expect(created.data?.relativePath).toBe(`${CREATIVE_SESSION_METADATA_DIR}/session-1.json`);
    expect(created.data?.session).toMatchObject({
      schema: 'risuai-workbench-mcp.creative.session',
      schemaVersion: CREATIVE_SCHEMA_VERSION,
      sessionId: 'session-1',
      status: 'active',
      title: 'Session One',
    });

    const raw = await readFile(path.join(workspaceRoot, getCreativeSessionRelativePath('session-1')), 'utf8');
    expect(JSON.parse(raw)).toMatchObject({ sessionId: 'session-1', workspaceRoot });

    const loaded = await loadCreativeSessionFromStore({ sessionId: 'session-1', workspaceRoot });
    expect(loaded.status).toBe('ok');
    expect(loaded.data?.session?.ideas).toHaveLength(1);

    const updated = await updateCreativeSessionInStore({
      sessionId: 'session-1',
      update: (session) => ({ ...session, status: 'completed', title: 'Session One Complete', updatedAt: '2026-05-22T01:00:00.000Z' }),
      workspaceRoot,
    });

    expect(updated.status).toBe('ok');
    expect(updated.data?.session).toMatchObject({ status: 'completed', title: 'Session One Complete', updatedAt: '2026-05-22T01:00:00.000Z' });
  });

  it('does not leak session content on workspace mismatch', async () => {
    const originalWorkspace = await createWorkspace();
    const requestedWorkspace = await createWorkspace();
    await mkdir(path.join(requestedWorkspace, CREATIVE_SESSION_METADATA_DIR), { recursive: true });

    const created = await createCreativeSessionInStore({
      ideas: [
        {
          assumptions: ['secret assumption'],
          evidence: ['private evidence'],
          id: 'idea-secret',
          summary: 'Do not leak me.',
          title: 'Secret idea',
        },
      ],
      patchPlanRefs: [{ ideaId: 'idea-secret', patchPlanId: 'patch-secret', resourceUri: 'risuai-workbench://mutations/patch-plans/patch-secret' }],
      sessionId: 'mismatch-session',
      title: 'Original workspace session',
      workspaceRoot: originalWorkspace,
    });
    expect(created.status).toBe('ok');

    const sourcePath = path.join(originalWorkspace, getCreativeSessionRelativePath('mismatch-session'));
    const targetPath = path.join(requestedWorkspace, getCreativeSessionRelativePath('mismatch-session'));
    await writeFile(targetPath, await readFile(sourcePath, 'utf8'), 'utf8');

    const loaded = await loadCreativeSessionFromStore({ sessionId: 'mismatch-session', workspaceRoot: requestedWorkspace });

    expect(loaded.status).toBe('domain_error');
    expectSingleDiagnosticId(loaded, 'CREATIVE_WORKSPACE_MISMATCH');
    expect(loaded.data).toBeUndefined();
    expect(JSON.stringify(loaded)).not.toContain('Do not leak me');
    expect(JSON.stringify(loaded)).not.toContain('patch-secret');
  });

  it('returns deterministic diagnostics for malformed JSON and unsupported schema versions', async () => {
    const workspaceRoot = await createWorkspace();
    await mkdir(path.join(workspaceRoot, CREATIVE_SESSION_METADATA_DIR), { recursive: true });

    await writeFile(path.join(workspaceRoot, getCreativeSessionRelativePath('bad-json')), '{"schemaVersion":', 'utf8');
    const malformed = await loadCreativeSessionFromStore({ sessionId: 'bad-json', workspaceRoot });
    expect(malformed.status).toBe('domain_error');
    expectSingleDiagnosticId(malformed, 'CREATIVE_SESSION_JSON_MALFORMED');

    await writeFile(
      path.join(workspaceRoot, getCreativeSessionRelativePath('old-schema')),
      `${JSON.stringify({ schema: 'risuai-workbench-mcp.creative.session', schemaVersion: '0.1.0', sessionId: 'old-schema', workspaceRoot })}\n`,
      'utf8',
    );
    const unsupported = await loadCreativeSessionFromStore({ sessionId: 'old-schema', workspaceRoot });
    expect(unsupported.status).toBe('domain_error');
    expectSingleDiagnosticId(unsupported, 'CREATIVE_SESSION_SCHEMA_UNSUPPORTED');
  });

  it('rejects duplicate session ids and unsafe session ids deterministically', async () => {
    const workspaceRoot = await createWorkspace();

    const first = await createCreativeSessionInStore({ sessionId: 'dup-session', title: 'Dup', workspaceRoot });
    const duplicate = await createCreativeSessionInStore({ sessionId: 'dup-session', title: 'Dup again', workspaceRoot });
    const unsafe = await createCreativeSessionInStore({ sessionId: '../escape', title: 'Unsafe', workspaceRoot });

    expect(first.status).toBe('ok');
    expect(duplicate.status).toBe('domain_error');
    expectSingleDiagnosticId(duplicate, 'CREATIVE_SESSION_ALREADY_EXISTS');
    expect(unsafe.status).toBe('domain_error');
    expectSingleDiagnosticId(unsafe, 'CREATIVE_SESSION_ID_UNSAFE');
  });

  it('ignores leftover temp files and reports missing or partial final files deterministically', async () => {
    const workspaceRoot = await createWorkspace();
    const sessionDir = path.join(workspaceRoot, CREATIVE_SESSION_METADATA_DIR);
    await mkdir(sessionDir, { recursive: true });

    await writeFile(path.join(sessionDir, '.partial-session.json.leftover.tmp'), '{"partial": true}', 'utf8');
    const missing = await loadCreativeSessionFromStore({ sessionId: 'partial-session', workspaceRoot });
    expect(missing.status).toBe('domain_error');
    expectSingleDiagnosticId(missing, 'CREATIVE_SESSION_NOT_FOUND');

    await writeFile(path.join(workspaceRoot, getCreativeSessionRelativePath('partial-session')), '{"schemaVersion":"0.2.0"', 'utf8');
    const partialFinal = await loadCreativeSessionFromStore({ sessionId: 'partial-session', workspaceRoot });
    expect(partialFinal.status).toBe('domain_error');
    expectSingleDiagnosticId(partialFinal, 'CREATIVE_SESSION_JSON_MALFORMED');
  });
});
