/**
 * VariableFlowService cross-file query contract tests.
 * @file packages/cbs-lsp/tests/services/variable-flow-service.test.ts
 */

import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';

import { afterEach, describe, expect, it } from 'vitest';
import { getCustomExtensionArtifactContract, type CustomExtensionArtifact } from 'risu-workbench-core';

import { ElementRegistry, FileScanner, UnifiedVariableGraph } from '../../src/indexer';
import { VariableFlowService } from '../../src/services';
import { snapshotLayer3Queries } from '../fixtures/fixture-corpus';

type WorkspaceFileSeed = {
  artifact: CustomExtensionArtifact;
  fileName: string;
  text: string;
  nestedSegments?: readonly string[];
};

const tempRoots: string[] = [];

/**
 * createWorkspaceRoot 함수.
 * VariableFlowService 테스트마다 격리된 임시 workspace root를 만듦.
 *
 * @returns 새로 만든 임시 workspace root 경로
 */
async function createWorkspaceRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cbs-lsp-variable-flow-service-'));
  tempRoots.push(root);
  return root;
}

/**
 * writeWorkspaceFile 함수.
 * artifact contract에 맞는 canonical 경로로 테스트 문서를 기록함.
 *
 * @param root - 테스트용 workspace root
 * @param seed - 기록할 artifact seed
 * @returns 기록된 파일의 workspace relative path
 */
async function writeWorkspaceFile(root: string, seed: WorkspaceFileSeed): Promise<string> {
  const contract = getCustomExtensionArtifactContract(seed.artifact);
  const relativePath = path.join(contract.directory, ...(seed.nestedSegments ?? []), seed.fileName);
  const absolutePath = path.join(root, relativePath);

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, seed.text, 'utf8');

  return relativePath.split(path.sep).join('/');
}

/**
 * buildService 함수.
 * seed 목록으로 workspace를 만들고 Layer 1 graph + Layer 3 service를 함께 생성함.
 *
 * @param seeds - 기록할 workspace 파일 seed 목록
 * @param defaultVariables - optional default variable seed
 * @returns registry, graph, service, relative path 묶음
 */
async function buildService(
  seeds: readonly WorkspaceFileSeed[],
  defaultVariables: Readonly<Record<string, string>> = {},
) {
  const root = await createWorkspaceRoot();
  const relativePaths = await Promise.all(seeds.map((seed) => writeWorkspaceFile(root, seed)));
  const scanResult = await new FileScanner(root).scan();
  const registry = new ElementRegistry(scanResult);
  const graph = UnifiedVariableGraph.fromRegistry(registry);
  const service = new VariableFlowService({ graph, registry, defaultVariables });

  return {
    root,
    relativePaths,
    scanResult,
    registry,
    graph,
    service,
  };
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('VariableFlowService', () => {
  it('aggregates cross-file readers and writers from lorebook, regex, and lua artifacts', async () => {
    const { service } = await buildService([
      {
        artifact: 'lorebook',
        fileName: 'writer.risulorebook',
        text: ['---', 'name: writer', '---', '@@@ CONTENT', '{{getvar::mood}}', ''].join('\n'),
      },
      {
        artifact: 'regex',
        fileName: 'reader.risuregex',
        text: ['---', 'comment: reader', 'type: plain', '---', '@@@ IN', '{{getvar::mood}}', ''].join(
          '\n',
        ),
      },
      {
        artifact: 'lua',
        fileName: 'reader.risulua',
        text: 'setState("mood", "happy")',
      },
    ]);

    const result = service.queryVariable('mood');

    expect(result).not.toBeNull();
    expect(result?.readers).toHaveLength(2);
    expect(result?.writers).toHaveLength(1);
    expect(service.queryVariable('mood')?.writers).toHaveLength(1);
    expect(result?.occurrences).toHaveLength(3);
    expect(result?.readers.map((entry) => entry.artifact)).toEqual(['lorebook', 'regex']);
    expect(result?.writers.map((entry) => entry.artifact)).toEqual(['lua']);
    expect(result?.occurrences.map((entry) => entry.occurrenceId)).toEqual(
      [...(result?.occurrences.map((entry) => entry.occurrenceId) ?? [])].sort((left, right) =>
        left.localeCompare(right),
      ),
    );
    expect(result?.flowEntry?.varName).toBe('mood');
    expect(result?.issues).toEqual([]);
    expect(result?.defaultValue).toBeNull();
    expect(result?.matchedOccurrence).toBeNull();

    const snapshot = snapshotLayer3Queries({ activationChain: null, variableFlow: result ?? null });
    expect(snapshot).toMatchObject({
      schema: 'cbs-lsp-agent-contract',
      schemaVersion: '1.0.0',
      contract: {
        layer: 'layer3',
        stability: 'stable-public-read-contract',
        trust: {
          agentsMayTrustSnapshotDirectly: true,
          stableForCrossFileReasoning: true,
        },
        nullableFields: {
          envelope: ['activationChain', 'variableFlow'],
          variableFlow: ['flowEntry', 'defaultValue', 'matchedOccurrence'],
        },
        deterministicOrdering: {
          variableOccurrences: 'occurrenceId',
          variableReadersWriters: 'uri -> hostStartOffset -> hostEndOffset -> occurrenceId',
        },
      },
      variableFlow: {
        schema: 'cbs-lsp-agent-contract',
        schemaVersion: '1.0.0',
      },
      activationChain: null,
    });
  });

  it('maps phase-order-risk issues back to the matching cross-file occurrences', async () => {
    const { service } = await buildService([
      {
        artifact: 'lorebook',
        fileName: 'writer.risulorebook',
        text: ['---', 'name: writer', '---', '@@@ CONTENT', '{{setvar::flag::ready}}', ''].join('\n'),
      },
      {
        artifact: 'regex',
        fileName: 'reader.risuregex',
        text: ['---', 'comment: reader', 'type: plain', '---', '@@@ IN', '{{getvar::flag}}', ''].join(
          '\n',
        ),
      },
    ]);

    const issues = service.getIssues('flag');
    const phaseOrderRisk = issues.find((entry) => entry.issue.type === 'phase-order-risk');

    expect(phaseOrderRisk).toBeDefined();
    expect(phaseOrderRisk?.occurrences).toHaveLength(2);
    expect(phaseOrderRisk?.occurrences.map((entry) => `${entry.artifact}:${entry.direction}`)).toEqual([
      'lorebook:write',
      'regex:read',
    ]);
  });

  it('resolves a cursor position to the matched occurrence and the full cross-file query result', async () => {
    const { service, graph, scanResult } = await buildService([
      {
        artifact: 'lorebook',
        fileName: 'writer.risulorebook',
        text: ['---', 'name: writer', '---', '@@@ CONTENT', '{{setvar::shared::1}}', ''].join('\n'),
      },
      {
        artifact: 'regex',
        fileName: 'reader.risuregex',
        text: ['---', 'comment: reader', 'type: plain', '---', '@@@ IN', '{{getvar::shared}}', ''].join(
          '\n',
        ),
      },
      {
        artifact: 'lua',
        fileName: 'reader.risulua',
        text: 'local value = getState("shared")',
      },
    ]);

    const regexUri = scanResult.files.find((entry) => entry.relativePath === 'regex/reader.risuregex')?.uri;
    expect(regexUri).toBeTruthy();

    const regexOccurrence = graph
      .getOccurrencesByUri(regexUri!)
      .find((entry) => entry.variableName === 'shared' && entry.direction === 'read');

    expect(regexOccurrence).toBeDefined();

    const result = service.queryAt(regexUri!, regexOccurrence!.hostStartOffset + 1);

    expect(result).not.toBeNull();
    expect(result?.matchedOccurrence?.occurrenceId).toBe(regexOccurrence?.occurrenceId);
    expect(result?.variableName).toBe('shared');
    expect(result?.readers).toHaveLength(2);
    expect(result?.writers).toHaveLength(1);
  });

  it('honors defaultVariables when mapping uninitialized-read issues', async () => {
    const { service } = await buildService(
      [
        {
          artifact: 'prompt',
          fileName: 'reader.risuprompt',
          text: ['---', 'type: plain', '---', '@@@ TEXT', 'Hello {{getvar::seeded}}', ''].join('\n'),
        },
      ],
      { seeded: 'from-defaults' },
    );

    const result = service.queryVariable('seeded');

    expect(result).not.toBeNull();
    expect(result?.defaultValue).toBe('from-defaults');
    expect(result?.issues.some((entry) => entry.issue.type === 'uninitialized-read')).toBe(false);
  });

  it('reports workspace freshness markers for matching and stale open-document versions', async () => {
    const { graph, registry, root, scanResult, service } = await buildService([
      {
        artifact: 'prompt',
        fileName: 'writer.risuprompt',
        text: ['---', 'type: plain', '---', '@@@ TEXT', '{{setvar::shared::1}}', ''].join('\n'),
      },
    ]);
    const writerUri = scanResult.files[0]?.uri;

    expect(writerUri).toBeTruthy();

    expect(service.getWorkspaceFreshness({ uri: writerUri!, version: 0 })).toBeNull();

    const workspaceAwareService = new VariableFlowService({
      graph,
      registry,
      workspaceSnapshot: {
        rootPath: root,
        snapshotVersion: 9,
        documentVersions: new Map([[writerUri!, 2]]),
      },
    });

    expect(workspaceAwareService.getWorkspaceFreshness({ uri: writerUri!, version: 2 })).toEqual(
      expect.objectContaining({
        freshness: 'fresh',
        snapshotVersion: 9,
        trackedDocumentVersion: 2,
      }),
    );
    expect(workspaceAwareService.getWorkspaceFreshness({ uri: writerUri!, version: 4 })).toEqual(
      expect.objectContaining({
        freshness: 'stale',
        snapshotVersion: 9,
        trackedDocumentVersion: 2,
        requestVersion: 4,
      }),
    );
  });
});
