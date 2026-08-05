import { randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { HMR_CHAT_DEBUG_MAX_RESULT_BYTES, HMR_PORT_RANGE, HMR_PROTOCOL_VERSION, buildHmrConnectionString, type HmrChatDebugSnapshot, type HmrHealthResponse, type HmrPayloadResponse, type HmrWatchResponse } from '@risuai-workbench/core';
import { AssetHashCache, buildHmrCharacterPayload, buildHmrModulePayload, type HmrBuildResult } from '@risuai-workbench/core/node';
import { isHmrChatDebugResult, readBoundedJsonBody, type BoundedJsonBody } from './hmrChatDebugResult';

export interface HmrBroadcastTarget { readonly stableId: string; readonly name: string; readonly kind: 'character' | 'module'; readonly rootFsPath: string }

export interface HmrServerStatus {
  readonly running: boolean; readonly stableId?: string; readonly artifactName?: string; readonly artifactKind?: 'character' | 'module';
  readonly connectionString?: string; readonly version?: number; readonly updateCount: number; readonly lastPollAtMs?: number; readonly lastError?: string;
}

interface HmrServerOptions {
  readonly build?: (kind: HmrBroadcastTarget['kind'], rootFsPath: string, cache: AssetHashCache) => HmrBuildResult;
  readonly longPollTimeoutMs?: number;
}

interface WatchWaiter { readonly response: ServerResponse; readonly timer: NodeJS.Timeout; readonly since: number }

interface PendingChatDebugRequest {
  readonly requestId: string;
  readonly stableId: string;
  state: 'queued' | 'delivered';
  readonly resolve: (snapshot: HmrChatDebugSnapshot) => void;
  readonly reject: (error: Error) => void;
  readonly timer: NodeJS.Timeout;
}

const DEFAULT_LONG_POLL_TIMEOUT_MS = 25_000;
const CHAT_DEBUG_TIMEOUT_MS = 30_000;
const CHAT_DEBUG_BODY_READ_TIMEOUT_MS = 5_000;
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  // Chrome Private Network Access: HTTPS 페이지 → 127.0.0.1 요청의 preflight 승인용.
  'Access-Control-Allow-Private-Network': 'true',
  Connection: 'close',
} as const;
const HMR_AUTH_TOKEN_PATTERN = /^[0-9a-f]{32}$/;

function defaultBuild(
  kind: HmrBroadcastTarget['kind'],
  rootFsPath: string,
  cache: AssetHashCache,
): HmrBuildResult {
  return kind === 'character'
    ? buildHmrCharacterPayload(rootFsPath, cache)
    : buildHmrModulePayload(rootFsPath);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class HmrServerService {
  private server: Server | undefined; private target: HmrBroadcastTarget | undefined; private current: HmrBuildResult | undefined;
  private cache = new AssetHashCache(); private readonly waiters: WatchWaiter[] = []; private readonly listeners = new Set<(status: HmrServerStatus) => void>();
  private port = 0; private token = ''; private version = 0; private updateCount = 0;
  private lastChangedAssets: readonly string[] = []; private lastPollAtMs: number | undefined; private lastError: string | undefined;
  private pendingChatDebugRequest: PendingChatDebugRequest | undefined;
  private readonly activeChatDebugRequests = new Set<IncomingMessage>();

  constructor(private readonly options: HmrServerOptions = {}) {}

  onStatus(listener: (status: HmrServerStatus) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  getStatus(): HmrServerStatus {
    if (!this.server || !this.target) return { running: false, updateCount: 0 };
    return {
      running: true,
      stableId: this.target.stableId,
      artifactName: this.target.name,
      artifactKind: this.target.kind,
      connectionString: buildHmrConnectionString(this.port, this.token),
      version: this.version,
      updateCount: this.updateCount,
      lastPollAtMs: this.lastPollAtMs,
      lastError: this.lastError,
    };
  }

  async startBroadcast(target: HmrBroadcastTarget): Promise<void> {
    await this.ensureServer();
    this.rejectPendingChatDebugRequest('Chat debug request cancelled because the broadcast target changed.');
    this.target = target;
    this.current = undefined; this.cache = new AssetHashCache(); this.version = 0; this.updateCount = 0;
    this.lastChangedAssets = []; this.lastPollAtMs = undefined; this.lastError = undefined;
    this.rebuild();
  }

  rebuild(): void {
    if (!this.target) return;
    try {
      const previous = this.current;
      const next = (this.options.build ?? defaultBuild)(this.target.kind, this.target.rootFsPath, this.cache);
      this.lastChangedAssets = changedAssetHashes(previous, next);
      this.current = next;
      this.version += 1;
      if (this.version > 1) this.updateCount += 1;
      this.lastError = undefined;
      this.flushWaiters();
    } catch (error) {
      this.lastError = errorMessage(error);
    }
    this.emit();
  }

  requestChatDebugSnapshot(requestId: string, stableId: string): Promise<HmrChatDebugSnapshot> {
    if (!this.target || !this.current || this.target.stableId !== stableId) {
      return Promise.reject(new Error('Chat debug request target is not active.'));
    }
    if (this.pendingChatDebugRequest) {
      return Promise.reject(new Error('A chat debug request is already pending.'));
    }

    return new Promise<HmrChatDebugSnapshot>((resolve, reject) => {
      const pendingRequest: PendingChatDebugRequest = {
        requestId,
        stableId,
        state: 'queued',
        resolve,
        reject,
        timer: setTimeout(() => {
          this.rejectPendingChatDebugRequest('Chat debug request timed out.');
        }, CHAT_DEBUG_TIMEOUT_MS),
      };
      this.pendingChatDebugRequest = pendingRequest;
      this.deliverPendingChatDebugRequest();
    });
  }

  async stop(): Promise<void> {
    this.rejectPendingChatDebugRequest('Chat debug request cancelled because the HMR server stopped.');
    for (const request of this.activeChatDebugRequests) request.destroy();
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      this.respondJson(waiter.response, 200, this.noChangeResponse());
    }
    const server = this.server;
    this.server = undefined;
    this.target = undefined;
    this.current = undefined;
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    this.emit();
  }

  private emit(): void {
    const status = this.getStatus();
    for (const listener of this.listeners) listener(status);
  }

  private async ensureServer(): Promise<void> {
    if (this.server) return;
    this.token = randomBytes(16).toString('hex');
    for (const port of portCandidates()) {
      try {
        this.port = await this.listen(port);
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'EADDRINUSE' && code !== 'EACCES') throw error;
      }
    }
    throw new Error('HMR server could not bind to an available port.');
  }

  private listen(port: number): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const server = createServer((request, response) => this.handleRequest(request, response));
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        server.removeListener('error', reject);
        this.server = server;
        resolve((server.address() as AddressInfo).port);
      });
    });
  }

  private handleRequest(request: IncomingMessage, response: ServerResponse): void {
    if (request.method === 'OPTIONS') {
      response.writeHead(204, CORS_HEADERS).end();
      return;
    }

    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (!this.isAuthorized(url.searchParams.get('k'))) {
      this.respondJson(response, 401, { error: 'unauthorized' });
      return;
    }
    if (url.pathname === '/debug/chat-snapshot') {
      void this.respondChatDebugResult(request, response);
      return;
    }

    const target = this.target;
    const current = this.current;
    if (!target || !current) {
      this.respondJson(response, 503, { error: 'no-broadcast' });
      return;
    }

    if (url.pathname === '/health') {
      this.respondHealth(target, response);
      return;
    }
    if (url.pathname === '/watch') {
      this.respondWatch(url, response);
      return;
    }
    if (url.pathname === '/payload') {
      this.respondPayload(current, response);
      return;
    }
    if (url.pathname.startsWith('/asset/')) {
      void this.respondAsset(current, url.pathname, response);
      return;
    }
    this.respondJson(response, 404, { error: 'not-found' });
  }

  private respondHealth(target: HmrBroadcastTarget, response: ServerResponse): void {
    const body: HmrHealthResponse = {
      app: 'risu-workbench-hmr',
      protocolVersion: HMR_PROTOCOL_VERSION,
      project: { name: target.name, kind: target.kind, stableId: target.stableId },
      version: this.version,
    };
    this.respondJson(response, 200, body);
  }

  private respondWatch(url: URL, response: ServerResponse): void {
    this.lastPollAtMs = Date.now();
    this.emit();
    if (this.pendingChatDebugRequest?.state === 'queued') {
      this.respondJson(response, 200, this.debugResponse(this.pendingChatDebugRequest));
      this.pendingChatDebugRequest.state = 'delivered';
      return;
    }
    const since = Number(url.searchParams.get('since')) || 0;
    if (since < this.version) {
      this.respondJson(response, 200, this.changedResponse(since));
      return;
    }
    const timer = setTimeout(() => {
      this.removeWaiter(response);
      this.respondJson(response, 200, this.noChangeResponse());
    }, this.options.longPollTimeoutMs ?? DEFAULT_LONG_POLL_TIMEOUT_MS);
    this.waiters.push({ response, timer, since });
  }

  private respondPayload(current: HmrBuildResult, response: ServerResponse): void {
    const body: HmrPayloadResponse = {
      kind: current.kind,
      data: current.data,
      assets: current.assets,
    };
    this.respondJson(response, 200, body);
  }

  private async respondAsset(current: HmrBuildResult, pathname: string, response: ServerResponse): Promise<void> {
    const hash = pathname.slice('/asset/'.length);
    const source = current.assetSources.get(hash);
    if (!source) return this.respondJson(response, 404, { error: 'asset-not-found' });
    try {
      const bytes = source.kind === 'buffer' ? source.buffer : await fs.promises.readFile(source.path);
      response.writeHead(200, { ...CORS_HEADERS, 'content-type': 'application/octet-stream' }).end(bytes);
    } catch {
      this.respondJson(response, 404, { error: 'asset-read-failed' });
    }
  }

  private flushWaiters(): void {
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      this.respondJson(waiter.response, 200, this.changedResponse(waiter.since));
    }
  }

  private deliverPendingChatDebugRequest(): void {
    const pendingRequest = this.pendingChatDebugRequest;
    const waiter = this.waiters.shift();
    if (!pendingRequest || pendingRequest.state !== 'queued' || !waiter) return;
    clearTimeout(waiter.timer);
    this.respondJson(waiter.response, 200, this.debugResponse(pendingRequest));
    pendingRequest.state = 'delivered';
  }

  private async respondChatDebugResult(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method !== 'POST') {
      this.respondJson(response, 405, { error: 'method-not-allowed' });
      return;
    }
    if (request.headers['content-type'] !== 'application/json') {
      this.respondJson(response, 415, { error: 'unsupported-media-type' });
      return;
    }

    this.activeChatDebugRequests.add(request);
    let body: BoundedJsonBody;
    try {
      body = await readBoundedJsonBody(
        request,
        HMR_CHAT_DEBUG_MAX_RESULT_BYTES,
        CHAT_DEBUG_BODY_READ_TIMEOUT_MS,
      );
    } finally {
      this.activeChatDebugRequests.delete(request);
    }
    if (body.kind === 'oversize') {
      this.respondJson(response, 413, { error: 'payload-too-large' });
      return;
    }
    if (body.kind === 'invalid' || !isHmrChatDebugResult(body.value)) {
      this.respondJson(response, 400, { error: 'invalid-chat-debug-result' });
      return;
    }

    const pendingRequest = this.pendingChatDebugRequest;
    if (!pendingRequest || pendingRequest.state !== 'delivered') {
      this.respondJson(response, 409, { error: 'no-pending-chat-debug-request' });
      return;
    }
    if (body.value.requestId !== pendingRequest.requestId || body.value.stableId !== pendingRequest.stableId) {
      this.respondJson(response, 409, { error: 'chat-debug-result-mismatch' });
      return;
    }

    this.pendingChatDebugRequest = undefined;
    clearTimeout(pendingRequest.timer);
    if (body.value.ok) {
      pendingRequest.resolve(body.value.snapshot);
    } else {
      pendingRequest.reject(new Error(chatDebugErrorMessage(body.value.error.code)));
    }
    this.respondNoContent(response);
  }

  private removeWaiter(response: ServerResponse): void {
    const index = this.waiters.findIndex((waiter) => waiter.response === response);
    if (index >= 0) this.waiters.splice(index, 1);
  }

  private changedResponse(since: number): HmrWatchResponse {
    const changedAssets = since === this.version - 1
      ? this.lastChangedAssets
      : (this.current?.assets ?? []).map((asset) => asset.hash);
    return { version: this.version, definitionChanged: true, changedAssets, stableId: this.target?.stableId ?? '' };
  }

  private noChangeResponse(): HmrWatchResponse {
    return { version: this.version, definitionChanged: false, changedAssets: [], stableId: this.target?.stableId ?? '' };
  }

  private debugResponse(pendingRequest: PendingChatDebugRequest): HmrWatchResponse {
    return {
      version: this.version,
      definitionChanged: false,
      changedAssets: [],
      debugCommand: { requestId: pendingRequest.requestId, kind: 'currentChatSnapshot' },
      stableId: this.target?.stableId ?? '',
    };
  }

  private rejectPendingChatDebugRequest(message: string): void {
    const pendingRequest = this.pendingChatDebugRequest;
    if (!pendingRequest) return;
    this.pendingChatDebugRequest = undefined;
    clearTimeout(pendingRequest.timer);
    pendingRequest.reject(new Error(message));
  }

  private isAuthorized(candidate: string | null): boolean {
    if (candidate === null || !HMR_AUTH_TOKEN_PATTERN.test(candidate)) return false;
    const candidateBytes = Buffer.from(candidate, 'utf8');
    const tokenBytes = Buffer.from(this.token, 'utf8');
    if (candidateBytes.byteLength !== tokenBytes.byteLength) return false;
    return timingSafeEqual(candidateBytes, tokenBytes);
  }

  private respondJson(response: ServerResponse, statusCode: number, body: unknown): void {
    if (response.writableEnded) return;
    response.writeHead(statusCode, { ...CORS_HEADERS, 'content-type': 'application/json' }).end(JSON.stringify(body));
  }

  private respondNoContent(response: ServerResponse): void {
    if (response.writableEnded) return;
    response.writeHead(204, CORS_HEADERS).end();
  }
}

function portCandidates(): readonly number[] {
  const ports: number[] = [];
  for (let port = HMR_PORT_RANGE.start; port <= HMR_PORT_RANGE.end; port += 1) ports.push(port);
  ports.push(0);
  return ports;
}

function changedAssetHashes(previous: HmrBuildResult | undefined, next: HmrBuildResult): readonly string[] {
  const previousHashes = new Set((previous?.assets ?? []).map((asset) => asset.hash));
  return next.assets.map((asset) => asset.hash).filter((hash) => !previousHashes.has(hash));
}

function chatDebugErrorMessage(code: 'CHAT_UNAVAILABLE' | 'CHAT_SHAPE_INVALID' | 'SNAPSHOT_TOO_LARGE' | 'CAPTURE_FAILED'): string {
  switch (code) {
    case 'CHAT_UNAVAILABLE': return 'The current chat is unavailable.';
    case 'CHAT_SHAPE_INVALID': return 'The current chat has an unsupported shape.';
    case 'SNAPSHOT_TOO_LARGE': return 'The chat snapshot exceeds the size limit.';
    case 'CAPTURE_FAILED': return 'The chat snapshot could not be captured.';
  }
}

let hmrServerService: HmrServerService | undefined;

export function getHmrServerService(): HmrServerService {
  hmrServerService ??= new HmrServerService();
  return hmrServerService;
}

export async function disposeHmrServer(): Promise<void> {
  if (!hmrServerService) return;
  await hmrServerService.stop();
  hmrServerService = undefined;
}
