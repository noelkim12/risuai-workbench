/**
 * Tests for proposal-named analyze query tools restored after F1 audit.
 * @file packages/risuai-workbench-mcp/tests/tools/query-analyze-missing-tools.test.ts
 */

import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { computeFileHash } from '../../src/mutation/file-hash';
import type { WorkspaceRootStatus } from '../../src/project/resolve-root';
import {
  handleQueryDeadCodeFindings,
  handleQueryLuaAnalysis,
  handleQueryLuaStateAccess,
} from '../../src/tools/analyze/query-analyze';

interface AnalyzeFixture {
  contextPath: string;
  luaPath: string;
  root: string;
  workspace: WorkspaceRootStatus;
}

const luaSource = `
function boot()
  setState("mood", "happy")
  local current = getState("mood")
  setChatVar("energy", current)
end
`;

/**
 * createAnalyzeFixture 함수.
 * new analyze query handlers가 읽기 전용으로 참조할 temp workspace를 만든다.
 *
 * @returns Lua source와 context file을 포함한 temp fixture
 */
async function createAnalyzeFixture(): Promise<AnalyzeFixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-query-analyze-'));
  const luaPath = path.join(root, 'characters', 'merry', 'scripts', 'main.lua');
  const contextPath = path.join(root, 'characters', 'merry', 'analysis-context.json');
  await mkdir(path.dirname(luaPath), { recursive: true });
  await writeFile(luaPath, luaSource, 'utf8');
  await writeFile(contextPath, `${JSON.stringify({ fixture: 'dead-code-context' })}\n`, 'utf8');
  return { contextPath, luaPath, root, workspace: { ok: true, path: root, reason: null } };
}

describe('F1 analyze query surface tools', () => {
  it('returns normalized Lua analysis JSON with snapshot metadata and no source mutation', async () => {
    const fixture = await createAnalyzeFixture();
    const beforeHash = await computeFileHash(fixture.luaPath);

    const result = await handleQueryLuaAnalysis({ sourcePath: 'characters/merry/scripts/main.lua' }, fixture.workspace);

    expect(result.status).toBe('ok');
    expect(result.tool).toBe('workbench.query_lua_analysis');
    expect(result.data).toMatchObject({
      baseName: 'main',
      filePath: 'characters/merry/scripts/main.lua',
      snapshot: {
        analyzerVersion: '0.2.0',
        sourceHash: beforeHash,
        stale: false,
        workspaceRoot: fixture.root,
      },
      totalLines: luaSource.split('\n').length,
    });
    const data = result.data as {
      analyzeSummary: { apiByCategory: Array<{ category: string }>; callGraph: unknown[]; totals: { stateVars: number } };
      apiCalls: unknown[];
      functions: Array<{ name: string }>;
      handlers: unknown[];
      stateAccessOccurrences: Array<{ key: string }>;
      stateVars: Record<string, unknown>;
    };
    expect(data.analyzeSummary.apiByCategory.some((entry) => entry.category === 'state')).toBe(true);
    expect(data.analyzeSummary.callGraph).toEqual(expect.any(Array));
    expect(data.analyzeSummary.totals.stateVars).toBeGreaterThanOrEqual(2);
    expect(data.functions.some((fn) => fn.name === 'boot')).toBe(true);
    expect(data.stateAccessOccurrences.map((occurrence) => occurrence.key)).toEqual(expect.arrayContaining(['energy', 'mood']));
    expect(Object.keys(data.stateVars)).toEqual(expect.arrayContaining(['energy', 'mood']));
    expect(data.apiCalls.length).toBeGreaterThanOrEqual(3);
    expect(data.handlers).toEqual(expect.any(Array));
    expect(JSON.stringify(result.data)).not.toContain('"apiByCategory":{}');
    expect(await computeFileHash(fixture.luaPath)).toBe(beforeHash);
    expect(await readFile(fixture.luaPath, 'utf8')).toBe(luaSource);
  });

  it('returns Lua state access occurrences and read/write summaries without mutating source files', async () => {
    const fixture = await createAnalyzeFixture();
    const beforeHash = await computeFileHash(fixture.luaPath);

    const result = await handleQueryLuaStateAccess({ sourcePath: 'characters/merry/scripts/main.lua' }, fixture.workspace);

    expect(result.status).toBe('ok');
    expect(result.tool).toBe('workbench.query_lua_state_access');
    expect(result.data).toMatchObject({
      snapshot: { sourceHash: beforeHash, stale: false },
      summary: { totalReads: 1, totalWrites: 2 },
    });
    const data = result.data as {
      readSummary: Array<{ functions: string[]; key: string }>;
      stateAccessOccurrences: Array<{ direction: string; key: string }>;
      writeSummary: Array<{ functions: string[]; key: string }>;
    };
    expect(data.stateAccessOccurrences).toEqual(expect.arrayContaining([
      expect.objectContaining({ direction: 'write', key: 'mood' }),
      expect.objectContaining({ direction: 'read', key: 'mood' }),
      expect.objectContaining({ direction: 'write', key: 'energy' }),
    ]));
    expect(data.readSummary).toEqual([expect.objectContaining({ functions: ['boot'], key: 'mood' })]);
    expect(data.writeSummary.map((entry) => entry.key)).toEqual(['energy', 'mood']);
    expect(await computeFileHash(fixture.luaPath)).toBe(beforeHash);
  });

  it('returns dead-code findings from core analyzer and supports stale-policy refusal', async () => {
    const fixture = await createAnalyzeFixture();
    const beforeHash = await computeFileHash(fixture.contextPath);
    const first = await handleQueryDeadCodeFindings(
      {
        elements: [{ elementName: 'setup', elementType: 'regex', reads: [], writes: ['unused'] }],
        lorebookEntries: [
          { constant: false, enabled: true, insertionOrder: 10, keywords: ['mood'], name: 'newer', selective: false },
          { constant: false, enabled: true, insertionOrder: 1, keywords: ['mood'], name: 'older', selective: false },
        ],
        regexScripts: [{ in: 'same', name: 'noop-regex', out: 'same' }],
        sourcePath: 'characters/merry/analysis-context.json',
      },
      fixture.workspace,
    );

    expect(first.status).toBe('ok');
    expect(first.tool).toBe('workbench.query_dead_code_findings');
    expect(first.data).toMatchObject({
      snapshot: { sourceHash: beforeHash, stale: false },
      summary: { totalFindings: 3 },
      variableFlowSummary: { totalVariables: 1, withIssues: 1 },
    });
    const findings = (first.data as { findings: Array<{ type: string }> }).findings.map((finding) => finding.type);
    expect(findings).toEqual(expect.arrayContaining(['write-only-variable', 'shadowed-lorebook-keyword', 'no-effect-regex']));
    expect(await computeFileHash(fixture.contextPath)).toBe(beforeHash);

    await writeFile(fixture.contextPath, `${JSON.stringify({ fixture: 'dead-code-context-updated' })}\n`, 'utf8');
    const refused = await handleQueryDeadCodeFindings(
      {
        elements: [{ elementName: 'setup', elementType: 'regex', reads: [], writes: ['unused'] }],
        previousSnapshot: (first.data as { snapshot: { snapshotId: string; sourceHash: string } }).snapshot,
        sourcePath: 'characters/merry/analysis-context.json',
        stalePolicy: 'refuse',
      },
      fixture.workspace,
    );

    expect(refused.status).toBe('domain_error');
    expect(refused.diagnostics.some((diagnostic) => diagnostic.id === 'ANALYZE_SNAPSHOT_STALE')).toBe(true);
    expect(refused.data).toMatchObject({ snapshot: { stale: true, staleReasons: ['source-hash-changed'] } });
  });
});
