/**
 * 에디터 문서의 UTF-16 offset과 line/character 좌표를 상호 변환하는 source-position 유틸.
 * @file packages/core/src/domain/editor/shared/source-position/line-offset-index.ts
 */

import type { SourcePosition } from './types';

export interface LineOffsetIndex {
  readonly lineStarts: readonly number[];
  positionAt(offset: number): SourcePosition;
  offsetAt(position: Pick<SourcePosition, 'line' | 'character'>): number;
}

/**
 * createLineOffsetIndex 함수.
 * VS Code와 Monaco가 쓰는 UTF-16 offset 기준으로 위치 변환 인덱스를 만듦.
 *
 * @param source - 줄 시작 offset을 계산할 전체 문서 원문
 * @returns offset과 source position을 오가는 변환 helper
 */
export function createLineOffsetIndex(source: string): LineOffsetIndex {
  const lineStarts: number[] = [0];
  for (let offset = 0; offset < source.length; offset += 1) {
    if (source[offset] !== '\n') continue;
    lineStarts.push(offset + 1);
  }

  return {
    lineStarts,
    /**
     * positionAt 함수.
     * 문서 offset을 zero-based source position으로 변환함.
     *
     * @param offset - 원문 안에서 위치를 찾을 UTF-16 offset
     * @returns line, character, clamped offset을 포함한 source position
     */
    positionAt(offset: number): SourcePosition {
      const clamped = Math.max(0, Math.min(offset, source.length));
      let low = 0;
      let high = lineStarts.length - 1;
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        if (lineStarts[middle] <= clamped) {
          low = middle + 1;
        } else {
          high = middle - 1;
        }
      }
      const line = Math.max(0, low - 1);
      return {
        line,
        character: clamped - lineStarts[line],
        offset: clamped,
      };
    },
    /**
     * offsetAt 함수.
     * zero-based source position을 문서 offset으로 변환함.
     *
     * @param position - offset으로 되돌릴 line/character 좌표
     * @returns 해당 줄 범위 안으로 보정된 UTF-16 offset
     */
    offsetAt(position: Pick<SourcePosition, 'line' | 'character'>): number {
      const line = Math.max(0, Math.min(position.line, lineStarts.length - 1));
      const nextLineStart = line + 1 < lineStarts.length ? lineStarts[line + 1] : source.length;
      return Math.max(lineStarts[line], Math.min(lineStarts[line] + position.character, nextLineStart));
    },
  };
}
