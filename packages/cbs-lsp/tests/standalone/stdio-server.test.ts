/**
 * Product-level stdio server matrix tests.
 * @file packages/cbs-lsp/tests/standalone/stdio-server.test.ts
 *
 * Execution conditions:
 * - Real LuaLS tests require CBS_LSP_RUN_LUALS_INTEGRATION=true and CBS_LSP_LUALS_PATH
 * - Diagnostics smoke requires shadow-file workspace with proper Lua.workspace.library injection
 *
 * Failure recovery:
 * - If LuaLS tests fail: Check companion is running with `report availability`
 * - If diagnostics empty: Verify shadow files exist and workspace/library config is injected
 * - See docs/LUALS_COMPANION.md and docs/TROUBLESHOOTING.md for detailed recovery steps
 */

import path from 'node:path';
import process from 'node:process';
import { rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { resolveLuaLsExecutablePathSync } from '../../src/providers/lua/lualsProcess';
import {
  createWorkspaceRoot,
  ensureBuiltPackage,
  spawnCliProcess,
  writeWorkspaceFile,
} from '../product/test-helpers';
import {
  StdioLspClient,
  getHoverMarkdown,
  positionAt,
  requestHoverUntilReady,
  requestReferencesUntil,
  waitForDiagnosticsUntil,
} from '../product/stdio-helpers';

const RUN_REAL_LUALS_PRODUCT_MATRIX = ['1', 'true'].includes(
  process.env.CBS_LSP_RUN_LUALS_INTEGRATION?.toLowerCase() ?? '',
);
const REAL_LUALS_PATH = resolveLuaLsExecutablePathSync({
  overrideExecutablePath: process.env.CBS_LSP_LUALS_PATH ?? null,
});
const tempRoots: string[] = [];
const childProcesses = new Set<ChildProcessWithoutNullStreams>();

/**
 * lorebookDocument 함수.
 * product-level stdio 테스트에 쓸 minimal lorebook host 문서를 만듦.
 *
 * @param bodyLines - `@@@ CONTENT` 아래에 들어갈 CBS 줄 목록
 * @returns canonical `.risulorebook` 본문
 */
function lorebookDocument(bodyLines: readonly string[]): string {
  return ['---', 'name: entry', '---', '@@@ CONTENT', ...bodyLines, ''].join('\n');
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

describe.sequential('cbs-language-server stdio product matrix', () => {
  it('boots over stdio for an external client, reports standalone compatibility state, and survives document lifecycle changes', async () => {
    const root = await createWorkspaceRoot('cbs-lsp-stdio-matrix-', tempRoots);
    const writerText = lorebookDocument(['{{setvar::shared::ready}}']);
    const readerText = lorebookDocument(['{{getvar::shared}}']);
    const absolutePath = await writeWorkspaceFile(
      root,
      'lorebooks/writer.risulorebook',
      writerText,
    );
    const readerAbsolutePath = await writeWorkspaceFile(root, 'lorebooks/reader.risulorebook', readerText);
    const uri = pathToFileURL(absolutePath).toString();
    const readerUri = pathToFileURL(readerAbsolutePath).toString();
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
      workspaceFolders: [{ uri: pathToFileURL(root).toString(), name: 'fixture' }],
      capabilities: {},
    }, 20_000)) as {
      capabilities: {
        hoverProvider?: boolean;
        textDocumentSync?: { openClose?: boolean };
      };
      experimental?: {
        cbs?: {
          availability?: {
            companions?: {
              luals?: {
                detail?: string;
                health?: string;
                status?: string;
              };
            };
            operator?: {
              docs?: { compatibility?: string };
              install?: { transport?: string };
            };
          };
          operator?: {
            failureModes?: Array<{ active?: boolean; key?: string }>;
            workspace?: {
              resolvedWorkspaceRoot?: string | null;
            };
          };
        };
      };
    };

    expect(initializeResult.capabilities.textDocumentSync?.openClose).toBe(true);
    expect(initializeResult.capabilities.hoverProvider).toBe(true);
    expect(initializeResult.experimental?.cbs?.availability?.companions?.luals).toMatchObject({
      health: 'unavailable',
      status: 'unavailable',
    });
    expect(initializeResult.experimental?.cbs?.availability?.companions?.luals?.detail).toContain('--luals-path');
    expect(initializeResult.experimental?.cbs?.availability?.operator).toMatchObject({
      docs: {
        compatibility: 'packages/cbs-lsp/docs/COMPATIBILITY.md',
      },
      install: {
        transport: 'stdio',
      },
    });
    expect(initializeResult.experimental?.cbs?.operator?.workspace).toMatchObject({
      resolvedWorkspaceRoot: root,
    });
    expect(initializeResult.experimental?.cbs?.operator?.failureModes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'luals-unavailable', active: true }),
      ]),
    );

    client.notify('initialized', {});
    client.notify('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: 'plaintext',
        version: 1,
        text: writerText,
      },
    });

    const initialReferences = await requestReferencesUntil(
      client,
      uri,
      writerText,
      'shared',
      (locations) => locations.some((location) => location.uri === readerUri),
    );

    expect(initialReferences.map((location) => location.uri)).toEqual(
      expect.arrayContaining([uri, readerUri]),
    );

    const changedWriterText = lorebookDocument(['{{setvar::nextShared::ready}}']);
    client.notify('textDocument/didChange', {
      textDocument: {
        uri,
        version: 2,
      },
      contentChanges: [{ text: changedWriterText }],
    });

    const changedReferences = await requestReferencesUntil(
      client,
      uri,
      changedWriterText,
      'nextShared',
      (locations) => locations.length > 0 && locations.every((location) => location.uri !== readerUri),
    );

    expect(changedReferences.map((location) => location.uri)).toEqual(expect.arrayContaining([uri]));
    expect(changedReferences.map((location) => location.uri)).not.toContain(readerUri);

    client.notify('textDocument/didClose', {
      textDocument: { uri },
    });
    await client.shutdown();

    const exitCode = await client.waitForExit(20_000);
    expect(exitCode).toBe(0);
  }, 30_000);

  it('accepts chunked Content-Length frames for initialize, didOpen, completion, and shutdown over stdio', async () => {
    const root = await createWorkspaceRoot('cbs-lsp-stdio-chunked-', tempRoots);
    const text = lorebookDocument(['{{setvar::shared::ready}}', '{{getvar::shared}}']);
    const absolutePath = await writeWorkspaceFile(root, 'lorebooks/chunked.risulorebook', text);
    const uri = pathToFileURL(absolutePath).toString();
    const client = createStdioClientWithTracking([
      '--stdio',
      '--workspace',
      root,
      '--luals-path',
      path.join(root, 'missing', 'lua-language-server'),
    ]);

    const initializeResult = (await client.requestChunked('initialize', {
      processId: null,
      rootUri: pathToFileURL(root).toString(),
      workspaceFolders: [{ uri: pathToFileURL(root).toString(), name: 'fixture' }],
      capabilities: {},
    }, [2, 19, 41], 20_000)) as {
      capabilities?: {
        completionProvider?: { triggerCharacters?: string[] };
        textDocumentSync?: { openClose?: boolean };
      };
    };

    expect(initializeResult.capabilities?.textDocumentSync?.openClose).toBe(true);
    expect(initializeResult.capabilities?.completionProvider?.triggerCharacters).toEqual(
      expect.arrayContaining(['{', ':']),
    );

    await client.notifyChunked('initialized', {}, [1, 17]);
    await client.notifyChunked('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: 'plaintext',
        version: 1,
        text,
      },
    }, [5, 31, 63]);

    const completion = (await client.requestChunked('textDocument/completion', {
      textDocument: { uri },
      position: positionAt(text, 'getvar', 8),
    }, [1, 23, 57], 20_000)) as
      | { items?: Array<{ label?: string }> }
      | Array<{ label?: string }>
      | null;

    const items = Array.isArray(completion) ? completion : completion?.items ?? [];
    expect(items.map((item) => item.label)).toContain('shared');

    await client.shutdownChunked([1, 15, 33], [1, 9]);
    const exitCode = await client.waitForExit(20_000);
    expect(exitCode).toBe(0);
  }, 30_000);

  it('accepts batched stdio frames and returns initialize/completion/shutdown responses in order', async () => {
    const root = await createWorkspaceRoot('cbs-lsp-stdio-batched-', tempRoots);
    const text = lorebookDocument(['{{setvar::shared::ready}}', '{{getvar::shared}}']);
    const absolutePath = await writeWorkspaceFile(root, 'lorebooks/batched.risulorebook', text);
    const uri = pathToFileURL(absolutePath).toString();
    const client = createStdioClientWithTracking([
      '--stdio',
      '--workspace',
      root,
      '--luals-path',
      path.join(root, 'missing', 'lua-language-server'),
    ]);

    const initializeRequest = client.prepareRequest('initialize', {
      processId: null,
      rootUri: pathToFileURL(root).toString(),
      workspaceFolders: [{ uri: pathToFileURL(root).toString(), name: 'fixture' }],
      capabilities: {},
    }, 20_000);
    const completionRequest = client.prepareRequest('textDocument/completion', {
      textDocument: { uri },
      position: positionAt(text, 'getvar', 8),
    }, 20_000);
    const shutdownRequest = client.prepareRequest('shutdown', null, 20_000);

    client.sendBatch([
      initializeRequest.message,
      { jsonrpc: '2.0', method: 'initialized', params: {} },
      {
        jsonrpc: '2.0',
        method: 'textDocument/didOpen',
        params: {
          textDocument: {
            uri,
            languageId: 'plaintext',
            version: 1,
            text,
          },
        },
      },
      completionRequest.message,
      shutdownRequest.message,
    ]);

    const initializeResult = (await initializeRequest.response) as {
      capabilities?: {
        completionProvider?: { triggerCharacters?: string[] };
        textDocumentSync?: { openClose?: boolean };
      };
    };
    expect(initializeResult.capabilities?.textDocumentSync?.openClose).toBe(true);
    expect(initializeResult.capabilities?.completionProvider?.triggerCharacters).toEqual(
      expect.arrayContaining(['{', ':']),
    );

    const completion = (await completionRequest.response) as
      | { items?: Array<{ label?: string }> }
      | Array<{ label?: string }>
      | null;
    const items = Array.isArray(completion) ? completion : completion?.items ?? [];
    expect(items.map((item) => item.label)).toContain('shared');

    await shutdownRequest.response;
    client.notify('exit', undefined);
    const exitCode = await client.waitForExit(20_000);
    expect(exitCode).toBe(0);
  }, 30_000);

  it('keeps a safe shutdown path after malformed JSON and accepts an explicit parse error response when emitted', async () => {
    const root = await createWorkspaceRoot('cbs-lsp-stdio-malformed-', tempRoots);
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
      workspaceFolders: [{ uri: pathToFileURL(root).toString(), name: 'fixture' }],
      capabilities: {},
    }, 20_000);
    client.notify('initialized', {});

    client.sendRawFrame('{"jsonrpc":"2.0","id":99,"method":"broken",');

    const parseError = await client
      .waitForResponse(
        (response) => response.id === null && response.error?.code === -32700,
        1_000,
      )
      .catch(() => null);
    if (parseError) {
      expect(parseError.error).toMatchObject({
        code: -32700,
        message: expect.stringContaining('Parse error'),
      });
    }

    await client.shutdown();
    const exitCode = await client.waitForExit(20_000);
    expect(exitCode).toBe(0);
  }, 30_000);
});

describe.runIf(RUN_REAL_LUALS_PRODUCT_MATRIX && Boolean(REAL_LUALS_PATH)).sequential(
  'cbs-language-server stdio product matrix with real LuaLS',
  () => {
    it('boots with a real LuaLS companion and answers hover over stdio for mirrored .risulua documents', async () => {
      const root = await createWorkspaceRoot('cbs-lsp-stdio-luals-', tempRoots);
      const absolutePath = await writeWorkspaceFile(root, 'lua/companion.risulua', 'local greeting = "hello"\nreturn greeting\n');
      const uri = pathToFileURL(absolutePath).toString();
      const text = 'local greeting = "hello"\nreturn greeting\n';
      const client = createStdioClientWithTracking([
        '--stdio',
        '--workspace',
        root,
        '--luals-path',
        REAL_LUALS_PATH!,
      ]);

      const initializeResult = (await client.request('initialize', {
        processId: null,
        rootUri: pathToFileURL(root).toString(),
        workspaceFolders: [{ uri: pathToFileURL(root).toString(), name: 'fixture' }],
        capabilities: {},
      }, 20_000)) as {
        experimental?: {
          cbs?: {
            availability?: {
              companions?: {
                luals?: {
                  executablePath?: string | null;
                  status?: string;
                };
              };
            };
          };
        };
      };

      expect(initializeResult.experimental?.cbs?.availability?.companions?.luals).toMatchObject({
        executablePath: REAL_LUALS_PATH,
        status: 'stopped',
      });

      client.notify('initialized', {});
      client.notify('textDocument/didOpen', {
        textDocument: {
          uri,
          languageId: 'lua',
          version: 1,
          text,
        },
      });

      const hover = await requestHoverUntilReady(client, uri, text);

      expect(getHoverMarkdown(hover)).toContain('greeting');

      await client.shutdown();
      const exitCode = await client.waitForExit(20_000);
      expect(exitCode).toBe(0);
    }, 30_000);

    it('receives non-empty LuaLS diagnostics via shadow-file workspace over stdio', async () => {
      const root = await createWorkspaceRoot('cbs-lsp-stdio-luals-diag-', tempRoots);
      // Use Lua code with intentional issues to trigger diagnostics
      const luaTextWithIssues = 'local x = 1\nlocal x = 2\nreturn x\n';
      const absolutePath = await writeWorkspaceFile(root, 'lua/diagnostics.risulua', luaTextWithIssues);
      const uri = pathToFileURL(absolutePath).toString();
      const client = createStdioClientWithTracking([
        '--stdio',
        '--workspace',
        root,
        '--luals-path',
        REAL_LUALS_PATH!,
      ]);

      const initializeResult = (await client.request('initialize', {
        processId: null,
        rootUri: pathToFileURL(root).toString(),
        workspaceFolders: [{ uri: pathToFileURL(root).toString(), name: 'fixture' }],
        capabilities: {},
      }, 20_000)) as {
        experimental?: {
          cbs?: {
            availability?: {
              companions?: {
                luals?: {
                  executablePath?: string | null;
                  status?: string;
                };
              };
            };
          };
        };
      };

      expect(initializeResult.experimental?.cbs?.availability?.companions?.luals).toMatchObject({
        executablePath: REAL_LUALS_PATH,
        status: 'stopped',
      });

      client.notify('initialized', {});
      client.notify('textDocument/didOpen', {
        textDocument: {
          uri,
          languageId: 'lua',
          version: 1,
          text: luaTextWithIssues,
        },
      });

      // Wait for non-empty diagnostics from LuaLS via shadow-file workspace
      const diagnostics = await waitForDiagnosticsUntil(client, uri, (diagnostics) => diagnostics.length > 0, 20_000);

      expect(diagnostics.uri).toBe(uri);
      expect(diagnostics.diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics.diagnostics[0]).toMatchObject({
        message: expect.any(String),
        range: {
          end: { character: expect.any(Number), line: expect.any(Number) },
          start: { character: expect.any(Number), line: expect.any(Number) },
        },
      });

      await client.shutdown();
      const exitCode = await client.waitForExit(20_000);
      expect(exitCode).toBe(0);
    }, 30_000);
  },
);
