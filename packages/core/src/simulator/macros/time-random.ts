/**
 * Time, random, and provider macro handlers for the CBS simulator.
 * Deterministic time macros (unixtime, time, isotime, isodate, date),
 * random/pick/roll/hash macros, and provider consumption helpers.
 * @file packages/core/src/domain/cbs/simulator/macros/time-random.ts
 */
import type { CBSNode, MacroCallNode } from '../../domain/cbs/parser/ast';
import type { CbsSimulationContext } from '../types';
import type { TraceState } from '../engine/trace';
import { stringifyVariableValue } from '../values';
import { pushProviderTrace } from './contextual';

/**
 * Narrow state interface for time/random macro handlers.
 * Extends TraceState with context providers and argument evaluation.
 * Also satisfies ContextualState requirements for pushProviderTrace.
 */
export interface TimeRandomState extends TraceState {
  readonly context: CbsSimulationContext;
  providerConsumption: number;
  /** Bound argument evaluator provided by the simulator core. */
  evaluateArgument: (nodes: CBSNode[] | undefined, depth: number) => string;
}

/** Handler signature for time/random macro evaluators. */
export type TimeRandomMacroHandler = (
  node: MacroCallNode,
  state: TimeRandomState,
  depth: number,
) => string;

/**
 * evaluateMacroArguments 함수.
 * Macro arguments 전체를 string 배열로 평가함.
 *
 * @param node - macro call node
 * @param state - simulation 누적 상태
 * @param depth - 현재 재귀 깊이
 * @returns 평가된 argument 문자열 배열
 */
function evaluateMacroArguments(
  node: MacroCallNode,
  state: TimeRandomState,
  depth: number,
): string[] {
  return node.arguments.map((argument) => state.evaluateArgument(argument, depth + 1));
}

/** consumeClock 함수. injected clock provider를 사용하고 소비 순서를 trace에 남김. */
function consumeClock(state: TimeRandomState, node: MacroCallNode): Date {
  const sequence = state.providerConsumption;
  state.providerConsumption += 1;
  const date = state.context.providers.clock();
  pushProviderTrace(state, node, `resolved ${node.name} from injected clock provider`, {
    provider: 'clock',
    sequence,
    iso: date.toISOString(),
  });
  return date;
}

/** consumeRng 함수. injected rng provider를 사용하고 소비 순서를 trace에 남김. */
function consumeRng(state: TimeRandomState, node: MacroCallNode): number {
  const sequence = state.providerConsumption;
  state.providerConsumption += 1;
  const value = clampUnitInterval(state.context.providers.rng());
  pushProviderTrace(state, node, `resolved ${node.name} from injected rng provider`, {
    provider: 'rng',
    sequence,
    value,
  });
  return value;
}

/** consumeHashIndex 함수. injected hash picker provider를 bounded index로 사용하고 trace에 남김. */
function consumeHashIndex(
  state: TimeRandomState,
  node: MacroCallNode,
  seed: string,
  upperBound: number,
): number {
  const sequence = state.providerConsumption;
  state.providerConsumption += 1;
  const boundedUpper = Math.max(Math.floor(upperBound), 1);
  const index = normalizeIndex(
    state.context.providers.pickHashRand(seed, boundedUpper),
    boundedUpper,
  );
  pushProviderTrace(state, node, `resolved ${node.name} from injected hash provider`, {
    provider: 'pickHashRand',
    sequence,
    seed,
    upperBound: boundedUpper,
    index,
  });
  return index;
}

/** randomPick 함수. upstream random/pick 선택 규칙을 deterministic value로 적용함. */
function randomPick(args: readonly string[], rand: number): string {
  const choices = normalizeRandomChoices(args);
  if (choices.length === 0) return rand.toString();
  const index = normalizeIndex(
    Math.floor(clampUnitInterval(rand) * choices.length),
    choices.length,
  );
  return choices[index] ?? '';
}

/** normalizeRandomChoices 함수. random/pick argument를 선택 후보 배열로 정규화함. */
function normalizeRandomChoices(args: readonly string[]): string[] {
  if (args.length === 0) return [];
  if (args.length > 1) return [...args];
  const [raw] = args;
  if (raw.startsWith('[') && raw.endsWith(']')) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((value) => stringifyVariableValue(value));
    } catch {
      return [raw];
    }
  }
  return raw
    .replace(/\\,/g, '§X')
    .split(/:|,/g)
    .map((value) => value.replace(/§X/g, ','));
}

/** rollDice 함수. dice notation을 deterministic random source로 합산함. */
function rollDice(notationInput: string, nextRand: (sides: number) => number): string {
  const notation = (notationInput || '1d6').split('d');
  let count = 1;
  let sides = 6;
  if (notation.length === 2) {
    count = Number(notation[0] || 1);
    sides = Number(notation[1] || 6);
  } else if (notation.length === 1) {
    sides = Number(notation[0] || 6);
  }
  if (Number.isNaN(count) || Number.isNaN(sides) || count < 1 || sides < 1) return 'NaN';
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    total += Math.floor(clampUnitInterval(nextRand(sides)) * sides) + 1;
  }
  return total.toString();
}

/** formatDateTime 함수. date macro format token을 deterministic Date 객체에서 치환함. */
function formatDateTime(formatInput: string, date: Date): string {
  const format = formatInput.startsWith(':') ? formatInput.slice(1) : formatInput;
  if (format.length > 300) return '';
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86_400_000,
  );
  return format
    .replace(/YYYY/g, date.getFullYear().toString())
    .replace(/YY/g, date.getFullYear().toString().slice(2))
    .replace(/MMMM/g, new Intl.DateTimeFormat('en', { month: 'long' }).format(date))
    .replace(/MMM/g, new Intl.DateTimeFormat('en', { month: 'short' }).format(date))
    .replace(/MM/g, (date.getMonth() + 1).toString().padStart(2, '0'))
    .replace(/DDDD/g, dayOfYear.toString())
    .replace(/DD/g, date.getDate().toString().padStart(2, '0'))
    .replace(/dddd/g, new Intl.DateTimeFormat('en', { weekday: 'long' }).format(date))
    .replace(/ddd/g, new Intl.DateTimeFormat('en', { weekday: 'short' }).format(date))
    .replace(/HH/g, date.getHours().toString().padStart(2, '0'))
    .replace(/hh/g, (date.getHours() % 12 || 12).toString().padStart(2, '0'))
    .replace(/mm/g, date.getMinutes().toString().padStart(2, '0'))
    .replace(/ss/g, date.getSeconds().toString().padStart(2, '0'))
    .replace(/X/g, Math.floor(date.getTime() / 1000).toString())
    .replace(/x/g, date.getTime().toString())
    .replace(/A/g, date.getHours() >= 12 ? 'PM' : 'AM');
}

/** clampUnitInterval 함수. provider random 값을 안전한 [0, 1) 범위로 보정함. */
function clampUnitInterval(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value >= 1) return 0.999_999_999;
  return value;
}

/** normalizeIndex 함수. provider index를 bounded integer로 정규화함. */
function normalizeIndex(value: number, upperBound: number): number {
  if (!Number.isFinite(value)) return 0;
  const index = Math.floor(value) % upperBound;
  return index < 0 ? index + upperBound : index;
}

/** evaluateUnixTimeMacro 함수. injected clock의 unix timestamp seconds를 반환함. */
function evaluateUnixTimeMacro(node: MacroCallNode, state: TimeRandomState): string {
  const date = consumeClock(state, node);
  return (date.getTime() / 1000).toFixed(0);
}

/** evaluateTimeMacro 함수. injected clock 또는 명시 timestamp로 time format macro를 평가함. */
function evaluateTimeMacro(node: MacroCallNode, state: TimeRandomState, depth: number): string {
  const format = state.evaluateArgument(node.arguments[0], depth + 1);
  const timestamp = state.evaluateArgument(node.arguments[1], depth + 1);
  const date = timestamp ? new Date(Number(timestamp) / 1000) : consumeClock(state, node);
  if (!format) return `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
  return formatDateTime(format, date);
}

/** evaluateIsoTimeMacro 함수. injected clock의 UTC time 값을 반환함. */
function evaluateIsoTimeMacro(node: MacroCallNode, state: TimeRandomState): string {
  const date = consumeClock(state, node);
  return `${date.getUTCHours()}:${date.getUTCMinutes()}:${date.getUTCSeconds()}`;
}

/** evaluateIsoDateMacro 함수. injected clock의 UTC date 값을 반환함. */
function evaluateIsoDateMacro(node: MacroCallNode, state: TimeRandomState): string {
  const date = consumeClock(state, node);
  return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
}

/** evaluateDateMacro 함수. injected clock 또는 명시 timestamp로 date format macro를 평가함. */
function evaluateDateMacro(node: MacroCallNode, state: TimeRandomState, depth: number): string {
  const format = state.evaluateArgument(node.arguments[0], depth + 1);
  const timestamp = state.evaluateArgument(node.arguments[1], depth + 1);
  const date = timestamp ? new Date(Number(timestamp) / 1000) : consumeClock(state, node);
  if (!format) return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  return formatDateTime(format, date);
}

/** evaluateRandomMacro 함수. deterministic rng 기반 random/pick output을 반환함. */
function evaluateRandomMacro(node: MacroCallNode, state: TimeRandomState, depth: number): string {
  const args = evaluateMacroArguments(node, state, depth);
  const rand = consumeRng(state, node);
  return randomPick(args, rand);
}

/** evaluatePickMacro 함수. deterministic hash provider 기반 pick output을 반환함. */
function evaluatePickMacro(node: MacroCallNode, state: TimeRandomState, depth: number): string {
  const args = evaluateMacroArguments(node, state, depth);
  const upperBound = Math.max(normalizeRandomChoices(args).length, 1);
  const index = consumeHashIndex(state, node, `${node.name}:${args.join('\u0000')}`, upperBound);
  return randomPick(args, upperBound <= 0 ? 0 : index / upperBound);
}

/** evaluateRandIntMacro 함수. deterministic rng 기반 inclusive integer를 반환함. */
function evaluateRandIntMacro(node: MacroCallNode, state: TimeRandomState, depth: number): string {
  const min = Number(state.evaluateArgument(node.arguments[0], depth + 1));
  const max = Number(state.evaluateArgument(node.arguments[1], depth + 1));
  if (Number.isNaN(min) || Number.isNaN(max)) return 'NaN';
  return (Math.floor(consumeRng(state, node) * (max - min + 1)) + min).toString();
}

/** evaluateRollMacro 함수. deterministic rng 기반 dice notation 합계를 반환함. */
function evaluateRollMacro(node: MacroCallNode, state: TimeRandomState, depth: number): string {
  return rollDice(state.evaluateArgument(node.arguments[0], depth + 1), () =>
    consumeRng(state, node),
  );
}

/** evaluateRollPickMacro 함수. deterministic hash provider 기반 dice notation 합계를 반환함. */
function evaluateRollPickMacro(node: MacroCallNode, state: TimeRandomState, depth: number): string {
  const notation = state.evaluateArgument(node.arguments[0], depth + 1);
  let rollIndex = 0;
  return rollDice(notation, (sides) => {
    const index = consumeHashIndex(state, node, `${node.name}:${notation}:${rollIndex}`, sides);
    rollIndex += 1;
    return index / sides;
  });
}

/** evaluateHashMacro 함수. deterministic hash provider를 7자리 hash 문자열로 변환함. */
function evaluateHashMacro(node: MacroCallNode, state: TimeRandomState, depth: number): string {
  const seed = state.evaluateArgument(node.arguments[0], depth + 1);
  const index = consumeHashIndex(state, node, seed, 10_000_000);
  return (index + 1).toFixed(0).padStart(7, '0');
}

/**
 * Registry of all time/random macro handlers.
 * Maps canonical macro names to their evaluator functions.
 */
export const TIME_RANDOM_MACRO_HANDLERS: Readonly<Record<string, TimeRandomMacroHandler>> = {
  unixtime: evaluateUnixTimeMacro,
  time: evaluateTimeMacro,
  isotime: evaluateIsoTimeMacro,
  isodate: evaluateIsoDateMacro,
  date: evaluateDateMacro,
  random: evaluateRandomMacro,
  pick: evaluatePickMacro,
  randint: evaluateRandIntMacro,
  roll: evaluateRollMacro,
  dice: evaluateRollMacro,
  rollp: evaluateRollPickMacro,
  hash: evaluateHashMacro,
};
