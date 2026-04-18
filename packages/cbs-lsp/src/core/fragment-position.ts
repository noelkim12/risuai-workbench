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

export interface FragmentOffsetMapper {
  readonly hostStart: number;
  readonly hostEnd: number;
  readonly localLength: number;
  containsHostOffset(hostOffset: number): boolean;
  containsLocalOffset(localOffset: number): boolean;
  toHostOffset(localOffset: number): number | null;
  toLocalOffset(hostOffset: number): number | null;
  toHostPosition(documentContent: string, localOffset: number): Position | null;
  toLocalPosition(documentContent: string, hostPosition: Position): Position | null;
  toHostRange(documentContent: string, localRange: Range): Range | null;
  toHostRangeFromOffsets(
    documentContent: string,
    localStartOffset: number,
    localEndOffset: number,
  ): Range | null;
  toLocalRange(documentContent: string, hostRange: Range): Range | null;
}

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
