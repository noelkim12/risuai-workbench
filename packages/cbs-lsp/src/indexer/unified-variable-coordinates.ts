/**
 * UnifiedVariableGraph coordinate conversion helpers.
 * @file packages/cbs-lsp/src/indexer/unified-variable-coordinates.ts
 */

import type { Range } from 'risu-workbench-core';

/**
 * positionToOffset 함수.
 * Position을 같은 text content 안의 offset으로 변환함.
 *
 * @param content - offset 기준이 되는 text content
 * @param position - 변환할 content-relative position
 * @returns content 안의 byte offset
 */
export function positionToOffset(content: string, position: Range['start']): number {
  const lines = content.split('\n');
  let offset = 0;

  for (let i = 0; i < position.line && i < lines.length; i++) {
    offset += lines[i].length + 1; // +1 for newline
  }

  offset += position.character;
  return Math.min(offset, content.length);
}

/**
 * offsetToPosition 함수.
 * Offset을 같은 text content 안의 Position으로 변환함.
 *
 * @param content - position 기준이 되는 text content
 * @param offset - 변환할 byte offset
 * @returns content 안의 Position
 */
export function offsetToPosition(content: string, offset: number): Range['start'] {
  const lines = content.split('\n');
  let currentOffset = 0;

  for (let line = 0; line < lines.length; line++) {
    const lineLength = lines[line].length + 1; // +1 for newline
    if (currentOffset + lineLength > offset) {
      return {
        line,
        character: offset - currentOffset,
      };
    }
    currentOffset += lineLength;
  }

  // If offset is at or beyond the end, return end position
  const lastLine = Math.max(0, lines.length - 1);
  return {
    line: lastLine,
    character: lines[lastLine]?.length ?? 0,
  };
}

/**
 * rebaseRangeToHost 함수.
 * Fragment-local range를 host-document range로 변환함.
 *
 * @param localRange - fragment content 기준 local range
 * @param fragmentStart - host document 안의 fragment 시작 offset
 * @param fragmentContent - local offset 계산에 쓰는 fragment content
 * @param hostDocumentContent - host position 계산에 쓰는 전체 문서 content
 * @returns host document 기준 Range
 */
export function rebaseRangeToHost(
  localRange: Range,
  fragmentStart: number,
  fragmentContent: string,
  hostDocumentContent: string,
): Range {
  // Step 1: Convert local positions to offsets within the fragment
  const localStartOffset = positionToOffset(fragmentContent, localRange.start);
  const localEndOffset = positionToOffset(fragmentContent, localRange.end);

  // Step 2: Rebase to host offsets by adding fragment's host start
  const hostStartOffset = fragmentStart + localStartOffset;
  const hostEndOffset = fragmentStart + localEndOffset;

  // Step 3: Convert host offsets to positions in the host document
  return {
    start: offsetToPosition(hostDocumentContent, hostStartOffset),
    end: offsetToPosition(hostDocumentContent, hostEndOffset),
  };
}
