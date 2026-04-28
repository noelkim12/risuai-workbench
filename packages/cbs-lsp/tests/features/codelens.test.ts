/**
 * CodeLens provider policy tests for activation summaries.
 * @file packages/cbs-lsp/tests/features/codelens.test.ts
 */

import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';
import {
  getCustomExtensionArtifactContract,
  type CustomExtensionArtifact,
} from 'risu-workbench-core';

import {
  ACTIVATION_CHAIN_CODELENS_CLIENT_COMMAND,
  CodeLensProvider,
} from '../../src/features/presentation';
import { fragmentAnalysisService } from '../../src/core';
import { ElementRegistry, FileScanner } from '../../src/indexer';
import { ActivationChainService } from '../../src/services';
import {
  createFixtureRequest,
  getFixtureCorpusEntry,
  snapshotCodeLensesEnvelope,
} from '../fixtures/fixture-corpus';

type WorkspaceFileSeed = {
  artifact: CustomExtensionArtifact;
  fileName: string;
  text: string;
};

const tempRoots: string[] = [];

/**
 * createWorkspaceRoot 함수.
 * CodeLens provider 테스트용 임시 workspace root를 만듦.
 *
 * @returns 새 임시 workspace root 경로
 */
async function createWorkspaceRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cbs-lsp-codelens-provider-'));
  tempRoots.push(root);
  return root;
}

/**
 * writeWorkspaceFile 함수.
 * artifact contract에 맞는 canonical 경로에 테스트 문서를 기록함.
 *
 * @param root - 테스트용 workspace root
 * @param seed - 기록할 파일 seed
 * @returns 기록된 파일 URI
 */
async function writeWorkspaceFile(root: string, seed: WorkspaceFileSeed): Promise<string> {
  const contract = getCustomExtensionArtifactContract(seed.artifact);
  const absolutePath = path.join(root, contract.directory, seed.fileName);

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, seed.text, 'utf8');

  return pathToFileURL(absolutePath).href;
}

afterEach(async () => {
  fragmentAnalysisService.clearAll();
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('CodeLensProvider', () => {
  it('counts only possible edges in the primary summary and moves partial/blocked/cycle state to detail lens', async () => {
    const root = await createWorkspaceRoot();
    const alphaEntry = getFixtureCorpusEntry('lorebook-activation-alpha');
    const betaEntry = getFixtureCorpusEntry('lorebook-activation-beta');
    const gammaEntry = getFixtureCorpusEntry('lorebook-activation-gamma');
    const deltaEntry = getFixtureCorpusEntry('lorebook-activation-delta');
    const alphaText = alphaEntry.text;
    const alphaUri = await writeWorkspaceFile(root, {
      artifact: 'lorebook',
      fileName: 'alpha.risulorebook',
      text: alphaText,
    });
    const betaUri = await writeWorkspaceFile(root, {
      artifact: 'lorebook',
      fileName: 'beta.risulorebook',
      text: betaEntry.text,
    });
    await writeWorkspaceFile(root, {
      artifact: 'lorebook',
      fileName: 'gamma.risulorebook',
      text: gammaEntry.text,
    });
    await writeWorkspaceFile(root, {
      artifact: 'lorebook',
      fileName: 'delta.risulorebook',
      text: deltaEntry.text,
    });

    const scanResult = await new FileScanner(root).scan();
    const registry = new ElementRegistry(scanResult);
    const activationChainService = ActivationChainService.fromRegistry(registry);
    const provider = new CodeLensProvider({
      analysisService: fragmentAnalysisService,
      resolveActivationChainService: () => activationChainService,
      resolveRequest: () => ({
        uri: alphaUri,
        version: 1,
        filePath: path.join(root, 'lorebooks', 'alpha.risulorebook'),
        text: alphaText,
      }),
    });

    const codeLenses = provider.provide({
      textDocument: { uri: alphaUri },
    });

    expect(codeLenses).toHaveLength(2);
    const expectedActivation = {
      incoming: [
        {
          direction: 'incoming',
          entryId: 'Beta',
          entryName: 'Beta',
          link: {
            command: 'risuWorkbench.cbs.openOccurrence',
            arguments: [
              {
                range: {
                  start: { line: 0, character: 0 },
                  end: { line: 0, character: 0 },
                },
                uri: betaUri,
              },
            ],
          },
          matchedKeywords: ['alpha'],
          relativePath: 'lorebooks/beta.risulorebook',
          uri: betaUri,
        },
      ],
      markdown: expect.stringContaining(
        `command:risuWorkbench.cbs.openOccurrence?${encodeURIComponent(
          JSON.stringify([
            {
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 0 },
              },
              uri: betaUri,
            },
          ]),
        )}`,
      ),
      outgoing: [
        {
          direction: 'outgoing',
          entryId: 'Beta',
          entryName: 'Beta',
          link: {
            command: 'risuWorkbench.cbs.openOccurrence',
            arguments: [
              {
                range: {
                  start: { line: 0, character: 0 },
                  end: { line: 0, character: 0 },
                },
                uri: betaUri,
              },
            ],
          },
          matchedKeywords: ['beta'],
          relativePath: 'lorebooks/beta.risulorebook',
          uri: betaUri,
        },
      ],
      plainText: expect.stringContaining('활성화시킨 엔트리'),
    };
    expect(codeLenses[0]?.command?.arguments).toEqual([
      { activation: expectedActivation, kind: 'summary', uri: alphaUri },
    ]);
    expect(snapshotCodeLensesEnvelope(codeLenses)).toEqual({
      schema: 'cbs-lsp-agent-contract',
      schemaVersion: '1.0.0',
      availability: expect.objectContaining({
        features: expect.arrayContaining([
          expect.objectContaining({
            key: 'codelens',
            scope: 'local-only',
          }),
        ]),
      }),
      provenance: {
        detail:
          'CodeLens snapshots normalize lorebook activation summary/detail lenses into stable command, count, cycle, and refresh semantics without requiring title string parsing.',
        reason: 'contextual-inference',
        source: 'codelens:activation-summary',
      },
      codeLenses: [
        {
          activation: expectedActivation,
          command: {
            command: ACTIVATION_CHAIN_CODELENS_CLIENT_COMMAND,
            kind: 'detail',
            mode: 'no-op',
            uri: alphaUri,
          },
          counts: {
            incoming: { blocked: 0, partial: 0, possible: 1 },
            outgoing: { blocked: 1, partial: 1, possible: 1 },
          },
          cycle: {
            count: 1,
            hasCycles: true,
          },
          lensKind: 'detail',
          lensState: 'active',
          range: expect.any(Object),
          semantics: {
            detailStatuses: ['partial', 'blocked'],
            refreshTriggers: ['document-sync', 'watched-files'],
            summaryStatuses: ['possible'],
          },
          title: '부분 매치: 들어옴 0 / 나감 1 | 차단: 들어옴 0 / 나감 1 | 순환 감지',
        },
        {
          activation: expectedActivation,
          command: {
            command: ACTIVATION_CHAIN_CODELENS_CLIENT_COMMAND,
            kind: 'summary',
            mode: 'no-op',
            uri: alphaUri,
          },
          counts: {
            incoming: { blocked: 0, partial: 0, possible: 1 },
            outgoing: { blocked: 1, partial: 1, possible: 1 },
          },
          cycle: {
            count: 1,
            hasCycles: true,
          },
          lensKind: 'summary',
          lensState: 'active',
          range: expect.any(Object),
          semantics: {
            detailStatuses: ['partial', 'blocked'],
            refreshTriggers: ['document-sync', 'watched-files'],
            summaryStatuses: ['possible'],
          },
          title: '1개 엔트리에 의해 활성화됨 | 1개 엔트리를 활성화',
        },
      ],
    });
  });

  it('returns no CodeLens for non-workspace or non-lorebook requests', () => {
    const provider = new CodeLensProvider({
      analysisService: fragmentAnalysisService,
      resolveActivationChainService: () => null,
      resolveRequest: () => null,
    });

    expect(
      provider.provide({
        textDocument: { uri: 'file:///fixtures/no-workspace.risulorebook' },
      }),
    ).toEqual([]);
  });

  it('returns no CodeLens when the lorebook has no CONTENT fragment to anchor the lens', async () => {
    const root = await createWorkspaceRoot();
    const entry = getFixtureCorpusEntry('lorebook-no-content-section');
    const entryUri = await writeWorkspaceFile(root, {
      artifact: 'lorebook',
      fileName: 'edge-no-content.risulorebook',
      text: entry.text,
    });
    const scanResult = await new FileScanner(root).scan();
    const registry = new ElementRegistry(scanResult);
    const activationChainService = ActivationChainService.fromRegistry(registry);
    const provider = new CodeLensProvider({
      analysisService: fragmentAnalysisService,
      resolveActivationChainService: () => activationChainService,
      resolveRequest: () => ({
        ...createFixtureRequest(entry),
        uri: entryUri,
        filePath: path.join(root, 'lorebooks', 'edge-no-content.risulorebook'),
      }),
    });

    expect(
      provider.provide({
        textDocument: { uri: entryUri },
      }),
    ).toEqual([]);
  });
});
