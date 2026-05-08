/**
 * CBS simulator default context and deterministic providers.
 * @file packages/core/src/domain/cbs/simulator/context.ts
 */
import { cloneChatHistoryEntry } from './chat-history';
import type { CbsSimulationContext, CbsSimulationOptions, CbsSimulationProviders } from './types';

/** Default budget/options contract for CBS simulation. */
export const DEFAULT_CBS_SIMULATION_OPTIONS: CbsSimulationOptions = {
  maxDepth: 20,
  maxSteps: 1_000,
  maxOutputLength: 100_000,
  maxTraceEvents: 1_000,
  onBudgetExceeded: 'stop',
};

const DEFAULT_CLOCK_ISO = '1970-01-01T00:00:00.000Z';

/**
 * createDefaultPickHashRand 함수.
 * 문자열 seed만으로 안정적인 bounded pseudo-random 값을 만듦.
 *
 * @param seed - 선택을 안정화할 해시 입력
 * @param upperBound - 반환값의 배타적 상한
 * @returns `0 <= n < upperBound` 범위의 정수
 */
function createDefaultPickHashRand(seed: string, upperBound: number): number {
  if (!Number.isFinite(upperBound) || upperBound <= 0) return 0;

  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return hash % Math.floor(upperBound);
}

/** Default deterministic-safe providers; they avoid wall-clock and real random state. */
export const DEFAULT_CBS_SIMULATION_PROVIDERS: CbsSimulationProviders = {
  clock: () => new Date(DEFAULT_CLOCK_ISO),
  rng: () => 0,
  pickHashRand: createDefaultPickHashRand,
};

/**
 * createDefaultCbsSimulationContext 함수.
 * mutation-safe 기본 CBS simulation context를 생성함.
 *
 * @param overrides - 기본 context 위에 얹을 선택적 context 값
 * @returns 새로 생성된 CBS simulation context
 */
export function createDefaultCbsSimulationContext(
  overrides: Partial<CbsSimulationContext> = {},
): CbsSimulationContext {
  return {
    executionMode: overrides.executionMode ?? 'preview',
    chatVariables: { ...(overrides.chatVariables ?? {}) },
    characterDefaultVariables: { ...(overrides.characterDefaultVariables ?? {}) },
    templateDefaultVariables: { ...(overrides.templateDefaultVariables ?? {}) },
    globalVariables: { ...(overrides.globalVariables ?? {}) },
    toggleValues: { ...(overrides.toggleValues ?? {}) },
    tempVariables: { ...(overrides.tempVariables ?? {}) },
    userLabel: overrides.userLabel ?? 'User',
    characterLabel: overrides.characterLabel ?? 'Character',
    role: overrides.role,
    chatIndex: overrides.chatIndex,
    isFirstMessage: overrides.isFirstMessage,
    lorePositions: overrides.lorePositions ? { ...overrides.lorePositions } : undefined,
    chatHistory: overrides.chatHistory ? overrides.chatHistory.map(cloneChatHistoryEntry) : undefined,
    chatHistoryCursor: overrides.chatHistoryCursor,
    providers: {
      ...DEFAULT_CBS_SIMULATION_PROVIDERS,
      ...(overrides.providers ?? {}),
    },
  };
}
