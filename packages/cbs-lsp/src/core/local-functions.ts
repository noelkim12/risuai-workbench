/**
 * fragment-local `#func` declaration helpers.
 * @file packages/cbs-lsp/src/core/local-functions.ts
 */

import type { BlockNode, CBSDocument, CBSNode, MacroCallNode, Range } from 'risu-workbench-core';

import { offsetToPosition, positionToOffset } from '../utils/position';
import type { FragmentCursorLookupResult } from './fragment-locator';

/**
 * LocalFunctionDeclaration 인터페이스.
 * fragment-local `#func` 선언의 이름, 위치, 파라미터 계약을 보관함.
 */
export interface LocalFunctionDeclaration {
  name: string;
  range: Range;
  parameters: string[];
  parameterDeclarations: LocalFunctionParameterDeclaration[];
}

/**
 * LocalFunctionParameterDeclaration 인터페이스.
 * `#func` 헤더에 선언된 파라미터의 순서와 위치를 나타냄.
 */
export interface LocalFunctionParameterDeclaration {
  index: number;
  name: string;
  range: Range;
}

/**
 * ActiveLocalFunctionContext 인터페이스.
 * 커서 위치에서 활성화된 로컬 함수 선언과 진입 원천을 나타냄.
 */
export interface ActiveLocalFunctionContext {
  declaration: LocalFunctionDeclaration;
  source: 'func-body' | 'call-macro';
  callArgumentIndex?: number;
}

/**
 * NumberedArgumentReference 인터페이스.
 * `{{arg::N}}` 형태의 numbered argument 참조와 위치를 나타냄.
 */
export interface NumberedArgumentReference {
  index: number;
  rawText: string;
  range: Range;
}

/**
 * collectLocalFunctionDeclarations 함수.
 * fragment-local CBS 문서에서 모든 `#func` 선언을 수집함.
 *
 * @param document - 선언을 찾을 fragment-local CBS 문서
 * @param sourceText - fragment 원문 텍스트
 * @returns 발견된 로컬 함수 선언 목록
 */
export function collectLocalFunctionDeclarations(
  document: Pick<CBSDocument, 'nodes'>,
  sourceText: string,
): LocalFunctionDeclaration[] {
  const declarations: LocalFunctionDeclaration[] = [];
  collectFromNodes(document.nodes, sourceText, declarations);
  return declarations;
}

/**
 * resolveLocalFunctionDeclaration 함수.
 * 현재 fragment 안에서 이름으로 `#func` 선언을 찾음.
 *
 * @param document - 선언 후보를 읽을 fragment-local CBS 문서
 * @param sourceText - fragment 원문 텍스트
 * @param functionName - 찾을 로컬 함수 이름
 * @returns 이름이 일치하는 로컬 함수 선언, 없으면 null
 */
export function resolveLocalFunctionDeclaration(
  document: Pick<CBSDocument, 'nodes'>,
  sourceText: string,
  functionName: string,
): LocalFunctionDeclaration | null {
  return (
    collectLocalFunctionDeclarations(document, sourceText).find(
      (candidate) => candidate.name === functionName,
    ) ?? null
  );
}

/**
 * resolveActiveLocalFunctionContext 함수.
 * 커서가 현재 어느 로컬 `#func` 인자 문맥에 있는지 판별함.
 *
 * @param lookup - fragment locator가 계산한 현재 커서 문맥
 * @returns 현재 활성 로컬 함수 문맥, 없으면 null
 */
export function resolveActiveLocalFunctionContext(
  lookup: FragmentCursorLookupResult,
): ActiveLocalFunctionContext | null {
  const functionBodyContext = findEnclosingFunctionBodyContext(lookup);
  if (functionBodyContext) {
    return functionBodyContext;
  }

  return findCallMacroContext(lookup);
}

/**
 * extractNumberedArgumentReference 함수.
 * `{{arg::N}}` 토큰에서 0-based 인자 슬롯 번호를 추출함.
 *
 * @param node - 검사할 macro call AST 노드
 * @param sourceText - fragment 원문 텍스트
 * @returns 파싱된 인자 슬롯 정보, 유효하지 않으면 null
 */
export function extractNumberedArgumentReference(
  node: MacroCallNode,
  sourceText: string,
): NumberedArgumentReference | null {
  if (normalizeMacroName(node.name) !== 'arg') {
    return null;
  }

  const firstArgument = extractStaticMacroArgument(node, 0, sourceText);
  if (!firstArgument || !/^\d+$/u.test(firstArgument.text)) {
    return null;
  }

  return {
    index: Number.parseInt(firstArgument.text, 10),
    rawText: firstArgument.text,
    range: firstArgument.range,
  };
}

function collectFromNodes(
  nodes: readonly CBSNode[],
  sourceText: string,
  declarations: LocalFunctionDeclaration[],
): void {
  for (const node of nodes) {
    if (node.type === 'Block') {
      const declaration = extractLocalFunctionDeclaration(node, sourceText);
      if (declaration) {
        declarations.push(declaration);
      }

      collectFromNodes(node.condition, sourceText, declarations);
      collectFromNodes(node.body, sourceText, declarations);
      if (node.elseBody) {
        collectFromNodes(node.elseBody, sourceText, declarations);
      }
      continue;
    }

    if (node.type === 'MacroCall') {
      for (const argument of node.arguments) {
        collectFromNodes(argument, sourceText, declarations);
      }
    }
  }
}

function extractLocalFunctionDeclaration(
  node: BlockNode,
  sourceText: string,
): LocalFunctionDeclaration | null {
  if (node.kind !== 'func') {
    return null;
  }

  const openStartOffset = positionToOffset(sourceText, node.openRange.start);
  const openEndOffset = positionToOffset(sourceText, node.openRange.end);
  const headerText = sourceText.slice(openStartOffset, openEndOffset);
  const match = headerText.match(/^\{\{#func\s+([^\s}]+)(?:\s+([^}]+?))?\}\}$/u);
  if (!match?.[1]) {
    return null;
  }

  const name = match[1];
  const nameStartOffset = openStartOffset + headerText.indexOf(name);
  const parameterDeclarations = collectParameterDeclarations(
    sourceText,
    openStartOffset,
    headerText,
    name,
    match[2] ?? '',
  );

  return {
    name,
    range: {
      start: offsetToPosition(sourceText, nameStartOffset),
      end: offsetToPosition(sourceText, nameStartOffset + name.length),
    },
    parameters: parameterDeclarations.map((parameter) => parameter.name),
    parameterDeclarations,
  };
}

/**
 * collectParameterDeclarations 함수.
 * `#func` 헤더에서 각 파라미터 이름과 정의 위치를 추출함.
 *
 * @param headerText - `{{#func ...}}` 전체 헤더 텍스트
 * @param headerStartOffset - fragment 안에서 헤더 시작 오프셋
 * @param functionName - 이미 파싱된 로컬 함수 이름
 * @param rawParameterText - 함수 이름 뒤에 이어지는 원본 파라미터 구간
 * @returns 선언 순서와 위치가 보존된 파라미터 정의 목록
 */
function collectParameterDeclarations(
  sourceText: string,
  headerStartOffset: number,
  headerText: string,
  functionName: string,
  rawParameterText: string,
): LocalFunctionParameterDeclaration[] {
  if (rawParameterText.length === 0) {
    return [];
  }

  const functionNameStart = headerText.indexOf(functionName);
  const searchStart = functionNameStart >= 0 ? functionNameStart + functionName.length : 0;
  const rawParameterStart = headerText.indexOf(rawParameterText, searchStart);
  if (rawParameterStart < 0) {
    return [];
  }

  return Array.from(rawParameterText.matchAll(/\S+/gu)).map((parameterMatch, index) => {
    const parameterName = parameterMatch[0] ?? '';
    const parameterRelativeStart = parameterMatch.index ?? 0;
    const parameterStartOffset = headerStartOffset + rawParameterStart + parameterRelativeStart;

    return {
      index,
      name: parameterName,
      range: {
        start: offsetToPosition(sourceText, parameterStartOffset),
        end: offsetToPosition(sourceText, parameterStartOffset + parameterName.length),
      },
    } satisfies LocalFunctionParameterDeclaration;
  });
}

/**
 * findEnclosingFunctionBodyContext 함수.
 * 커서가 `#func` 헤더가 아닌 body 안에 있을 때 현재 함수 선언을 찾음.
 *
 * @param lookup - fragment cursor lookup 결과
 * @returns 함수 body 문맥이면 활성 로컬 함수 정보, 아니면 null
 */
function findEnclosingFunctionBodyContext(
  lookup: FragmentCursorLookupResult,
): ActiveLocalFunctionContext | null {
  for (let index = lookup.nodePath.length - 1; index >= 0; index -= 1) {
    const candidate = lookup.nodePath[index];
    if (candidate?.type !== 'Block' || candidate.kind !== 'func') {
      continue;
    }

    const openEndOffset = positionToOffset(lookup.fragment.content, candidate.openRange.end);
    const closeStartOffset = candidate.closeRange
      ? positionToOffset(lookup.fragment.content, candidate.closeRange.start)
      : lookup.fragment.content.length;
    if (
      lookup.fragmentLocalOffset < openEndOffset ||
      lookup.fragmentLocalOffset > closeStartOffset
    ) {
      continue;
    }

    const declaration = extractLocalFunctionDeclaration(candidate, lookup.fragment.content);
    if (!declaration) {
      return null;
    }

    return {
      declaration,
      source: 'func-body',
    };
  }

  return null;
}

/**
 * findCallMacroContext 함수.
 * 커서가 `{{call::name::...}}` 안에 있을 때 대상 로컬 함수 문맥을 해석함.
 *
 * @param lookup - fragment cursor lookup 결과
 * @returns call macro 기준 활성 로컬 함수 정보, 없으면 null
 */
function findCallMacroContext(lookup: FragmentCursorLookupResult): ActiveLocalFunctionContext | null {
  for (let index = lookup.nodePath.length - 1; index >= 0; index -= 1) {
    const candidate = lookup.nodePath[index];
    if (candidate?.type !== 'MacroCall' || normalizeMacroName(candidate.name) !== 'call') {
      continue;
    }

    const target = extractStaticMacroArgument(candidate, 0, lookup.fragment.content);
    if (!target) {
      return null;
    }

    const declaration = resolveLocalFunctionDeclaration(
      lookup.fragmentAnalysis.document,
      lookup.fragment.content,
      target.text,
    );
    if (!declaration) {
      return null;
    }

    return {
      declaration,
      source: 'call-macro',
      callArgumentIndex:
        lookup.nodeSpan?.owner.type === 'MacroCall' && lookup.nodeSpan.owner === candidate
          ? lookup.nodeSpan.argumentIndex
          : undefined,
    };
  }

  return null;
}

/**
 * extractStaticMacroArgument 함수.
 * plain-text만으로 이루어진 macro argument를 trim된 문자열로 합침.
 *
 * @param node - 값을 읽을 macro call 노드
 * @param argumentIndex - 읽을 인자 슬롯 번호
 * @param sourceText - fragment 원문 텍스트
 * @returns 정적 인자 문자열과 range, 동적 노드가 섞이면 null
 */
function extractStaticMacroArgument(
  node: MacroCallNode,
  argumentIndex: number,
  sourceText: string,
): { text: string; range: Range } | null {
  const argument = node.arguments[argumentIndex];
  if (!argument || argument.length === 0) {
    return null;
  }

  const firstNode = argument[0];
  const lastNode = argument[argument.length - 1];
  if (!firstNode || !lastNode) {
    return null;
  }

  const literalParts: string[] = [];
  for (const child of argument) {
    if (child.type === 'Comment') {
      continue;
    }

    if (child.type !== 'PlainText') {
      return null;
    }

    literalParts.push(sourceText.slice(
      positionToOffset(sourceText, child.range.start),
      positionToOffset(sourceText, child.range.end),
    ));
  }

  const text = literalParts.join('').trim();
  if (text.length === 0) {
    return null;
  }

  return {
    text,
    range: {
      start: firstNode.range.start,
      end: lastNode.range.end,
    },
  };
}

/**
 * normalizeMacroName 함수.
 * macro 이름 비교를 위해 소문자 lookup key로 정규화함.
 *
 * @param value - 원본 macro 이름
 * @returns 비교용 정규화 이름
 */
function normalizeMacroName(value: string): string {
  return value.toLowerCase().replace(/[\s_-]/gu, '');
}
