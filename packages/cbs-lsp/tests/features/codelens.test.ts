/**
 * CodeLens provider policy tests for activation summaries.
 * @file packages/cbs-lsp/tests/features/codelens.test.ts
 */

import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';
import { getCustomExtensionArtifactContract, type CustomExtensionArtifact } from 'risu-workbench-core';

import { CodeLensProvider } from '../../src/features/codelens';
import { fragmentAnalysisService } from '../../src/core';
import { ElementRegistry, FileScanner } from '../../src/indexer';
import { ActivationChainService } from '../../src/services';

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

/**
 * lorebookText 함수.
 * activation chain fixture용 canonical lorebook 텍스트를 조립함.
 *
 * @param options - lorebook frontmatter와 content seed
 * @returns `.risulorebook` fixture text
 */
function lorebookText(options: {
  name: string;
  keys: readonly string[];
  content: string;
  secondaryKeys?: readonly string[];
  selective?: boolean;
}): string {
  return [
    '---',
    `name: ${options.name}`,
    `comment: ${options.name}`,
    'constant: false',
    `selective: ${String(options.selective ?? false)}`,
    'enabled: true',
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

afterEach(async () => {
  fragmentAnalysisService.clearAll();
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('CodeLensProvider', () => {
  it('counts only possible edges in the primary summary and moves partial/blocked/cycle state to detail lens', async () => {
    const root = await createWorkspaceRoot();
    const alphaText = lorebookText({
      name: 'Alpha',
      keys: ['alpha'],
      content: 'beta wakes the main chain, gamma only partially matches, and delta is blocked.',
    });
    const alphaUri = await writeWorkspaceFile(root, {
      artifact: 'lorebook',
      fileName: 'alpha.risulorebook',
      text: alphaText,
    });
    await writeWorkspaceFile(root, {
      artifact: 'lorebook',
      fileName: 'beta.risulorebook',
      text: lorebookText({
        name: 'Beta',
        keys: ['beta'],
        content: 'alpha closes the cycle.',
      }),
    });
    await writeWorkspaceFile(root, {
      artifact: 'lorebook',
      fileName: 'gamma.risulorebook',
      text: lorebookText({
        name: 'Gamma',
        keys: ['gamma'],
        secondaryKeys: ['omega'],
        selective: true,
        content: 'Gamma lore body.',
      }),
    });
    await writeWorkspaceFile(root, {
      artifact: 'lorebook',
      fileName: 'delta.risulorebook',
      text: lorebookText({
        name: 'Delta',
        keys: ['delta'],
        content: '@@no_recursive_search\nDelta lore body.',
      }),
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
    expect(codeLenses[0]?.command?.title).toBe('1개 엔트리에 의해 활성화됨 | 1개 엔트리를 활성화');
    expect(codeLenses[1]?.command?.title).toBe(
      '부분 매치: 들어옴 0 / 나감 1 | 차단: 들어옴 0 / 나감 1 | 순환 감지',
    );
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
});
