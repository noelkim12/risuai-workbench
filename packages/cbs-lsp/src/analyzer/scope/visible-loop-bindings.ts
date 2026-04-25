/**
 * 현재 cursor 기준 visible `#each` alias 계산 유틸.
 * @file packages/cbs-lsp/src/analyzer/scope/visible-loop-bindings.ts
 */

import { type CBSNode } from 'risu-workbench-core';

import { offsetToPosition } from '../../utils/position';
import { type EachLoopBinding, extractEachLoopBinding } from '../block-header';

interface OpenEachFrame {
  binding: EachLoopBinding | null;
}

/**
 * collectVisibleLoopBindingsFromNodePath 함수.
 * 현재 cursor nodePath에서 보이는 `#each ... as alias` binding을 안쪽 scope 우선순위로 수집함.
 *
 * @param nodePath - cursor 위치를 감싸는 AST node path
 * @param sourceText - loop binding range를 계산할 fragment 원문
 * @param fragmentLocalOffset - malformed recovery 기준으로 현재 cursor 앞 fragment 범위를 제한할 local offset
 * @returns shadowing을 반영한 visible loop binding 목록
 */
export function collectVisibleLoopBindingsFromNodePath(
  nodePath: readonly CBSNode[],
  sourceText: string,
  fragmentLocalOffset?: number,
): EachLoopBinding[] {
  const visibleBindings: EachLoopBinding[] = [];
  const seenBindings = new Set<string>();

  const appendBinding = (binding: EachLoopBinding | null) => {
    if (!binding || seenBindings.has(binding.bindingName)) {
      return;
    }

    seenBindings.add(binding.bindingName);
    visibleBindings.push(binding);
  };

  if (sourceText.length > 0 && fragmentLocalOffset !== undefined) {
    for (const binding of collectVisibleLoopBindingsFromSource(sourceText, fragmentLocalOffset)) {
      appendBinding(binding);
    }
  }

  if (sourceText.length > 0) {
    for (let index = nodePath.length - 1; index >= 0; index -= 1) {
      const node = nodePath[index];
      if (node?.type !== 'Block' || node.kind !== 'each') {
        continue;
      }

      appendBinding(extractEachLoopBinding(node, sourceText));
    }
  }

  return visibleBindings;
}

/**
 * resolveVisibleLoopBindingFromNodePath 함수.
 * 현재 cursor에서 실제로 보이는 `slot::name` loop alias binding을 shadowing 우선순위까지 반영해 찾음.
 *
 * @param nodePath - cursor 위치를 감싸는 AST node path
 * @param sourceText - binding range를 계산할 fragment 원문
 * @param bindingName - `slot::` 뒤에서 찾을 alias 이름
 * @param fragmentLocalOffset - malformed recovery까지 포함해 현재 visible scope를 복원할 cursor offset
 * @returns 현재 scope에서 연결된 binding과 relative scope depth, 없으면 null
 */
export function resolveVisibleLoopBindingFromNodePath(
  nodePath: readonly CBSNode[],
  sourceText: string,
  bindingName: string,
  fragmentLocalOffset?: number,
): { binding: EachLoopBinding; scopeDepth: number } | null {
  const visibleBindings = collectVisibleLoopBindingsFromNodePath(
    nodePath,
    sourceText,
    fragmentLocalOffset,
  );
  const normalizedBindingName = bindingName.trim();
  if (normalizedBindingName.length === 0) {
    return null;
  }

  const scopeDepth = visibleBindings.findIndex(
    (binding) => binding.bindingName === normalizedBindingName,
  );
  if (scopeDepth === -1) {
    return null;
  }

  return {
    binding: visibleBindings[scopeDepth],
    scopeDepth,
  };
}

/**
 * collectVisibleLoopBindingsFromSource 함수.
 * cursor 앞 fragment text를 스택처럼 훑어 malformed recovery 상황에서도 현재 visible `#each` alias를 복원함.
 *
 * @param sourceText - 현재 fragment 원문
 * @param fragmentLocalOffset - cursor fragment-local offset
 * @returns 안쪽 scope 우선순위로 정렬된 recoverable loop binding 목록
 */
function collectVisibleLoopBindingsFromSource(
  sourceText: string,
  fragmentLocalOffset: number,
): EachLoopBinding[] {
  const prefixText = sourceText.slice(0, fragmentLocalOffset);
  const frames: OpenEachFrame[] = [];
  const macroPattern = /\{\{([\s\S]*?)\}\}/g;

  for (const match of prefixText.matchAll(macroPattern)) {
    const rawMacro = match[1]?.trim() ?? '';
    if (/^\/each\b/i.test(rawMacro)) {
      frames.pop();
      continue;
    }

    if (!/^#each\b/i.test(rawMacro)) {
      continue;
    }

    frames.push({
      binding: extractEachLoopBindingFromMacroText(
        match[0],
        rawMacro,
        match.index ?? 0,
        sourceText,
      ),
    });
  }

  const visibleBindings: EachLoopBinding[] = [];
  const seenBindings = new Set<string>();

  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const binding = frames[index]?.binding;
    if (!binding || seenBindings.has(binding.bindingName)) {
      continue;
    }

    seenBindings.add(binding.bindingName);
    visibleBindings.push(binding);
  }

  return visibleBindings;
}

/**
 * extractEachLoopBindingFromMacroText 함수.
 * raw `{{#each ...}}` text에서 recovery-safe loop alias를 추출함.
 *
 * @param fullMacroText - braces를 포함한 전체 macro text
 * @param rawMacroText - braces 안쪽 raw text
 * @param macroStartOffset - sourceText 기준 macro 시작 offset
 * @param sourceText - position 계산에 쓸 fragment 원문
 * @returns 파싱된 loop binding 정보, 없으면 null
 */
function extractEachLoopBindingFromMacroText(
  fullMacroText: string,
  rawMacroText: string,
  macroStartOffset: number,
  sourceText: string,
): EachLoopBinding | null {
  const headerText = rawMacroText.replace(/^#each\b/i, '').trim();
  if (headerText.length === 0) {
    return null;
  }

  const asMatch = headerText.match(/^(.*?)\s+as\s+(.+)$/i);
  const shorthandMatch = asMatch ? null : headerText.match(/^(\S+)\s+(\S+)$/u);
  const iteratorExpression = (asMatch?.[1] ?? shorthandMatch?.[1] ?? '').trim();
  const bindingName = (asMatch?.[2] ?? shorthandMatch?.[2] ?? '').trim();
  if (
    !iteratorExpression ||
    !bindingName ||
    bindingName.toLowerCase() === 'as' ||
    !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(bindingName)
  ) {
    return null;
  }

  const bindingIndex = fullMacroText.lastIndexOf(bindingName);
  const iteratorIndex = fullMacroText.indexOf(iteratorExpression);
  if (bindingIndex === -1 || iteratorIndex === -1) {
    return null;
  }

  const iteratorStartOffset = macroStartOffset + iteratorIndex;
  const iteratorEndOffset = iteratorStartOffset + iteratorExpression.length;
  const bindingStartOffset = macroStartOffset + bindingIndex;
  const bindingEndOffset = bindingStartOffset + bindingName.length;

  return {
    iteratorExpression,
    iteratorRange: {
      start: offsetToPosition(sourceText, iteratorStartOffset),
      end: offsetToPosition(sourceText, iteratorEndOffset),
    },
    bindingName,
    bindingRange: {
      start: offsetToPosition(sourceText, bindingStartOffset),
      end: offsetToPosition(sourceText, bindingEndOffset),
    },
  };
}
