// allow: SIZE_OK - Task 6 requires a single exported controller state machine file.
import { ensureAssets, type EnsureAssetsProgress } from './assets';
import { nextBackoffDelayMs } from './backoff';
import { buildDefinitionDiff, type ConfirmDiff } from './diff';
import { captureCurrentChatSnapshot, ChatSnapshotCaptureError } from '../helpers/risu-api';
import {
  HMR_CHAT_DEBUG_MAX_RESULT_BYTES,
  HMR_PROTOCOL_VERSION,
  buildRequestUrl,
  parseConnectionString,
  type HmrChatDebugCommand,
  type HmrChatDebugResult,
  type HmrConnection,
  type HmrHealthResponse,
  type HmrPayloadResponse,
  type HmrWatchResponse,
} from './protocol';
import {
  applyAssetPlaceholders,
  findCharacterIndexByChaId,
  mergeCharacterDefinition,
  replaceModuleById,
} from './merge';
import type { HmrMapping, MappingStore } from './storage';

export type HmrPhase =
  | 'idle'
  | 'connecting'
  | 'selecting'
  | 'confirming'
  | 'initialSync'
  | 'active'
  | 'paused'
  | 'reconnecting'
  | 'stoppedError';

export interface HmrPublicState {
  readonly phase: HmrPhase;
  readonly project?: HmrHealthResponse['project'] | undefined;
  readonly targetLabel?: string | undefined;
  readonly appliedVersion: number;
  readonly updateCount: number;
  readonly badgeEnabled: boolean;
  readonly lastError?: string | undefined;
  readonly syncProgress?: EnsureAssetsProgress | undefined;
}

/**
 * onState가 "지금 사실이 무엇인가"라면, onEvent는 "무슨 일이 일어났는가"다.
 * applied는 fromVersion을 스스로 나른다 — digest의 v13 → v18 범위를 만들려면
 * 최초 병합 시점의 이전 버전이 필요한데, 그 값을 아는 것은 컨트롤러뿐이다.
 */
export type HmrEvent =
  | { readonly kind: 'initialSynced'; readonly version: number; readonly assetCount: number }
  | {
      readonly kind: 'applied';
      readonly fromVersion: number;
      readonly version: number;
      readonly assetCount: number;
    };

export interface ControllerDeps {
  getPlatform(): Promise<'web' | 'tauri' | 'node'>;
  fetchJson(url: string): Promise<unknown>;
  readonly postJson?: ((url: string, body: string) => Promise<void>) | undefined;
  fetchBinary(url: string): Promise<Uint8Array>;
  getCharacters(): Promise<unknown[]>;
  setCharacterToIndex(index: number, character: unknown): Promise<void>;
  getModules(): Promise<unknown[]>;
  setModulesLite(modules: unknown[]): Promise<void>;
  persistDatabase(): Promise<void>;
  probeImage(fileName: string): Promise<boolean>;
  saveAsset(bytes: Uint8Array): Promise<string>;
  readonly store: MappingStore;
  sleep(ms: number): Promise<void>;
  onState(state: HmrPublicState): void;
  onEvent(event: HmrEvent): void;
  alertError(message: string): Promise<void>;
  readonly idlePersistDelayMs?: number | undefined;
}

interface ConfirmTarget {
  readonly chaId?: string | undefined;
  readonly moduleId?: string | undefined;
  readonly label: string;
  readonly badgeEnabled: boolean;
}

type HealthCheckResult = 'ok' | 'down' | 'stableIdChanged';

export class HmrTargetMissingError extends Error {}

export class HmrController {
  private phase: HmrPhase = 'idle';
  private connection: HmrConnection | undefined;
  private project: HmrHealthResponse['project'] | undefined;
  private mapping: HmrMapping | undefined;
  private appliedVersion = 0;
  private updateCount = 0;
  private connectVersion = 0;
  private lastError: string | undefined;
  private syncProgress: EnsureAssetsProgress | undefined;
  private loopGeneration = 0;
  private idlePersistTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly deps: ControllerDeps) {}

  getState(): HmrPublicState {
    return {
      phase: this.phase,
      project: this.project,
      targetLabel: this.mapping?.targetLabel,
      appliedVersion: this.appliedVersion,
      updateCount: this.updateCount,
      badgeEnabled: this.mapping?.badgeEnabled ?? false,
      lastError: this.lastError,
      syncProgress: this.syncProgress,
    };
  }

  async getSavedTargetLabel(): Promise<string | null> {
    const mapping = await this.deps.store.load();
    return mapping?.targetLabel ?? null;
  }

  async connect(raw: string): Promise<HmrHealthResponse> {
    const connection = parseConnectionString(raw);
    if (connection === null) {
      throw new Error('연결 문자열 형식이 올바르지 않습니다 (risu-hmr://127.0.0.1:PORT#k=TOKEN).');
    }

    this.setPhase('connecting');
    let health: HmrHealthResponse;
    try {
      health = parseHealthResponse(await this.deps.fetchJson(buildRequestUrl(connection, '/health')));
    } catch (error) {
      if ((await this.deps.getPlatform()) === 'web') {
        throw new Error(
          `웹 빌드에서 로컬 HMR 서버 연결에 실패했습니다 (${errorToMessage(error)}). ` +
          'RisuAI 설정 > 고급에서 "Plain Fetch"를 켜야 요청이 프록시 서버를 거치지 않고 127.0.0.1로 직접 전달됩니다. ' +
          '켠 뒤에도 실패하면 브라우저의 로컬 네트워크 접근 권한 프롬프트를 허용했는지 확인하세요.',
        );
      }
      throw error;
    }
    this.connection = connection;
    this.project = health.project;
    this.connectVersion = health.version;
    this.setPhase('selecting');
    return health;
  }

  async listCharacterTargets(): Promise<Array<{ readonly index: number; readonly chaId: string; readonly name: string; readonly image?: string | undefined }>> {
    const characters = await this.deps.getCharacters();
    return characters.flatMap((candidate, index) => {
      if (!isRecord(candidate)) return [];
      if (candidate['type'] === 'group' || typeof candidate['chaId'] !== 'string') return [];
      if (candidate['trashTime'] !== null && candidate['trashTime'] !== undefined) return [];
      return [{
        index,
        chaId: candidate['chaId'],
        name: typeof candidate['name'] === 'string' ? candidate['name'] : '(unnamed)',
        image: typeof candidate['image'] === 'string' ? candidate['image'] : undefined,
      }];
    });
  }

  async listModuleTargets(): Promise<Array<{ readonly id: string; readonly name: string; readonly description?: string | undefined }>> {
    const modules = await this.deps.getModules();
    return modules.flatMap((candidate) => {
      if (!isRecord(candidate) || typeof candidate['id'] !== 'string') return [];
      return [{
        id: candidate['id'],
        name: typeof candidate['name'] === 'string' ? candidate['name'] : '(unnamed)',
        description: typeof candidate['description'] === 'string' ? candidate['description'] : undefined,
      }];
    });
  }

  async buildConfirmDiff(target: { readonly chaId?: string | undefined; readonly moduleId?: string | undefined }): Promise<ConfirmDiff> {
    if (this.connection === undefined || this.project === undefined) {
      throw new Error('connect가 선행되어야 합니다.');
    }
    const payload = parsePayloadResponse(await this.deps.fetchJson(buildRequestUrl(this.connection, '/payload')));

    let existing: Record<string, unknown>;
    if (payload.kind === 'character') {
      if (target.chaId === undefined) throw new Error('character 대상에 chaId가 없습니다.');
      const characters = await this.deps.getCharacters();
      const index = findCharacterIndexByChaId(characters, target.chaId);
      const candidate = index >= 0 ? characters[index] : undefined;
      if (!isRecord(candidate)) {
        throw new HmrTargetMissingError('대상 캐릭터를 찾을 수 없습니다. 뒤로 가서 다시 선택하세요.');
      }
      existing = candidate;
    } else {
      if (target.moduleId === undefined) throw new Error('module 대상에 moduleId가 없습니다.');
      const modules = await this.deps.getModules();
      const candidate = modules.find((module) => isRecord(module) && module['id'] === target.moduleId);
      if (!isRecord(candidate)) {
        throw new HmrTargetMissingError('대상 모듈을 찾을 수 없습니다. 뒤로 가서 다시 선택하세요.');
      }
      existing = candidate;
    }

    return buildDefinitionDiff({ kind: payload.kind, incoming: payload.data, existing, assets: payload.assets });
  }

  async confirmAndStart(target: ConfirmTarget): Promise<void> {
    if (this.connection === undefined || this.project === undefined) {
      throw new Error('connect가 선행되어야 합니다.');
    }

    this.stopLoops();
    this.setPhase('confirming');
    this.mapping = {
      connectionString: this.connection.raw,
      stableId: this.project.stableId,
      kind: this.project.kind,
      targetChaId: target.chaId,
      targetModuleId: target.moduleId,
      targetLabel: target.label,
      appliedVersion: 0,
      badgeEnabled: target.badgeEnabled,
      assetCache: {},
      savedAtMs: Date.now(),
    };
    this.appliedVersion = 0;
    this.updateCount = 0;
    this.lastError = undefined;
    this.setPhase('initialSync');
    const assetCount = await this.applyLatest(this.connectVersion);
    await this.persistMapping();
    this.deps.onEvent({ kind: 'initialSynced', version: this.connectVersion, assetCount });
    this.startLoop();
  }

  async tryAutoReconnect(): Promise<boolean> {
    const mapping = await this.deps.store.load();
    if (mapping === null) return false;

    const connection = parseConnectionString(mapping.connectionString);
    if (connection === null) return false;

    try {
      const health = parseHealthResponse(await this.deps.fetchJson(buildRequestUrl(connection, '/health')));
      if (health.project.stableId !== mapping.stableId) return false;
      this.connection = connection;
      this.project = health.project;
      this.connectVersion = health.version;
      this.mapping = mapping;
      this.appliedVersion = mapping.appliedVersion;
      this.updateCount = 0;
      this.lastError = undefined;
      this.setPhase('active');
      if (health.version > this.appliedVersion) {
        const fromVersion = this.appliedVersion;
        const assetCount = await this.applyLatest(health.version);
        this.deps.onEvent({ kind: 'applied', fromVersion, version: health.version, assetCount });
      }
      this.startLoop();
      return true;
    } catch (error) {
      if (error instanceof Error) return false;
      throw error;
    }
  }

  pause(): void {
    if (this.phase !== 'active' && this.phase !== 'reconnecting') return;
    this.loopGeneration += 1;
    this.setPhase('paused');
  }

  resume(): void {
    if (this.phase !== 'paused') return;
    this.setPhase('active');
    void this.refreshOnce().catch((error: unknown) => {
      this.setPhase('reconnecting', errorToMessage(error));
    });
    this.startLoop();
  }

  stopLoops(): void {
    this.loopGeneration += 1;
    if (this.idlePersistTimer !== undefined) {
      clearTimeout(this.idlePersistTimer);
      this.idlePersistTimer = undefined;
    }
  }

  async disconnect(): Promise<void> {
    this.stopLoops();
    await this.deps.store.clear();
    this.mapping = undefined;
    this.connection = undefined;
    this.project = undefined;
    this.appliedVersion = 0;
    this.updateCount = 0;
    this.lastError = undefined;
    this.syncProgress = undefined;
    this.setPhase('idle');
  }

  private setPhase(phase: HmrPhase, lastError?: string): void {
    this.phase = phase;
    this.lastError = lastError;
    this.deps.onState(this.getState());
  }

  private startLoop(): void {
    this.loopGeneration += 1;
    const generation = this.loopGeneration;
    void this.runLoop(generation);
  }

  private async refreshOnce(): Promise<void> {
    if (this.connection === undefined) return;
    const health = parseHealthResponse(await this.deps.fetchJson(buildRequestUrl(this.connection, '/health')));
    if (health.version > this.appliedVersion) {
      const fromVersion = this.appliedVersion;
      const assetCount = await this.applyLatest(health.version);
      this.deps.onEvent({ kind: 'applied', fromVersion, version: health.version, assetCount });
      this.deps.onState(this.getState());
    }
  }

  private async runLoop(generation: number): Promise<void> {
    let backoffAttempt = 0;
    while (generation === this.loopGeneration && this.connection !== undefined && this.mapping !== undefined) {
      try {
        const watch = parseWatchResponse(await this.deps.fetchJson(
          buildRequestUrl(this.connection, '/watch', { since: String(this.appliedVersion) }),
        ));
        if (generation !== this.loopGeneration) return;
        backoffAttempt = 0;
        // Broadcast 대상 전환 감지: 서버는 살아있는 채로 타겟만 바뀔 수 있으므로 매 응답마다 stableId를 대조한다.
        if (watch.stableId !== this.mapping.stableId) {
          this.loopGeneration += 1;
          this.setPhase('stoppedError', 'Broadcast 대상이 바뀌었습니다. 위저드에서 다시 확인하세요.');
          await this.deps.alertError('Workbench HMR: Broadcast 대상이 바뀌어 수신을 안전 정지했습니다.');
          return;
        }
        if (this.phase === 'reconnecting') this.setPhase('active');
        if (watch.debugCommand !== undefined) {
          await this.handleDebugCommand(watch.debugCommand);
        }
        if (watch.version > this.appliedVersion && watch.definitionChanged) {
          const fromVersion = this.appliedVersion;
          await this.applyLatest(watch.version);
          if (generation !== this.loopGeneration) return;
          this.updateCount += 1;
          this.scheduleIdlePersist();
          this.deps.onState(this.getState());
          this.deps.onEvent({
            kind: 'applied',
            fromVersion,
            version: watch.version,
            assetCount: watch.changedAssets.length,
          });
        }
      } catch (error) {
        if (generation !== this.loopGeneration) return;
        this.setPhase('reconnecting', errorToMessage(error));
        await this.deps.sleep(nextBackoffDelayMs(backoffAttempt));
        backoffAttempt += 1;
        if (generation !== this.loopGeneration) return;
        const recovered = await this.recheckHealth();
        if (recovered === 'stableIdChanged') {
          this.loopGeneration += 1;
          this.setPhase('stoppedError', 'Broadcast 대상이 바뀌었습니다. 위저드에서 다시 확인하세요.');
          await this.deps.alertError('Workbench HMR: Broadcast 대상이 바뀌어 수신을 안전 정지했습니다.');
          return;
        }
      }
    }
  }

  private async recheckHealth(): Promise<HealthCheckResult> {
    if (this.connection === undefined || this.mapping === undefined) return 'down';
    try {
      const health = parseHealthResponse(await this.deps.fetchJson(buildRequestUrl(this.connection, '/health')));
      return health.project.stableId === this.mapping.stableId ? 'ok' : 'stableIdChanged';
    } catch (error) {
      if (error instanceof Error) return 'down';
      throw error;
    }
  }

  private async handleDebugCommand(command: HmrChatDebugCommand): Promise<void> {
    if (this.connection === undefined || this.mapping === undefined) return;
    const connection = this.connection;
    const stableId = this.mapping.stableId;
    if (stableId.length === 0) throw new Error('Chat debug correlation is unavailable.');
    const postJson = this.deps.postJson;
    if (postJson === undefined) throw new Error('Chat debug transport is unavailable.');

    const result = await this.captureChatDebugResult(command, stableId);
    const body = this.serializeChatDebugResult(result);
    await postJson(buildRequestUrl(connection, '/debug/chat-snapshot'), body);
  }

  private async captureChatDebugResult(command: HmrChatDebugCommand, stableId: string): Promise<HmrChatDebugResult> {
    try {
      return {
        requestId: command.requestId,
        stableId,
        ok: true,
        snapshot: await captureCurrentChatSnapshot(),
      };
    } catch (error) {
      const code = error instanceof ChatSnapshotCaptureError
        ? error.code
        : 'CAPTURE_FAILED';
      return createChatDebugErrorResult(command.requestId, stableId, code);
    }
  }

  private serializeChatDebugResult(result: HmrChatDebugResult): string {
    const serialized = JSON.stringify(result);
    if (new TextEncoder().encode(serialized).byteLength <= HMR_CHAT_DEBUG_MAX_RESULT_BYTES) return serialized;

    const fallback = JSON.stringify(createChatDebugErrorResult(result.requestId, result.stableId, 'SNAPSHOT_TOO_LARGE'));
    if (new TextEncoder().encode(fallback).byteLength <= HMR_CHAT_DEBUG_MAX_RESULT_BYTES) return fallback;

    throw new Error('Chat debug result exceeds the maximum size.');
  }

  private async applyLatest(version: number): Promise<number> {
    if (this.connection === undefined || this.mapping === undefined) return 0;
    const payload = parsePayloadResponse(await this.deps.fetchJson(buildRequestUrl(this.connection, '/payload')));
    const connection = this.connection;
    const mapping = this.mapping;

    const resolvedAssets = await ensureAssets(
      payload.assets,
      {
        cacheGet: (hash) => mapping.assetCache[hash],
        cacheSet: (hash, path) => {
          mapping.assetCache[hash] = path;
        },
        probeImage: this.deps.probeImage,
        downloadAsset: (hash) => this.deps.fetchBinary(buildRequestUrl(connection, `/asset/${hash}`)),
        saveAsset: this.deps.saveAsset,
      },
      (progress) => {
        this.syncProgress = progress;
        this.deps.onState(this.getState());
      },
    );
    const materialized = applyAssetPlaceholders(payload.data, (hash) => {
      const resolvedPath = resolvedAssets.get(hash);
      if (resolvedPath === undefined) throw new Error(`unresolved asset: ${hash}`);
      return resolvedPath;
    });

    if (payload.kind === 'character') {
      await this.applyCharacter(materialized, mapping);
    } else {
      await this.applyModule(materialized, mapping);
    }

    this.appliedVersion = version;
    this.syncProgress = undefined;
    mapping.appliedVersion = version;
    mapping.savedAtMs = Date.now();
    await this.persistMapping();
    if (this.phase === 'initialSync' || this.phase === 'connecting') {
      this.setPhase('active');
    } else {
      this.deps.onState(this.getState());
    }
    return payload.assets.length;
  }

  private async applyCharacter(definition: Record<string, unknown>, mapping: HmrMapping): Promise<void> {
    if (mapping.targetChaId === undefined) throw new Error('character 매핑에 chaId가 없습니다.');
    const characters = await this.deps.getCharacters();
    const index = findCharacterIndexByChaId(characters, mapping.targetChaId);
    if (index < 0) {
      this.loopGeneration += 1;
      this.setPhase('stoppedError', '대상 캐릭터가 삭제되었습니다. 위저드에서 다시 선택하세요.');
      await this.deps.alertError('Workbench HMR: 대상 캐릭터가 삭제되어 수신을 정지했습니다.');
      throw new Error('target character deleted');
    }
    const existing = characters[index];
    if (!isRecord(existing)) throw new Error('target character is not an object');
    await this.deps.setCharacterToIndex(index, mergeCharacterDefinition(existing, definition));
  }

  private async applyModule(definition: Record<string, unknown>, mapping: HmrMapping): Promise<void> {
    if (mapping.targetModuleId === undefined) throw new Error('module 매핑에 moduleId가 없습니다.');
    const modules = await this.deps.getModules();
    const next = replaceModuleById(modules, mapping.targetModuleId, definition);
    if (next === null) {
      this.loopGeneration += 1;
      this.setPhase('stoppedError', '대상 모듈이 삭제되었습니다. 위저드에서 다시 선택하세요.');
      await this.deps.alertError('Workbench HMR: 대상 모듈이 삭제되어 수신을 정지했습니다.');
      throw new Error('target module deleted');
    }
    await this.deps.setModulesLite(next);
  }

  private scheduleIdlePersist(): void {
    if (this.idlePersistTimer !== undefined) clearTimeout(this.idlePersistTimer);
    this.idlePersistTimer = setTimeout(() => {
      void this.deps.persistDatabase().catch(() => {});
    }, this.deps.idlePersistDelayMs ?? 3_000);
  }

  private async persistMapping(): Promise<void> {
    if (this.mapping !== undefined) await this.deps.store.save(this.mapping);
  }
}

function parseHealthResponse(value: unknown): HmrHealthResponse {
  if (!isRecord(value)) throw new Error('워크벤치 HMR 서버 응답 형식이 올바르지 않습니다.');
  if (value['app'] !== 'risu-workbench-hmr') throw new Error('워크벤치 HMR 서버가 아닙니다.');
  if (value['protocolVersion'] !== HMR_PROTOCOL_VERSION) {
    throw new Error(`protocolVersion 불일치 (서버 ${String(value['protocolVersion'])} != 플러그인 ${HMR_PROTOCOL_VERSION}) - 워크벤치/플러그인을 업데이트하세요.`);
  }
  if (!isProject(value['project']) || typeof value['version'] !== 'number') {
    throw new Error('워크벤치 HMR health 응답 형식이 올바르지 않습니다.');
  }
  return {
    app: 'risu-workbench-hmr',
    protocolVersion: HMR_PROTOCOL_VERSION,
    project: value['project'],
    version: value['version'],
  };
}

function parseWatchResponse(value: unknown): HmrWatchResponse {
  if (!isRecord(value) || typeof value['version'] !== 'number' || typeof value['definitionChanged'] !== 'boolean' || !isStringArray(value['changedAssets']) || typeof value['stableId'] !== 'string' || !isChatDebugCommand(value['debugCommand'])) {
    throw new Error('워크벤치 HMR watch 응답 형식이 올바르지 않습니다.');
  }
  return {
    version: value['version'],
    definitionChanged: value['definitionChanged'],
    changedAssets: value['changedAssets'],
    stableId: value['stableId'],
    ...(value['debugCommand'] === undefined ? {} : { debugCommand: value['debugCommand'] }),
  };
}

function isChatDebugCommand(value: unknown): value is HmrChatDebugCommand | undefined {
  return value === undefined || (isRecord(value) && typeof value['requestId'] === 'string' && value['requestId'].length > 0 && value['kind'] === 'currentChatSnapshot');
}

function createChatDebugErrorResult(
  requestId: string,
  stableId: string,
  code: 'CHAT_UNAVAILABLE' | 'CHAT_SHAPE_INVALID' | 'SNAPSHOT_TOO_LARGE' | 'CAPTURE_FAILED',
): HmrChatDebugResult {
  const message = code === 'CHAT_UNAVAILABLE'
    ? 'The current chat is unavailable.'
    : code === 'CHAT_SHAPE_INVALID'
      ? 'The current chat data is invalid.'
      : code === 'SNAPSHOT_TOO_LARGE'
        ? 'The complete chat snapshot is too large.'
        : 'The chat snapshot could not be captured.';
  return { requestId, stableId, ok: false, error: { code, message } };
}

function parsePayloadResponse(value: unknown): HmrPayloadResponse {
  if (!isRecord(value) || (value['kind'] !== 'character' && value['kind'] !== 'module') || !isRecord(value['data']) || !isAssetEntries(value['assets'])) {
    throw new Error('워크벤치 HMR payload 응답 형식이 올바르지 않습니다.');
  }
  return {
    kind: value['kind'],
    data: value['data'],
    assets: value['assets'],
  };
}

function isProject(value: unknown): value is HmrHealthResponse['project'] {
  return (
    isRecord(value) &&    
    typeof value['name'] === 'string' &&
    (value['kind'] === 'character' || value['kind'] === 'module') &&
    typeof value['stableId'] === 'string'
  );
}

function isAssetEntries(value: unknown): value is HmrPayloadResponse['assets'] {
  return Array.isArray(value) && value.every((entry) => (
    isRecord(entry) &&
    typeof entry['hash'] === 'string' &&
    typeof entry['ext'] === 'string' &&
    typeof entry['role'] === 'string' &&
    typeof entry['size'] === 'number'
  ));
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
