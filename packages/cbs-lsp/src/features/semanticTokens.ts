import type { CancellationToken } from 'vscode-languageserver/node';
import type { BlockKind, BlockNode, MacroCallNode, Token } from 'risu-workbench-core';
import { CBSBuiltinRegistry, TokenType } from 'risu-workbench-core';
import { SemanticTokens, SemanticTokensParams } from 'vscode-languageserver/node';

import {
  fragmentAnalysisService,
  locateFragmentAtHostPosition,
  resolveTokenMacroArgumentContext,
  shouldSuppressPureModeFeatures,
  type DocumentFragmentAnalysis,
  type FragmentAnalysisRequest,
  type FragmentAnalysisService,
} from '../core';
import { isRequestCancelled } from '../request-cancellation';
import { offsetToPosition, positionToOffset } from '../utils/position';

export const SEMANTIC_TOKEN_TYPES = [
  'function',
  'parameter',
  'variable',
  'keyword',
  'operator',
  'string',
  'number',
  'comment',
  'deprecated',
  'punctuation',
] as const;

export const SEMANTIC_TOKEN_MODIFIERS = ['deprecated', 'readonly'] as const;

type SemanticTokenTypeName = (typeof SEMANTIC_TOKEN_TYPES)[number];
type SemanticTokenModifierName = (typeof SEMANTIC_TOKEN_MODIFIERS)[number];

interface TokenOffsetSpan {
  startOffset: number;
  endOffset: number;
}

interface HostSemanticTokenEntry {
  line: number;
  startChar: number;
  length: number;
  tokenType: number;
  tokenModifiers: number;
}

const TOKEN_TYPE_INDEX = new Map(
  SEMANTIC_TOKEN_TYPES.map((tokenType, index) => [tokenType, index]),
);
const TOKEN_MODIFIER_INDEX = new Map(
  SEMANTIC_TOKEN_MODIFIERS.map((modifier, index) => [modifier, index]),
);

const VARIABLE_ARGUMENT_BUILTINS = new Set([
  'addvar',
  'getglobalvar',
  'gettempvar',
  'getvar',
  'setdefaultvar',
  'setglobalvar',
  'settempvar',
  'setvar',
  'slot',
  'tempvar',
]);
const HEADER_OPERATORS = new Set([
  'and',
  'keep',
  'legacy',
  'not',
  'or',
  'toggle',
  'var',
  'is',
  'isnot',
  'vis',
  'visnot',
  'tis',
  'tisnot',
  '>',
  '<',
  '>=',
  '<=',
]);
const MATH_OPERATORS = ['>=', '<=', '==', '!=', '+', '-', '*', '/', '%', '^', '<', '>', '(', ')'];
const NUMBER_PATTERN = /^[+-]?\d+(?:\.\d+)?$/;

function getTokenTypeIndex(tokenType: SemanticTokenTypeName): number {
  return TOKEN_TYPE_INDEX.get(tokenType) ?? 0;
}

function getTokenModifierMask(modifiers: readonly SemanticTokenModifierName[] = []): number {
  let mask = 0;

  for (const modifier of modifiers) {
    const bitIndex = TOKEN_MODIFIER_INDEX.get(modifier);
    if (bitIndex === undefined) {
      continue;
    }

    mask |= 1 << bitIndex;
  }

  return mask;
}

function createTokenSpan(text: string, token: Token): TokenOffsetSpan {
  return {
    startOffset: positionToOffset(text, token.range.start),
    endOffset: positionToOffset(text, token.range.end),
  };
}

function trimOffsetSpan(text: string, span: TokenOffsetSpan): TokenOffsetSpan | null {
  let startOffset = span.startOffset;
  let endOffset = span.endOffset;

  while (startOffset < endOffset && /\s/u.test(text[startOffset] ?? '')) {
    startOffset += 1;
  }

  while (endOffset > startOffset && /\s/u.test(text[endOffset - 1] ?? '')) {
    endOffset -= 1;
  }

  if (endOffset <= startOffset) {
    return null;
  }

  return { startOffset, endOffset };
}

function trimTokenSpan(text: string, token: Token): TokenOffsetSpan | null {
  return trimOffsetSpan(text, createTokenSpan(text, token));
}

function getHeaderKeywordSpan(text: string, token: Token): TokenOffsetSpan | null {
  const trimmed = trimTokenSpan(text, token);
  if (!trimmed) {
    return null;
  }

  let endOffset = trimmed.startOffset;
  while (endOffset < trimmed.endOffset) {
    const current = text[endOffset] ?? '';
    if (/\s/u.test(current) || current === ':') {
      break;
    }
    endOffset += 1;
  }

  if (endOffset <= trimmed.startOffset) {
    return null;
  }

  return {
    startOffset: trimmed.startOffset,
    endOffset,
  };
}

function isNumberLike(value: string): boolean {
  return NUMBER_PATTERN.test(value.trim());
}

function emitHostOffsetRange(
  entries: HostSemanticTokenEntry[],
  documentText: string,
  hostStartOffset: number,
  hostEndOffset: number,
  tokenType: SemanticTokenTypeName,
  modifiers: readonly SemanticTokenModifierName[] = [],
): void {
  const startOffset = Math.max(0, Math.min(hostStartOffset, documentText.length));
  const endOffset = Math.max(0, Math.min(hostEndOffset, documentText.length));

  if (endOffset <= startOffset) {
    return;
  }

  let cursor = startOffset;
  while (cursor < endOffset) {
    let lineEnd = cursor;
    while (lineEnd < endOffset) {
      const current = documentText[lineEnd];
      if (current === '\r' || current === '\n') {
        break;
      }
      lineEnd += 1;
    }

    if (lineEnd > cursor) {
      const start = offsetToPosition(documentText, cursor);
      entries.push({
        line: start.line,
        startChar: start.character,
        length: lineEnd - cursor,
        tokenType: getTokenTypeIndex(tokenType),
        tokenModifiers: getTokenModifierMask(modifiers),
      });
    }

    if (lineEnd >= endOffset) {
      break;
    }

    if (documentText[lineEnd] === '\r' && documentText[lineEnd + 1] === '\n') {
      cursor = lineEnd + 2;
      continue;
    }

    cursor = lineEnd + 1;
  }
}

function emitLocalOffsetRange(
  entries: HostSemanticTokenEntry[],
  documentText: string,
  request: {
    hostOffsetForLocal(localOffset: number): number | null;
  },
  localStartOffset: number,
  localEndOffset: number,
  tokenType: SemanticTokenTypeName,
  modifiers: readonly SemanticTokenModifierName[] = [],
): void {
  const hostStartOffset = request.hostOffsetForLocal(localStartOffset);
  const hostEndOffset = request.hostOffsetForLocal(localEndOffset);
  if (hostStartOffset === null || hostEndOffset === null) {
    return;
  }

  emitHostOffsetRange(entries, documentText, hostStartOffset, hostEndOffset, tokenType, modifiers);
}

function emitMathExpressionTokens(
  entries: HostSemanticTokenEntry[],
  documentText: string,
  token: Token,
  fragmentContent: string,
  request: {
    hostOffsetForLocal(localOffset: number): number | null;
  },
): void {
  const span = createTokenSpan(fragmentContent, token);
  const raw = fragmentContent.slice(span.startOffset, span.endOffset);
  if (raw.length === 0) {
    return;
  }

  if (raw[0] === '?') {
    emitLocalOffsetRange(
      entries,
      documentText,
      request,
      span.startOffset,
      span.startOffset + 1,
      'operator',
    );
  }

  let cursor = 1;
  while (cursor < raw.length) {
    const current = raw[cursor] ?? '';
    if (/\s/u.test(current)) {
      cursor += 1;
      continue;
    }

    const numberMatch = raw.slice(cursor).match(/^[+-]?\d+(?:\.\d+)?/u);
    if (numberMatch) {
      emitLocalOffsetRange(
        entries,
        documentText,
        request,
        span.startOffset + cursor,
        span.startOffset + cursor + numberMatch[0].length,
        'number',
      );
      cursor += numberMatch[0].length;
      continue;
    }

    const operator = MATH_OPERATORS.find((candidate) => raw.startsWith(candidate, cursor));
    if (operator) {
      emitLocalOffsetRange(
        entries,
        documentText,
        request,
        span.startOffset + cursor,
        span.startOffset + cursor + operator.length,
        'operator',
      );
      cursor += operator.length;
      continue;
    }

    cursor += 1;
  }
}

function classifyArgumentToken(
  lookup: ReturnType<typeof locateFragmentAtHostPosition>,
  token: Token,
  registry: CBSBuiltinRegistry,
): SemanticTokenTypeName {
  const trimmedValue = token.value.trim();
  const tokenMacroContext = lookup ? resolveTokenMacroArgumentContext(lookup) : null;

  if (lookup?.nodeSpan?.category === 'local-function-reference') {
    return 'function';
  }

  if (lookup?.nodeSpan?.category === 'argument-reference') {
    return 'parameter';
  }

  if (tokenMacroContext?.macroName === 'call' && tokenMacroContext.argumentIndex === 0) {
    return 'function';
  }

  if (tokenMacroContext?.macroName === 'arg' && tokenMacroContext.argumentIndex === 0) {
    return 'parameter';
  }

  if (lookup?.nodeSpan?.owner.type === 'Block' && lookup.nodeSpan.category === 'block-header') {
    return HEADER_OPERATORS.has(trimmedValue.toLowerCase())
      ? 'operator'
      : isNumberLike(trimmedValue)
        ? 'number'
        : 'string';
  }

  if (lookup?.nodeSpan?.owner.type === 'MacroCall' && lookup.nodeSpan.category === 'argument') {
    const owner = lookup.nodeSpan.owner as MacroCallNode;
    const builtin = registry.get(owner.name);
    const argumentIndex = lookup.nodeSpan.argumentIndex ?? 0;
    if (builtin && argumentIndex === 0 && VARIABLE_ARGUMENT_BUILTINS.has(builtin.name)) {
      return 'variable';
    }

    return isNumberLike(trimmedValue) ? 'number' : 'string';
  }

  return isNumberLike(trimmedValue) ? 'number' : 'string';
}

function buildSemanticTokenData(entries: readonly HostSemanticTokenEntry[]): number[] {
  const sorted = [...entries].sort(
    (left, right) =>
      left.line - right.line ||
      left.startChar - right.startChar ||
      left.length - right.length ||
      left.tokenType - right.tokenType ||
      left.tokenModifiers - right.tokenModifiers,
  );

  const data: number[] = [];
  let previousLine = 0;
  let previousCharacter = 0;

  for (const entry of sorted) {
    const deltaLine = entry.line - previousLine;
    const deltaStart = deltaLine === 0 ? entry.startChar - previousCharacter : entry.startChar;

    data.push(deltaLine, deltaStart, entry.length, entry.tokenType, entry.tokenModifiers);

    previousLine = entry.line;
    previousCharacter = entry.startChar;
  }

  return data;
}

export class SemanticTokensProvider {
  constructor(
    private readonly analysisService: FragmentAnalysisService = fragmentAnalysisService,
    private readonly registry: CBSBuiltinRegistry = new CBSBuiltinRegistry(),
  ) {}

  provide(
    _params: SemanticTokensParams,
    request: FragmentAnalysisRequest,
    cancellationToken?: CancellationToken,
  ): SemanticTokens {
    if (isRequestCancelled(cancellationToken)) {
      return { data: [] };
    }

    const analysis = this.analysisService.analyzeDocument(request, cancellationToken);
    if (!analysis) {
      return { data: [] };
    }

    const entries: HostSemanticTokenEntry[] = [];

    for (const fragmentAnalysis of analysis.fragmentAnalyses) {
      if (isRequestCancelled(cancellationToken)) {
        return { data: [] };
      }

      const hostOffsetForLocal = (localOffset: number): number | null =>
        fragmentAnalysis.mapper.toHostOffset(localOffset);

      for (const token of fragmentAnalysis.tokens) {
        if (isRequestCancelled(cancellationToken)) {
          return { data: [] };
        }

        if (token.type === TokenType.EOF) {
          continue;
        }

        const span = createTokenSpan(fragmentAnalysis.fragment.content, token);
        const hostStartOffset = hostOffsetForLocal(span.startOffset);
        if (hostStartOffset === null) {
          continue;
        }

        const lookup = locateFragmentAtHostPosition(
          analysis,
          request.text,
          offsetToPosition(request.text, hostStartOffset),
        );

        if (lookup && shouldSuppressPureModeFeatures(lookup)) {
          emitLocalOffsetRange(
            entries,
            request.text,
            { hostOffsetForLocal },
            span.startOffset,
            span.endOffset,
            'string',
          );
          continue;
        }

        switch (token.type) {
          case TokenType.OpenBrace:
          case TokenType.CloseBrace:
          case TokenType.ArgumentSeparator:
            emitLocalOffsetRange(
              entries,
              request.text,
              { hostOffsetForLocal },
              span.startOffset,
              span.endOffset,
              'punctuation',
            );
            break;
          case TokenType.Comment:
            emitLocalOffsetRange(
              entries,
              request.text,
              { hostOffsetForLocal },
              span.startOffset,
              span.endOffset,
              'comment',
            );
            break;
          case TokenType.MathExpression:
            emitMathExpressionTokens(
              entries,
              request.text,
              token,
              fragmentAnalysis.fragment.content,
              { hostOffsetForLocal },
            );
            break;
          case TokenType.FunctionName: {
            const builtin = this.registry.get(token.value);
            const keywordSpan = trimTokenSpan(fragmentAnalysis.fragment.content, token);
            if (!keywordSpan) {
              break;
            }

            emitLocalOffsetRange(
              entries,
              request.text,
              { hostOffsetForLocal },
              keywordSpan.startOffset,
              keywordSpan.endOffset,
              builtin?.deprecated ? 'deprecated' : 'function',
              builtin?.deprecated ? ['deprecated'] : [],
            );
            break;
          }
          case TokenType.BlockStart: {
            const keywordSpan = getHeaderKeywordSpan(fragmentAnalysis.fragment.content, token);
            if (!keywordSpan) {
              break;
            }
            const builtin = this.registry.get(
              fragmentAnalysis.fragment.content.slice(
                keywordSpan.startOffset,
                keywordSpan.endOffset,
              ),
            );

            emitLocalOffsetRange(
              entries,
              request.text,
              { hostOffsetForLocal },
              keywordSpan.startOffset,
              keywordSpan.endOffset,
              builtin?.deprecated ? 'deprecated' : 'keyword',
              builtin?.deprecated ? ['deprecated'] : [],
            );
            break;
          }
          case TokenType.BlockEnd:
          case TokenType.ElseKeyword: {
            const keywordSpan = trimTokenSpan(fragmentAnalysis.fragment.content, token);
            if (!keywordSpan) {
              break;
            }

            emitLocalOffsetRange(
              entries,
              request.text,
              { hostOffsetForLocal },
              keywordSpan.startOffset,
              keywordSpan.endOffset,
              'keyword',
            );
            break;
          }
          case TokenType.AngleBracketMacro: {
            const keywordSpan = trimTokenSpan(fragmentAnalysis.fragment.content, token);
            if (!keywordSpan) {
              break;
            }

            emitLocalOffsetRange(
              entries,
              request.text,
              { hostOffsetForLocal },
              keywordSpan.startOffset,
              keywordSpan.endOffset,
              'function',
            );
            break;
          }
          case TokenType.Argument: {
            const trimmedSpan = trimTokenSpan(fragmentAnalysis.fragment.content, token);
            if (!trimmedSpan) {
              break;
            }

            emitLocalOffsetRange(
              entries,
              request.text,
                { hostOffsetForLocal },
                trimmedSpan.startOffset,
                trimmedSpan.endOffset,
                classifyArgumentToken(lookup, token, this.registry),
              );
              break;
          }
          default:
            break;
        }
      }
    }

    return { data: buildSemanticTokenData(entries) };
  }
}
