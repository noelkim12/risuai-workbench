/**
 * RisuLua modular require("...") completion overlay.
 * @file packages/cbs-lsp/src/features/completion/risulua-module-completion.ts
 */

import {
  CompletionItemKind,
  InsertTextFormat,
  type CompletionItem,
  type CompletionParams,
  Range as LSPRange,
} from 'vscode-languageserver/node';

import type { FragmentAnalysisRequest } from '../../core';
import { listRisuLuaModuleIdsForCompletion } from '../../analyzer/diagnostics/risulua-modular-diagnostics';

interface RequireCompletionContext {
  prefix: string;
  replacementRange: LSPRange;
}

export function buildRisuLuaModuleIdCompletions(context: {
  params: CompletionParams;
  request: FragmentAnalysisRequest | null;
}): CompletionItem[] {
  const { params, request } = context;
  if (!request) return [];

  const completionContext = resolveRequireCompletionContext(request.text, params.position);
  if (!completionContext) return [];

  return listRisuLuaModuleIdsForCompletion(request.filePath)
    .filter((moduleId) => moduleId.startsWith(completionContext.prefix))
    .map((moduleId) => ({
      label: moduleId,
      kind: CompletionItemKind.Module,
      detail: 'RisuLua source module',
      documentation: {
        kind: 'markdown',
        value: [
          `**RisuLua module:** \`${moduleId}\``,
          '',
          '- Source: modular `lua/**/*.risulua` workspace module discovery',
          '- Excludes `lua/main.risulua`, generated `dist/**`, and generated files',
        ].join('\n'),
      },
      insertText: moduleId,
      insertTextFormat: InsertTextFormat.PlainText,
      sortText: `0000-${moduleId}`,
      textEdit: {
        range: completionContext.replacementRange,
        newText: moduleId,
      },
    } satisfies CompletionItem));
}

function resolveRequireCompletionContext(
  text: string,
  position: CompletionParams['position'],
): RequireCompletionContext | null {
  const offset = offsetFromPosition(text, position);
  if (offset === null) return null;
  const prefix = text.slice(0, offset);
  const match = /require\(\s*["']([A-Za-z0-9_.]*)$/u.exec(prefix);
  if (!match) return null;
  const typedPrefix = match[1] ?? '';
  const startOffset = offset - typedPrefix.length;
  return {
    prefix: typedPrefix,
    replacementRange: LSPRange.create(positionFromOffset(text, startOffset), position),
  };
}

function offsetFromPosition(text: string, position: CompletionParams['position']): number | null {
  let line = 0;
  let character = 0;
  for (let index = 0; index <= text.length; index += 1) {
    if (line === position.line && character === position.character) return index;
    if (index === text.length) break;
    if (text[index] === '\n') {
      line += 1;
      character = 0;
    } else {
      character += 1;
    }
  }
  return null;
}

function positionFromOffset(text: string, offset: number): CompletionParams['position'] {
  let line = 0;
  let character = 0;
  const boundedOffset = Math.max(0, Math.min(offset, text.length));
  for (let index = 0; index < boundedOffset; index += 1) {
    if (text[index] === '\n') {
      line += 1;
      character = 0;
    } else {
      character += 1;
    }
  }
  return { line, character };
}
