/**
 * Product-level extracted workspace E2E tests.
 *
 * This file validates the CBS LSP server through **two independent surfaces**:
 * 1. Standalone CLI `report`/`query` JSON adapter (server product layer)
 * 2. Standalone stdio LSP interface with real extracted workspace (server product layer)
 *
 * VS Code client integration is a separate client-layer concern tested in
 * `packages/vscode/tests/e2e/extension-client.test.ts`.
 * @file packages/cbs-lsp/tests/e2e/extracted-workspace.test.ts
 */

import path from 'node:path';
import { rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  createWorkspaceRoot,
  ensureBuiltPackage,
  runCliJson,
  spawnCliProcess,
  writeWorkspaceFile,
} from '../product/test-helpers';
import {
  StdioLspClient,
  positionAt,
  requestReferencesUntil,
  waitForDiagnosticsUntil,
} from '../product/stdio-helpers';

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
const childProcesses = new Set<ChildProcessWithoutNullStreams>();

/**
 * createExtractedWorkspace 함수.
 * lorebook/regex/prompt/lua가 함께 있는 representative extracted workspace를 조립함.
 *
 * @returns root와 주요 파일 경로를 포함한 fixture 정보
 */
async function createExtractedWorkspace(): Promise<{
  alphaPath: string;
  betaPath: string;
  configPath: string;
  luaPath: string;
  promptPath: string;
  regexPath: string;
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

  const [alphaPath, betaPath, regexPath, promptPath, luaPath] = await Promise.all([
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
    alphaPath,
    betaPath,
    configPath,
    luaPath,
    promptPath,
    regexPath,
    root,
  };
}

/**
 * createStdioClientWithTracking 함수.
 * standalone CLI를 외부 stdio client 관점에서 띄우고,
 * 테스트 cleanup 대상에 child process를 등록함.
 *
 * @param args - CLI에 전달할 stdio launch 인자
 * @returns stdio JSON-RPC client wrapper
 */
function createStdioClientWithTracking(args: readonly string[]): StdioLspClient {
  const child = spawnCliProcess(args);
  childProcesses.add(child);
  return new StdioLspClient(child);
}

beforeAll(() => {
  ensureBuiltPackage();
});

afterEach(async () => {
  for (const child of childProcesses) {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
    }
  }
  childProcesses.clear();
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

describe.sequential('cbs-language-server extracted workspace stdio LSP E2E', () => {
  it('validates a real extracted workspace through the standalone stdio interface', async () => {
    const workspace = await createExtractedWorkspace();
    const alphaUri = pathToFileURL(workspace.alphaPath).toString();
    const regexUri = pathToFileURL(workspace.regexPath).toString();
    const promptUri = pathToFileURL(workspace.promptPath).toString();
    const luaUri = pathToFileURL(workspace.luaPath).toString();
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
    const regexText = ['---', 'comment: reader', 'type: plain', '---', '@@@ IN', '{{getvar::shared}}', ''].join('\n');
    const promptText = ['---', 'type: plain', '---', '@@@ TEXT', '{{getvar::shared}}', ''].join('\n');
    const luaText = 'local mood = getState("shared")\nreturn mood\n';

    const client = createStdioClientWithTracking([
      '--stdio',
      '--workspace',
      workspace.root,
      '--luals-path',
      path.join(workspace.root, 'missing', 'lua-language-server'),
    ]);

    const initializeResult = (await client.request('initialize', {
      processId: null,
      rootUri: pathToFileURL(workspace.root).toString(),
      workspaceFolders: [{ uri: pathToFileURL(workspace.root).toString(), name: 'fixture' }],
      capabilities: {},
    }, 20_000)) as {
      capabilities: {
        hoverProvider?: boolean;
        completionProvider?: { triggerCharacters?: string[] };
        referencesProvider?: boolean;
        workspaceSymbolProvider?: boolean;
        textDocumentSync?: { openClose?: boolean };
      };
    };

    expect(initializeResult.capabilities.textDocumentSync?.openClose).toBe(true);
    expect(initializeResult.capabilities.hoverProvider).toBe(true);
    expect(initializeResult.capabilities.completionProvider?.triggerCharacters).toEqual(
      expect.arrayContaining(['{', ':']),
    );
    expect(initializeResult.capabilities.referencesProvider).toBe(true);
    expect(initializeResult.capabilities.workspaceSymbolProvider).toBe(true);

    client.notify('initialized', {});

    // Open all workspace documents
    client.notify('textDocument/didOpen', {
      textDocument: {
        uri: alphaUri,
        languageId: 'plaintext',
        version: 1,
        text: alphaText,
      },
    });
    client.notify('textDocument/didOpen', {
      textDocument: {
        uri: regexUri,
        languageId: 'plaintext',
        version: 1,
        text: regexText,
      },
    });
    client.notify('textDocument/didOpen', {
      textDocument: {
        uri: promptUri,
        languageId: 'plaintext',
        version: 1,
        text: promptText,
      },
    });
    client.notify('textDocument/didOpen', {
      textDocument: {
        uri: luaUri,
        languageId: 'lua',
        version: 1,
        text: luaText,
      },
    });

    const alphaDiagnostics = await waitForDiagnosticsUntil(client, alphaUri, () => true, 20_000);
    expect(alphaDiagnostics.uri).toBe(alphaUri);
    expect(alphaDiagnostics.diagnostics).toEqual([]);

    // Cross-file references: shared variable written in lorebook is read in regex and prompt
    const references = await requestReferencesUntil(
      client,
      alphaUri,
      alphaText,
      'shared',
      (locations) =>
        locations.some((loc) => loc.uri === regexUri) && locations.some((loc) => loc.uri === promptUri),
    );
    const referenceUris = references.map((loc) => loc.uri);
    expect(referenceUris).toContain(alphaUri);
    expect(referenceUris).toContain(regexUri);
    expect(referenceUris).toContain(promptUri);

    // Completion in regex file should see workspace variable `shared` from lorebook
    const completion = (await client.request('textDocument/completion', {
      textDocument: { uri: regexUri },
      position: positionAt(regexText, 'getvar', 8),
    }, 20_000)) as { items?: Array<{ label: string }> } | Array<{ label: string }> | null;
    const items = Array.isArray(completion) ? completion : completion?.items ?? [];
    expect(items.map((item) => item.label)).toContain('shared');

    // Hover on shared variable in lorebook should return something
    const hover = (await client.request('textDocument/hover', {
      textDocument: { uri: alphaUri },
      position: positionAt(alphaText, 'shared'),
    }, 20_000)) as { contents?: { value?: string } } | null;
    expect(hover).not.toBeNull();
    expect(hover?.contents?.value ?? '').toContain('shared');

    // Workspace symbol query for shared should return at least one result
    const workspaceSymbols = (await client.request('workspace/symbol', {
      query: 'shared',
    }, 20_000)) as Array<{ name: string; kind: number; location?: { uri: string } }> | null;
    const symbols = workspaceSymbols ?? [];
    expect(symbols.length).toBeGreaterThan(0);
    expect(symbols.some((sym) => sym.name.toLowerCase().includes('shared'))).toBe(true);

    // Custom availability request should reflect the current session state
    const availability = (await client.request('cbs/runtimeAvailability', {}, 20_000)) as {
      schema?: string;
      schemaVersion?: string;
      operator?: {
        workspace?: { resolvedWorkspaceRoot?: string | null };
      };
    } | null;
    expect(availability?.schema).toBe('cbs-lsp-agent-contract');
    expect(availability?.schemaVersion).toBe('1.0.0');
    expect(availability?.operator?.workspace?.resolvedWorkspaceRoot).toBe(workspace.root);

    // Close documents and shutdown
    client.notify('textDocument/didClose', { textDocument: { uri: alphaUri } });
    client.notify('textDocument/didClose', { textDocument: { uri: regexUri } });
    client.notify('textDocument/didClose', { textDocument: { uri: promptUri } });
    client.notify('textDocument/didClose', { textDocument: { uri: luaUri } });
    await client.shutdown();

    const exitCode = await client.waitForExit(20_000);
    expect(exitCode).toBe(0);
  }, 60_000);
});
