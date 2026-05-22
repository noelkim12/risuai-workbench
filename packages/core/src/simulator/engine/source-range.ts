/**
 * Source range and line-offset helpers for the CBS simulator.
 * Pure functions that convert parser ranges to source slices,
 * build line-start offset tables, and clone parser diagnostics.
 * @file packages/core/src/domain/cbs/simulator/engine/source-range.ts
 */
import type { DiagnosticInfo } from '../../domain/cbs/parser/ast';
import type { Range } from '../../domain/cbs/parser/tokens';
import type { CbsSimulationDiagnostic } from '../types';

/**
 * Narrow interface for source-range operations.
 * Avoids exporting the full `SimulationState` type from the engine module.
 */
export interface SourceInfo {
  readonly source: string;
  readonly lineStarts: readonly number[];
}

/**
 * sourceForRange 함수.
 * parser range를 원본 source slice로 되돌림.
 *
 * @param info - source와 line offset 정보
 * @param range - 추출할 source range
 * @returns source fragment
 */
export function sourceForRange(info: SourceInfo, range: Range): string {
  const start = offsetForPosition(info.lineStarts, range.start.line, range.start.character);
  const end = offsetForPosition(info.lineStarts, range.end.line, range.end.character);
  return info.source.slice(start, end);
}

/**
 * buildLineStarts 함수.
 * line/character range를 offset으로 바꾸기 위한 line 시작점을 계산함.
 *
 * @param source - CBS source text
 * @returns 각 line의 시작 offset
 */
export function buildLineStarts(source: string): number[] {
  const lineStarts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10) {
      lineStarts.push(index + 1);
    }
  }
  return lineStarts;
}

/**
 * offsetForPosition 함수.
 * parser position을 source offset으로 변환함.
 *
 * @param lineStarts - line별 시작 offset
 * @param line - zero-based line index
 * @param character - zero-based character offset in line
 * @returns source offset
 */
export function offsetForPosition(
  lineStarts: readonly number[],
  line: number,
  character: number,
): number {
  return (lineStarts[line] ?? 0) + character;
}

/**
 * cloneParserDiagnostic 함수.
 * parser diagnostic을 simulator result에 안전하게 복사함.
 *
 * @param diagnostic - parser diagnostic
 * @returns source가 표시된 cloned diagnostic
 */
export function cloneParserDiagnostic(diagnostic: DiagnosticInfo): CbsSimulationDiagnostic {
  return {
    ...diagnostic,
    range: cloneRange(diagnostic.range),
    relatedInformation: diagnostic.relatedInformation?.map((related) => ({
      ...related,
      range: cloneRange(related.range),
    })),
    source: 'parser',
  };
}

/**
 * cloneRange 함수.
 * parser range 객체를 caller mutation과 분리함.
 *
 * @param range - 복사할 range
 * @returns cloned range
 */
export function cloneRange(range: Range): Range {
  return {
    start: { ...range.start },
    end: { ...range.end },
  };
}
