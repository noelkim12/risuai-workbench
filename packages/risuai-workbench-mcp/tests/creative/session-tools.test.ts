/**
 * Explicit creative session and memory persistence tool tests.
 * @file packages/risuai-workbench-mcp/tests/creative/session-tools.test.ts
 */

import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildBrainstormScamperResult } from '../../src/creative/ideation-tools';
import { saveIdeaSession, writeIdeaMemory } from '../../src/creative/session-tools';
import { CREATIVE_SCHEMA_VERSION } from '../../src/contracts/creative';
import { handleRankIdeas } from '../../src/tools/creative/ranking-critique-handlers';

async function createWorkspace(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-creative-session-tools-'));
}

async function listRelativeFiles(root: string): Promise<readonly string[]> {
  const entries: string[] = [];

  async function walk(relativeDir: string): Promise<void> {
    const absoluteDir = path.join(root, relativeDir);
    for (const entry of await readdir(absoluteDir, { withFileTypes: true })) {
      const relativePath = path.join(relativeDir, entry.name);
      if (entry.isDirectory()) {
        await walk(relativePath);
      } else {
        entries.push(relativePath.split(path.sep).join('/'));
      }
    }
  }

  await walk('');
  return entries.sort();
}

function expectSingleDiagnosticId(result: { diagnostics: readonly { id: string }[] }, id: string): void {
  expect(result.diagnostics).toHaveLength(1);
  expect(result.diagnostics[0]?.id).toBe(id);
}

describe('creative explicit persistence tools', () => {
  it('save_idea_session writes workspace-local schema-versioned session JSON and no source artifacts', async () => {
    const workspaceRoot = await createWorkspace();
    const sentinelPath = path.join(workspaceRoot, 'source-sentinel.txt');
    await writeFile(sentinelPath, 'source unchanged\n', 'utf8');

    const result = await saveIdeaSession({
      createdAt: '2026-05-22T02:00:00.000Z',
      ideas: [{ assumptions: ['caller assumption'], evidence: ['risuai-workbench://wiki/example'], id: 'idea-1', summary: 'Persist explicitly.', title: 'Explicit persistence' }],
      sessionId: 'explicit-session',
      title: 'Explicit Session',
      workspaceRoot,
    });

    expect(result.status).toBe('ok');
    expect(result.data).toMatchObject({
      persistentMemoryWritten: false,
      resourceUri: 'risuai-workbench://ideas/sessions/explicit-session',
      schema: 'risuai-workbench-mcp.creative.session-write',
      schemaVersion: CREATIVE_SCHEMA_VERSION,
      sessionId: 'explicit-session',
      sessionWritten: true,
      sourceArtifactWritten: false,
    });

    const written = JSON.parse(await readFile(path.join(workspaceRoot, '.risuai-workbench-mcp/creative/sessions/explicit-session.json'), 'utf8'));
    expect(written).toMatchObject({ schema: 'risuai-workbench-mcp.creative.session', schemaVersion: CREATIVE_SCHEMA_VERSION, sessionId: 'explicit-session', workspaceRoot });
    expect(await readFile(sentinelPath, 'utf8')).toBe('source unchanged\n');
  });

  it('write_idea_memory writes workspace-local privacy/retention metadata and no source artifacts', async () => {
    const workspaceRoot = await createWorkspace();
    const sentinelPath = path.join(workspaceRoot, 'source-sentinel.txt');
    await writeFile(sentinelPath, 'source unchanged\n', 'utf8');

    const result = await writeIdeaMemory({
      idea: { assumptions: ['requires user review'], evidence: ['risuai-workbench://analyze/demo'], id: 'idea-memory-1', summary: 'Remember locally.', title: 'Local memory' },
      memoryId: 'memory-1',
      privacy: { classification: 'private', containsSecrets: false, redactions: ['api keys'] },
      retention: { policy: 'delete-on-request', reason: 'User explicitly saved the idea for this workspace.' },
      sessionId: 'explicit-session',
      workspaceRoot,
    });

    expect(result.status).toBe('ok');
    expect(result.data).toMatchObject({
      ideaId: 'idea-memory-1',
      memoryId: 'memory-1',
      persistentMemoryWritten: true,
      resourceUri: 'risuai-workbench://ideas/idea-memory-1/memory/memory-1',
      sourceArtifactWritten: false,
    });
    expect(result.data?.privacy).toMatchObject({ classification: 'private', containsSecrets: false, redactions: ['api keys'] });
    expect(result.data?.retention).toMatchObject({ policy: 'delete-on-request', reason: 'User explicitly saved the idea for this workspace.' });

    const written = JSON.parse(await readFile(path.join(workspaceRoot, '.risuai-workbench-mcp/creative/memory/memory-1.json'), 'utf8'));
    expect(written).toMatchObject({ schema: 'risuai-workbench-mcp.creative.memory', schemaVersion: CREATIVE_SCHEMA_VERSION, memoryId: 'memory-1', workspaceRoot });
    expect(written.privacy.containsSecrets).toBe(false);
    expect(await readFile(sentinelPath, 'utf8')).toBe('source unchanged\n');
  });

  it('rejects duplicate memory ids with a structured diagnostic and does not overwrite the original file', async () => {
    const workspaceRoot = await createWorkspace();

    const first = await writeIdeaMemory({
      idea: { assumptions: ['original'], evidence: [], id: 'idea-dup', summary: 'Original memory.', title: 'Original' },
      memoryId: 'dup-memory',
      privacy: { classification: 'workspace-local', containsSecrets: false, redactions: [] },
      retention: { policy: 'workspace-local', reason: 'Original write.' },
      workspaceRoot,
    });
    expect(first.status).toBe('ok');

    const second = await writeIdeaMemory({
      idea: { assumptions: ['duplicate'], evidence: [], id: 'idea-dup', summary: 'Duplicate memory.', title: 'Duplicate' },
      memoryId: 'dup-memory',
      privacy: { classification: 'public-summary', containsSecrets: false, redactions: [] },
      retention: { policy: 'delete-on-request', reason: 'Duplicate write.' },
      workspaceRoot,
    });
    expect(second.status).toBe('domain_error');
    expectSingleDiagnosticId(second, 'CREATIVE_MEMORY_ALREADY_EXISTS');
    expect(second.data).toBeUndefined();

    const written = JSON.parse(await readFile(path.join(workspaceRoot, '.risuai-workbench-mcp/creative/memory/dup-memory.json'), 'utf8'));
    expect(written).toMatchObject({ memoryId: 'dup-memory', idea: { title: 'Original' }, retention: { reason: 'Original write.' } });
  });

  it('rejects cross-workspace session saves without writing metadata or leaking source artifacts', async () => {
    const serverWorkspace = await createWorkspace();
    const foreignWorkspace = await createWorkspace();
    const beforeFiles = await listRelativeFiles(serverWorkspace);

    const result = await saveIdeaSession(
      {
        session: {
          createdAt: '2026-05-22T02:00:00.000Z',
          ideas: [],
          patchPlanRefs: [],
          rankings: {},
          schema: 'risuai-workbench-mcp.creative.session',
          schemaVersion: CREATIVE_SCHEMA_VERSION,
          sessionId: 'foreign-session',
          sourceInputs: [],
          status: 'active',
          title: 'Foreign Session',
          updatedAt: '2026-05-22T02:00:00.000Z',
          workspaceRoot: foreignWorkspace,
        },
      },
      { workspaceRoot: serverWorkspace },
    );

    expect(result.status).toBe('domain_error');
    expectSingleDiagnosticId(result, 'CREATIVE_WORKSPACE_MISMATCH');
    expect(result.data).toBeUndefined();
    expect(await listRelativeFiles(serverWorkspace)).toEqual(beforeFiles);
  });

  it('rejects unsupported schemas and secret-marked memory without writing metadata', async () => {
    const workspaceRoot = await createWorkspace();
    await mkdir(path.join(workspaceRoot, '.risuai-workbench-mcp/creative'), { recursive: true });
    const beforeFiles = await listRelativeFiles(workspaceRoot);

    const unsupportedSession = await saveIdeaSession({ schemaVersion: '0.1.0', sessionId: 'old-session', title: 'Old', workspaceRoot });
    expect(unsupportedSession.status).toBe('domain_error');
    expectSingleDiagnosticId(unsupportedSession, 'CREATIVE_SESSION_SCHEMA_UNSUPPORTED');

    const secretMemory = await writeIdeaMemory({ ideaId: 'secret-idea', privacy: { containsSecrets: true }, workspaceRoot });
    expect(secretMemory.status).toBe('domain_error');
    expectSingleDiagnosticId(secretMemory, 'CREATIVE_POLICY_DENIED');
    expect(secretMemory.data).toBeUndefined();

    expect(await listRelativeFiles(workspaceRoot)).toEqual(beforeFiles);
  });

  it('read-only creative tools do not implicitly persist sessions or memory', async () => {
    const workspaceRoot = await createWorkspace();
    await writeFile(path.join(workspaceRoot, 'source-sentinel.txt'), 'source unchanged\n', 'utf8');
    const beforeFiles = await listRelativeFiles(workspaceRoot);

    const brainstorm = buildBrainstormScamperResult({ artifactKey: 'characters/demo', sessionId: 'read-only-session', theme: 'memory separation', workspaceRoot });
    const ranked = await handleRankIdeas({ ideas: brainstorm.ideas, sessionId: 'read-only-session', workspaceRoot });

    expect(brainstorm.session.sourceArtifactWritten).toBe(false);
    expect(brainstorm.session.persistentMemoryWritten).toBe(false);
    expect(ranked.data?.readOnly).toBe(true);
    expect(ranked.data?.sessionWrites).toEqual([]);
    expect(await listRelativeFiles(workspaceRoot)).toEqual(beforeFiles);
  });
});
