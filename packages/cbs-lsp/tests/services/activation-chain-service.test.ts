/**
 * ActivationChainService cross-entry query contract tests.
 * @file packages/cbs-lsp/tests/services/activation-chain-service.test.ts
 */

import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';

import { afterEach, describe, expect, it } from 'vitest';
import { getCustomExtensionArtifactContract, type CustomExtensionArtifact } from 'risu-workbench-core';

import { ElementRegistry, FileScanner } from '../../src/indexer';
import { ActivationChainService } from '../../src/services';

type WorkspaceFileSeed = {
  artifact: CustomExtensionArtifact;
  fileName: string;
  text: string;
  nestedSegments?: readonly string[];
};

const tempRoots: string[] = [];

/**
 * createWorkspaceRoot 함수.
 * ActivationChainService 테스트마다 격리된 임시 workspace root를 만듦.
 *
 * @returns 새로 만든 임시 workspace root 경로
 */
async function createWorkspaceRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cbs-lsp-activation-chain-service-'));
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
 * lorebookText 함수.
 * canonical lorebook fixture text를 간단히 조립함.
 *
 * @param options - name, keys, content와 optional secondary/flags
 * @returns canonical `.risulorebook` 텍스트
 */
function lorebookText(options: {
  name: string;
  keys: readonly string[];
  content: string;
  secondaryKeys?: readonly string[];
  selective?: boolean;
  constant?: boolean;
  enabled?: boolean;
}): string {
  return [
    '---',
    `name: ${options.name}`,
    `comment: ${options.name}`,
    `constant: ${String(options.constant ?? false)}`,
    `selective: ${String(options.selective ?? false)}`,
    `enabled: ${String(options.enabled ?? true)}`,
    'insertion_order: 0',
    'case_sensitive: false',
    'use_regex: false',
    '---',
    '@@@ KEYS',
    ...options.keys,
    ...(options.secondaryKeys ? ['@@@ SECONDARY_KEYS', ...options.secondaryKeys] : []),
    '@@@ CONTENT',
    options.content,
    '',
  ].join('\n');
}

/**
 * buildService 함수.
 * seed 목록으로 workspace를 만들고 activation-chain service를 생성함.
 *
 * @param seeds - 기록할 workspace 파일 seed 목록
 * @returns registry, service, scan result 묶음
 */
async function buildService(seeds: readonly WorkspaceFileSeed[]) {
  const root = await createWorkspaceRoot();
  const relativePaths = await Promise.all(seeds.map((seed) => writeWorkspaceFile(root, seed)));
  const scanResult = await new FileScanner(root).scan();
  const registry = new ElementRegistry(scanResult);
  const service = ActivationChainService.fromRegistry(registry);

  return {
    root,
    relativePaths,
    scanResult,
    registry,
    service,
  };
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('ActivationChainService', () => {
  it('aggregates incoming and outgoing lorebook activation edges across workspace lorebooks', async () => {
    const { service } = await buildService([
      {
        artifact: 'lorebook',
        fileName: 'alpha.risulorebook',
        text: lorebookText({
          name: 'Alpha',
          keys: ['alpha'],
          content: 'beta appears here to activate the next lorebook.',
        }),
      },
      {
        artifact: 'lorebook',
        fileName: 'beta.risulorebook',
        text: lorebookText({
          name: 'Beta',
          keys: ['beta'],
          content: 'Beta lore body',
        }),
      },
    ]);

    const betaQuery = service.queryEntry('Beta');
    const alphaQuery = service.queryEntry('Alpha');

    expect(betaQuery).not.toBeNull();
    expect(betaQuery?.incoming).toHaveLength(1);
    expect(betaQuery?.possibleIncoming).toHaveLength(1);
    expect(betaQuery?.incoming[0]?.entry.id).toBe('Alpha');
    expect(betaQuery?.incoming[0]?.edge.matchedKeywords).toEqual(['beta']);
    expect(alphaQuery?.outgoing).toHaveLength(1);
    expect(alphaQuery?.possibleOutgoing[0]?.entry.id).toBe('Beta');
  });

  it('preserves partial matches and missing secondary keywords in query results', async () => {
    const { service } = await buildService([
      {
        artifact: 'lorebook',
        fileName: 'alpha.risulorebook',
        text: lorebookText({
          name: 'Alpha',
          keys: ['alpha'],
          content: 'beta is present but no backup token exists here.',
        }),
      },
      {
        artifact: 'lorebook',
        fileName: 'beta.risulorebook',
        text: lorebookText({
          name: 'Beta',
          keys: ['beta'],
          secondaryKeys: ['gamma'],
          selective: true,
          content: 'Selective beta lore body',
        }),
      },
    ]);

    const betaQuery = service.queryEntry('Beta');

    expect(betaQuery?.possibleIncoming).toEqual([]);
    expect(betaQuery?.partialIncoming).toHaveLength(1);
    expect(betaQuery?.partialIncoming[0]?.edge.status).toBe('partial');
    expect(betaQuery?.partialIncoming[0]?.edge.missingSecondaryKeywords).toEqual(['gamma']);
  });

  it('reports cycle summaries for traversable lorebook activation loops', async () => {
    const { service } = await buildService([
      {
        artifact: 'lorebook',
        fileName: 'alpha.risulorebook',
        text: lorebookText({
          name: 'Alpha',
          keys: ['alpha'],
          content: 'beta is referenced here.',
        }),
      },
      {
        artifact: 'lorebook',
        fileName: 'beta.risulorebook',
        text: lorebookText({
          name: 'Beta',
          keys: ['beta'],
          content: 'alpha is referenced here.',
        }),
      },
    ]);

    const alphaQuery = service.queryEntry('Alpha');

    expect(alphaQuery).not.toBeNull();
    expect(alphaQuery?.cycle.hasCycles).toBe(true);
    expect(alphaQuery?.cycle.cycleCount).toBeGreaterThan(0);
    expect(alphaQuery?.cycle.steps.map((step) => step.entryId)).toEqual(['Alpha', 'Beta']);
  });

  it('resolves lorebook uri and cursor offset back to the same activation query result', async () => {
    const { service, scanResult } = await buildService([
      {
        artifact: 'lorebook',
        fileName: 'alpha.risulorebook',
        text: lorebookText({
          name: 'Alpha',
          keys: ['alpha'],
          content: 'beta appears here for uri lookup.',
        }),
      },
      {
        artifact: 'lorebook',
        fileName: 'beta.risulorebook',
        text: lorebookText({
          name: 'Beta',
          keys: ['beta'],
          content: 'Beta lore body',
        }),
      },
    ]);

    const alphaFile = scanResult.files.find((entry) => entry.relativePath === 'lorebooks/alpha.risulorebook');
    expect(alphaFile).toBeTruthy();

    const queryByUri = service.queryByUri(alphaFile!.uri);
    const queryAt = service.queryAt(alphaFile!.uri, alphaFile!.text.indexOf('beta'));

    expect(queryByUri?.entry.id).toBe('Alpha');
    expect(queryAt?.entry.id).toBe('Alpha');
    expect(queryAt?.possibleOutgoing.map((entry) => entry.entry.id)).toEqual(['Beta']);
  });
});
