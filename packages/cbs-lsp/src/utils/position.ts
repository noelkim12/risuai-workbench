import { Range, Position } from '../lexer/tokens'
import { Position as LSPPosition, Range as LSPRange } from 'vscode-languageserver/node'

export function toLSPPosition(pos: Position): LSPPosition {
  return LSPPosition.create(pos.line, pos.character)
}

export function toLSPRange(range: Range): LSPRange {
  return LSPRange.create(
    toLSPPosition(range.start),
    toLSPPosition(range.end)
  )
}

export function isPositionInRange(pos: Position, range: Range): boolean {
  if (pos.line < range.start.line || pos.line > range.end.line) return false
  if (pos.line === range.start.line && pos.character < range.start.character)
    return false
  if (pos.line === range.end.line && pos.character > range.end.character)
    return false
  return true
}

export function offsetToPosition(text: string, offset: number): Position {
  let line = 0
  let character = 0
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') {
      line++
      character = 0
    } else {
      character++
    }
  }
  return { line, character }
}

export function positionToOffset(text: string, pos: Position): number {
  let line = 0
  let character = 0
  for (let i = 0; i < text.length; i++) {
    if (line === pos.line && character === pos.character) return i
    if (text[i] === '\n') {
      line++
      character = 0
    } else {
      character++
    }
  }
  return text.length
}
