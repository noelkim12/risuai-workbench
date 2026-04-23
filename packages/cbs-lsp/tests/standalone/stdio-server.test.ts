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

interface JsonRpcRequestMessage {
  id: number;
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

interface JsonRpcNotificationMessage {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

interface JsonRpcResponseMessage {
  error?: {
    code: number;
    data?: unknown;
    message: string;
  };
  id: number | null;
  jsonrpc: '2.0';
  result?: unknown;
}

interface JsonRpcResponseRecord {
  error?: JsonRpcResponseMessage['error'];
  id: number | null;
  result?: unknown;
}

interface JsonRpcNotificationRecord {
  method: string;
  params: unknown;
}

interface DiagnosticsNotificationParams {
  diagnostics: Array<{
    code?: string | number;
    message: string;
    range: {
      end: { character: number; line: number };
      start: { character: number; line: number };
    };
    severity?: number;
    source?: string;
  }>;
  uri: string;
  version?: number;
}

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
 * positionAt 함수.
 * 문자열 안 특정 토큰의 host position을 찾아 LSP position으로 바꾼다.
 *
 * @param text - 검색할 전체 텍스트
 * @param needle - 찾을 토큰
 * @param characterOffset - 찾은 토큰 시작점에서 더할 문자 오프셋
 * @returns 해당 토큰의 LSP position
 */
function positionAt(text: string, needle: string, characterOffset: number = 0): { character: number; line: number } {
  const offset = text.indexOf(needle);
  expect(offset).toBeGreaterThanOrEqual(0);

  const before = text.slice(0, offset + characterOffset);
  const lines = before.split('\n');

  return {
    line: lines.length - 1,
    character: lines.at(-1)?.length ?? 0,
  };
}

/**
 * getHoverMarkdown 함수.
 * hover payload를 테스트하기 쉬운 markdown 문자열로 정규화함.
 *
 * @param hover - 서버가 반환한 hover 결과
 * @returns markdown 본문 또는 null
 */
function getHoverMarkdown(hover: unknown): string | null {
  if (!hover || typeof hover !== 'object') {
    return null;
  }

  const contents = (hover as { contents?: { value?: string } }).contents;
  return contents?.value ?? null;
}

/**
 * StdioLspClient 클래스.
 * built standalone CLI를 외부 LSP client처럼 stdio JSON-RPC로 구동함.
 */
class StdioLspClient {
  private readonly notifications: JsonRpcNotificationRecord[] = [];

  private readonly orphanResponses: JsonRpcResponseRecord[] = [];

  private readonly notificationWaiters: Array<{
    method: string;
    predicate: (params: unknown) => boolean;
    reject: (error: Error) => void;
    resolve: (params: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  private readonly pendingRequests = new Map<
    number,
    {
      reject: (error: Error) => void;
      resolve: (result: unknown) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  private readonly responseWaiters: Array<{
    predicate: (response: JsonRpcResponseRecord) => boolean;
    reject: (error: Error) => void;
    resolve: (response: JsonRpcResponseRecord) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  private nextId = 1;

  private stdoutBuffer = Buffer.alloc(0);

  private readonly stderrChunks: Buffer[] = [];

  constructor(private readonly child: ChildProcessWithoutNullStreams) {
    this.child.stdout.on('data', (chunk: Buffer) => {
      this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, chunk]);
      this.drainFrames();
    });

    this.child.stderr.on('data', (chunk: Buffer) => {
      this.stderrChunks.push(chunk);
    });

    const exitHandler = (code: number | null, signal: NodeJS.Signals | null) => {
      const detail = signal ? `signal=${signal}` : `code=${String(code)}`;
      const error = new Error(
        `cbs-language-server stdio child exited before the pending RPC completed (${detail}). stderr: ${this.getStderr()}`,
      );

      for (const pending of this.pendingRequests.values()) {
        clearTimeout(pending.timer);
        pending.reject(error);
      }
      this.pendingRequests.clear();

      while (this.notificationWaiters.length > 0) {
        const waiter = this.notificationWaiters.shift();
        if (!waiter) {
          continue;
        }
        clearTimeout(waiter.timer);
        waiter.reject(error);
      }

      while (this.responseWaiters.length > 0) {
        const waiter = this.responseWaiters.shift();
        if (!waiter) {
          continue;
        }
        clearTimeout(waiter.timer);
        waiter.reject(error);
      }
    };

    this.child.once('exit', exitHandler);
    this.child.once('error', () => {
      exitHandler(null, null);
    });
  }

  /**
   * request 함수.
   * stdio child에게 JSON-RPC request를 보내고 응답을 기다림.
   *
   * @param method - 호출할 LSP method
   * @param params - method에 전달할 params payload
   * @param timeoutMs - 응답을 기다릴 최대 시간
   * @returns 서버가 돌려준 JSON-RPC result
   */
  request(method: string, params: unknown, timeoutMs: number = 10_000): Promise<unknown> {
    const prepared = this.prepareRequest(method, params, timeoutMs);
    this.writeMessage(prepared.message);
    return prepared.response;
  }

  /**
   * requestChunked 함수.
   * request frame을 여러 stdin chunk로 쪼개 보내면서 응답을 기다림.
   *
   * @param method - 호출할 LSP method
   * @param params - method에 전달할 params payload
   * @param splitOffsets - frame을 자를 byte 경계 목록
   * @param timeoutMs - 응답을 기다릴 최대 시간
   * @returns 서버가 돌려준 JSON-RPC result
   */
  async requestChunked(
    method: string,
    params: unknown,
    splitOffsets: readonly number[],
    timeoutMs: number = 10_000,
  ): Promise<unknown> {
    const prepared = this.prepareRequest(method, params, timeoutMs);
    await this.writeFrameInChunks(this.encodeMessage(prepared.message), splitOffsets);
    return prepared.response;
  }

  /**
   * notify 함수.
   * stdio child에게 fire-and-forget JSON-RPC notification을 보냄.
   *
   * @param method - 호출할 LSP notification method
   * @param params - notification payload
   */
  notify(method: string, params: unknown): void {
    this.writeMessage({ jsonrpc: '2.0', method, params } satisfies JsonRpcNotificationMessage);
  }

  /**
   * notifyChunked 함수.
   * notification frame을 여러 stdin chunk로 쪼개 전송함.
   *
   * @param method - 호출할 LSP notification method
   * @param params - notification payload
   * @param splitOffsets - frame을 자를 byte 경계 목록
   */
  async notifyChunked(method: string, params: unknown, splitOffsets: readonly number[]): Promise<void> {
    await this.writeFrameInChunks(
      this.encodeMessage({ jsonrpc: '2.0', method, params } satisfies JsonRpcNotificationMessage),
      splitOffsets,
    );
  }

  /**
   * waitForResponse 함수.
   * pending request와 연결되지 않은 JSON-RPC response를 predicate 기준으로 기다림.
   *
   * @param predicate - 응답 payload를 필터링할 조건
   * @param timeoutMs - 응답을 기다릴 최대 시간
   * @returns 조건을 통과한 response record
   */
  waitForResponse(
    predicate: (response: JsonRpcResponseRecord) => boolean,
    timeoutMs: number = 10_000,
  ): Promise<JsonRpcResponseRecord> {
    const existingIndex = this.orphanResponses.findIndex((response) => predicate(response));
    if (existingIndex >= 0) {
      const [response] = this.orphanResponses.splice(existingIndex, 1);
      return Promise.resolve(response);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.responseWaiters.findIndex((waiter) => waiter.resolve === resolve);
        if (index >= 0) {
          this.responseWaiters.splice(index, 1);
        }
        reject(new Error(`Timed out waiting for orphan JSON-RPC response. stderr: ${this.getStderr()}`));
      }, timeoutMs);

      this.responseWaiters.push({ predicate, resolve, reject, timer });
    });
  }

  /**
   * sendBatch 함수.
   * 여러 JSON-RPC frame을 한 번의 stdin write로 붙여 보내 transport batching을 재현함.
   *
   * @param messages - 순서대로 직렬화할 JSON-RPC message 목록
   */
  sendBatch(messages: ReadonlyArray<JsonRpcRequestMessage | JsonRpcNotificationMessage>): void {
    const frame = Buffer.concat(messages.map((message) => this.encodeMessage(message)));
    this.child.stdin.write(frame);
  }

  /**
   * sendRawFrame 함수.
   * 이미 직렬화한 body를 원하는 Content-Length와 함께 직접 전송함.
   *
   * @param rawBody - frame body로 보낼 raw JSON text
   * @param contentLength - header에 넣을 Content-Length 값. 기본값은 raw body 길이
   */
  sendRawFrame(rawBody: string, contentLength: number = Buffer.byteLength(rawBody, 'utf8')): void {
    const body = Buffer.from(rawBody, 'utf8');
    const header = Buffer.from(`Content-Length: ${contentLength}\r\n\r\n`, 'utf8');
    this.child.stdin.write(Buffer.concat([header, body]));
  }

  /**
   * waitForNotification 함수.
   * 특정 method의 notification이 predicate를 만족할 때까지 기다림.
   *
   * @param method - 기다릴 notification method
   * @param predicate - payload를 추가로 필터링할 조건
   * @param timeoutMs - notification을 기다릴 최대 시간
   * @returns 조건을 통과한 notification params
   */
  waitForNotification(
    method: string,
    predicate: (params: unknown) => boolean = () => true,
    timeoutMs: number = 10_000,
  ): Promise<unknown> {
    const existingIndex = this.notifications.findIndex(
      (notification) => notification.method === method && predicate(notification.params),
    );
    if (existingIndex >= 0) {
      const [notification] = this.notifications.splice(existingIndex, 1);
      return Promise.resolve(notification.params);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.notificationWaiters.findIndex((waiter) => waiter.resolve === resolve);
        if (index >= 0) {
          this.notificationWaiters.splice(index, 1);
        }
        reject(
          new Error(
            `Timed out waiting for JSON-RPC notification: ${method}. stderr: ${this.getStderr()}`,
          ),
        );
      }, timeoutMs);

      this.notificationWaiters.push({ method, predicate, resolve, reject, timer });
    });
  }

  /**
   * shutdown 함수.
   * JSON-RPC shutdown/exit 순서로 stdio server를 정리함.
   */
  async shutdown(): Promise<void> {
    await this.request('shutdown', null, 20_000);
    this.notify('exit', undefined);
  }

  /**
   * shutdownChunked 함수.
   * shutdown request와 exit notification을 chunked transport로 전송함.
   *
   * @param requestSplitOffsets - shutdown request frame을 자를 byte 경계 목록
   * @param exitSplitOffsets - exit notification frame을 자를 byte 경계 목록
   */
  async shutdownChunked(
    requestSplitOffsets: readonly number[],
    exitSplitOffsets: readonly number[],
  ): Promise<void> {
    await this.requestChunked('shutdown', null, requestSplitOffsets, 20_000);
    await this.notifyChunked('exit', undefined, exitSplitOffsets);
  }

  /**
   * waitForExit 함수.
   * child process가 종료될 때까지 기다리고 종료 코드를 돌려줌.
   *
   * @param timeoutMs - 프로세스 종료를 기다릴 최대 시간
   * @returns child exit code
   */
  waitForExit(timeoutMs: number = 10_000): Promise<number | null> {
    if (this.child.exitCode !== null) {
      return Promise.resolve(this.child.exitCode);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(`Timed out waiting for cbs-language-server to exit. stderr: ${this.getStderr()}`),
        );
      }, timeoutMs);

      this.child.once('exit', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
      this.child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  /**
   * dispose 함수.
   * 테스트 실패 시 child process를 강제로 정리함.
   */
  dispose(): void {
    if (this.child.exitCode === null) {
      this.child.kill('SIGTERM');
    }
  }

  /**
   * getStderr 함수.
   * 현재까지 누적된 stderr를 디버깅 문자열로 돌려줌.
   *
   * @returns stderr UTF-8 본문
   */
  getStderr(): string {
    return Buffer.concat(this.stderrChunks).toString('utf8');
  }

  private drainFrames(): void {
    while (true) {
      const headerEnd = this.stdoutBuffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) {
        return;
      }

      const header = this.stdoutBuffer.subarray(0, headerEnd).toString('utf8');
      const contentLengthLine = header
        .split('\r\n')
        .find((line) => line.toLowerCase().startsWith('content-length:'));

      if (!contentLengthLine) {
        throw new Error(`Missing Content-Length header in JSON-RPC frame: ${header}`);
      }

      const contentLength = Number.parseInt(contentLengthLine.split(':')[1]?.trim() ?? '', 10);
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + contentLength;
      if (this.stdoutBuffer.length < messageEnd) {
        return;
      }

      const messageBuffer = this.stdoutBuffer.subarray(messageStart, messageEnd);
      this.stdoutBuffer = this.stdoutBuffer.subarray(messageEnd);
      this.handleMessage(JSON.parse(messageBuffer.toString('utf8')) as JsonRpcResponseMessage | JsonRpcNotificationMessage);
    }
  }

  private handleMessage(message: JsonRpcResponseMessage | JsonRpcNotificationMessage): void {
    if ('id' in message) {
      const pending = this.pendingRequests.get(message.id ?? -1);
      if (!pending) {
        this.queueOrphanResponse({
          error: message.error,
          id: message.id,
          result: message.result,
        });
        return;
      }

      clearTimeout(pending.timer);
      this.pendingRequests.delete(message.id ?? -1);

      if (message.error) {
        pending.reject(new Error(`JSON-RPC ${message.error.code}: ${message.error.message}`));
        return;
      }

      pending.resolve(message.result ?? null);
      return;
    }

    const waiterIndex = this.notificationWaiters.findIndex(
      (waiter) => waiter.method === message.method && waiter.predicate(message.params),
    );
    if (waiterIndex >= 0) {
      const [waiter] = this.notificationWaiters.splice(waiterIndex, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message.params);
      return;
    }

    this.notifications.push({ method: message.method, params: message.params });
  }

  private writeMessage(message: JsonRpcRequestMessage | JsonRpcNotificationMessage): void {
    this.child.stdin.write(this.encodeMessage(message));
  }

  /**
   * prepareRequest 함수.
   * request id/promise를 먼저 준비해서 batched transport에서도 같은 pending map을 재사용하게 함.
   *
   * @param method - 호출할 LSP method
   * @param params - method에 전달할 params payload
   * @param timeoutMs - 응답을 기다릴 최대 시간
   * @returns 직렬화 전 message와 응답 promise 묶음
   */
  prepareRequest(
    method: string,
    params: unknown,
    timeoutMs: number = 10_000,
  ): {
    message: JsonRpcRequestMessage;
    response: Promise<unknown>;
  } {
    const id = this.nextId++;
    const message = { id, jsonrpc: '2.0', method, params } satisfies JsonRpcRequestMessage;

    const response = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(
          new Error(
            `Timed out waiting for JSON-RPC response: ${method}. stderr: ${this.getStderr()}`,
          ),
        );
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });
    });

    return { message, response };
  }

  private encodeMessage(message: JsonRpcRequestMessage | JsonRpcNotificationMessage): Buffer {
    const body = Buffer.from(JSON.stringify(message), 'utf8');
    const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf8');
    return Buffer.concat([header, body]);
  }

  private async writeFrameInChunks(frame: Buffer, splitOffsets: readonly number[]): Promise<void> {
    const boundaries = Array.from(new Set(splitOffsets))
      .filter((offset) => Number.isInteger(offset) && offset > 0 && offset < frame.length)
      .sort((left, right) => left - right);
    const slices: Buffer[] = [];
    let previous = 0;

    for (const boundary of boundaries) {
      slices.push(frame.subarray(previous, boundary));
      previous = boundary;
    }
    slices.push(frame.subarray(previous));

    for (const slice of slices) {
      await new Promise<void>((resolve, reject) => {
        this.child.stdin.write(slice, (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  }

  private queueOrphanResponse(response: JsonRpcResponseRecord): void {
    const waiterIndex = this.responseWaiters.findIndex((waiter) => waiter.predicate(response));
    if (waiterIndex >= 0) {
      const [waiter] = this.responseWaiters.splice(waiterIndex, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(response);
      return;
    }

    this.orphanResponses.push(response);
  }
}

/**
 * createStdioClient 함수.
 * standalone CLI를 외부 stdio client 관점에서 띄우고 테스트 대상 client wrapper를 반환함.
 *
 * @param args - CLI에 전달할 stdio launch 인자
 * @returns stdio JSON-RPC client wrapper
 */
function createStdioClient(args: readonly string[]): StdioLspClient {
  const child = spawnCliProcess(args);
  childProcesses.add(child);
  return new StdioLspClient(child);
}

/**
 * requestHoverUntilReady 함수.
 * opt-in real LuaLS matrix에서 sidecar startup이 끝날 때까지 hover roundtrip을 재시도함.
 *
 * @param client - 요청을 보낼 stdio JSON-RPC client
 * @param uri - hover 대상 문서 URI
 * @param text - hover 대상 문서 텍스트
 * @returns 성공한 hover payload
 */
async function requestHoverUntilReady(client: StdioLspClient, uri: string, text: string): Promise<unknown> {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    const hover = await client.request('textDocument/hover', {
      textDocument: { uri },
      position: positionAt(text, 'greeting', 1),
    }, 20_000);

    if (getHoverMarkdown(hover)?.includes('greeting')) {
      return hover;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for real LuaLS hover response. stderr: ${client.getStderr()}`);
}

/**
 * requestReferencesUntil 함수.
 * workspace refresh가 끝날 때까지 references 결과를 재시도하며 기대 조건을 기다림.
 *
 * @param client - 요청을 보낼 stdio JSON-RPC client
 * @param uri - 기준 문서 URI
 * @param text - 기준 문서 텍스트
 * @param needle - cursor를 둘 토큰
 * @param predicate - references 배열이 만족해야 할 조건
 * @returns 조건을 통과한 references 결과
 */
async function requestReferencesUntil(
  client: StdioLspClient,
  uri: string,
  text: string,
  needle: string,
  predicate: (locations: Array<{ uri: string }>) => boolean,
): Promise<Array<{ uri: string }>> {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    const result = (await client.request('textDocument/references', {
      textDocument: { uri },
      position: positionAt(text, needle),
      context: { includeDeclaration: true },
    }, 20_000)) as Array<{ uri: string }> | null;
    const locations = result ?? [];

    if (predicate(locations)) {
      return locations;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for references to satisfy the expected workspace condition. stderr: ${client.getStderr()}`);
}

/**
 * waitForDiagnosticsUntil 함수.
 * textDocument/publishDiagnostics notification이 non-empty payload로 도착할 때까지 기다림.
 *
 * @param client - stdio JSON-RPC client
 * @param uri - diagnostics 대상 문서 URI
 * @param predicate - diagnostics 배열이 만족해야 할 조건
 * @param timeoutMs - 최대 대기 시간
 * @returns non-empty diagnostics params
 */
async function waitForDiagnosticsUntil(
  client: StdioLspClient,
  uri: string,
  predicate: (diagnostics: DiagnosticsNotificationParams['diagnostics']) => boolean = (diagnostics) => diagnostics.length > 0,
  timeoutMs: number = 20_000,
): Promise<DiagnosticsNotificationParams> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const params = await client.waitForNotification(
        'textDocument/publishDiagnostics',
        (notificationParams): boolean => {
          if (!notificationParams || typeof notificationParams !== 'object') {
            return false;
          }
          const p = notificationParams as { uri?: string; diagnostics?: unknown };
          return p.uri === uri && Array.isArray(p.diagnostics);
        },
        500,
      ) as DiagnosticsNotificationParams;

      if (predicate(params.diagnostics)) {
        return params;
      }
    } catch {
      // Timeout on single wait, continue polling
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for non-empty diagnostics for ${uri}. stderr: ${client.getStderr()}`);
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
    const client = createStdioClient([
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
    const client = createStdioClient([
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
    const client = createStdioClient([
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
    const client = createStdioClient([
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
      const client = createStdioClient([
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
      const client = createStdioClient([
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
