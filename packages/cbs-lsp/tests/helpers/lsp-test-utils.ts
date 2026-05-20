/**
 * CBS LSP 테스트에서 공용으로 쓰는 LSP 좌표와 응답 정규화 헬퍼.
 * @file packages/cbs-lsp/tests/helpers/lsp-test-utils.ts
 */

import type { CompletionItem, Diagnostic, Position, Range } from 'vscode-languageserver/node';
import { expect } from 'vitest';

import { offsetToPosition } from '../../src/utils/position';

interface DiagnosticsSink {
  diagnostics: Array<{
    uri: string;
    version?: number;
    diagnostics: readonly Diagnostic[];
  }>;
}

interface TextDocumentRequestLike {
  uri: string;
  version: number;
  filePath: string;
  text: string;
}

type CompletionResult =
  | CompletionItem[]
  | { items: CompletionItem[] }
  | Promise<CompletionItem[] | { items: CompletionItem[] }>
  | null
  | undefined;

/**
 * locateNthOffset 함수.
 * text 안에서 needle의 occurrence번째 시작 offset을 찾음.
 *
 * @param text - 검색할 host 문서 전문
 * @param needle - 찾을 문자열
 * @param occurrence - 같은 문자열 중 찾을 occurrence index
 * @returns needle이 시작하는 UTF-16 offset
 */
export function locateNthOffset(text: string, needle: string, occurrence: number = 0): number {
  let fromIndex = 0;
  let foundIndex = -1;

  for (let index = 0; index <= occurrence; index += 1) {
    foundIndex = text.indexOf(needle, fromIndex);
    if (foundIndex === -1) {
      break;
    }

    fromIndex = foundIndex + needle.length;
  }

  expect(foundIndex).toBeGreaterThanOrEqual(0);
  return foundIndex;
}

/**
 * locateOffset 함수.
 * text 안의 needle occurrence 위치에 추가 character offset을 더한 offset을 반환함.
 *
 * @param text - 검색할 host 문서 전문
 * @param needle - 찾을 문자열
 * @param characterOffset - 찾은 위치에서 추가로 이동할 문자 수
 * @param occurrence - 같은 문자열 중 찾을 occurrence index
 * @returns cursor 또는 range 계산에 쓸 UTF-16 offset
 */
export function locateOffset(
  text: string,
  needle: string,
  characterOffset: number = 0,
  occurrence: number = 0,
): number {
  return locateNthOffset(text, needle, occurrence) + characterOffset;
}

/**
 * positionAt 함수.
 * text 안의 needle occurrence를 LSP Position으로 변환함.
 *
 * @param text - 검색할 host 문서 전문
 * @param needle - 찾을 문자열
 * @param characterOffset - 찾은 위치에서 추가로 이동할 문자 수
 * @param occurrence - 같은 문자열 중 찾을 occurrence index
 * @returns LSP Position 객체
 */
export function positionAt(
  text: string,
  needle: string,
  characterOffset: number = 0,
  occurrence: number = 0,
): Position {
  return offsetToPosition(text, locateOffset(text, needle, characterOffset, occurrence));
}

/**
 * rangeAt 함수.
 * text 안의 needle occurrence 전체를 감싸는 LSP Range를 만듦.
 *
 * @param text - 검색할 host 문서 전문
 * @param needle - 찾을 문자열
 * @param occurrence - 같은 문자열 중 찾을 occurrence index
 * @returns needle 전체를 감싸는 LSP Range 객체
 */
export function rangeAt(text: string, needle: string, occurrence: number = 0): Range {
  const startOffset = locateNthOffset(text, needle, occurrence);
  return {
    start: offsetToPosition(text, startOffset),
    end: offsetToPosition(text, startOffset + needle.length),
  };
}

/**
 * lineOf 함수.
 * text 안의 needle occurrence가 위치한 줄 번호를 반환함.
 *
 * @param text - 검색할 host 문서 전문
 * @param needle - 찾을 문자열
 * @param occurrence - 같은 문자열 중 찾을 occurrence index
 * @returns 0-based line 번호
 */
export function lineOf(text: string, needle: string, occurrence: number = 0): number {
  return positionAt(text, needle, 0, occurrence).line;
}

/**
 * buildRequest 함수.
 * CBS LSP provider 테스트용 text document request 형태를 만듦.
 *
 * @param filePath - file URI로 변환할 fixture 경로
 * @param text - request에 담을 host 문서 전문
 * @param version - 테스트 문서 version
 * @returns provider가 소비하는 text document request 객체
 */
export function buildRequest(
  filePath: string,
  text: string,
  version: number = 1,
): TextDocumentRequestLike {
  return {
    uri: `file://${filePath}`,
    version,
    filePath,
    text,
  };
}

/**
 * getCompletionItems 함수.
 * LSP completion 배열/list 응답을 테스트 비교용 배열로 정규화함.
 *
 * @param result - provider나 connection handler가 반환한 completion 응답
 * @returns completion item 배열
 */
export function getCompletionItems(result: CompletionResult): CompletionItem[] {
  if (!result || result instanceof Promise) {
    return [];
  }

  return Array.isArray(result) ? result : result.items;
}

/**
 * getLastDiagnostics 함수.
 * fake connection에 기록된 마지막 diagnostics publish payload를 가져옴.
 *
 * @param connection - diagnostics 배열을 가진 fake connection
 * @returns 마지막 diagnostics publish payload
 */
export function getLastDiagnostics<TConnection extends DiagnosticsSink>(
  connection: TConnection,
): TConnection['diagnostics'][number] {
  const diagnostics = connection.diagnostics[connection.diagnostics.length - 1];
  expect(diagnostics).toBeDefined();
  return diagnostics!;
}
