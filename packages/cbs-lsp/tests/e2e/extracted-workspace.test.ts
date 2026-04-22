/**
 * Product-level extracted workspace CLI E2E tests.
 * @file packages/cbs-lsp/tests/e2e/extracted-workspace.test.ts
 */

import path from 'node:path';
import { rm } from 'node:fs/promises';

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

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
  schema: string;
  schemaVersion: string;
}

interface VariableQueryPayload {
  query: {
    contract: {
      layer: string;
    };
    variableFlow: {
      readers: Array<{ artifact: string }>;
      variableName: string;
      writers: Array<{ artifact: string }>;
    };
  };
  queryKind: string;
  schema: string;
  schemaVersion: string;
  workspaceRoot: string;
}

interface AvailabilityReportPayload {
  availability: {
    operator: {
      docs: {
        compatibility: string;
      };
      failureModes: Array<{ active: boolean; key: string }>;
      workspace: {
        resolvedWorkspaceRoot: string | null;
        resolvedWorkspaceRootSource: string;
      };
    };
  };
  reportKind: string;
  schema: string;
  schemaVersion: string;
}

const tempRoots: string[] = [];

/**
 * createExtractedWorkspace 함수.
 * lorebook/regex/prompt/lua가 함께 있는 representative extracted workspace를 조립함.
 *
 * @returns root와 주요 파일 경로를 포함한 fixture 정보
 */
async function createExtractedWorkspace(): Promise<{
  configPath: string;
  root: string;
}> {
  const root = await createWorkspaceRoot('cbs-lsp-extracted-workspace-', tempRoots);
  const alphaText = [
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
    '{{setvar::shared::ready}} beta signal',
    '',
  ].join('\n');
  const betaText = [
    '---',
    'name: Beta',
    'comment: Beta',
    'constant: false',
    'selective: false',
    'enabled: true',
    'insertion_order: 1',
    'case_sensitive: false',
    'use_regex: false',
    '---',
    '@@@ KEYS',
    'beta',
    '@@@ CONTENT',
    'beta remembers alpha',
    '',
  ].join('\n');
  const regexText = ['---', 'comment: reader', 'type: plain', '---', '@@@ IN', '{{getvar::shared}}', ''].join(
    '\n',
  );
  const promptText = ['---', 'type: plain', '---', '@@@ TEXT', '{{getvar::shared}}', ''].join('\n');
  const luaText = 'local mood = getState("shared")\nreturn mood\n';
  const configPath = path.join(root, 'cbs-language-server.json');

  await Promise.all([
    writeWorkspaceFile(root, 'lorebooks/alpha.risulorebook', alphaText),
    writeWorkspaceFile(root, 'lorebooks/beta.risulorebook', betaText),
    writeWorkspaceFile(root, 'regex/reader.risuregex', regexText),
    writeWorkspaceFile(root, 'prompt_template/writer.risuprompt', promptText),
    writeWorkspaceFile(root, 'lua/companion.risulua', luaText),
    writeWorkspaceFile(
      root,
      'cbs-language-server.json',
      JSON.stringify(
        {
          cbs: {
            workspace: '.',
          },
        },
        null,
        2,
      ),
    ),
  ]);

  return {
    configPath,
    root,
  };
}

beforeAll(() => {
  ensureBuiltPackage();
});

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe.sequential('cbs-language-server extracted workspace product matrix', () => {
  it('walks a real extracted workspace through Layer 1 and Layer 3 standalone query surfaces', async () => {
    const workspace = await createExtractedWorkspace();
    const { payload: layer1 } = runCliJson<Layer1ReportPayload>([
      'report',
      'layer1',
      '--workspace',
      workspace.root,
    ]);
    const { payload: variable } = runCliJson<VariableQueryPayload>([
      'query',
      'variable',
      'shared',
      '--workspace',
      workspace.root,
    ]);

    expect(layer1).toMatchObject({
      schema: 'cbs-lsp-agent-contract',
      schemaVersion: '1.0.0',
      contract: {
        layer: 'layer1',
        trust: {
          agentsMayTrustSnapshotDirectly: true,
        },
        deterministicOrdering: {
          graphVariables: 'variableName',
        },
      },
      registry: {
        summary: {
          totalFiles: 5,
          totalElements: 5,
        },
      },
    });
    expect(layer1.graph.totalVariables).toBeGreaterThanOrEqual(1);

    expect(variable).toMatchObject({
      queryKind: 'variable',
      schema: 'cbs-lsp-agent-contract',
      schemaVersion: '1.0.0',
      workspaceRoot: workspace.root,
      query: {
        contract: {
          layer: 'layer3',
          deterministicOrdering: {
            variableReadersWriters: 'uri -> hostStartOffset -> hostEndOffset -> occurrenceId',
          },
        },
        variableFlow: {
          variableName: 'shared',
          writers: expect.arrayContaining([expect.objectContaining({ artifact: 'lorebook' })]),
          readers: expect.arrayContaining([
            expect.objectContaining({ artifact: 'prompt' }),
            expect.objectContaining({ artifact: 'regex' }),
          ]),
        },
      },
    });
  });

  it('reports compatibility/operator surface for an extracted workspace through the standalone availability report', async () => {
    const workspace = await createExtractedWorkspace();
    const { payload } = runCliJson<AvailabilityReportPayload>([
      'report',
      'availability',
      '--config',
      workspace.configPath,
      '--luals-path',
      path.join(workspace.root, 'missing', 'lua-language-server'),
    ]);

    expect(payload).toMatchObject({
      reportKind: 'availability',
      schema: 'cbs-lsp-agent-contract',
      schemaVersion: '1.0.0',
      availability: {
        operator: {
          docs: {
            compatibility: 'packages/cbs-lsp/docs/COMPATIBILITY.md',
          },
          workspace: {
            resolvedWorkspaceRoot: workspace.root,
            resolvedWorkspaceRootSource: 'runtime-config.workspacePath',
          },
        },
      },
    });
    expect(payload.availability.operator.failureModes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'watched-files-client-unsupported', active: true }),
        expect.objectContaining({ key: 'luals-unavailable' }),
      ]),
    );
  });
});
