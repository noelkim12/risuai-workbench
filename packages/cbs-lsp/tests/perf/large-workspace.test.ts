/**
 * Large workspace regression/perf guards for the standalone CLI surface.
 * @file packages/cbs-lsp/tests/perf/large-workspace.test.ts
 */

import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { CBSBuiltinRegistry } from 'risu-workbench-core';
import type { Diagnostic } from 'vscode-languageserver/node';

import { FragmentAnalysisService } from '../../src/core';
import { SemanticTokensProvider } from '../../src/features/semanticTokens';
import { CompletionProvider } from '../../src/features/completion';
import { CodeActionProvider } from '../../src/features/codeActions';
import {
  assembleDiagnosticsForRequest,
  routeDiagnosticsForDocument,
} from '../../src/utils/diagnostics-router';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';

import {
  createWorkspaceRoot,
  ensureBuiltPackage,
  runCliJson,
  spawnCliProcess,
  writeWorkspaceFile,
} from '../product/test-helpers';
import { StdioLspClient } from '../product/stdio-helpers';
import {
  createVariableFlowQueryResult,
  createVariableFlowServiceStub,
} from '../features/variable-flow-test-helpers';

interface Layer1ReportPayload {
  graph: {
    totalVariables: number;
  };
  registry: {
    summary: {
      totalElements: number;
      totalFiles: number;
    };
  };
}

interface VariableQueryPayload {
  query: {
    contract: {
      layer: string;
    };
    variableFlow: {
      readers: unknown[];
      variableName: string;
      writers: unknown[];
    };
  };
}

const tempRoots: string[] = [];

/**
 * createLargeWorkspace 함수.
 * product-level cold-start와 query regression을 잡기 위한 큰 extracted workspace를 생성함.
 *
 * @param pairCount - lorebook/regex 파일 쌍 개수
 * @returns 생성된 workspace root
 */
async function createLargeWorkspace(pairCount: number): Promise<string> {
  const root = await createWorkspaceRoot('cbs-lsp-large-workspace-', tempRoots);

  for (let index = 0; index < pairCount; index += 1) {
    const variableName = `shared_${index}`;
    const lorebookText = [
      '---',
      `name: Entry${index}`,
      'comment: perf',
      'constant: false',
      'selective: false',
      'enabled: true',
      `insertion_order: ${index}`,
      'case_sensitive: false',
      'use_regex: false',
      '---',
      '@@@ KEYS',
      `entry-${index}`,
      '@@@ CONTENT',
      `{{setvar::${variableName}::ready}} reader-${index}`,
      '',
    ].join('\n');
    const regexText = [
      '---',
      `comment: reader-${index}`,
      'type: plain',
      '---',
      '@@@ IN',
      `{{getvar::${variableName}}}`,
      '',
    ].join('\n');

    await Promise.all([
      writeWorkspaceFile(root, `lorebooks/entry-${index}.risulorebook`, lorebookText),
      writeWorkspaceFile(root, `regex/reader-${index}.risuregex`, regexText),
    ]);
  }

  return root;
}

const childProcesses = new Set<ChildProcessWithoutNullStreams>();

afterEach(async () => {
  for (const child of childProcesses) {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
    }
  }
  childProcesses.clear();
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function createStdioClientWithTracking(args: readonly string[]): StdioLspClient {
  const child = spawnCliProcess(args);
  childProcesses.add(child);
  return new StdioLspClient(child);
}

describe.sequential('cbs-language-server large workspace product matrix', () => {
  it('keeps large extracted workspace report/query flows within a practical regression budget', async () => {
    ensureBuiltPackage();
    const pairCount = 80;
    const root = await createLargeWorkspace(pairCount);

    const reportStart = performance.now();
    const { payload: report } = runCliJson<Layer1ReportPayload>([
      'report',
      'layer1',
      '--workspace',
      root,
    ]);
    const reportDurationMs = performance.now() - reportStart;

    const queryStart = performance.now();
    const { payload: query } = runCliJson<VariableQueryPayload>([
      'query',
      'variable',
      'shared_79',
      '--workspace',
      root,
    ]);
    const queryDurationMs = performance.now() - queryStart;

    expect(report.registry.summary).toMatchObject({
      totalFiles: pairCount * 2,
      totalElements: pairCount * 2,
    });
    expect(report.graph.totalVariables).toBeGreaterThanOrEqual(pairCount);
    expect(query.query.variableFlow.variableName).toBe('shared_79');
    expect(query.query.variableFlow.readers.length).toBeGreaterThan(0);
    expect(query.query.variableFlow.writers.length).toBeGreaterThan(0);
    expect(reportDurationMs).toBeLessThan(20_000);
    expect(queryDurationMs).toBeLessThan(10_000);
  }, 30_000);

  it('keeps semantic token range payloads meaningfully smaller than full-document payloads on large CBS documents', () => {
    const provider = new SemanticTokensProvider(new FragmentAnalysisService());
    const bodyLineCount = 20;
    const bodyLines = Array.from({ length: bodyLineCount }, (_value, index) => {
      return `{{setvar::shared_${index}::${index}}} {{#when::shared_${index}::is::${index}}}ok{{:else}}no{{/}}`;
    });
    const text = ['---', 'name: perf-range', '---', '@@@ CONTENT', ...bodyLines, ''].join('\n');
    const request = {
      uri: 'file:///fixtures/perf-semantic-range.risulorebook',
      version: 1,
      filePath: '/fixtures/perf-semantic-range.risulorebook',
      text,
    };

    const fullPayload = provider.provide({ textDocument: { uri: request.uri } }, request).data;
    const rangePayload = provider.provideRange(
      {
        textDocument: { uri: request.uri },
        range: {
          start: { line: 4, character: 0 },
          end: { line: 6, character: 0 },
        },
      },
      request,
    ).data;

    expect(fullPayload.length).toBeGreaterThan(0);
    expect(rangePayload.length).toBeGreaterThan(0);
    expect(rangePayload.length).toBeLessThan(fullPayload.length);
    expect(fullPayload.length / rangePayload.length).toBeGreaterThan(8);
  });

  it('keeps unresolved completion payloads meaningfully smaller than resolved payloads under a stable contract', () => {
    const analysisService = new FragmentAnalysisService();
    const text = ['---', 'name: perf-resolve', '---', '@@@ CONTENT', '{{#if::ready}}ok{{/if}}', ''].join('\n');
    const request = {
      uri: 'file:///fixtures/perf-completion-resolve.risulorebook',
      version: 1,
      filePath: '/fixtures/perf-completion-resolve.risulorebook',
      text,
    };
    const params = { textDocument: { uri: request.uri }, position: { line: 4, character: 2 } };
    const provider = new CompletionProvider(new CBSBuiltinRegistry(), {
      analysisService,
      resolveRequest: ({ textDocument }) => (textDocument.uri === request.uri ? request : null),
    });

    const unresolved = provider.provideUnresolved(params);
    const resolved = provider.provide(params);

    expect(unresolved.length).toBeGreaterThan(0);
    expect(resolved.length).toBe(unresolved.length);

    const unresolvedSize = JSON.stringify(unresolved).length;
    const resolvedSize = JSON.stringify(resolved).length;

    expect(unresolvedSize).toBeLessThan(resolvedSize);
    expect(resolvedSize / unresolvedSize).toBeGreaterThan(2);

    const firstUnresolved = unresolved[0];
    const firstResolved = provider.resolve(firstUnresolved, params);
    expect(firstResolved).not.toBeNull();
    expect(firstResolved!.detail).toBeDefined();
    expect(firstResolved!.documentation).toBeDefined();
  });

  it('keeps unresolved code action payloads meaningfully smaller than resolved payloads under a stable contract', () => {
    const text = ['---', 'name: perf-action-resolve', '---', '@@@ CONTENT', '{{#if::ready}}ok{{/if}}', ''].join('\n');
    const request = {
      uri: 'file:///fixtures/perf-code-action-resolve.risulorebook',
      version: 1,
      filePath: '/fixtures/perf-code-action-resolve.risulorebook',
      text,
    };
    const provider = new CodeActionProvider({
      resolveRequest: (uri) => (uri === request.uri ? request : null),
    });

    // Use real diagnostics from analysis so action generators have genuine metadata to work with.
    const diagnostics = routeDiagnosticsForDocument(request.filePath, request.text, {}, request);
    expect(diagnostics.length).toBeGreaterThan(0);

    const diagnostic = diagnostics[0]!;
    const params = {
      textDocument: { uri: request.uri },
      range: diagnostic.range,
      context: { diagnostics: [diagnostic as Diagnostic] },
    };

    const unresolved = provider.provideUnresolved(params);
    const resolved = provider.provide(params);

    expect(unresolved.length).toBeGreaterThan(0);
    expect(resolved.length).toBe(unresolved.length);

    const unresolvedSize = JSON.stringify(unresolved).length;
    const resolvedSize = JSON.stringify(resolved).length;

    expect(unresolvedSize).toBeLessThan(resolvedSize);
    expect(resolvedSize / unresolvedSize).toBeGreaterThan(2);

    const firstUnresolved = unresolved[0];
    const firstResolved = provider.resolve(firstUnresolved, params);
    expect(firstResolved).not.toBeNull();
    expect(firstResolved!.edit).toBeDefined();
  });

  it('keeps default-only workspace variable completion on cached summary budget', () => {
    const variableCount = 1_000;
    const variableNames = Array.from({ length: variableCount }, (_value, index) => `ct_default_${index}`);
    const text = ['---', 'name: perf-completion-defaults', '---', '@@@ CONTENT', '{{getvar::ct_default_}}', ''].join('\n');
    const request = {
      uri: 'file:///fixtures/perf-completion-defaults.risulorebook',
      version: 1,
      filePath: '/fixtures/perf-completion-defaults.risulorebook',
      text,
    };
    const queryVariable = vi.fn(() => null);
    const provider = new CompletionProvider(new CBSBuiltinRegistry(), {
      analysisService: new FragmentAnalysisService(),
      resolveRequest: ({ textDocument }) => (textDocument.uri === request.uri ? request : null),
      variableFlowService: createVariableFlowServiceStub({
        getAllVariableNames: () => variableNames,
        getVariableCompletionSummaries: () =>
          variableNames.map((name) => ({
            name,
            readerCount: 0,
            writerCount: 0,
            defaultDefinitionCount: 1,
            hasWritableSource: true,
          })),
        queryVariable,
      }),
    });

    const startedAt = performance.now();
    const completions = provider.provide({
      textDocument: { uri: request.uri },
      position: { line: 4, character: '{{getvar::ct_default_'.length },
    });
    const durationMs = performance.now() - startedAt;

    expect(completions.length).toBe(variableCount);
    expect(queryVariable).not.toHaveBeenCalled();
    expect(durationMs).toBeLessThan(250);
  });

  it('keeps diagnostics fallback scoped and memoized for repeated .risulua ranges', () => {
    const text = '{{getvar::ct_seeded}} {{getvar::ct_seeded}}\n';
    const request = {
      uri: 'file:///fixtures/perf-diagnostics.risulua',
      version: 1,
      filePath: '/fixtures/perf-diagnostics.risulua',
      text,
    };
    const localDiagnostics = routeDiagnosticsForDocument(request.filePath, request.text, {}, request);
    const duplicatedDiagnostics = [...localDiagnostics, ...localDiagnostics];
    const queryVariable = vi.fn((name: string) =>
      name === 'ct_seeded'
        ? { ...createVariableFlowQueryResult(name, [], []), defaultValue: '1' }
        : null,
    );
    const fallbackTraceStats = {
      attempts: 0,
      hits: 0,
      misses: 0,
      durationMs: 0,
      byCode: {},
    };

    const startedAt = performance.now();
    const diagnostics = assembleDiagnosticsForRequest({
      fallbackTraceStats,
      localDiagnostics: duplicatedDiagnostics,
      request,
      workspaceVariableFlowService: createVariableFlowServiceStub({
        queryAt: () => null,
        queryVariable,
      }),
    });
    const durationMs = performance.now() - startedAt;

    expect(diagnostics).toEqual([]);
    expect(fallbackTraceStats.attempts).toBeLessThanOrEqual(localDiagnostics.length);
    expect(queryVariable.mock.calls.length).toBeLessThanOrEqual(localDiagnostics.length);
    expect(durationMs).toBeLessThan(250);
  });

  it('keeps standalone server cold-start within a practical budget', async () => {
    ensureBuiltPackage();
    const pairCount = 20;
    const root = await createLargeWorkspace(pairCount);

    const spawnStart = performance.now();
    const client = createStdioClientWithTracking([
      '--stdio',
      '--workspace',
      root,
      '--luals-path',
      path.join(root, 'missing', 'lua-language-server'),
    ]);

    const initializeResult = (await client.request('initialize', {
      processId: null,
      rootUri: pathToFileURL(root).toString(),
      workspaceFolders: [{ uri: pathToFileURL(root).toString(), name: 'perf' }],
      capabilities: {},
    }, 20_000)) as { capabilities?: unknown };
    const coldStartMs = performance.now() - spawnStart;

    expect(initializeResult.capabilities).toBeDefined();
    expect(coldStartMs).toBeLessThan(10_000);

    client.notify('initialized', {});
    await client.shutdown();
    const exitCode = await client.waitForExit(10_000);
    expect(exitCode).toBe(0);
  }, 30_000);

  it('keeps incremental document rebuild within a practical budget', async () => {
    ensureBuiltPackage();
    const pairCount = 20;
    const root = await createLargeWorkspace(pairCount);
    const firstEntryPath = path.join(root, 'lorebooks/entry-0.risulorebook');
    const firstEntryUri = pathToFileURL(firstEntryPath).toString();
    const originalText = [
      '---',
      'name: Entry0',
      'comment: perf',
      'constant: false',
      'selective: false',
      'enabled: true',
      'insertion_order: 0',
      'case_sensitive: false',
      'use_regex: false',
      '---',
      '@@@ KEYS',
      'entry-0',
      '@@@ CONTENT',
      '{{setvar::shared_0::ready}} reader-0',
      '',
    ].join('\n');
    const changedText = [
      '---',
      'name: Entry0',
      'comment: perf',
      'constant: false',
      'selective: false',
      'enabled: true',
      'insertion_order: 0',
      'case_sensitive: false',
      'use_regex: false',
      '---',
      '@@@ KEYS',
      'entry-0',
      '@@@ CONTENT',
      '{{setvar::shared_0::changed}} reader-0',
      '',
    ].join('\n');

    const client = createStdioClientWithTracking([
      '--stdio',
      '--workspace',
      root,
      '--luals-path',
      path.join(root, 'missing', 'lua-language-server'),
    ]);

    await client.request('initialize', {
      processId: null,
      rootUri: pathToFileURL(root).toString(),
      workspaceFolders: [{ uri: pathToFileURL(root).toString(), name: 'perf' }],
      capabilities: {},
    }, 20_000);
    client.notify('initialized', {});

    client.notify('textDocument/didOpen', {
      textDocument: {
        uri: firstEntryUri,
        languageId: 'plaintext',
        version: 1,
        text: originalText,
      },
    });

    // Wait for the first empty-diagnostics notification to confirm the document is analyzed.
    const firstDiagnostics = await client.waitForNotification(
      'textDocument/publishDiagnostics',
      (params: unknown) => (params as { uri: string }).uri === firstEntryUri,
      20_000,
    );
    expect(Array.isArray((firstDiagnostics as { diagnostics: unknown[] }).diagnostics)).toBe(true);

    const changeStart = performance.now();
    client.notify('textDocument/didChange', {
      textDocument: { uri: firstEntryUri, version: 2 },
      contentChanges: [{ text: changedText }],
    });

    // Use a completion request as the signal that incremental re-analysis is complete.
    // This avoids notification race conditions and still measures the incremental rebuild cost accurately.
    const completion = (await client.request('textDocument/completion', {
      textDocument: { uri: firstEntryUri },
      position: { line: 8, character: 2 },
    }, 20_000)) as { items?: Array<{ label: string }> } | Array<{ label: string }> | null;
    const incrementalRebuildMs = performance.now() - changeStart;

    expect(completion).toBeDefined();
    expect(incrementalRebuildMs).toBeLessThan(5_000);

    await client.shutdown();
    const exitCode = await client.waitForExit(10_000);
    expect(exitCode).toBe(0);
  }, 45_000);

  it('keeps stdio client attach cost within a practical budget', async () => {
    ensureBuiltPackage();
    const pairCount = 20;
    const root = await createLargeWorkspace(pairCount);
    const firstEntryPath = path.join(root, 'lorebooks/entry-0.risulorebook');
    const firstEntryUri = pathToFileURL(firstEntryPath).toString();
    const firstEntryText = [
      '---',
      'name: Entry0',
      'comment: perf',
      'constant: false',
      'selective: false',
      'enabled: true',
      'insertion_order: 0',
      'case_sensitive: false',
      'use_regex: false',
      '---',
      '@@@ KEYS',
      'entry-0',
      '@@@ CONTENT',
      '{{setvar::shared_0::ready}} reader-0',
      '',
    ].join('\n');

    const attachStart = performance.now();
    const client = createStdioClientWithTracking([
      '--stdio',
      '--workspace',
      root,
      '--luals-path',
      path.join(root, 'missing', 'lua-language-server'),
    ]);

    await client.request('initialize', {
      processId: null,
      rootUri: pathToFileURL(root).toString(),
      workspaceFolders: [{ uri: pathToFileURL(root).toString(), name: 'perf' }],
      capabilities: {},
    }, 20_000);
    client.notify('initialized', {});

    client.notify('textDocument/didOpen', {
      textDocument: {
        uri: firstEntryUri,
        languageId: 'plaintext',
        version: 1,
        text: firstEntryText,
      },
    });

    const firstDiagnostics = await client.waitForNotification(
      'textDocument/publishDiagnostics',
      (params: unknown) => (params as { uri: string }).uri === firstEntryUri,
      20_000,
    );
    const clientAttachMs = performance.now() - attachStart;

    expect(Array.isArray((firstDiagnostics as { diagnostics: unknown[] }).diagnostics)).toBe(true);
    expect(clientAttachMs).toBeLessThan(15_000);

    await client.shutdown();
    const exitCode = await client.waitForExit(10_000);
    expect(exitCode).toBe(0);
  }, 45_000);
});
