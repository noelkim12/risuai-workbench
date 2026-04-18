import { TokenType, type Range as CBSRange } from 'risu-workbench-core';
import { positionToOffset } from '../utils/position';
import type { FragmentCursorLookupResult } from './fragment-locator';

export type CompletionTriggerContext =
  | { type: 'all-functions'; prefix: string; startOffset: number; endOffset: number }
  | { type: 'block-functions'; prefix: string; startOffset: number; endOffset: number }
  | { type: 'else-keyword'; prefix: string; startOffset: number; endOffset: number }
  | { type: 'close-tag'; prefix: string; startOffset: number; endOffset: number; blockKind: string }
  | {
      type: 'variable-names';
      prefix: string;
      startOffset: number;
      endOffset: number;
      kind: 'chat' | 'temp';
    }
  | { type: 'metadata-keys'; prefix: string; startOffset: number; endOffset: number }
  | { type: 'when-operators'; prefix: string; startOffset: number; endOffset: number }
  | { type: 'none' };

/**
 * Detects completion trigger context from fragment cursor lookup.
 * This is a shared seam that interprets the parsed token stream to determine
 * what kind of completions should be offered at the cursor position.
 *
 * This implementation is strictly token/nodePath-driven from the shared analysis seam.
 * It uses only token types, token ranges, nodePath, and fragment-local offsets.
 * No raw fragment text parsing is performed.
 */
export function detectCompletionTriggerContext(
  lookup: FragmentCursorLookupResult,
): CompletionTriggerContext {
  const { fragmentLocalOffset, token, nodePath, fragmentAnalysis } = lookup;
  const tokens = fragmentAnalysis.tokens;

  // Helper to find parent macro from node path
  const findParentMacro = (): { name: string; range: CBSRange } | null => {
    for (let i = nodePath.length - 1; i >= 0; i--) {
      const node = nodePath[i];
      if (node?.type === 'MacroCall') {
        return node as unknown as { name: string; range: CBSRange };
      }
    }
    return null;
  };

  // Helper to find open block kind
  const findOpenBlockKind = (): string | null => {
    for (let i = nodePath.length - 1; i >= 0; i--) {
      const node = nodePath[i];
      if (node?.type === 'Block') {
        return node.kind;
      }
    }
    return null;
  };

  // Helper to find when block in nodePath
  const findWhenBlock = (): { openRange: CBSRange } | null => {
    for (const n of nodePath) {
      if (n.type === 'Block' && n.kind === 'when') {
        return n as { openRange: CBSRange };
      }
    }
    return null;
  };

  // Helper to find the OpenBrace token that starts the current macro context
  const findOpenBraceToken = (): { index: number; offset: number } | null => {
    let startIndex = tokens.length - 1;
    for (let i = tokens.length - 1; i >= 0; i--) {
      const t = tokens[i];
      const tStart = positionToOffset(fragmentAnalysis.fragment.content, t.range.start);
      const tEnd = positionToOffset(fragmentAnalysis.fragment.content, t.range.end);

      if (
        tEnd <= fragmentLocalOffset ||
        (tStart <= fragmentLocalOffset && tEnd > fragmentLocalOffset)
      ) {
        startIndex = i;
        break;
      }
    }

    for (let i = startIndex; i >= 0; i--) {
      const t = tokens[i];
      const tStart = positionToOffset(fragmentAnalysis.fragment.content, t.range.start);

      if (t.type === TokenType.OpenBrace) {
        return { index: i, offset: tStart };
      }
      if (t.type === TokenType.CloseBrace && i < startIndex) {
        return null;
      }
    }
    return null;
  };

  // Helper to find the last ArgumentSeparator before cursor
  const findLastSeparatorBeforeCursor = (): {
    token: (typeof tokens)[0];
    offset: number;
  } | null => {
    for (let i = tokens.length - 1; i >= 0; i--) {
      const t = tokens[i];
      const tEnd = positionToOffset(fragmentAnalysis.fragment.content, t.range.end);
      if (t.type === TokenType.ArgumentSeparator && tEnd <= fragmentLocalOffset) {
        return {
          token: t,
          offset: positionToOffset(fragmentAnalysis.fragment.content, t.range.start),
        };
      }
    }
    return null;
  };

  // Helper to extract prefix from a token's end to cursor position
  const getPrefixFromTokenEnd = (t: (typeof tokens)[0]): string => {
    const tokenEnd = positionToOffset(fragmentAnalysis.fragment.content, t.range.end);
    if (fragmentLocalOffset <= tokenEnd) return '';
    // For incomplete syntax, the "prefix" is the partial text the user has typed
    // We return empty string since we can't extract it without content.slice
    // The completion provider will use empty prefix to show all options
    return '';
  };

  // Determine context based on token type and node information
  if (token) {
    const tokenStart = positionToOffset(fragmentAnalysis.fragment.content, token.token.range.start);
    const tokenEnd = positionToOffset(fragmentAnalysis.fragment.content, token.token.range.end);

    // Case 1: When operators - cursor is in a #when block header after an ArgumentSeparator
    const whenBlock = findWhenBlock();
    if (whenBlock) {
      const headerEnd = positionToOffset(
        fragmentAnalysis.fragment.content,
        whenBlock.openRange.end,
      );
      const headerStart = positionToOffset(
        fragmentAnalysis.fragment.content,
        whenBlock.openRange.start,
      );
      if (fragmentLocalOffset <= headerEnd && fragmentLocalOffset >= headerStart) {
        const lastSeparator = findLastSeparatorBeforeCursor();
        if (lastSeparator !== null && lastSeparator.offset >= headerStart) {
          const sepEnd = positionToOffset(
            fragmentAnalysis.fragment.content,
            lastSeparator.token.range.end,
          );
          if (fragmentLocalOffset >= sepEnd) {
            return {
              type: 'when-operators',
              prefix: getPrefixFromTokenEnd(lastSeparator.token),
              startOffset: sepEnd,
              endOffset: fragmentLocalOffset,
            };
          }
        }
      }
    }

    // Case 2: Variable names - cursor is in getvar/gettempvar argument
    if (
      token.token.type === TokenType.Argument ||
      token.token.type === TokenType.FunctionName ||
      token.token.type === TokenType.ArgumentSeparator
    ) {
      const parentMacro = findParentMacro();
      if (parentMacro) {
        const macroName = parentMacro.name.toLowerCase();
        const macroNameStart = positionToOffset(
          fragmentAnalysis.fragment.content,
          parentMacro.range.start,
        );

        if (fragmentLocalOffset > macroNameStart) {
          if (macroName === 'getvar' || macroName === 'setvar' || macroName === 'addvar') {
            const prefixStart =
              token.token.type === TokenType.ArgumentSeparator ? tokenEnd : tokenStart;
            return {
              type: 'variable-names',
              prefix: '',
              startOffset: prefixStart,
              endOffset: fragmentLocalOffset,
              kind: 'chat',
            };
          }

          if (macroName === 'gettempvar' || macroName === 'settempvar' || macroName === 'tempvar') {
            const prefixStart =
              token.token.type === TokenType.ArgumentSeparator ? tokenEnd : tokenStart;
            return {
              type: 'variable-names',
              prefix: '',
              startOffset: prefixStart,
              endOffset: fragmentLocalOffset,
              kind: 'temp',
            };
          }

          if (macroName === 'metadata') {
            const prefixStart =
              token.token.type === TokenType.ArgumentSeparator ? tokenEnd : tokenStart;
            return {
              type: 'metadata-keys',
              prefix: '',
              startOffset: prefixStart,
              endOffset: fragmentLocalOffset,
            };
          }
        }
      }
    }

    // Case 3: BlockEnd token - close tag completion
    if (token.token.type === TokenType.BlockEnd) {
      const blockKind = findOpenBlockKind();
      const openBrace = findOpenBraceToken();
      if (openBrace !== null) {
        return {
          type: 'close-tag',
          prefix: '',
          startOffset: openBrace.offset + 3,
          endOffset: fragmentLocalOffset,
          blockKind: blockKind ?? '',
        };
      }
    }

    // Case 4: CloseBrace token - check for macro argument completion first, then close tag
    if (token.token.type === TokenType.CloseBrace) {
      const openBrace = findOpenBraceToken();
      if (openBrace !== null) {
        // Check if we're in a macro argument context (for variable/metadata completion)
        const parentMacro = findParentMacro();
        if (parentMacro) {
          const macroName = parentMacro.name.toLowerCase();
          const macroNameStart = positionToOffset(
            fragmentAnalysis.fragment.content,
            parentMacro.range.start,
          );

          if (fragmentLocalOffset > macroNameStart) {
            // Check for variable macros (getvar, setvar, addvar)
            if (macroName === 'getvar' || macroName === 'setvar' || macroName === 'addvar') {
              return {
                type: 'variable-names',
                prefix: '',
                startOffset: fragmentLocalOffset,
                endOffset: fragmentLocalOffset,
                kind: 'chat',
              };
            }

            // Check for temp variable macros
            if (macroName === 'gettempvar' || macroName === 'settempvar' || macroName === 'tempvar') {
              return {
                type: 'variable-names',
                prefix: '',
                startOffset: fragmentLocalOffset,
                endOffset: fragmentLocalOffset,
                kind: 'temp',
              };
            }

            // Check for metadata macro
            if (macroName === 'metadata') {
              return {
                type: 'metadata-keys',
                prefix: '',
                startOffset: fragmentLocalOffset,
                endOffset: fragmentLocalOffset,
              };
            }
          }
        }

        // Fall back to close-tag completion for block contexts
        const blockKind = findOpenBlockKind();
        return {
          type: 'close-tag',
          prefix: '',
          startOffset: openBrace.offset + 3,
          endOffset: fragmentLocalOffset,
          blockKind: blockKind ?? '',
        };
      }
    }

    // Case 5: PlainText token - might be incomplete macro syntax
    // Two scenarios:
    // 1. There's an OpenBrace before this PlainText (complete macro before incomplete text)
    // 2. The PlainText itself starts with {{ (unclosed macro treated as PlainText by tokenizer)
    if (token.token.type === TokenType.PlainText) {
      // Scenario 1: Check if there's an OpenBrace token before this PlainText
      const openBrace = findOpenBraceToken();
      if (openBrace !== null) {
        // Look at the next token after OpenBrace to determine context
        const nextToken = tokens[openBrace.index + 1];
        if (nextToken) {
          // Check for BlockStart ({{#...)
          if (nextToken.type === TokenType.BlockStart) {
            return {
              type: 'block-functions',
              prefix: '',
              startOffset: openBrace.offset + 3,
              endOffset: fragmentLocalOffset,
            };
          }
          // Check for BlockEnd ({{/...)
          if (nextToken.type === TokenType.BlockEnd) {
            const blockKind = findOpenBlockKind();
            return {
              type: 'close-tag',
              prefix: '',
              startOffset: openBrace.offset + 3,
              endOffset: fragmentLocalOffset,
              blockKind: blockKind ?? '',
            };
          }
          // Check for ElseKeyword ({{:...)
          if (nextToken.type === TokenType.ElseKeyword) {
            return {
              type: 'else-keyword',
              prefix: '',
              startOffset: openBrace.offset + 3,
              endOffset: fragmentLocalOffset,
            };
          }
          // Check for FunctionName ({{getvar::, {{metadata::, etc.)
          if (nextToken.type === TokenType.FunctionName) {
            const funcName = nextToken.value.toLowerCase();
            const separatorToken = tokens[openBrace.index + 2];

            if (separatorToken?.type === TokenType.ArgumentSeparator) {
              const sepEnd = positionToOffset(
                fragmentAnalysis.fragment.content,
                separatorToken.range.end,
              );

              if (funcName === 'getvar' || funcName === 'setvar' || funcName === 'addvar') {
                if (fragmentLocalOffset >= sepEnd) {
                  return {
                    type: 'variable-names',
                    prefix: '',
                    startOffset: sepEnd,
                    endOffset: fragmentLocalOffset,
                    kind: 'chat',
                  };
                }
              }
              if (
                funcName === 'gettempvar' ||
                funcName === 'settempvar' ||
                funcName === 'tempvar'
              ) {
                if (fragmentLocalOffset >= sepEnd) {
                  return {
                    type: 'variable-names',
                    prefix: '',
                    startOffset: sepEnd,
                    endOffset: fragmentLocalOffset,
                    kind: 'temp',
                  };
                }
              }
              if (funcName === 'metadata') {
                if (fragmentLocalOffset >= sepEnd) {
                  return {
                    type: 'metadata-keys',
                    prefix: '',
                    startOffset: sepEnd,
                    endOffset: fragmentLocalOffset,
                  };
                }
              }
            }

            return {
              type: 'all-functions',
              prefix: '',
              startOffset: openBrace.offset + 2,
              endOffset: fragmentLocalOffset,
            };
          }
        }

        // If no next token, default to all-functions
        return {
          type: 'all-functions',
          prefix: '',
          startOffset: openBrace.offset + 2,
          endOffset: fragmentLocalOffset,
        };
      }
    }

    // Case 6: ElseKeyword token
    if (token.token.type === TokenType.ElseKeyword) {
      const openBrace = findOpenBraceToken();
      if (openBrace !== null) {
        return {
          type: 'else-keyword',
          prefix: '',
          startOffset: openBrace.offset + 3,
          endOffset: fragmentLocalOffset,
        };
      }
    }

    // Case 7: BlockStart token - block functions
    if (token.token.type === TokenType.BlockStart) {
      const openBrace = findOpenBraceToken();
      if (openBrace !== null) {
        return {
          type: 'block-functions',
          prefix: '',
          startOffset: openBrace.offset + 3,
          endOffset: fragmentLocalOffset,
        };
      }
    }

    // Case 8: FunctionName token - check for specific macros or default to all functions
    if (token.token.type === TokenType.FunctionName) {
      const openBrace = findOpenBraceToken();
      if (openBrace !== null) {
        const funcName = token.token.value.toLowerCase();
        const nextTokenIndex = token.tokenIndex + 1;
        const separatorToken = tokens[nextTokenIndex];

        if (separatorToken?.type === TokenType.ArgumentSeparator) {
          const sepEnd = positionToOffset(
            fragmentAnalysis.fragment.content,
            separatorToken.range.end,
          );

          if (funcName === 'getvar' || funcName === 'setvar' || funcName === 'addvar') {
            if (fragmentLocalOffset >= sepEnd) {
              return {
                type: 'variable-names',
                prefix: '',
                startOffset: sepEnd,
                endOffset: fragmentLocalOffset,
                kind: 'chat',
              };
            }
          }

          if (funcName === 'gettempvar' || funcName === 'settempvar' || funcName === 'tempvar') {
            if (fragmentLocalOffset >= sepEnd) {
              return {
                type: 'variable-names',
                prefix: '',
                startOffset: sepEnd,
                endOffset: fragmentLocalOffset,
                kind: 'temp',
              };
            }
          }

          if (funcName === 'metadata') {
            if (fragmentLocalOffset >= sepEnd) {
              return {
                type: 'metadata-keys',
                prefix: '',
                startOffset: sepEnd,
                endOffset: fragmentLocalOffset,
              };
            }
          }
        }

        return {
          type: 'all-functions',
          prefix: '',
          startOffset: openBrace.offset + 2,
          endOffset: fragmentLocalOffset,
        };
      }
    }
  }

  // Fallback: When cursor is between tokens, use token stream analysis
  const openBrace = findOpenBraceToken();
  if (openBrace !== null) {
    // Check if we're in a when block context (for when operators)
    const whenBlockInPath = findWhenBlock();
    if (whenBlockInPath) {
      const headerEnd = positionToOffset(
        fragmentAnalysis.fragment.content,
        whenBlockInPath.openRange.end,
      );
      const headerStart = positionToOffset(
        fragmentAnalysis.fragment.content,
        whenBlockInPath.openRange.start,
      );
      if (fragmentLocalOffset <= headerEnd && fragmentLocalOffset >= headerStart) {
        const lastSeparator = findLastSeparatorBeforeCursor();
        if (lastSeparator !== null && lastSeparator.offset >= headerStart) {
          const sepEnd = positionToOffset(
            fragmentAnalysis.fragment.content,
            lastSeparator.token.range.end,
          );
          if (fragmentLocalOffset >= sepEnd) {
            return {
              type: 'when-operators',
              prefix: '',
              startOffset: sepEnd,
              endOffset: fragmentLocalOffset,
            };
          }
        }
      }
    }

    // Look at the next token after OpenBrace to determine context
    const nextToken = tokens[openBrace.index + 1];
    if (nextToken) {
      const nextType = nextToken.type;
      const nextStart = positionToOffset(fragmentAnalysis.fragment.content, nextToken.range.start);
      const nextEnd = positionToOffset(fragmentAnalysis.fragment.content, nextToken.range.end);

      // If cursor is between {{ and the next token
      if (fragmentLocalOffset >= openBrace.offset && fragmentLocalOffset <= nextStart) {
        if (nextType === TokenType.BlockStart) {
          return {
            type: 'block-functions',
            prefix: '',
            startOffset: openBrace.offset + 3,
            endOffset: fragmentLocalOffset,
          };
        }
        if (nextType === TokenType.BlockEnd) {
          const blockKind = findOpenBlockKind();
          return {
            type: 'close-tag',
            prefix: '',
            startOffset: openBrace.offset + 3,
            endOffset: fragmentLocalOffset,
            blockKind: blockKind ?? '',
          };
        }
        if (nextType === TokenType.ElseKeyword) {
          return {
            type: 'else-keyword',
            prefix: '',
            startOffset: openBrace.offset + 3,
            endOffset: fragmentLocalOffset,
          };
        }
        if (nextType === TokenType.FunctionName) {
          return {
            type: 'all-functions',
            prefix: '',
            startOffset: openBrace.offset + 2,
            endOffset: fragmentLocalOffset,
          };
        }
      }

      // If cursor is after the next token (for incomplete syntax)
      if (fragmentLocalOffset > nextEnd) {
        if (nextType === TokenType.FunctionName) {
          const funcName = nextToken.value.toLowerCase();
          const separatorToken = tokens[openBrace.index + 2];
          if (separatorToken?.type === TokenType.ArgumentSeparator) {
            const sepEnd = positionToOffset(
              fragmentAnalysis.fragment.content,
              separatorToken.range.end,
            );

            if (fragmentLocalOffset >= sepEnd) {
              if (funcName === 'getvar' || funcName === 'setvar' || funcName === 'addvar') {
                return {
                  type: 'variable-names',
                  prefix: '',
                  startOffset: sepEnd,
                  endOffset: fragmentLocalOffset,
                  kind: 'chat',
                };
              }
              if (
                funcName === 'gettempvar' ||
                funcName === 'settempvar' ||
                funcName === 'tempvar'
              ) {
                return {
                  type: 'variable-names',
                  prefix: '',
                  startOffset: sepEnd,
                  endOffset: fragmentLocalOffset,
                  kind: 'temp',
                };
              }
              if (funcName === 'metadata') {
                return {
                  type: 'metadata-keys',
                  prefix: '',
                  startOffset: sepEnd,
                  endOffset: fragmentLocalOffset,
                };
              }
            }
          }

          return {
            type: 'all-functions',
            prefix: '',
            startOffset: openBrace.offset + 2,
            endOffset: fragmentLocalOffset,
          };
        }
      }
    }

    // Default: all-functions for plain {{
    return {
      type: 'all-functions',
      prefix: '',
      startOffset: openBrace.offset + 2,
      endOffset: fragmentLocalOffset,
    };
  }

  return { type: 'none' };
}
