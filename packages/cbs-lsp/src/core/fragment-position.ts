/**
 * CBS fragment와 host document 사이의 위치 변환 유틸 모음.
 * @file packages/cbs-lsp/src/core/fragment-position.ts
 */

import type { CbsFragment, Position, Range } from 'risu-workbench-core';

import { offsetToPosition, positionToOffset } from '../utils/position';

function clampOffset(offset: number, max: number): number {
  return Math.max(0, Math.min(offset, max));
}

function normalizeOffsets(
  startOffset: number,
  endOffset: number,
  max: number,
): {
  startOffset: number;
  endOffset: number;
} {
  const clampedStart = clampOffset(startOffset, max);
  const clampedEnd = clampOffset(endOffset, max);

  if (clampedEnd < clampedStart) {
    return {
      startOffset: clampedStart,
      endOffset: clampedStart,
    };
  }

  return {
    startOffset: clampedStart,
    endOffset: clampedEnd,
  };
}

function rangeFromOffsets(text: string, startOffset: number, endOffset: number): Range {
  const normalized = normalizeOffsets(startOffset, endOffset, text.length);

  return {
    start: offsetToPosition(text, normalized.startOffset),
    end: offsetToPosition(text, normalized.endOffset),
  };
}

/**
 * FragmentOffsetMapper 인터페이스.
 * fragment-local offset, position, range를 host document 좌표로 상호 변환함.
 */
export interface FragmentOffsetMapper {
  readonly hostStart: number;
  readonly hostEnd: number;
  readonly localLength: number;
  /**
   * containsHostOffset 함수.
   * host document offset이 fragment 범위 안에 있는지 확인함.
   *
   * @param hostOffset - 검사할 host document offset
   * @returns offset이 fragment host 범위 안이면 true
   */
  containsHostOffset(hostOffset: number): boolean;
  /**
   * containsLocalOffset 함수.
   * fragment-local offset이 fragment content 범위 안에 있는지 확인함.
   *
   * @param localOffset - 검사할 fragment-local offset
   * @returns offset이 fragment-local 범위 안이면 true
   */
  containsLocalOffset(localOffset: number): boolean;
  /**
   * toHostOffset 함수.
   * fragment-local offset을 host document offset으로 변환함.
   *
   * @param localOffset - 변환할 fragment-local offset
   * @returns host document offset, 범위를 벗어나면 null
   */
  toHostOffset(localOffset: number): number | null;
  /**
   * toLocalOffset 함수.
   * host document offset을 fragment-local offset으로 변환함.
   *
   * @param hostOffset - 변환할 host document offset
   * @returns fragment-local offset, 범위를 벗어나면 null
   */
  toLocalOffset(hostOffset: number): number | null;
  /**
   * toHostPosition 함수.
   * fragment-local offset을 host document position으로 변환함.
   *
   * @param documentContent - host document 전체 텍스트
   * @param localOffset - 변환할 fragment-local offset
   * @returns host document position, 범위를 벗어나면 null
   */
  toHostPosition(documentContent: string, localOffset: number): Position | null;
  /**
   * toLocalPosition 함수.
   * host document position을 fragment-local position으로 변환함.
   *
   * @param documentContent - host document 전체 텍스트
   * @param hostPosition - 변환할 host document position
   * @returns fragment-local position, 범위를 벗어나면 null
   */
  toLocalPosition(documentContent: string, hostPosition: Position): Position | null;
  /**
   * toHostRange 함수.
   * fragment-local range를 host document range로 변환함.
   *
   * @param documentContent - host document 전체 텍스트
   * @param localRange - 변환할 fragment-local range
   * @returns host document range, 범위를 벗어나면 null
   */
  toHostRange(documentContent: string, localRange: Range): Range | null;
  /**
   * toHostRangeFromOffsets 함수.
   * fragment-local offset 쌍을 host document range로 변환함.
   *
   * @param documentContent - host document 전체 텍스트
   * @param localStartOffset - 변환할 fragment-local 시작 offset
   * @param localEndOffset - 변환할 fragment-local 종료 offset
   * @returns host document range, 범위를 벗어나면 null
   */
  toHostRangeFromOffsets(
    documentContent: string,
    localStartOffset: number,
    localEndOffset: number,
  ): Range | null;
  /**
   * toLocalRange 함수.
   * host document range를 fragment-local range로 변환함.
   *
   * @param documentContent - host document 전체 텍스트
   * @param hostRange - 변환할 host document range
   * @returns fragment-local range, 범위를 벗어나면 null
   */
  toLocalRange(documentContent: string, hostRange: Range): Range | null;
}

/**
 * createFragmentOffsetMapper 함수.
 * 단일 CBS fragment의 host 좌표와 local 좌표를 변환하는 mapper를 생성함.
 *
 * @param fragment - 변환 기준이 될 CBS fragment
 * @returns fragment offset mapper
 */
export function createFragmentOffsetMapper(fragment: CbsFragment): FragmentOffsetMapper {
  const containsHostOffset = (hostOffset: number): boolean =>
    hostOffset >= fragment.start && hostOffset <= fragment.end;
  const containsLocalOffset = (localOffset: number): boolean =>
    localOffset >= 0 && localOffset <= fragment.content.length;

  const toHostOffset = (localOffset: number): number | null => {
    if (!containsLocalOffset(localOffset)) {
      return null;
    }

    return fragment.start + localOffset;
  };

  const toLocalOffset = (hostOffset: number): number | null => {
    if (!containsHostOffset(hostOffset)) {
      return null;
    }

    return hostOffset - fragment.start;
  };

  const toHostRangeFromOffsets = (
    documentContent: string,
    localStartOffset: number,
    localEndOffset: number,
  ): Range | null => {
    const normalized = normalizeOffsets(localStartOffset, localEndOffset, fragment.content.length);
    const hostStart = toHostOffset(normalized.startOffset);
    const hostEnd = toHostOffset(normalized.endOffset);

    if (hostStart === null || hostEnd === null) {
      return null;
    }

    return {
      start: offsetToPosition(documentContent, hostStart),
      end: offsetToPosition(documentContent, hostEnd),
    };
  };

  return {
    hostStart: fragment.start,
    hostEnd: fragment.end,
    localLength: fragment.content.length,
    containsHostOffset,
    containsLocalOffset,
    toHostOffset,
    toLocalOffset,
    toHostPosition: (documentContent, localOffset) => {
      const hostOffset = toHostOffset(localOffset);
      return hostOffset === null ? null : offsetToPosition(documentContent, hostOffset);
    },
    toLocalPosition: (documentContent, hostPosition) => {
      const hostOffset = positionToOffset(documentContent, hostPosition);
      const localOffset = toLocalOffset(hostOffset);
      return localOffset === null ? null : offsetToPosition(fragment.content, localOffset);
    },
    toHostRange: (documentContent, localRange) => {
      const localStartOffset = positionToOffset(fragment.content, localRange.start);
      const localEndOffset = positionToOffset(fragment.content, localRange.end);

      return toHostRangeFromOffsets(documentContent, localStartOffset, localEndOffset);
    },
    toHostRangeFromOffsets,
    toLocalRange: (documentContent, hostRange) => {
      const hostStartOffset = positionToOffset(documentContent, hostRange.start);
      const hostEndOffset = positionToOffset(documentContent, hostRange.end);
      const localStartOffset = toLocalOffset(hostStartOffset);
      const localEndOffset = toLocalOffset(hostEndOffset);

      if (localStartOffset === null || localEndOffset === null) {
        return null;
      }

      return rangeFromOffsets(fragment.content, localStartOffset, localEndOffset);
    },
  };
}
