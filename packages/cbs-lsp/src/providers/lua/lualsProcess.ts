/**
 * LuaLS sidecar process manager and stdio JSON-RPC transport.
 * @file packages/cbs-lsp/src/providers/lua/lualsProcess.ts
 */

import {
  spawn,
  type ChildProcessWithoutNullStreams,
  type SpawnOptionsWithoutStdio,
} from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter } from 'node:path';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { type Diagnostic, type InitializeParams } from 'vscode-languageserver/node';

import {
  createLuaLsCompanionRuntime,
  type LuaLsCompanionRuntime,
} from '../../core/availability-contract';
import type { LuaLsRoutedDocument } from './lualsDocuments';
import {
  createLuaLsShadowWorkspace,
  type LuaLsShadowWorkspace,
} from './lualsShadowWorkspace';

const DEFAULT_HEALTH_CHECK_INTERVAL_MS = 30_000;
const DEFAULT_INITIALIZE_TIMEOUT_MS = 5_000;
const DEFAULT_RESTART_BACKOFF_MS = Object.freeze([1_000, 3_000]);
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 3_000;
const DEFAULT_STDERR_RING_BUFFER_LIMIT = 20;
const DEFAULT_PROXY_REQUEST_TIMEOUT_MS = 1_500;
/**
 * LuaLS 기본 executable candidate 목록.
 * compatibility matrix와 runtime contract가 같은 binary expectation을 재사용할 때의 source of truth입니다.
 */
export const DEFAULT_LUALS_EXECUTABLE_CANDIDATES = Object.freeze([
  'lua-language-server',
  'lua-language-server.exe',
]);
const LUALS_VALID_SCHEMES = Object.freeze(['file', 'risu-luals']);

export interface LuaLsProcessPrepareOptions {
  overrideExecutablePath?: string | null;
  rootPath?: string | null;
}

export interface LuaLsProcessStartOptions {
  rootPath?: string | null;
}

export interface LuaLsExecutableResolutionOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  exists?: (filePath: string) => boolean;
  overrideExecutablePath?: string | null;
  candidates?: readonly string[];
}

export interface LuaLsProcessEvent {
  type:
    | 'prepared'
    | 'unavailable'
    | 'spawn-start'
    | 'spawned'
    | 'initialize-start'
    | 'initialized'
    | 'health-check'
    | 'restart-attempt'
    | 'restart-gave-up'
    | 'restart-scheduled'
    | 'stderr'
    | 'crashed'
    | 'shutdown-start'
    | 'shutdown-end';
  runtime: LuaLsCompanionRuntime;
  stderrLine?: string;
}

export interface LuaLsRestartPolicyStatus {
  attemptsRemaining: number;
  lastStartRootPath: string | null;
  maxAttempts: number;
  mode: 'automatic-on-crash';
  nextDelayMs: number | null;
}

export interface LuaLsSpawnedProcess extends ChildProcessWithoutNullStreams {}

export interface LuaLsTransport {
  dispose(): void;
  notify(method: string, params: unknown): void;
  onNotification(handler: LuaLsTransportNotificationHandler): void;
  request<TResult>(method: string, params: unknown, timeoutMs: number): Promise<TResult>;
}

export interface LuaLsTransportNotification {
  method: string;
  params: unknown;
}

export type LuaLsTransportNotificationHandler = (notification: LuaLsTransportNotification) => void;

export interface LuaLsPublishDiagnosticsParams {
  diagnostics: readonly Diagnostic[];
  uri: string;
  version?: number;
}

export interface LuaLsPublishDiagnosticsEvent {
  diagnostics: readonly Diagnostic[];
  sourceUri: string;
  transportUri: string;
  version?: number;
}

interface ManagedLuaLsDocument {
  languageId: 'lua';
  sourceFilePath: string;
  sourceUri: string;
  text: string;
  transportUri: string;
  version: number | string;
}

export interface LuaLsTransportFactory {
  create(processHandle: LuaLsSpawnedProcess): LuaLsTransport;
}

export interface LuaLsProcessManagerOptions {
  createShadowWorkspace?: () => LuaLsShadowWorkspace;
  cwd?: string;
  createTransport?: LuaLsTransportFactory;
  env?: NodeJS.ProcessEnv;
  healthCheckIntervalMs?: number;
  initializeTimeoutMs?: number;
  onEvent?: (event: LuaLsProcessEvent) => void;
  processId?: number;
  resolveExecutablePath?: (options: LuaLsExecutableResolutionOptions) => string | null;
  restartBackoffMs?: readonly number[];
  shutdownTimeoutMs?: number;
  spawnProcess?: (
    command: string,
    args: readonly string[],
    options: SpawnOptionsWithoutStdio,
  ) => LuaLsSpawnedProcess;
  stderrRingBufferLimit?: number;
}

interface PendingJsonRpcRequest<TResult> {
  reject: (reason?: unknown) => void;
  resolve: (value: TResult | PromiseLike<TResult>) => void;
  timeoutHandle: NodeJS.Timeout;
}

/**
 * resolveLuaLsExecutablePathSync 함수.
 * override 경로와 PATH 후보를 순서대로 검사해서 LuaLS 실행 파일을 찾음.
 *
 * @param options - 경로 탐색에 필요한 환경/override 옵션
 * @returns 찾은 절대 경로, 없으면 null
 */
export function resolveLuaLsExecutablePathSync(
  options: LuaLsExecutableResolutionOptions = {},
): string | null {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const exists = options.exists ?? existsSync;
  const overridePath = options.overrideExecutablePath?.trim();

  if (overridePath) {
    const normalizedOverride = path.isAbsolute(overridePath)
      ? overridePath
      : path.resolve(cwd, overridePath);
    return exists(normalizedOverride) ? normalizedOverride : null;
  }

  const pathEntries = (env.PATH ?? '')
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

    for (const candidate of options.candidates ?? DEFAULT_LUALS_EXECUTABLE_CANDIDATES) {
    if (path.isAbsolute(candidate) && exists(candidate)) {
      return candidate;
    }

    for (const directory of pathEntries) {
      const candidatePath = path.join(directory, candidate);
      if (exists(candidatePath)) {
        return candidatePath;
      }
    }
  }

  return null;
}

/**
 * LuaLsStdioTransport 클래스.
 * stdio 기반 Content-Length framed JSON-RPC 요청/응답을 처리함.
 */
class LuaLsStdioTransport implements LuaLsTransport {
  private nextRequestId = 0;

  private notificationHandler: LuaLsTransportNotificationHandler = () => undefined;

  private readonly pendingRequests = new Map<number, PendingJsonRpcRequest<unknown>>();

  private stdoutBuffer = Buffer.alloc(0);

  constructor(private readonly processHandle: LuaLsSpawnedProcess) {
    processHandle.stdout.on('data', this.handleStdoutChunk);
  }

  dispose(): void {
    this.processHandle.stdout.off('data', this.handleStdoutChunk);
    for (const [requestId, pendingRequest] of this.pendingRequests.entries()) {
      clearTimeout(pendingRequest.timeoutHandle);
      pendingRequest.reject(new Error(`LuaLS transport disposed before request ${requestId} completed.`));
      this.pendingRequests.delete(requestId);
    }
    this.stdoutBuffer = Buffer.alloc(0);
  }

  notify(method: string, params: unknown): void {
    this.writeMessage({ jsonrpc: '2.0', method, params });
  }

  onNotification(handler: LuaLsTransportNotificationHandler): void {
    this.notificationHandler = handler;
  }

  request<TResult>(method: string, params: unknown, timeoutMs: number): Promise<TResult> {
    const requestId = ++this.nextRequestId;
    this.writeMessage({ jsonrpc: '2.0', id: requestId, method, params });

    return new Promise<TResult>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`LuaLS request timed out: ${method}`));
      }, timeoutMs);

      this.pendingRequests.set(requestId, {
        resolve: resolve as PendingJsonRpcRequest<unknown>['resolve'],
        reject,
        timeoutHandle,
      });
    });
  }

  private readonly handleStdoutChunk = (chunk: Buffer | string): void => {
    const normalizedChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8');
    this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, normalizedChunk]);

    while (true) {
      const headerEndOffset = this.stdoutBuffer.indexOf('\r\n\r\n');
      if (headerEndOffset === -1) {
        return;
      }

      const header = this.stdoutBuffer.subarray(0, headerEndOffset).toString('utf8');
      const contentLengthMatch = header.match(/Content-Length:\s*(\d+)/iu);
      if (!contentLengthMatch) {
        this.stdoutBuffer = this.stdoutBuffer.subarray(headerEndOffset + 4);
        continue;
      }

      const contentLength = Number.parseInt(contentLengthMatch[1] ?? '', 10);
      const messageStartOffset = headerEndOffset + 4;
      const messageEndOffset = messageStartOffset + contentLength;
      if (this.stdoutBuffer.length < messageEndOffset) {
        return;
      }

      const messageBytes = this.stdoutBuffer.subarray(messageStartOffset, messageEndOffset);
      this.stdoutBuffer = this.stdoutBuffer.subarray(messageEndOffset);

      let payload: unknown;
      try {
        payload = JSON.parse(messageBytes.toString('utf8'));
      } catch {
        continue;
      }

      this.handleMessage(payload);
    }
  };

  private handleMessage(payload: unknown): void {
    if (!payload || typeof payload !== 'object') {
      return;
    }

    if ('method' in payload && typeof payload.method === 'string' && !('id' in payload)) {
      this.notificationHandler({
        method: payload.method,
        params: (payload as { params?: unknown }).params ?? null,
      });
      return;
    }

    if (!('id' in payload)) {
      return;
    }

    const requestId = typeof payload.id === 'number' ? payload.id : null;
    if (requestId === null) {
      return;
    }

    const pendingRequest = this.pendingRequests.get(requestId);
    if (!pendingRequest) {
      return;
    }

    clearTimeout(pendingRequest.timeoutHandle);
    this.pendingRequests.delete(requestId);

    if ('error' in payload && payload.error) {
      const errorPayload = payload.error as { message?: string };
      pendingRequest.reject(new Error(errorPayload.message ?? 'LuaLS returned an unknown error.'));
      return;
    }

    pendingRequest.resolve((payload as { result?: unknown }).result ?? null);
  }

  private writeMessage(message: Record<string, unknown>): void {
    const json = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n`;
    this.processHandle.stdin.write(`${header}${json}`, 'utf8');
  }
}

/**
 * LuaLsProcessManager 클래스.
 * LuaLS executable 탐색, spawn/initialize/shutdown, crash 추적, health check를 담당함.
 */
export class LuaLsProcessManager {
  private childProcess: LuaLsSpawnedProcess | null = null;

  private executablePath: string | null = null;

  private healthCheckTimer: NodeJS.Timeout | null = null;

  private readonly initializeTimeoutMs: number;

  private initialized = false;

  private readonly onEvent: (event: LuaLsProcessEvent) => void;

  private readonly publishDiagnosticsListeners = new Set<
    (event: LuaLsPublishDiagnosticsEvent) => void
  >();

  private readonly processId: number;

  private readonly restartBackoffMs: readonly number[];

  private restartTimer: NodeJS.Timeout | null = null;

  private restartTimerDelayMs: number | null = null;

  private lastStartOptions: LuaLsProcessStartOptions = { rootPath: null };

  private restartAttemptIndex = 0;

  private readonly resolveExecutablePath: (options: LuaLsExecutableResolutionOptions) => string | null;

  private readonly shutdownTimeoutMs: number;

  private readonly shadowWorkspace: LuaLsShadowWorkspace;

  private readonly spawnProcess: NonNullable<LuaLsProcessManagerOptions['spawnProcess']>;

  private readonly synchronizedDocuments = new Map<string, ManagedLuaLsDocument>();

  private stderrLines: string[] = [];

  private readonly stderrRingBufferLimit: number;

  private shutdownRequested = false;

  private transport: LuaLsTransport | null = null;

  private readonly transportFactory: LuaLsTransportFactory;

  private runtime = createLuaLsCompanionRuntime();

  constructor(private readonly options: LuaLsProcessManagerOptions = {}) {
    this.initializeTimeoutMs = options.initializeTimeoutMs ?? DEFAULT_INITIALIZE_TIMEOUT_MS;
    this.onEvent = options.onEvent ?? (() => undefined);
    this.processId = options.processId ?? process.pid;
    this.resolveExecutablePath = options.resolveExecutablePath ?? resolveLuaLsExecutablePathSync;
    this.restartBackoffMs = options.restartBackoffMs ?? DEFAULT_RESTART_BACKOFF_MS;
    this.shutdownTimeoutMs = options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
    this.shadowWorkspace = options.createShadowWorkspace?.() ?? createLuaLsShadowWorkspace();
    this.spawnProcess = options.spawnProcess ?? ((command, args, spawnOptions) => spawn(command, args, spawnOptions));
    this.stderrRingBufferLimit = options.stderrRingBufferLimit ?? DEFAULT_STDERR_RING_BUFFER_LIMIT;
    this.transportFactory =
      options.createTransport ?? ({ create: (processHandle) => new LuaLsStdioTransport(processHandle) });
  }

  /**
   * getRuntime 함수.
   * 현재 LuaLS sidecar 상태 스냅샷을 반환함.
   *
   * @returns 현재 sidecar runtime 상태
   */
  getRuntime(): LuaLsCompanionRuntime {
    return this.runtime;
  }

  /**
   * getRestartPolicy 함수.
   * 현재 sidecar 자동 재기동 정책과 다음 시도 상태를 요약함.
   *
   * @returns 현재 restart policy snapshot
   */
  getRestartPolicy(): LuaLsRestartPolicyStatus {
    return {
      attemptsRemaining: Math.max(this.restartBackoffMs.length - this.restartAttemptIndex, 0),
      lastStartRootPath: this.lastStartOptions.rootPath ?? null,
      maxAttempts: this.restartBackoffMs.length,
      mode: 'automatic-on-crash',
      nextDelayMs: this.restartTimerDelayMs,
    };
  }

  /**
   * request 함수.
   * 준비된 LuaLS transport로 임의의 JSON-RPC request를 보내고 응답을 기다림.
   *
   * @param method - LuaLS에 전달할 JSON-RPC method
   * @param params - method payload
   * @param timeoutMs - 응답 timeout, 기본값은 proxy seam용 짧은 timeout
   * @returns transport가 준비되지 않았으면 null, 아니면 LuaLS 응답
   */
  async request<TResult>(
    method: string,
    params: unknown,
    timeoutMs: number = DEFAULT_PROXY_REQUEST_TIMEOUT_MS,
  ): Promise<TResult | null> {
    if (!this.isTransportReady()) {
      return null;
    }

    return this.transport?.request<TResult>(method, params, timeoutMs) ?? null;
  }

  /**
   * onPublishDiagnostics 함수.
   * LuaLS `textDocument/publishDiagnostics` notification을 host publish loop에서 소비할 수 있게 구독함.
   *
   * @param listener - source URI 기준 diagnostics payload를 받을 리스너
   * @returns 구독 해제 함수
   */
  onPublishDiagnostics(listener: (event: LuaLsPublishDiagnosticsEvent) => void): () => void {
    this.publishDiagnosticsListeners.add(listener);
    return () => {
      this.publishDiagnosticsListeners.delete(listener);
    };
  }

  /**
   * syncDocument 함수.
   * 현재 Lua 문서를 canonical mirror 상태로 저장하고, transport가 준비됐으면 didOpen/didChange를 전달함.
   *
   * @param document - LuaLS session에 반영할 routed Lua document
   */
  syncDocument(document: LuaLsRoutedDocument): void {
    const nextDocument: ManagedLuaLsDocument = {
      languageId: document.languageId,
      sourceFilePath: document.sourceFilePath,
      sourceUri: document.sourceUri,
      text: document.text,
      transportUri: this.shadowWorkspace.syncDocument(document.sourceFilePath, document.text),
      version: document.version,
    };
    const previousDocument = this.synchronizedDocuments.get(document.sourceUri);
    this.synchronizedDocuments.set(document.sourceUri, nextDocument);

    if (!this.isTransportReady()) {
      return;
    }

    if (!previousDocument || previousDocument.transportUri !== nextDocument.transportUri) {
      if (previousDocument) {
        this.notifyDidClose(previousDocument);
      }
      this.notifyDidOpen(nextDocument);
      return;
    }

    if (
      previousDocument.version === nextDocument.version &&
      previousDocument.text === nextDocument.text &&
      previousDocument.languageId === nextDocument.languageId
    ) {
      return;
    }

    this.notifyDidChange(nextDocument);
  }

  /**
   * closeDocument 함수.
   * LuaLS session mirror에서 문서를 제거하고 transport가 준비됐으면 didClose를 보냄.
   *
   * @param sourceUri - 닫을 원본 문서 URI
   */
  closeDocument(sourceUri: string): void {
    const previousDocument = this.synchronizedDocuments.get(sourceUri);
    if (!previousDocument) {
      return;
    }

    this.synchronizedDocuments.delete(sourceUri);
    this.shadowWorkspace.closeDocument(previousDocument.sourceFilePath);

    if (!this.isTransportReady()) {
      this.emitPublishDiagnostics({
        diagnostics: [],
        sourceUri: previousDocument.sourceUri,
        transportUri: previousDocument.transportUri,
        version: typeof previousDocument.version === 'number' ? previousDocument.version : undefined,
      });
      return;
    }

    this.notifyDidClose(previousDocument);
    this.emitPublishDiagnostics({
      diagnostics: [],
      sourceUri: previousDocument.sourceUri,
      transportUri: previousDocument.transportUri,
      version: typeof previousDocument.version === 'number' ? previousDocument.version : undefined,
    });
  }

  /**
   * prepareForInitialize 함수.
   * initialize 응답 전에 executable 탐색 결과를 고정해 availability payload에 반영함.
   *
   * @param options - root/executable override 정보
   * @returns initialize 시점 availability에 넣을 runtime 상태
   */
  prepareForInitialize(options: LuaLsProcessPrepareOptions = {}): LuaLsCompanionRuntime {
    this.cancelScheduledRestart();
    this.restartAttemptIndex = 0;
    this.lastStartOptions = { rootPath: options.rootPath ?? null };
    const nextExecutablePath = this.resolveExecutablePath({
      cwd: this.options.cwd,
      env: this.options.env,
      overrideExecutablePath: options.overrideExecutablePath,
    });
    this.executablePath = nextExecutablePath;

    if (!nextExecutablePath) {
      this.clearAllPublishedDiagnostics();
      this.runtime = createLuaLsCompanionRuntime({
        detail:
          'LuaLS executable was not found from `--luals-path` override or PATH candidates (`lua-language-server`, `lua-language-server.exe`), so the sidecar stays unavailable while CBS features continue normally.',
        executablePath: null,
        health: 'unavailable',
        status: 'unavailable',
      });
      this.emit('unavailable');
      return this.runtime;
    }

    this.runtime = createLuaLsCompanionRuntime({
      detail:
        'LuaLS executable was resolved and the sidecar is ready to start after the main LSP server finishes initialization.',
      executablePath: nextExecutablePath,
      health: 'idle',
      status: 'stopped',
    });
    this.emit('prepared');
    return this.runtime;
  }

  /**
   * start 함수.
   * LuaLS sidecar를 spawn하고 initialize/initialized handshake까지 완료함.
   *
   * @param options - root path 등 initialize 파라미터 재료
   * @returns 시작 이후의 runtime 상태
   */
  async start(options: LuaLsProcessStartOptions = {}): Promise<LuaLsCompanionRuntime> {
    this.lastStartOptions = { rootPath: options.rootPath ?? null };
    this.cancelScheduledRestart();

    if (!this.executablePath) {
      return this.prepareForInitialize({ rootPath: options.rootPath ?? null });
    }

    if (this.runtime.status === 'ready') {
      return this.checkHealth();
    }

    this.shutdownRequested = false;
    this.runtime = createLuaLsCompanionRuntime({
      detail: 'Spawning LuaLS sidecar over stdio and waiting for the initialize handshake to complete.',
      executablePath: this.executablePath,
      health: 'idle',
      status: 'starting',
    });
    this.emit('spawn-start');

    try {
      const childProcess = this.spawnProcess(this.executablePath, [], {
        cwd: this.options.cwd ?? path.dirname(this.executablePath),
        env: this.options.env ?? process.env,
        stdio: 'pipe',
      });

      this.childProcess = childProcess;
      this.transport = this.transportFactory.create(childProcess);
      this.transport.onNotification(this.handleTransportNotification);
      this.attachProcessObservers(childProcess);

      this.runtime = createLuaLsCompanionRuntime({
        detail: 'LuaLS sidecar process spawned successfully and is waiting for the initialize request.',
        executablePath: this.executablePath,
        health: 'idle',
        pid: childProcess.pid ?? null,
        status: 'starting',
      });
      this.emit('spawned');

      this.emit('initialize-start');
      await this.transport.request('initialize', this.createInitializeParams(options.rootPath ?? null), this.initializeTimeoutMs);
      this.transport.notify('initialized', {});
      this.transport.notify('workspace/didChangeConfiguration', {
        settings: {
          Lua: {
            diagnostics: {
              enableScheme: [...LUALS_VALID_SCHEMES],
            },
          },
        },
      });
      this.initialized = true;
      this.flushSynchronizedDocuments();
      this.runtime = createLuaLsCompanionRuntime({
        detail:
          this.restartAttemptIndex > 0
            ? 'LuaLS sidecar recovered after an automatic restart attempt and is healthy again.'
            : 'LuaLS sidecar finished initialize/initialized handshake and is healthy.',
        executablePath: this.executablePath,
        health: 'healthy',
        pid: childProcess.pid ?? null,
        status: 'ready',
      });
      this.restartAttemptIndex = 0;
      this.startHealthChecks();
      this.emit('initialized');
      return this.runtime;
    } catch (error) {
      return this.handleStartFailure(error);
    }
  }

  /**
   * checkHealth 함수.
   * 현재 sidecar가 살아 있는지 lightweight 상태 점검을 수행함.
   *
   * @returns 갱신된 runtime 상태
   */
  checkHealth(): LuaLsCompanionRuntime {
    const healthy =
      Boolean(this.childProcess) &&
      this.childProcess?.exitCode === null &&
      this.runtime.status === 'ready' &&
      !this.childProcess.killed;

    this.runtime = createLuaLsCompanionRuntime({
      detail: healthy
        ? 'LuaLS sidecar process is alive and ready to serve future Lua document routing/proxy work.'
        : this.runtime.detail,
      executablePath: this.executablePath,
      health: healthy ? 'healthy' : this.runtime.health,
      pid: this.childProcess?.pid ?? null,
      status: healthy ? 'ready' : this.runtime.status,
    });
    this.emit('health-check');
    return this.runtime;
  }

  /**
   * shutdown 함수.
   * shutdown/exit handshake를 보내고 필요하면 프로세스를 강제로 종료함.
   *
   * @returns 종료 이후의 runtime 상태
   */
  async shutdown(): Promise<LuaLsCompanionRuntime> {
    this.shutdownRequested = true;
    this.cancelScheduledRestart();
    this.restartAttemptIndex = 0;
    this.stopHealthChecks();
    this.emit('shutdown-start');

    const childProcess = this.childProcess;
    const transport = this.transport;
    this.transport = null;
    this.childProcess = null;
    this.clearAllPublishedDiagnostics();

    if (transport && childProcess) {
      try {
        if (this.initialized) {
          await transport.request('shutdown', null, this.shutdownTimeoutMs);
          transport.notify('exit', null);
        }
      } catch {
        childProcess.kill('SIGTERM');
      }

      await waitForProcessExit(childProcess, this.shutdownTimeoutMs).catch(() => {
        childProcess.kill('SIGKILL');
      });
      transport.dispose();
    }

    this.initialized = false;
    this.runtime = createLuaLsCompanionRuntime({
      detail: this.executablePath
        ? 'LuaLS sidecar lifecycle was shut down cleanly with the server.'
        : 'LuaLS sidecar remained unavailable and had nothing to shut down.',
      executablePath: this.executablePath,
      health: this.executablePath ? 'idle' : 'unavailable',
      status: this.executablePath ? 'stopped' : 'unavailable',
    });
    this.emit('shutdown-end');
    return this.runtime;
  }

  private attachProcessObservers(childProcess: LuaLsSpawnedProcess): void {
    childProcess.stderr.on('data', this.handleStderrChunk);
    childProcess.once('error', (error) => {
      if (this.shutdownRequested) {
        return;
      }

      this.handleStartFailure(error);
    });
    childProcess.once('exit', (code, signal) => {
      childProcess.stderr.off('data', this.handleStderrChunk);
      this.stopHealthChecks();

      if (this.shutdownRequested) {
        return;
      }

      this.initialized = false;
      this.transport?.dispose();
      this.transport = null;
      this.childProcess = null;
      this.markCrashed(
        `LuaLS sidecar exited unexpectedly before routing/proxy features could use it (code=${String(code)}, signal=${String(signal)}).`,
      );
    });
  }

  private createInitializeParams(rootPath: string | null): InitializeParams {
    const shadowRootUri = pathToFileURL(this.shadowWorkspace.rootPath).href;
    return {
      capabilities: {},
      clientInfo: {
        name: 'cbs-language-server',
        version: '0.1.0',
      },
      processId: this.processId,
      rootUri: shadowRootUri,
      workspaceFolders: rootPath
        ? [
            {
              name: `${path.basename(rootPath)}-luals-shadow`,
              uri: shadowRootUri,
            },
          ]
        : null,
    } satisfies InitializeParams;
  }

  private emit(type: LuaLsProcessEvent['type'], stderrLine?: string): void {
    this.onEvent({
      runtime: this.runtime,
      stderrLine,
      type,
    });
  }

  private handleStartFailure(error: unknown): LuaLsCompanionRuntime {
    this.transport?.dispose();
    this.transport = null;
    this.childProcess = null;
    this.initialized = false;
    const detail = error instanceof Error ? error.message : 'Unknown LuaLS start failure.';
    this.markCrashed(`LuaLS sidecar could not finish startup: ${detail}`);
    return this.runtime;
  }

  /**
   * restart 함수.
   * 현재 lifecycle을 정리한 뒤 동일한 rootPath로 LuaLS sidecar를 다시 시작함.
   *
   * @param options - 재기동에 사용할 root path override
   * @returns restart 이후 runtime 상태
   */
  async restart(options: LuaLsProcessStartOptions = {}): Promise<LuaLsCompanionRuntime> {
    await this.shutdown();
    this.shutdownRequested = false;
    this.restartAttemptIndex = 0;
    return this.start({ rootPath: options.rootPath ?? this.lastStartOptions.rootPath ?? null });
  }

  private readonly handleStderrChunk = (chunk: Buffer | string): void => {
    const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk;
    for (const line of text
      .split(/\r?\n/u)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)) {
      this.stderrLines.push(line);
      if (this.stderrLines.length > this.stderrRingBufferLimit) {
        this.stderrLines = this.stderrLines.slice(-this.stderrRingBufferLimit);
      }
      this.emit('stderr', line);
    }
  };

  private startHealthChecks(): void {
    this.stopHealthChecks();
    this.healthCheckTimer = setInterval(() => {
      this.checkHealth();
    }, this.options.healthCheckIntervalMs ?? DEFAULT_HEALTH_CHECK_INTERVAL_MS);
  }

  private stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * isTransportReady 함수.
   * didOpen/didChange/didClose를 안전하게 보낼 수 있는 상태인지 확인함.
   *
   * @returns initialized transport 사용 가능 여부
   */
  private isTransportReady(): boolean {
    return Boolean(this.transport) && this.initialized;
  }

  /**
   * markCrashed 함수.
   * crash detail을 runtime에 반영하고 자동 재기동 정책을 이어 붙임.
   *
   * @param detail - 현재 crash/failure를 설명할 detail 문구
   */
  private markCrashed(detail: string): void {
    this.clearAllPublishedDiagnostics();
    this.runtime = createLuaLsCompanionRuntime({
      detail,
      executablePath: this.executablePath,
      health: 'degraded',
      status: 'crashed',
    });
    this.emit('crashed');
    this.scheduleRestart();
  }

  /**
   * cancelScheduledRestart 함수.
   * 예약된 자동 재기동 타이머를 정리함.
   */
  private cancelScheduledRestart(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    this.restartTimerDelayMs = null;
  }

  /**
   * scheduleRestart 함수.
   * crash 뒤 자동 재기동 정책이 남아 있으면 다음 시도를 예약함.
   */
  private scheduleRestart(): void {
    if (this.shutdownRequested || !this.executablePath) {
      this.cancelScheduledRestart();
      return;
    }

    const nextDelayMs = this.restartBackoffMs[this.restartAttemptIndex] ?? null;
    if (nextDelayMs === null) {
      this.cancelScheduledRestart();
      this.runtime = createLuaLsCompanionRuntime({
        detail:
          `${this.runtime.detail} Automatic restart attempts are exhausted, so restart or reinitialize the server after fixing LuaLS.`,
        executablePath: this.executablePath,
        health: 'degraded',
        status: 'crashed',
      });
      this.emit('restart-gave-up');
      return;
    }

    const attemptNumber = this.restartAttemptIndex + 1;
    const maxAttempts = this.restartBackoffMs.length;
    this.restartAttemptIndex += 1;
    this.restartTimerDelayMs = nextDelayMs;
    this.runtime = createLuaLsCompanionRuntime({
      detail:
        `${this.runtime.detail} Scheduling automatic restart attempt ${attemptNumber}/${maxAttempts} in ${nextDelayMs}ms.`,
      executablePath: this.executablePath,
      health: 'degraded',
      status: 'crashed',
    });
    this.emit('restart-scheduled');
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.restartTimerDelayMs = null;
      if (this.shutdownRequested) {
        return;
      }

      this.emit('restart-attempt');
      void this.start({ rootPath: this.lastStartOptions.rootPath ?? null }).catch(() => undefined);
    }, nextDelayMs);
  }

  /**
   * flushSynchronizedDocuments 함수.
   * startup 이전에 쌓인 document mirror 상태를 새 LuaLS session으로 다시 엶.
   */
  private flushSynchronizedDocuments(): void {
    if (!this.isTransportReady()) {
      return;
    }

    for (const document of [...this.synchronizedDocuments.values()].sort((left, right) =>
      left.sourceUri.localeCompare(right.sourceUri),
    )) {
      this.notifyDidOpen(document);
    }
  }

  /**
   * notifyDidOpen 함수.
   * LuaLS session에 full-text didOpen notification을 보냄.
   *
   * @param document - 새로 열릴 mirrored Lua document
   */
  private notifyDidOpen(document: ManagedLuaLsDocument): void {
    this.transport?.notify('textDocument/didOpen', {
      textDocument: {
        uri: document.transportUri,
        languageId: document.languageId,
        version: document.version,
        text: document.text,
      },
    });
  }

  /**
   * notifyDidChange 함수.
   * LuaLS session에 full-text didChange notification을 보냄.
   *
   * @param document - 변경된 mirrored Lua document
   */
  private notifyDidChange(document: ManagedLuaLsDocument): void {
    this.transport?.notify('textDocument/didChange', {
      textDocument: {
        uri: document.transportUri,
        version: document.version,
      },
      contentChanges: [
        {
          text: document.text,
        },
      ],
    });
  }

  /**
   * notifyDidClose 함수.
   * LuaLS session에 mirrored document close notification을 보냄.
   *
   * @param document - 닫을 mirrored Lua document
   */
  private notifyDidClose(document: ManagedLuaLsDocument): void {
    this.transport?.notify('textDocument/didClose', {
      textDocument: {
        uri: document.transportUri,
      },
    });
  }

  /**
   * handleTransportNotification 함수.
   * LuaLS가 보내는 notification 중 host diagnostics publish에 필요한 payload만 가로챔.
   *
   * @param notification - LuaLS transport에서 수신한 notification
   */
  private readonly handleTransportNotification = (notification: LuaLsTransportNotification): void => {
    if (notification.method !== 'textDocument/publishDiagnostics') {
      return;
    }

    const payload = this.parsePublishDiagnostics(notification.params);
    if (!payload) {
      return;
    }

    const document = this.findSynchronizedDocumentByTransportUri(payload.uri);
    if (!document) {
      return;
    }

    this.emitPublishDiagnostics({
      diagnostics: payload.diagnostics,
      sourceUri: document.sourceUri,
      transportUri: payload.uri,
      version: payload.version,
    });
  };

  /**
   * emitPublishDiagnostics 함수.
   * source URI 기준 Lua diagnostics payload를 현재 구독자들에게 브로드캐스트함.
   *
   * @param event - host publishDiagnostics로 승격할 Lua diagnostics payload
   */
  private emitPublishDiagnostics(event: LuaLsPublishDiagnosticsEvent): void {
    for (const listener of this.publishDiagnosticsListeners) {
      listener(event);
    }
  }

  /**
   * clearAllPublishedDiagnostics 함수.
   * sidecar가 unavailable/crashed/shutdown 상태로 내려갈 때 남아 있는 Lua diagnostics를 비움.
   */
  private clearAllPublishedDiagnostics(): void {
    for (const document of this.synchronizedDocuments.values()) {
      this.emitPublishDiagnostics({
        diagnostics: [],
        sourceUri: document.sourceUri,
        transportUri: document.transportUri,
        version: typeof document.version === 'number' ? document.version : undefined,
      });
    }
  }

  /**
   * findSynchronizedDocumentByTransportUri 함수.
    * LuaLS shadow file:// URI를 현재 source `.risulua` 문서로 역매핑함.
   *
   * @param transportUri - LuaLS가 보낸 mirrored Lua document URI
   * @returns source URI를 찾았으면 synced document, 없으면 null
   */
  private findSynchronizedDocumentByTransportUri(transportUri: string): ManagedLuaLsDocument | null {
    for (const document of this.synchronizedDocuments.values()) {
      if (document.transportUri === transportUri) {
        return document;
      }
    }

    return null;
  }

  /**
   * parsePublishDiagnostics 함수.
   * LuaLS diagnostics notification payload를 최소한의 shape 검증과 함께 정규화함.
   *
   * @param params - transport notification params
   * @returns host publish로 승격 가능한 diagnostics payload, 아니면 null
   */
  private parsePublishDiagnostics(params: unknown): LuaLsPublishDiagnosticsParams | null {
    if (!params || typeof params !== 'object') {
      return null;
    }

    const payload = params as {
      diagnostics?: unknown;
      uri?: unknown;
      version?: unknown;
    };
    if (typeof payload.uri !== 'string' || !Array.isArray(payload.diagnostics)) {
      return null;
    }

    return {
      diagnostics: payload.diagnostics as Diagnostic[],
      uri: payload.uri,
      version: typeof payload.version === 'number' ? payload.version : undefined,
    };
  }
}

/**
 * createLuaLsProcessManager 함수.
 * 서버에서 기본 LuaLS sidecar manager를 생성함.
 *
 * @param options - 테스트/환경 주입 옵션
 * @returns LuaLS sidecar lifecycle manager
 */
export function createLuaLsProcessManager(
  options: LuaLsProcessManagerOptions = {},
): LuaLsProcessManager {
  return new LuaLsProcessManager(options);
}

/**
 * waitForProcessExit 함수.
 * child process 종료를 timeout과 함께 기다림.
 *
 * @param childProcess - 종료를 기다릴 child process
 * @param timeoutMs - 최대 대기 시간
 * @returns 프로세스가 종료되면 resolve, timeout이면 reject
 */
export function waitForProcessExit(
  childProcess: LuaLsSpawnedProcess,
  timeoutMs: number,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (childProcess.exitCode !== null) {
      resolve();
      return;
    }

    const timeoutHandle = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out while waiting for LuaLS process exit.'));
    }, timeoutMs);

    const handleExit = () => {
      cleanup();
      resolve();
    };

    const cleanup = () => {
      clearTimeout(timeoutHandle);
      childProcess.off('exit', handleExit);
    };

    childProcess.on('exit', handleExit);
  });
}
