/**
 * cbs-lsp position/range 변환 유틸 모음.
 * @file packages/cbs-lsp/src/utils/position.ts
 */

import type { Position, Range } from 'risu-workbench-core';
import { Position as LSPPosition, Range as LSPRange } from 'vscode-languageserver/node';

/**
 * cbs-lsp가 advertise하는 LSP position encoding.
 * position.ts의 모든 line/character 계산은 JavaScript string index를 그대로 따라가므로 UTF-16 code unit 기준입니다.
 * 3.17 capability negotiation도 이 기준만 지원하며, UTF-16을 받지 않는 client는 compatibility boundary 밖으로 문서화합니다.
 */
export const LSP_POSITION_ENCODING = 'utf-16' as const;

/**
 * CursorState 타입.
 * offset 순회 중 현재 line/character 좌표를 함께 들고 다니는 내부 상태를 표현함.
 */
interface CursorState {
  offset: number;
  line: number;
  character: number;
}

/**
 * advanceCursor 함수.
 * 현재 offset의 문자를 한 칸 소비하면서 다음 line/character 상태를 계산함.
 *
 * @param text - 줄바꿈 규칙을 해석할 원문 텍스트
 * @param state - 현재 offset과 line/character를 담은 순회 상태
 * @returns 한 글자 전진한 다음 cursor 상태
 */
function advanceCursor(text: string, state: CursorState): CursorState {
  const current = text[state.offset];

  if (current === '\r') {
    const nextOffset = text[state.offset + 1] === '\n' ? state.offset + 2 : state.offset + 1;
    return {
      offset: nextOffset,
      line: state.line + 1,
      character: 0,
    };
  }

  if (current === '\n') {
    return {
      offset: state.offset + 1,
      line: state.line + 1,
      character: 0,
    };
  }

  return {
    offset: state.offset + 1,
    line: state.line,
    character: state.character + 1,
  };
}

/**
 * toLSPPosition 함수.
 * core Position을 vscode-languageserver Position으로 변환함.
 *
 * @param pos - LSP 형식으로 넘길 core 좌표
 * @returns 같은 line/character 값을 가진 LSP Position
 */
export function toLSPPosition(pos: Position): LSPPosition {
  return LSPPosition.create(pos.line, pos.character);
}

/**
 * toLSPRange 함수.
 * core Range를 vscode-languageserver Range로 변환함.
 *
 * @param range - LSP 형식으로 넘길 core range
 * @returns start/end가 변환된 LSP Range
 */
export function toLSPRange(range: Range): LSPRange {
  return LSPRange.create(toLSPPosition(range.start), toLSPPosition(range.end));
}

/**
 * isPositionInRange 함수.
 * 주어진 좌표가 range 안에 들어오는지 line/character 기준으로 판별함.
 *
 * @param pos - 포함 여부를 확인할 좌표
 * @param range - 비교 기준이 되는 범위
 * @returns 좌표가 range 내부 또는 경계에 있으면 true
 */
export function isPositionInRange(pos: Position, range: Range): boolean {
  if (pos.line < range.start.line || pos.line > range.end.line) {
    return false;
  }

  if (pos.line === range.start.line && pos.character < range.start.character) {
    return false;
  }

  if (pos.line === range.end.line && pos.character > range.end.character) {
    return false;
  }

  return true;
}

/**
 * offsetToPosition 함수.
 * UTF-16 code unit offset을 CRLF/LF를 고려한 line/character 좌표로 바꿈.
 *
 * @param text - offset 기준이 되는 원문 텍스트
 * @param offset - position으로 바꿀 UTF-16 code unit offset
 * @returns clamp된 offset이 가리키는 Position
 */
export function offsetToPosition(text: string, offset: number): Position {
  const targetOffset = Math.max(0, Math.min(offset, text.length));
  let state: CursorState = { offset: 0, line: 0, character: 0 };

  while (state.offset < targetOffset) {
    state = advanceCursor(text, state);
  }

  return {
    line: state.line,
    character: state.character,
  };
}

/**
 * positionToOffset 함수.
 * line/character 좌표를 원문 텍스트의 UTF-16 code unit offset으로 역변환함.
 *
 * @param text - position 기준이 되는 원문 텍스트
 * @param pos - offset으로 바꿀 UTF-16 line/character 좌표
 * @returns 가능한 가장 가까운 UTF-16 code unit 경계 offset
 */
export function positionToOffset(text: string, pos: Position): number {
  const targetLine = Math.max(0, pos.line);
  const targetCharacter = Math.max(0, pos.character);
  let state: CursorState = { offset: 0, line: 0, character: 0 };

  while (state.offset < text.length) {
    if (state.line === targetLine && state.character === targetCharacter) {
      return state.offset;
    }

    const current = text[state.offset];
    if ((current === '\r' || current === '\n') && state.line === targetLine) {
      return state.offset;
    }

    state = advanceCursor(text, state);
  }

  return state.offset;
}
