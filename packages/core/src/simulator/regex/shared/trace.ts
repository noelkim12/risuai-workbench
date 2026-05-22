/**
 * Regex preview simulator trace event contract.
 * @file packages/core/src/simulator/regex/shared/trace.ts
 */
import type { Range } from '../../../domain/cbs/parser/tokens';

/** Serializable event emitted while preparing or running a regex preview. */
export interface SimulatorTraceEvent {
  /** Lifecycle phase that produced this event. */
  phase: string;
  /** Human-readable trace message. */
  message: string;
  /** Optional source range involved in the event. */
  range?: Range;
  /** Optional JSON-serializable metadata for trace viewers. */
  details?: Readonly<Record<string, unknown>>;
}
