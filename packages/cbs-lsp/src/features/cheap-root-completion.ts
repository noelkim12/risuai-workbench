/**
 * CBS root completion fast path detection and textEdit helpers.
 * @file packages/cbs-lsp/src/features/cheap-root-completion.ts
 */
import {
  CompletionItem,
  Range as LSPRange,
  type Position,
} from 'vscode-languageserver/node';
import type { CBSBuiltinRegistry } from 'risu-workbench-core';

import { isAgentMetadataEnvelope, type FragmentAnalysisRequest } from '../core';
import {
  buildAllFunctionCompletions,
  buildBlockFunctionCompletions,
  type BuiltinCompletionBuilderCallbacks,
} from './builtin-completion';
import { isFullMacroSnippetCompletion } from './completion-text-edit';

export interface CheapRootCompletionContext {
  kind: 'all-functions' | 'block-functions';
  prefix: string;
  macroStartCharacter: number;
  prefixStartCharacter: number;
  cursorCharacter: number;
  replaceEndCharacter: number;
  line: number;
}

const CBS_SECTIONED_ARTIFACT_EXTENSIONS = new Set(['.risulorebook', '.risuregex', '.risuprompt']);

const CBS_FAST_PATH_SECTION_MARKERS = new Set([
  'CONTENT',
  'IN',
  'OUT',
  'TEXT',
  'INNER_FORMAT',
  'DEFAULT_TEXT',
]);

const CBS_ROOT_PREFIX_PATTERN = /^#?[a-z_]*$/i;

/**
 * provideCheapRootCompletions 함수.
 * 단순 `{{` / `{{#` root completion은 fragment 분석 없이 현재 줄 prefix만 보고 즉시 후보를 생성함.
 *
 * @param request - completion 요청의 문서 텍스트와 경로 정보
 * @param position - completion을 요청한 cursor 위치
 * @param unresolvedOnly - heavy field 생략 여부
 * @param registry - CBS builtin registry
 * @param callbacks - provider metadata envelope 생성 콜백
 * @returns cheap root completion 후보 또는 full analysis로 넘겨야 하면 null
 */
export function provideCheapRootCompletions(
  request: FragmentAnalysisRequest,
  position: Position,
  unresolvedOnly: boolean,
  registry: CBSBuiltinRegistry,
  callbacks: BuiltinCompletionBuilderCallbacks,
): CompletionItem[] | null {
  const context = detectCheapRootCompletionContext(request, position);
  if (!context) {
    return null;
  }

  const completions =
    context.kind === 'block-functions'
      ? buildBlockFunctionCompletions(registry, context.prefix, unresolvedOnly, callbacks)
      : buildAllFunctionCompletions(registry, context.prefix, unresolvedOnly, callbacks);

  return completions.map((item) => applyCheapRootTextEdit(item, context));
}

/**
 * detectCheapRootCompletionContext 함수.
 * parser가 필요 없는 current-line CBS root prefix만 엄격히 감지함.
 *
 * @param request - completion 요청의 문서 텍스트와 경로 정보
 * @param position - completion을 요청한 cursor 위치
 * @returns cheap root context 또는 안전하지 않으면 null
 */
export function detectCheapRootCompletionContext(
  request: FragmentAnalysisRequest,
  position: Position,
): CheapRootCompletionContext | null {
  if (!canUseCheapRootFastPath(request, position)) {
    return null;
  }

  if (isInsideCheapPureBlock(request.text, position)) {
    return null;
  }

  const line = getLineTextAtPosition(request.text, position);
  if (line === null || position.character > line.length) {
    return null;
  }

  const prefixText = line.slice(0, position.character);
  const macroStartCharacter = prefixText.lastIndexOf('{{');
  if (macroStartCharacter === -1) {
    return null;
  }

  const typedPrefix = prefixText.slice(macroStartCharacter + 2);
  if (typedPrefix.includes('::') || typedPrefix.includes('?') || typedPrefix.startsWith(':')) {
    return null;
  }

  if (!CBS_ROOT_PREFIX_PATTERN.test(typedPrefix) || typedPrefix.startsWith('/')) {
    return null;
  }

  const suffix = line.slice(position.character);
  const replaceEndCharacter = suffix.startsWith('}}') ? position.character + 2 : position.character;

  return {
    kind: typedPrefix.startsWith('#') ? 'block-functions' : 'all-functions',
    prefix: typedPrefix,
    macroStartCharacter,
    prefixStartCharacter: macroStartCharacter + 2,
    cursorCharacter: position.character,
    replaceEndCharacter,
    line: position.line,
  };
}

/**
 * canUseCheapRootFastPath 함수.
 * sectioned artifact에서는 현재 offset이 CBS-bearing section 안에 있을 때만 fast path를 허용함.
 *
 * @param request - completion 요청의 문서 텍스트와 경로 정보
 * @param position - completion을 요청한 cursor 위치
 * @returns cheap root fast path를 써도 안전하면 true
 */
export function canUseCheapRootFastPath(
  request: FragmentAnalysisRequest,
  position: Position,
): boolean {
  const normalizedPath = request.filePath.toLowerCase();
  const isSectionedArtifact = [...CBS_SECTIONED_ARTIFACT_EXTENSIONS].some((extension) =>
    normalizedPath.endsWith(extension),
  );
  if (!isSectionedArtifact) {
    return true;
  }

  const linesBeforeCursor = request.text.split(/\r\n|\r|\n/).slice(0, position.line + 1);
  for (let index = linesBeforeCursor.length - 1; index >= 0; index -= 1) {
    const markerMatch = /^@@@\s+([A-Z_]+)/i.exec(linesBeforeCursor[index]?.trim() ?? '');
    if (!markerMatch) {
      continue;
    }

    return CBS_FAST_PATH_SECTION_MARKERS.has(markerMatch[1]!.toUpperCase());
  }

  return false;
}

/**
 * getLineTextAtPosition 함수.
 * 문서 텍스트에서 지정 line의 전체 문자열을 추출함.
 *
 * @param text - completion 대상 문서 텍스트
 * @param position - line을 지정하는 cursor 위치
 * @param maxScannedCharacters - 이 문자 수를 넘겨야만 line을 찾을 수 있으면 null을 반환함
 * @returns 해당 line 텍스트 또는 범위를 벗어나거나 scan cap을 넘으면 null
 */
export function getLineTextAtPosition(
  text: string,
  position: Position,
  maxScannedCharacters: number = Number.POSITIVE_INFINITY,
): string | null {
  let currentLine = 0;
  let lineStart = 0;

  for (let offset = 0; offset < text.length; offset += 1) {
    if (offset > maxScannedCharacters) {
      return null;
    }

    const char = text[offset];
    if (char !== '\r' && char !== '\n') {
      continue;
    }

    if (currentLine === position.line) {
      return position.character <= offset - lineStart ? text.slice(lineStart, offset) : null;
    }

    if (char === '\r' && text[offset + 1] === '\n') {
      offset += 1;
    }
    currentLine += 1;
    lineStart = offset + 1;
  }

  if (currentLine !== position.line) {
    return null;
  }

  return position.character <= text.length - lineStart ? text.slice(lineStart) : null;
}

/**
 * isInsideCheapPureBlock 함수.
 * root fast path가 pure/puredisplay body suppression을 우회하지 않도록 cursor 전 text를 가볍게 스캔함.
 *
 * @param text - completion 대상 문서 텍스트
 * @param position - completion을 요청한 cursor 위치
 * @returns cursor가 pure 계열 block body 안에 있으면 true
 */
export function isInsideCheapPureBlock(text: string, position: Position): boolean {
  const offset = offsetAtPosition(text, position);
  if (offset === null) {
    return false;
  }

  const beforeCursor = text.slice(0, offset);
  const pureBlockPattern = /\{\{\s*(#puredisplay|#pure|\/puredisplay|\/pure)\b[^}]*\}\}/gi;
  let depth = 0;
  for (const match of beforeCursor.matchAll(pureBlockPattern)) {
    const marker = match[1]?.toLowerCase();
    if (marker === '#pure' || marker === '#puredisplay') {
      depth += 1;
    } else if (marker === '/pure' || marker === '/puredisplay') {
      depth = Math.max(0, depth - 1);
    }
  }

  return depth > 0;
}

/**
 * offsetAtPosition 함수.
 * fast path 보조 판단용으로 Position을 문서 offset으로 변환함.
 *
 * @param text - completion 대상 문서 텍스트
 * @param position - 변환할 cursor 위치
 * @returns 문서 offset 또는 범위를 벗어나면 null
 */
export function offsetAtPosition(text: string, position: Position): number | null {
  let line = 0;
  let character = 0;
  for (let offset = 0; offset <= text.length; offset += 1) {
    if (line === position.line && character === position.character) {
      return offset;
    }

    if (offset === text.length) {
      break;
    }

    const char = text[offset];
    if (char === '\r') {
      if (text[offset + 1] === '\n') {
        offset += 1;
      }
      line += 1;
      character = 0;
    } else if (char === '\n') {
      line += 1;
      character = 0;
    } else {
      character += 1;
    }
  }

  return null;
}

/**
 * applyCheapRootTextEdit 함수.
 * cheap root completion item에 host 문서 기준 textEdit range를 직접 부여함.
 *
 * @param item - textEdit을 적용할 completion item
 * @param context - current-line cheap root context
 * @returns textEdit이 설정된 completion item
 */
export function applyCheapRootTextEdit(
  item: CompletionItem,
  context: CheapRootCompletionContext,
): CompletionItem {
  const newText = typeof item.insertText === 'string' ? item.insertText : item.label;
  const isSnippet = isBlockSnippetCompletion(item) || isFullMacroSnippetCompletion(item, newText);
  const startCharacter = isSnippet ? context.macroStartCharacter : context.prefixStartCharacter;
  const endCharacter = isSnippet ? context.replaceEndCharacter : context.cursorCharacter;

  return {
    ...item,
    textEdit: {
      range: LSPRange.create(context.line, startCharacter, context.line, endCharacter),
      newText,
    },
  };
}

/**
 * isBlockSnippetCompletion 함수.
 * block snippet은 `{{`까지 포함한 template라서 root prefix 전체를 교체해야 하는지 판별함.
 *
 * @param item - completion item
 * @returns block snippet completion이면 true
 */
export function isBlockSnippetCompletion(item: CompletionItem): boolean {
  const envelope = isAgentMetadataEnvelope(item.data) ? item.data : null;
  return (
    envelope?.cbs.category.category === 'snippet' && envelope.cbs.category.kind === 'block-snippet'
  );
}
