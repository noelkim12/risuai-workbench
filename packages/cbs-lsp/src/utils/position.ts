import type { Position, Range } from 'risu-workbench-core';
import { Position as LSPPosition, Range as LSPRange } from 'vscode-languageserver/node';

interface CursorState {
  offset: number;
  line: number;
  character: number;
}

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

export function toLSPPosition(pos: Position): LSPPosition {
  return LSPPosition.create(pos.line, pos.character);
}

export function toLSPRange(range: Range): LSPRange {
  return LSPRange.create(toLSPPosition(range.start), toLSPPosition(range.end));
}

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
