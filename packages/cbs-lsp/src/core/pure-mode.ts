/**
 * CBS pure-mode block helpers shared across providers.
 * @file packages/cbs-lsp/src/core/pure-mode.ts
 */

import { TokenType, type BlockKind, type BlockNode } from 'risu-workbench-core';

import type { FragmentCursorLookupResult } from './fragment-locator';
import { positionToOffset } from '../utils/position';

export interface TokenMacroArgumentContext {
  macroName: string;
  argumentIndex: number;
}

export const PURE_MODE_BLOCKS = new Set<BlockKind>(['each', 'escape', 'pure', 'puredisplay', 'func']);

const PURE_MODE_ALLOWED_MACROS: Readonly<Record<BlockKind, readonly string[]>> = {
  each: ['slot'],
  escape: [],
  func: ['arg', 'call'],
  if: [],
  if_pure: [],
  pure: [],
  puredisplay: [],
  when: [],
};

/**
 * resolveTokenMacroArgumentContext 함수.
 * 현재 커서가 어떤 macro argument 슬롯 위에 있는지 token stream 기준으로 해석함.
 *
 * @param lookup - fragment locator가 계산한 현재 커서 문맥
 * @returns macro 이름과 argument index, 아니면 null
 */
export function resolveTokenMacroArgumentContext(
  lookup: Pick<FragmentCursorLookupResult, 'token' | 'fragmentAnalysis'>,
): TokenMacroArgumentContext | null {
  const tokenLookup = lookup.token;
  if (!tokenLookup || tokenLookup.category !== 'argument') {
    return null;
  }

  let openBraceIndex = -1;
  let separatorCount = 0;
  for (let index = tokenLookup.tokenIndex - 1; index >= 0; index -= 1) {
    const token = lookup.fragmentAnalysis.tokens[index];
    if (token.type === TokenType.CloseBrace) {
      return null;
    }
    if (token.type === TokenType.ArgumentSeparator) {
      separatorCount += 1;
    }
    if (token.type === TokenType.OpenBrace) {
      openBraceIndex = index;
      break;
    }
  }

  if (openBraceIndex === -1 || separatorCount < 1) {
    return null;
  }

  const functionNameToken = lookup.fragmentAnalysis.tokens[openBraceIndex + 1];
  if (functionNameToken?.type !== TokenType.FunctionName) {
    return null;
  }

  return {
    macroName: functionNameToken.value.toLowerCase(),
    argumentIndex: separatorCount - 1,
  };
}

/**
 * findEnclosingPureModeBlock 함수.
 * 현재 node path에서 가장 가까운 pure-mode block body 문맥을 찾음.
 *
 * @param lookup - fragment locator가 계산한 현재 커서 문맥
 * @returns pure-mode block body를 감싸는 block, 없으면 null
 */
export function findEnclosingPureModeBlock(
  lookup: Pick<FragmentCursorLookupResult, 'nodePath' | 'fragmentLocalOffset' | 'fragment'>,
): BlockNode | null {
  for (let index = lookup.nodePath.length - 1; index >= 0; index -= 1) {
    const candidate = lookup.nodePath[index];
    if (candidate?.type !== 'Block' || !PURE_MODE_BLOCKS.has(candidate.kind)) {
      continue;
    }

    const openEndOffset = positionToOffset(lookup.fragment.content, candidate.openRange.end);
    const closeStartOffset = candidate.closeRange
      ? positionToOffset(lookup.fragment.content, candidate.closeRange.start)
      : lookup.fragment.content.length;
    if (
      lookup.fragmentLocalOffset >= openEndOffset &&
      lookup.fragmentLocalOffset <= closeStartOffset
    ) {
      return candidate;
    }
  }

  return null;
}

/**
 * shouldSuppressPureModeFeatures 함수.
 * pure-mode body 안에서 대부분의 feature를 억제하고, block별 예외 token만 살려둠.
 *
 * @param lookup - fragment locator가 계산한 현재 커서 문맥
 * @returns 현재 위치의 feature를 억제해야 하면 true
 */
export function shouldSuppressPureModeFeatures(lookup: FragmentCursorLookupResult): boolean {
  const pureBlock = findEnclosingPureModeBlock(lookup);
  if (!pureBlock) {
    return false;
  }

  const tokenContext = resolveTokenMacroArgumentContext(lookup);
  if (!tokenContext) {
    return true;
  }

  const allowedMacros = PURE_MODE_ALLOWED_MACROS[pureBlock.kind] ?? [];
  return !(tokenContext.argumentIndex === 0 && allowedMacros.includes(tokenContext.macroName));
}
