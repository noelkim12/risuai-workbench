/**
 * Regex preview simulator safety limit defaults.
 * @file packages/core/src/simulator/regex/shared/safety-limits.ts
 */

/** Safety limits applied by regex preview simulator layers. */
export interface SimulatorSafetyLimits {
  /** Maximum accepted input text length. */
  maxInputLength: number;
  /** Maximum retained output text length. */
  maxOutputLength: number;
  /** Maximum retained regex match count. */
  maxMatches: number;
  /** Maximum preview execution time budget in milliseconds. */
  timeoutMs: number;
}

/** Plan-defined default safety limits for regex preview simulation. */
export const DEFAULT_SIMULATOR_SAFETY_LIMITS: SimulatorSafetyLimits = {
  maxInputLength: 20_000,
  maxOutputLength: 20_000,
  maxMatches: 500,
  timeoutMs: 250,
};
