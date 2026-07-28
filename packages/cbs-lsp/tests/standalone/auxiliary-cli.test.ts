/**
 * CBS language server auxiliary CLI JSON surface tests.
 * @file packages/cbs-lsp/tests/standalone/auxiliary-cli.test.ts
 */

import path from 'node:path';
import os from 'node:os';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';
import { getCustomExtensionArtifactContract, type CustomExtensionArtifact } from 'risu-workbench-core';

type WorkspaceFileSeed = {
  artifact: CustomExtensionArtifact;
  fileName: string;
  text: string;
};

const packageRoot = process.cwd();
const cliPath = path.join(packageRoot, 'dist', 'cli.js');
const tempRoots: string[] = [];

/**
 * createWorkspaceRoot 함수.
 * auxiliary CLI 테스트마다 격리된 임시 workspace root를 만듦.
 *
 * @returns 새로 만든 임시 workspace root 경로
 */
async function createWorkspaceRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cbs-lsp-auxiliary-cli-'));
  tempRoots.push(root);
  return root;
}

/**
 * writeWorkspaceFile 함수.
 * artifact contract에 맞는 canonical 경로로 테스트 문서를 기록함.
 *
 * @param root - 테스트용 workspace root
 * @param seed - 기록할 workspace 파일 seed
 * @returns 기록된 파일의 절대 경로
 */
async function writeWorkspaceFile(root: string, seed: WorkspaceFileSeed): Promise<string> {
  const contract = getCustomExtensionArtifactContract(seed.artifact);
  const absolutePath = path.join(root, contract.directory, seed.fileName);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, seed.text, 'utf8');
  return absolutePath;
}

/**
 * createAuxiliaryWorkspace 함수.
 * variable-flow와 activation-chain query를 함께 검증할 대표 workspace를 조립함.
 *
 * @returns workspace root와 주요 fixture 절대 경로
 */
async function createAuxiliaryWorkspace(): Promise<{
  lorebookPath: string;
  regexPath: string;
  root: string;
}> {
  const root = await createWorkspaceRoot();
  const lorebookText = [
    '---',
    'name: Alpha',
    'comment: Alpha',
    'constant: false',
    'selective: false',
    'enabled: true',
    'insertion_order: 0',
    'case_sensitive: false',
    'use_regex: false',
    '---',
    '@@@ KEYS',
    'alpha',
    '@@@ CONTENT',
    '{{setvar::shared::ready}} beta appears here.',
    '',
  ].join('\n');
  const regexText = ['---', 'comment: reader', 'type: plain', '---', '@@@ IN', '{{getvar::shared}}', ''].join(
    '\n',
  );

  return {
    lorebookPath: await writeWorkspaceFile(root, {
      artifact: 'lorebook',
      fileName: 'alpha.risulorebook',
      text: lorebookText,
    }),
    regexPath: await writeWorkspaceFile(root, {
      artifact: 'regex',
      fileName: 'reader.risuregex',
      text: regexText,
    }),
    root,
  };
}

/**
 * runCliJson 함수.
 * built CLI를 실행하고 stdout JSON을 파싱해 반환함.
 *
 * @param args - CLI에 전달할 인자 목록
 * @returns spawn 결과와 파싱된 JSON payload
 */
function runCliJson(args: readonly string[]): {
  payload: unknown;
  result: ReturnType<typeof spawnSync>;
} {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: packageRoot,
    encoding: 'utf8',
  });
  expect(result.status, result.stderr).toBe(0);
  return {
    payload: JSON.parse(result.stdout),
    result,
  };
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('cbs-language-server auxiliary CLI surfaces', () => {
  it('emits runtime availability JSON without requiring a workspace', () => {
    const { payload } = runCliJson(['report', 'availability']);

    expect(payload).toMatchObject({
      schema: 'cbs-lsp-agent-contract',
      schemaVersion: '1.0.0',
      reportKind: 'availability',
      availability: {
        schema: 'cbs-lsp-agent-contract',
        schemaVersion: '1.0.0',
      },
    });
  });

  it('emits Layer 1 registry and graph snapshot JSON for report layer1', async () => {
    const workspace = await createAuxiliaryWorkspace();
    const { payload } = runCliJson(['report', 'layer1', '--workspace', workspace.root]);

    expect(payload).toMatchObject({
      schema: 'cbs-lsp-agent-contract',
      schemaVersion: '1.0.0',
      contract: {
        layer: 'layer1',
        trust: {
          agentsMayTrustSnapshotDirectly: true,
        },
        surfaces: {
          cli: 'report layer1',
        },
      },
      registry: {
        summary: {
          totalFiles: 2,
          totalElements: 2,
        },
      },
      graph: {
        totalVariables: 1,
      },
    });
  });

  it('emits variable query JSON for a named variable', async () => {
    const workspace = await createAuxiliaryWorkspace();
    const { payload } = runCliJson(['query', 'variable', 'shared', '--workspace', workspace.root]);

    expect(payload).toMatchObject({
      schema: 'cbs-lsp-agent-contract',
      schemaVersion: '1.0.0',
      queryKind: 'variable',
      workspaceRoot: workspace.root,
      query: {
        contract: {
          layer: 'layer3',
          trust: {
            agentsMayTrustSnapshotDirectly: true,
          },
          surfaces: {
            helper: 'snapshotLayer3Queries',
          },
        },
        variableFlow: {
          variableName: 'shared',
          readers: [{ artifact: 'regex' }],
          writers: [{ artifact: 'lorebook' }],
        },
      },
    });
  });

  it('emits variable-at query JSON for a host document offset', async () => {
    const workspace = await createAuxiliaryWorkspace();
    const lorebookText = [
      '---',
      'name: Alpha',
      'comment: Alpha',
      'constant: false',
      'selective: false',
      'enabled: true',
      'insertion_order: 0',
      'case_sensitive: false',
      'use_regex: false',
      '---',
      '@@@ KEYS',
      'alpha',
      '@@@ CONTENT',
      '{{setvar::shared::ready}} beta appears here.',
      '',
    ].join('\n');
    const offset = lorebookText.indexOf('shared');
    const { payload } = runCliJson([
      'query',
      'variable-at',
      '--path',
      path.relative(workspace.root, workspace.lorebookPath),
      '--offset',
      String(offset),
      '--workspace',
      workspace.root,
    ]);

    expect(payload).toMatchObject({
      queryKind: 'variable-at',
      query: {
        contract: {
          layer: 'layer3',
        },
        variableFlow: {
          matchedOccurrence: {
            variableName: 'shared',
          },
        },
      },
    });
  });

  it('emits activation-entry query JSON for a lorebook id', async () => {
    const workspace = await createAuxiliaryWorkspace();
    const { payload } = runCliJson(['query', 'activation-entry', 'Alpha', '--workspace', workspace.root]);

    expect(payload).toMatchObject({
      queryKind: 'activation-entry',
      query: {
        contract: {
          layer: 'layer3',
        },
        activationChain: {
          entry: {
            id: 'Alpha',
          },
        },
      },
    });
  });

  it('emits activation-uri and activation-at query JSON for lorebook documents', async () => {
    const workspace = await createAuxiliaryWorkspace();
    const lorebookText = [
      '---',
      'name: Alpha',
      'comment: Alpha',
      'constant: false',
      'selective: false',
      'enabled: true',
      'insertion_order: 0',
      'case_sensitive: false',
      'use_regex: false',
      '---',
      '@@@ KEYS',
      'alpha',
      '@@@ CONTENT',
      '{{setvar::shared::ready}} beta appears here.',
      '',
    ].join('\n');
    const offset = lorebookText.indexOf('beta');
    const relativeLorebookPath = path.relative(workspace.root, workspace.lorebookPath);

    const byUri = runCliJson([
      'query',
      'activation-uri',
      '--path',
      relativeLorebookPath,
      '--workspace',
      workspace.root,
    ]);
    const byOffset = runCliJson([
      'query',
      'activation-at',
      '--path',
      relativeLorebookPath,
      '--offset',
      String(offset),
      '--workspace',
      workspace.root,
    ]);

    expect(byUri.payload).toMatchObject({
      queryKind: 'activation-uri',
      query: {
        contract: {
          layer: 'layer3',
        },
        activationChain: {
          entry: {
            id: 'Alpha',
          },
        },
      },
    });
    expect(byOffset.payload).toMatchObject({
      queryKind: 'activation-at',
      query: {
        contract: {
          layer: 'layer3',
        },
        activationChain: {
          entry: {
            id: 'Alpha',
          },
        },
      },
    });
  });
});
