/**
 * Macro support coverage recording for the CBS simulator.
 * Tracks total macros, unknown macros, per-support-class, and per-name coverage counters.
 * @file packages/core/src/domain/cbs/simulator/engine/coverage.ts
 */
import { getCbsSupportClassification } from '../support-classification';
import type { CbsSimulatorCoverage } from '../types';

/**
 * Narrow structural interface for coverage recording.
 * Avoids exporting the full `SimulationState` type from the engine module.
 */
export interface CoverageState {
  coverage: CbsSimulatorCoverage;
}

/**
 * recordMacro 함수.
 * macro support coverage를 현재 classification table 기준으로 기록함.
 *
 * @param state - simulation 누적 상태 (narrow CoverageState)
 * @param name - macro 또는 block 이름
 * @param supportClass - optional pre-computed support class
 */
export function recordMacro(state: CoverageState, name: string, supportClass?: ReturnType<typeof getCbsSupportClassification>): void {
  state.coverage.totalMacros += 1;
  const resolvedSupportClass = supportClass ?? getCbsSupportClassification(name);
  if (!resolvedSupportClass) {
    state.coverage.unknownMacros.push(name);
  } else {
    state.coverage.bySupportClass[resolvedSupportClass] = (state.coverage.bySupportClass[resolvedSupportClass] ?? 0) + 1;
  }

  // Track by macro name
  state.coverage.byMacroName[name] = (state.coverage.byMacroName[name] ?? 0) + 1;
}
