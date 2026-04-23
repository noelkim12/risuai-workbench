/**
 * Large workspace regression/perf guards for the standalone CLI surface.
 * @file packages/cbs-lsp/tests/perf/large-workspace.test.ts
 */

import { performance } from 'node:perf_hooks';
import { rm } from 'node:fs/promises';

import { afterEach, describe, expect, it } from 'vitest';

import { FragmentAnalysisService } from '../../src/core';
import { SemanticTokensProvider } from '../../src/features/semanticTokens';
import {
  createWorkspaceRoot,
  ensureBuiltPackage,
  runCliJson,
  writeWorkspaceFile,
} from '../product/test-helpers';

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

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

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
  });

  it('keeps semantic token range payloads meaningfully smaller than full-document payloads on large CBS documents', () => {
    const provider = new SemanticTokensProvider(new FragmentAnalysisService());
    const bodyLines = Array.from({ length: 240 }, (_value, index) => {
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
          end: { line: 10, character: 0 },
        },
      },
      request,
    ).data;

    expect(fullPayload.length).toBeGreaterThan(0);
    expect(rangePayload.length).toBeGreaterThan(0);
    expect(rangePayload.length).toBeLessThan(fullPayload.length);
    expect(fullPayload.length / rangePayload.length).toBeGreaterThan(10);
  });
});
