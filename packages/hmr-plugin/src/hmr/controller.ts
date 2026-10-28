// allow: SIZE_OK - Task 6 requires a single exported controller state machine file.
import { ensureAssets, type EnsureAssetsProgress } from './assets';
import { nextBackoffDelayMs } from './backoff';
import { type ConfirmDiff } from './diff';
import {
  createPreviewSnapshot,
  validatePreviewSnapshot,
  MAX_PREVIEW_READ_ATTEMPTS,
  type PreviewSnapshot,
  type PreviewTarget,
} from './preview';
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
  convertCharacterToModuleDefinition,
  findCharacterIndexByChaId,
  mergeCharacterDefinition,
  replaceModuleById,
  type MergeMode,
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
  readonly autoApply?: boolean;
  readonly mergeMode?: MergeMode;
  readonly observedVersion?: number;
  readonly pendingVersion?: number | undefined;
  readonly previewBusy?: boolean;
  readonly applyBusy?: boolean;
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
  getCharacterAt(index: number): Promise<unknown>;
  getCurrentCharacterIndex(): Promise<number>;
  setCharacterToIndex(index: number, character: unknown): Promise<void>;
  getModules(): Promise<unknown[]>;
  setModulesLite(modules: unknown[]): Promise<void>;
  probeImage(fileName: string): Promise<boolean>;
  saveAsset(bytes: Uint8Array): Promise<string>;
  readonly store: MappingStore;
  sleep(ms: number): Promise<void>;
  onState(state: HmrPublicState): void;
  onEvent(event: HmrEvent): void;
  alertError(message: string): Promise<void>;
}

interface ConfirmTarget {
  readonly chaId?: string | undefined;
  readonly moduleId?: string | undefined;
  readonly label: string;
  readonly badgeEnabled: boolean;
  readonly mergeMode?: MergeMode;
  readonly autoApply?: boolean;
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
  private lastError: string | undefined;
  private syncProgress: EnsureAssetsProgress | undefined;
  private loopGeneration = 0;
  private writeGeneration = 0;
  private observedVersion = 0;
  private pendingVersion: number | undefined;
  private previewBusy = false;
  private applyBusy = false;
  private automaticBusy = false;
  private conflictVersion: number | undefined;
  private characterIndex: number | undefined;
  private mappingSave: Promise<void> = Promise.resolve();

  constructor(private readonly deps: ControllerDeps) {}

  getState(): HmrPublicState {
    return {
      phase: this.phase,
      project: this.project,
      targetLabel: this.mapping?.targetLabel,
      appliedVersion: this.appliedVersion,
      updateCount: this.updateCount,
      badgeEnabled: this.mapping?.badgeEnabled ?? false,
      autoApply: this.mapping?.autoApply ?? true,
      mergeMode: this.mapping?.mergeMode ?? 'merge-by-name',
      observedVersion: this.observedVersion,
      pendingVersion: this.pendingVersion,
      previewBusy: this.previewBusy,
      applyBusy: this.applyBusy,
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

    this.stopLoops();
    this.setPhase('connecting');
    let health: HmrHealthResponse;
    try {
      health = parseHealthResponse(
        await this.deps.fetchJson(buildRequestUrl(connection, '/health')),
      );
    } catch (error) {
      if ((await this.deps.getPlatform()) === 'web') {
        throw new Error(
          `웹 빌드에서 로컬 HMR 서버 연결에 실패했습니다 (${errorToMessage(error)}). ` +
            '[RisuAI 설정 > 고급 설정]에서 "Plain Fetch(직접 요청 보내기)"를 켜야 요청이 프록시 서버를 거치지 않고 127.0.0.1로 직접 전달됩니다. ' +
            '켠 뒤에도 실패하면 브라우저의 로컬 네트워크 접근 권한 프롬프트를 허용했는지 확인하세요.',
        );
      }
      throw error;
    }
    this.connection = connection;
    this.project = health.project;
    this.setPhase('selecting');
    return health;
  }

  async listCharacterTargets(): Promise<
    Array<{
      readonly index: number;
      readonly chaId: string;
      readonly name: string;
      readonly image?: string | undefined;
    }>
  > {
    const characters = await this.deps.getCharacters();
    return characters.flatMap((candidate, index) => {
      if (!isRecord(candidate)) return [];
      if (candidate['type'] === 'group' || typeof candidate['chaId'] !== 'string') return [];
      if (candidate['trashTime'] !== null && candidate['trashTime'] !== undefined) return [];
      return [
        {
          index,
          chaId: candidate['chaId'],
          name: typeof candidate['name'] === 'string' ? candidate['name'] : '(unnamed)',
          image: typeof candidate['image'] === 'string' ? candidate['image'] : undefined,
        },
      ];
    });
  }

  async listModuleTargets(): Promise<
    Array<{ readonly id: string; readonly name: string; readonly description?: string | undefined }>
  > {
    const modules = await this.deps.getModules();
    return modules.flatMap((candidate) => {
      if (!isRecord(candidate) || typeof candidate['id'] !== 'string') return [];
      return [
        {
          id: candidate['id'],
          name: typeof candidate['name'] === 'string' ? candidate['name'] : '(unnamed)',
          description:
            typeof candidate['description'] === 'string' ? candidate['description'] : undefined,
        },
      ];
    });
  }

  async buildConfirmDiff(
    target: { readonly chaId?: string | undefined; readonly moduleId?: string | undefined },
    mode: MergeMode = 'merge-by-name',
  ): Promise<ConfirmDiff> {
    return (await this.prepareConfirmPreview(target, mode)).diff;
  }

  async prepareConfirmPreview(
    target: { readonly chaId?: string | undefined; readonly moduleId?: string | undefined },
    mode: MergeMode = 'merge-by-name',
  ): Promise<PreviewSnapshot> {
    if (
      this.connection === undefined ||
      (this.project === undefined && this.mapping === undefined)
    ) {
      throw new Error('connect가 선행되어야 합니다.');
    }
    const targetKind = resolveTargetKind(target);
    const id = target.chaId ?? target.moduleId;
    if (id === undefined) throw new HmrTargetMissingError('대상이 없습니다.');
    const identity = { kind: targetKind, id };
    const connection = this.connection;
    const generation = this.writeGeneration;
    for (let attempt = 0; attempt < MAX_PREVIEW_READ_ATTEMPTS; attempt += 1) {
      const before = parseHealthResponse(
        await this.deps.fetchJson(buildRequestUrl(connection, '/health')),
      );
      const payload = parsePayloadResponse(
        await this.deps.fetchJson(buildRequestUrl(connection, '/payload')),
      );
      const after = parseHealthResponse(
        await this.deps.fetchJson(buildRequestUrl(connection, '/health')),
      );
      if (generation !== this.writeGeneration || connection !== this.connection)
        throw new Error('연결이 변경되었습니다.');
      if (after.project.stableId !== (this.project?.stableId ?? this.mapping?.stableId))
        throw new Error('Broadcast 대상이 바뀌었습니다.');
      const existing = await this.readTarget(identity);
      const result = createPreviewSnapshot({
        before,
        after,
        payload,
        target: identity,
        mode,
        existing,
      });
      if (result.status === 'ready') return result.snapshot;
      if (result.status === 'kind-mismatch') throw new Error('지원하지 않는 대상 종류입니다.');
    }
    throw new Error('변경 중입니다. 다시 확인하세요.');
  }

  private async readTarget(target: PreviewTarget): Promise<Record<string, unknown>> {
    const candidate =
      target.kind === 'character'
        ? (await this.findCharacter(target.id))?.character
        : (await this.deps.getModules()).find(
            (value) => isRecord(value) && value['id'] === target.id,
          );
    if (!isRecord(candidate))
      throw new HmrTargetMissingError('대상을 찾을 수 없습니다. 다시 선택하세요.');
    return candidate;
  }

  /**
   * getDatabase(['characters'])는 모든 캐릭터와 채팅을 호스트 메인 스레드에서 통째로 복사해 RisuAI 전체가 멈춘다.
   * 기억해 둔 index → 현재 선택된 캐릭터 index 순으로 한 명씩 읽어 보고, 둘 다 어긋날 때만 전체 목록을 훑는다.
   */
  private async findCharacter(
    chaId: string,
  ): Promise<{ readonly index: number; readonly character: Record<string, unknown> } | undefined> {
    const candidates = new Set([this.characterIndex, await this.deps.getCurrentCharacterIndex()]);
    for (const index of candidates) {
      if (index === undefined || index < 0) continue;
      const character = await this.deps.getCharacterAt(index);
      if (!isRecord(character) || character['chaId'] !== chaId) continue;
      this.characterIndex = index;
      return { index, character };
    }
    const characters = await this.deps.getCharacters();
    const index = findCharacterIndexByChaId(characters, chaId);
    const character = characters[index];
    if (index < 0 || !isRecord(character)) {
      this.characterIndex = undefined;
      return undefined;
    }
    this.characterIndex = index;
    return { index, character };
  }

  async prepareManualPreview(
    mode: MergeMode = this.mapping?.mergeMode ?? 'merge-by-name',
  ): Promise<PreviewSnapshot> {
    if (this.mapping === undefined) throw new Error('연결이 없습니다.');
    this.previewBusy = true;
    this.deps.onState(this.getState());
    try {
      return await this.prepareConfirmPreview(
        { chaId: this.mapping.targetChaId, moduleId: this.mapping.targetModuleId },
        mode,
      );
    } finally {
      this.previewBusy = false;
      this.deps.onState(this.getState());
    }
  }

  async setAutoApply(enabled: boolean): Promise<void> {
    if (this.mapping === undefined || this.mapping.autoApply === enabled) return;
    this.mapping.autoApply = enabled;
    this.writeGeneration += 1;
    await this.persistMapping();
    this.deps.onState(this.getState());
    if (enabled && this.phase !== 'paused') await this.refreshOnce();
  }

  async confirmAndStart(target: ConfirmTarget, approvedSnapshot?: PreviewSnapshot): Promise<void> {
    if (this.connection === undefined || this.project === undefined) {
      throw new Error('connect가 선행되어야 합니다.');
    }

    this.stopLoops();
    this.setPhase('confirming');
    // 에셋은 해시 이름으로 저장되므로 이전 연결의 캐시를 그대로 써도 된다. 매번 비우면 수신 시작마다 전부 다시 확인한다.
    const assetCache = (await this.deps.store.load())?.assetCache ?? {};
    this.mapping = {
      connectionString: this.connection.raw,
      stableId: this.project.stableId,
      kind: resolveTargetKind(target),
      targetChaId: target.chaId,
      targetModuleId: target.moduleId,
      targetLabel: target.label,
      appliedVersion: 0,
      badgeEnabled: target.badgeEnabled,
      mergeMode: target.mergeMode ?? approvedSnapshot?.mode ?? 'merge-by-name',
      autoApply: target.autoApply ?? false,
      paused: false,
      assetCache,
      savedAtMs: Date.now(),
    };
    this.appliedVersion = 0;
    this.observedVersion = 0;
    this.pendingVersion = undefined;
    this.conflictVersion = undefined;
    this.updateCount = 0;
    this.lastError = undefined;
    this.setPhase('initialSync');
    const result =
      approvedSnapshot === undefined
        ? await this.applyLatest()
        : await this.applyPreview(approvedSnapshot, true);
    if (typeof result !== 'number' && result.status !== 'applied')
      throw new Error('미리보기가 변경되었습니다. 다시 확인하세요.');
    if (this.phase !== 'active') throw new Error('초기 반영이 취소되었습니다. 다시 확인하세요.');
    const assetCount =
      typeof result === 'number' ? result : (approvedSnapshot?.source.payload.assets.length ?? 0);
    await this.persistMapping();
    this.deps.onEvent({ kind: 'initialSynced', version: this.appliedVersion, assetCount });
    this.startLoop();
  }

  async tryAutoReconnect(manual = false): Promise<boolean> {
    const generation = this.writeGeneration;
    const mapping = await this.deps.store.load();
    if (generation !== this.writeGeneration) return false;
    if (mapping === null) return false;
    if (mapping.mergeMode !== 'merge-by-name' && mapping.mergeMode !== 'replace') return false;
    const wasDisconnected = mapping.disconnected === true;
    if (wasDisconnected && !manual) return false;
    delete mapping.disconnected;

    const connection = parseConnectionString(mapping.connectionString);
    if (connection === null) return false;

    if (mapping.paused === true) {
      this.connection = connection;
      this.mapping = mapping;
      this.project = undefined;
      this.appliedVersion = mapping.appliedVersion;
      this.observedVersion = mapping.appliedVersion;
      this.pendingVersion = undefined;
      this.updateCount = 0;
      this.setPhase('paused');
      if (wasDisconnected) await this.persistMapping();
      return true;
    }

    try {
      const health = parseHealthResponse(
        await this.deps.fetchJson(buildRequestUrl(connection, '/health')),
      );
      if (generation !== this.writeGeneration) return false;
      if (health.project.stableId !== mapping.stableId) return false;
      this.connection = connection;
      this.project = health.project;
      this.mapping = mapping;
      this.appliedVersion = mapping.appliedVersion;
      this.observedVersion = mapping.appliedVersion;
      this.rebaseIfServerRestarted(health.version);
      this.pendingVersion = health.version > this.appliedVersion ? health.version : undefined;
      this.updateCount = 0;
      this.lastError = undefined;
      this.setPhase('active');
      if (mapping.autoApply && this.pendingVersion !== undefined) {
        try {
          await this.applyPending();
        } catch (error) {
          if (generation !== this.writeGeneration) return false;
          this.setPhase('reconnecting', errorToMessage(error));
          await this.deps.sleep(nextBackoffDelayMs(0));
        }
      }
      if (generation !== this.writeGeneration) return false;
      if (wasDisconnected) await this.persistMapping();
      this.startLoop();
      return true;
    } catch (error) {
      if (error instanceof Error) return false;
      throw error;
    }
  }

  async pause(): Promise<void> {
    if ((this.phase !== 'active' && this.phase !== 'reconnecting') || this.mapping === undefined)
      return;
    this.stopLoops();
    const generation = this.writeGeneration;
    const mapping = this.mapping;
    this.mapping.paused = true;
    this.setPhase('paused');
    try {
      await this.persistMapping();
    } catch (error) {
      if (generation === this.writeGeneration && mapping === this.mapping)
        this.setPhase('paused', errorToMessage(error));
      throw error;
    }
  }

  async resume(): Promise<void> {
    if (this.phase !== 'paused' || this.mapping === undefined) return;
    const mapping = this.mapping;
    const generation = this.writeGeneration;
    mapping.paused = false;
    try {
      await this.persistMapping();
    } catch (error) {
      mapping.paused = true;
      if (generation === this.writeGeneration && mapping === this.mapping)
        this.setPhase('paused', errorToMessage(error));
      throw error;
    }
    if (generation !== this.writeGeneration || mapping !== this.mapping) return;
    this.setPhase('active');
    try {
      await this.refreshOnce();
    } catch (error) {
      if (generation !== this.writeGeneration) return;
      this.setPhase('reconnecting', errorToMessage(error));
    }
    if (generation === this.writeGeneration) this.startLoop();
  }

  stopLoops(): void {
    this.loopGeneration += 1;
    this.writeGeneration += 1;
  }

  async disconnect(): Promise<void> {
    this.stopLoops();
    if (this.mapping !== undefined) {
      this.mapping.disconnected = true;
      await this.persistMapping();
    }
    this.mapping = undefined;
    this.connection = undefined;
    this.project = undefined;
    this.appliedVersion = 0;
    this.observedVersion = 0;
    this.pendingVersion = undefined;
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
    if (this.connection === undefined || this.mapping === undefined) return;
    const generation = this.writeGeneration;
    const health = parseHealthResponse(
      await this.deps.fetchJson(buildRequestUrl(this.connection, '/health')),
    );
    if (generation !== this.writeGeneration) return;
    if (health.project.stableId !== this.mapping.stableId) {
      this.stopLoops();
      this.setPhase('stoppedError', 'Broadcast 대상이 바뀌었습니다. 위저드에서 다시 확인하세요.');
      await this.deps.alertError(
        'Workbench HMR: Broadcast 대상이 바뀌어 수신을 안전 정지했습니다.',
      );
      return;
    }
    this.project = health.project;
    this.rebaseIfServerRestarted(health.version);
    if (health.version > this.appliedVersion) this.pendingVersion = health.version;
    this.deps.onState(this.getState());
    await this.applyPending();
  }

  private async applyPending(): Promise<void> {
    if (
      !this.mapping?.autoApply ||
      this.pendingVersion === undefined ||
      this.pendingVersion === this.conflictVersion ||
      this.applyBusy ||
      this.automaticBusy ||
      this.phase === 'paused'
    )
      return;
    this.automaticBusy = true;
    const mapping = this.mapping;
    try {
      const fromVersion = this.appliedVersion;
      const assetCount = await this.applyLatest();
      if (this.appliedVersion === fromVersion || mapping !== this.mapping) return;
      this.updateCount += 1;
      this.deps.onState(this.getState());
      this.deps.onEvent({ kind: 'applied', fromVersion, version: this.appliedVersion, assetCount });
    } finally {
      this.automaticBusy = false;
    }
  }

  private async runLoop(generation: number): Promise<void> {
    let backoffAttempt = 0;
    while (
      generation === this.loopGeneration &&
      this.connection !== undefined &&
      this.mapping !== undefined
    ) {
      try {
        await this.applyPending();
        if (
          generation !== this.loopGeneration ||
          this.connection === undefined ||
          this.mapping === undefined
        )
          return;
        const watch = parseWatchResponse(
          await this.deps.fetchJson(
            buildRequestUrl(this.connection, '/watch', { since: String(this.observedVersion) }),
          ),
        );
        if (generation !== this.loopGeneration) return;
        backoffAttempt = 0;
        // Broadcast 대상 전환 감지: 서버는 살아있는 채로 타겟만 바뀔 수 있으므로 매 응답마다 stableId를 대조한다.
        if (watch.stableId !== this.mapping.stableId) {
          this.stopLoops();
          this.setPhase(
            'stoppedError',
            'Broadcast 대상이 바뀌었습니다. 위저드에서 다시 확인하세요.',
          );
          await this.deps.alertError(
            'Workbench HMR: Broadcast 대상이 바뀌어 수신을 안전 정지했습니다.',
          );
          return;
        }
        if (this.phase === 'reconnecting') this.setPhase('active');
        if (this.rebaseIfServerRestarted(watch.version)) continue;
        if (watch.debugCommand !== undefined) {
          await this.handleDebugCommand(watch.debugCommand);
        }
        if (watch.version > this.appliedVersion && watch.definitionChanged) {
          this.observedVersion = Math.max(this.observedVersion, watch.version);
          this.pendingVersion = Math.max(this.pendingVersion ?? 0, watch.version);
          this.deps.onState(this.getState());
          await this.applyPending();
        }
      } catch (error) {
        if (generation !== this.loopGeneration) return;
        this.setPhase('reconnecting', errorToMessage(error));
        await this.deps.sleep(nextBackoffDelayMs(backoffAttempt));
        backoffAttempt += 1;
        if (generation !== this.loopGeneration) return;
        const recovered = await this.recheckHealth();
        if (recovered === 'stableIdChanged') {
          this.stopLoops();
          this.setPhase(
            'stoppedError',
            'Broadcast 대상이 바뀌었습니다. 위저드에서 다시 확인하세요.',
          );
          await this.deps.alertError(
            'Workbench HMR: Broadcast 대상이 바뀌어 수신을 안전 정지했습니다.',
          );
          return;
        }
      }
    }
  }

  /**
   * 워크벤치(VS Code)가 재시작되면 서버 버전이 0부터 다시 올라간다.
   * 저장된 버전보다 작은 버전을 받으면 기준을 0으로 되돌려 최신 내용을 다시 대기 상태로 만든다.
   */
  private rebaseIfServerRestarted(serverVersion: number): boolean {
    if (this.mapping === undefined || serverVersion >= this.observedVersion) return false;
    this.appliedVersion = 0;
    this.observedVersion = 0;
    this.mapping.appliedVersion = 0;
    return true;
  }

  private async recheckHealth(): Promise<HealthCheckResult> {
    if (this.connection === undefined || this.mapping === undefined) return 'down';
    try {
      const health = parseHealthResponse(
        await this.deps.fetchJson(buildRequestUrl(this.connection, '/health')),
      );
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

  private async captureChatDebugResult(
    command: HmrChatDebugCommand,
    stableId: string,
  ): Promise<HmrChatDebugResult> {
    try {
      return {
        requestId: command.requestId,
        stableId,
        ok: true,
        snapshot: await captureCurrentChatSnapshot(),
      };
    } catch (error) {
      const code = error instanceof ChatSnapshotCaptureError ? error.code : 'CAPTURE_FAILED';
      return createChatDebugErrorResult(command.requestId, stableId, code);
    }
  }

  private serializeChatDebugResult(result: HmrChatDebugResult): string {
    const serialized = JSON.stringify(result);
    if (new TextEncoder().encode(serialized).byteLength <= HMR_CHAT_DEBUG_MAX_RESULT_BYTES)
      return serialized;

    const fallback = JSON.stringify(
      createChatDebugErrorResult(result.requestId, result.stableId, 'SNAPSHOT_TOO_LARGE'),
    );
    if (new TextEncoder().encode(fallback).byteLength <= HMR_CHAT_DEBUG_MAX_RESULT_BYTES)
      return fallback;

    throw new Error('Chat debug result exceeds the maximum size.');
  }

  private async applyLatest(): Promise<number> {
    const generation = this.writeGeneration;
    let snapshot: PreviewSnapshot;
    try {
      snapshot = await this.prepareManualPreview();
    } catch (error) {
      if (error instanceof HmrTargetMissingError) {
        this.stopLoops();
        this.setPhase('stoppedError', error.message);
        await this.deps.alertError('Workbench HMR: 대상이 삭제되어 수신을 정지했습니다.');
      }
      throw error;
    }
    if (generation !== this.writeGeneration) return 0;
    if ((snapshot.diff.conflicts?.length ?? 0) > 0 && this.phase !== 'initialSync') {
      this.conflictVersion = this.pendingVersion;
      this.setPhase('active', '이름 충돌: Sync에서 확인하거나 전체 치환을 선택하세요.');
      return 0;
    }
    const result = await this.applyPreview(snapshot, true);
    if (result.status === 'stale') throw new Error('변경 중입니다. 다시 확인하세요.');
    return result.status === 'applied' ? snapshot.source.payload.assets.length : 0;
  }

  async applyPreview(
    snapshot: PreviewSnapshot,
    automatic = false,
  ): Promise<
    { status: 'applied' } | { status: 'stale'; snapshot: PreviewSnapshot } | { status: 'busy' }
  > {
    if (this.applyBusy) return { status: 'busy' };
    if (this.connection === undefined || this.mapping === undefined)
      throw new Error('연결이 없습니다.');
    if ((snapshot.diff.conflicts?.length ?? 0) > 0)
      throw new Error('이름 충돌을 해결하거나 전체 치환을 선택하세요.');
    if (automatic && !this.mapping.autoApply && this.phase !== 'initialSync')
      return { status: 'busy' };
    const connection = this.connection;
    const mapping = this.mapping;
    const generation = this.writeGeneration;
    const payload = snapshot.source.payload;
    this.applyBusy = true;
    this.deps.onState(this.getState());
    try {
      const resolvedAssets = await ensureAssets(
        payload.assets,
        {
          cacheGet: (hash) => mapping.assetCache[hash],
          cacheSet: (hash, path) => {
            mapping.assetCache[hash] = path;
          },
          probeImage: this.deps.probeImage,
          downloadAsset: (hash) => {
            if (generation !== this.writeGeneration || mapping !== this.mapping)
              throw new Error('반영이 취소되었습니다.');
            return this.deps.fetchBinary(buildRequestUrl(connection, `/asset/${hash}`));
          },
          saveAsset: (bytes) => {
            if (generation !== this.writeGeneration || mapping !== this.mapping)
              throw new Error('반영이 취소되었습니다.');
            return this.deps.saveAsset(bytes);
          },
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

      const definition = resolveDefinitionForTarget(payload.kind, materialized, mapping.kind);
      const final = await this.prepareManualPreview(snapshot.mode);
      if (validatePreviewSnapshot(snapshot, final).status !== 'valid')
        return { status: 'stale', snapshot: final };
      if (generation !== this.writeGeneration || mapping !== this.mapping)
        throw new Error('연결 또는 자동 변경 설정이 바뀌었습니다.');
      const written =
        mapping.kind === 'character'
          ? await this.applyCharacter(definition, mapping, snapshot, generation)
          : await this.applyModule(definition, mapping, snapshot, generation);
      if (!written)
        return { status: 'stale', snapshot: await this.prepareManualPreview(snapshot.mode) };

      if (mapping !== this.mapping) return { status: 'applied' };
      const fromVersion = this.appliedVersion;
      const version = snapshot.source.version;
      this.appliedVersion = version;
      this.observedVersion = Math.max(this.observedVersion, version);
      if ((this.pendingVersion ?? 0) <= version) this.pendingVersion = undefined;
      this.syncProgress = undefined;
      mapping.appliedVersion = version;
      mapping.mergeMode = snapshot.mode;
      this.conflictVersion = undefined;
      this.lastError = undefined;
      mapping.savedAtMs = Date.now();
      await this.persistMapping();
      if (this.phase === 'initialSync' || this.phase === 'connecting') {
        this.setPhase('active');
      } else {
        this.deps.onState(this.getState());
      }
      if (!automatic) {
        this.updateCount += 1;
        this.deps.onEvent({
          kind: 'applied',
          fromVersion,
          version,
          assetCount: payload.assets.length,
        });
      }
      return { status: 'applied' };
    } finally {
      this.applyBusy = false;
      this.syncProgress = undefined;
      this.deps.onState(this.getState());
    }
  }

  private async applyCharacter(
    definition: Record<string, unknown>,
    mapping: HmrMapping,
    snapshot: PreviewSnapshot,
    generation: number,
  ): Promise<boolean> {
    if (mapping.targetChaId === undefined) throw new Error('character 매핑에 chaId가 없습니다.');
    const found = await this.findCharacter(mapping.targetChaId);
    if (found === undefined) {
      this.loopGeneration += 1;
      this.setPhase('stoppedError', '대상 캐릭터가 삭제되었습니다. 위저드에서 다시 선택하세요.');
      await this.deps.alertError('Workbench HMR: 대상 캐릭터가 삭제되어 수신을 정지했습니다.');
      throw new Error('target character deleted');
    }
    const { index, character: existing } = found;
    if (generation !== this.writeGeneration || mapping !== this.mapping)
      throw new Error('연결 또는 자동 변경 설정이 바뀌었습니다.');
    if (validatePreviewSnapshot(snapshot, { ...snapshot, existing }).status !== 'valid')
      return false;
    await this.deps.setCharacterToIndex(
      index,
      mergeCharacterDefinition(existing, definition, snapshot.mode),
    );
    return true;
  }

  private async applyModule(
    definition: Record<string, unknown>,
    mapping: HmrMapping,
    snapshot: PreviewSnapshot,
    generation: number,
  ): Promise<boolean> {
    if (mapping.targetModuleId === undefined) throw new Error('module 매핑에 moduleId가 없습니다.');
    const modules = await this.deps.getModules();
    const existing = modules.find(
      (value) => isRecord(value) && value['id'] === mapping.targetModuleId,
    );
    if (
      isRecord(existing) &&
      validatePreviewSnapshot(snapshot, { ...snapshot, existing }).status !== 'valid'
    )
      return false;
    const next = replaceModuleById(modules, mapping.targetModuleId, definition, snapshot.mode);
    if (next === null) {
      this.loopGeneration += 1;
      this.setPhase('stoppedError', '대상 모듈이 삭제되었습니다. 위저드에서 다시 선택하세요.');
      await this.deps.alertError('Workbench HMR: 대상 모듈이 삭제되어 수신을 정지했습니다.');
      throw new Error('target module deleted');
    }
    if (generation !== this.writeGeneration || mapping !== this.mapping)
      throw new Error('연결 또는 자동 변경 설정이 바뀌었습니다.');
    await this.deps.setModulesLite(next);
    return true;
  }

  private async persistMapping(): Promise<void> {
    if (this.mapping === undefined) return;
    const mapping = structuredClone(this.mapping);
    const save = () => this.deps.store.save(mapping);
    this.mappingSave = this.mappingSave.then(save, save);
    await this.mappingSave;
  }
}

function parseHealthResponse(value: unknown): HmrHealthResponse {
  if (!isRecord(value)) throw new Error('워크벤치 HMR 서버 응답 형식이 올바르지 않습니다.');
  if (value['app'] !== 'risu-workbench-hmr') throw new Error('워크벤치 HMR 서버가 아닙니다.');
  if (value['protocolVersion'] !== HMR_PROTOCOL_VERSION) {
    throw new Error(
      `protocolVersion 불일치 (서버 ${String(value['protocolVersion'])} != 플러그인 ${HMR_PROTOCOL_VERSION}) - 워크벤치/플러그인을 업데이트하세요.`,
    );
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
  if (
    !isRecord(value) ||
    typeof value['version'] !== 'number' ||
    typeof value['definitionChanged'] !== 'boolean' ||
    !isStringArray(value['changedAssets']) ||
    typeof value['stableId'] !== 'string' ||
    !isChatDebugCommand(value['debugCommand'])
  ) {
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
  return (
    value === undefined ||
    (isRecord(value) &&
      typeof value['requestId'] === 'string' &&
      value['requestId'].length > 0 &&
      value['kind'] === 'currentChatSnapshot')
  );
}

function createChatDebugErrorResult(
  requestId: string,
  stableId: string,
  code: 'CHAT_UNAVAILABLE' | 'CHAT_SHAPE_INVALID' | 'SNAPSHOT_TOO_LARGE' | 'CAPTURE_FAILED',
): HmrChatDebugResult {
  const message =
    code === 'CHAT_UNAVAILABLE'
      ? 'The current chat is unavailable.'
      : code === 'CHAT_SHAPE_INVALID'
        ? 'The current chat data is invalid.'
        : code === 'SNAPSHOT_TOO_LARGE'
          ? 'The complete chat snapshot is too large.'
          : 'The chat snapshot could not be captured.';
  return { requestId, stableId, ok: false, error: { code, message } };
}

function parsePayloadResponse(value: unknown): HmrPayloadResponse {
  if (
    !isRecord(value) ||
    (value['kind'] !== 'character' && value['kind'] !== 'module') ||
    !isRecord(value['data']) ||
    !isAssetEntries(value['assets'])
  ) {
    throw new Error('워크벤치 HMR payload 응답 형식이 올바르지 않습니다.');
  }
  return {
    kind: value['kind'],
    data: value['data'],
    assets: value['assets'],
  };
}

function resolveTargetKind(target: {
  readonly chaId?: string | undefined;
  readonly moduleId?: string | undefined;
}): HmrMapping['kind'] {
  const hasCharacterTarget = target.chaId !== undefined;
  const hasModuleTarget = target.moduleId !== undefined;
  if (hasCharacterTarget === hasModuleTarget) {
    throw new Error('character 또는 module 대상 하나만 선택해야 합니다.');
  }
  return hasCharacterTarget ? 'character' : 'module';
}

function resolveDefinitionForTarget(
  payloadKind: HmrPayloadResponse['kind'],
  definition: Record<string, unknown>,
  targetKind: HmrMapping['kind'],
): Record<string, unknown> {
  if (payloadKind === targetKind) return definition;
  if (payloadKind === 'character' && targetKind === 'module') {
    return convertCharacterToModuleDefinition(definition);
  }
  throw new Error('module HMR payload는 character 대상으로 적용할 수 없습니다.');
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
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry['hash'] === 'string' &&
        typeof entry['ext'] === 'string' &&
        typeof entry['role'] === 'string' &&
        typeof entry['size'] === 'number',
    )
  );
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
