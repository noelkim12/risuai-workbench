/**
 * Regex preview simulator diagnostic contract.
 * @file packages/core/src/simulator/regex/shared/diagnostics.ts
 */
import type { Range } from '../../../domain/cbs/parser/tokens';

/** Diagnostic severity values used by regex preview contracts. */
export type SimulatorDiagnosticSeverity = 'info' | 'warning' | 'error';

/** Serializable diagnostic emitted by regex preview simulator layers. */
export interface SimulatorDiagnostic {
  /** Stable diagnostic code suitable for filtering and tests. */
  code: string;
  /** Diagnostic severity. */
  severity: SimulatorDiagnosticSeverity;
  /** Human-readable diagnostic message. */
  message: string;
  /** Producer label for parser, simulator, runner, or adapter diagnostics. */
  source: string;
  /** Optional source range attached to the diagnostic. */
  range?: Range;
  /** Optional JSON-serializable metadata for callers and trace viewers. */
  details?: Readonly<Record<string, unknown>>;
}
