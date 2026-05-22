/**
 * Lorebook decorator completion builder.
 * Maps core decorator candidates to LSP CompletionItem objects.
 * @file packages/cbs-lsp/src/features/completion/decorator-completion.ts
 */

import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  MarkupKind,
  Range as LSPRange,
} from 'vscode-languageserver/node';

import {
  getLorebookDecoratorCompletionCandidates,
  getLorebookDecoratorCompletionContext,
  type LorebookDecoratorCompletionContext,
} from 'risu-workbench-core';

/**
 * buildDecoratorCompletions.
 * Maps core decorator completion candidates to LSP CompletionItem objects
 * for a given line-leading `@@` context.
 *
 * @param context - Core decorator completion context (prefix, token offsets)
 * @param line - 0-based line number in the document
 * @returns LSP completion items for matching decorators
 */
export function buildDecoratorCompletions(
  context: LorebookDecoratorCompletionContext,
  line: number,
): CompletionItem[] {
  const candidates = getLorebookDecoratorCompletionCandidates(context.prefix || undefined);

  return candidates.map((candidate) => ({
    label: candidate.label,
    kind: CompletionItemKind.Keyword,
    detail: candidate.detail,
    documentation: {
      kind: MarkupKind.Markdown,
      value: candidate.documentationMarkdown,
    } as const,
    insertText: candidate.insertText,
    insertTextFormat: InsertTextFormat.PlainText,
    sortText: candidate.sortText,
    textEdit: {
      range: LSPRange.create(line, context.tokenStart, line, context.tokenEnd),
      newText: candidate.insertText,
    },
  }));
}

/**
 * detectDecoratorCompletionContext.
 * Examines the current line in the document text to determine whether
 * the cursor is at a line-leading `@@` decorator position.
 *
 * Returns the core decorator completion context if valid, or `null` if
 * the current position does not match decorator syntax.
 *
 * @param text - Full document text
 * @param line - 0-based line number
 * @param character - 0-based character offset within the line
 * @returns Decorator completion context, or null if not applicable
 */
export function detectDecoratorCompletionContext(
  text: string,
  line: number,
  character: number,
): LorebookDecoratorCompletionContext | null {
  const lineStart = computeLineStartOffset(text, line);
  const lineEnd = computeLineEndOffset(text, line);
  const lineText = text.slice(lineStart, lineEnd);
  const cursorOffset = character;

  return getLorebookDecoratorCompletionContext(lineText, cursorOffset);
}

function computeLineStartOffset(text: string, line: number): number {
  if (line === 0) return 0;
  let currentLine = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      currentLine++;
      if (currentLine === line) return i + 1;
    }
  }
  return text.length;
}

function computeLineEndOffset(text: string, line: number): number {
  let currentLine = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      if (currentLine === line) return i;
      currentLine++;
    }
  }
  if (currentLine === line) return text.length;
  return text.length;
}
