/**
 * pure-mode diagnostics 후처리 필터.
 * @file packages/cbs-lsp/src/analyzer/diagnostics/pure-mode-filter.ts
 */

import {
  TokenType,
  type BlockNode,
  type DiagnosticInfo,
  type Range,
} from 'risu-workbench-core';

import {
  findEnclosingPureModeBlockAtRange,
  isPureModeMacroAllowed,
} from '../../core/pure-mode';
import { positionToOffset } from '../../utils/position';
import type { DiagnosticsContext } from './context';

/**
 * filterPureModeDiagnostics 함수.
 * pure-mode body 안의 일반 diagnostics를 숨기고 허용된 macro argument 문맥만 남김.
 *
 * @param context - fragment document/tokens/sourceText를 담은 diagnostics context
 * @param diagnostics - 필터링할 diagnostics 목록
 * @returns pure-mode contract를 통과한 diagnostics 목록
 */
export function filterPureModeDiagnostics(
  context: DiagnosticsContext,
  diagnostics: readonly DiagnosticInfo[],
): DiagnosticInfo[] {
  return diagnostics.filter((diagnostic) => shouldKeepDiagnostic(context, diagnostic));
}

function shouldKeepDiagnostic(
  context: DiagnosticsContext,
  diagnostic: DiagnosticInfo,
): boolean {
  const pureBlock = findEnclosingPureModeBlockAtRange({
    nodes: context.document.nodes.filter((node): node is BlockNode => node.type === 'Block'),
    sourceText: context.sourceText,
    targetRange: diagnostic.range,
  });
  if (!pureBlock) {
    return true;
  }

  const macroContext = resolveMacroArgumentContextAtRange(
    context.tokens,
    context.sourceText,
    diagnostic.range,
  );
  if (!macroContext) {
    return false;
  }

  return isPureModeMacroAllowed(
    pureBlock.kind,
    macroContext.macroName,
    macroContext.argumentIndex,
  );
}

function resolveMacroArgumentContextAtRange(
  tokens: readonly DiagnosticsContext['tokens'][number][],
  sourceText: string,
  range: Range,
): { macroName: string; argumentIndex: number } | null {
  const targetOffset = positionToOffset(sourceText, range.start);
  let tokenIndex = -1;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === TokenType.EOF) {
      continue;
    }

    const startOffset = positionToOffset(sourceText, token.range.start);
    const endOffset = positionToOffset(sourceText, token.range.end);
    if (targetOffset >= startOffset && targetOffset <= endOffset) {
      tokenIndex = index;
      break;
    }
  }

  if (tokenIndex === -1 || tokens[tokenIndex]?.type !== TokenType.Argument) {
    return null;
  }

  let openBraceIndex = -1;
  let separatorCount = 0;
  for (let index = tokenIndex - 1; index >= 0; index -= 1) {
    const token = tokens[index];
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

  const functionNameToken = tokens[openBraceIndex + 1];
  if (functionNameToken?.type !== TokenType.FunctionName) {
    return null;
  }

  return {
    macroName: functionNameToken.value.toLowerCase(),
    argumentIndex: separatorCount - 1,
  };
}
