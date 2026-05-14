/**
 * Main editor CBS LSP bridge for Monaco webview requests.
 * @file packages/vscode/src/editors/mainEditor/mainEditorLspBridge.ts
 */

import * as vscode from 'vscode';
import {
  mapContentMonacoPositionToSourcePosition,
  mapSourceRangeToContentMonacoRange,
  parseMainEditorDocumentModel,
} from 'risu-workbench-core';
import type {
  MainEditorLspCompletionItemPayload,
  MainEditorLspCompletionRequestPayload,
  MainEditorLspCompletionResponsePayload,
  MainEditorLspDefinitionRequestPayload,
  MainEditorLspDefinitionResponsePayload,
  MainEditorLspDefinitionTargetPayload,
  MainEditorLspHoverRequestPayload,
  MainEditorLspHoverResponsePayload,
  MainEditorMonacoRangePayload,
} from './mainEditorTypes';

export interface MainEditorLspBridgeResult<TPayload> {
  ok: true;
  payload: TPayload;
}

export interface MainEditorLspBridgeFailure {
  ok: false;
  code: 'staleDocument' | 'unsupportedSection' | 'languageClientUnavailable' | 'requestFailed';
  message: string;
}

export interface MainEditorLspBridge {
  completion(
    document: vscode.TextDocument,
    payload: MainEditorLspCompletionRequestPayload,
  ): Promise<MainEditorLspBridgeResult<MainEditorLspCompletionResponsePayload> | MainEditorLspBridgeFailure>;
  hover(
    document: vscode.TextDocument,
    payload: MainEditorLspHoverRequestPayload,
  ): Promise<MainEditorLspBridgeResult<MainEditorLspHoverResponsePayload> | MainEditorLspBridgeFailure>;
  definition(
    document: vscode.TextDocument,
    payload: MainEditorLspDefinitionRequestPayload,
  ): Promise<MainEditorLspBridgeResult<MainEditorLspDefinitionResponsePayload> | MainEditorLspBridgeFailure>;
}

interface MappedRequest {
  model: ReturnType<typeof parseMainEditorDocumentModel>;
  position: vscode.Position;
}

/**
 * createMainEditorLspBridge 함수.
 * Monaco CONTENT request를 canonical TextDocument 좌표 기반 CBS language request로 변환함.
 *
 * @returns main editor LSP bridge handler 묶음
 */
export function createMainEditorLspBridge(): MainEditorLspBridge {
  return {
    async completion(document, payload) {
      const mapped = await prepareRequest(document, payload);
      if (!mapped.ok) return mapped;
      try {
        const result = await vscode.commands.executeCommand<vscode.CompletionList | vscode.CompletionItem[]>(
          'vscode.executeCompletionItemProvider',
          document.uri,
          mapped.payload.position,
          payload.triggerCharacter,
        );
        const items = Array.isArray(result) ? result : result.items;
        return {
          ok: true,
          payload: {
            requestId: payload.requestId,
            documentUri: document.uri.toString(),
            documentVersion: document.version,
            items: items.map((item) => serializeCompletionItem(item, mapped.payload.model)),
            incomplete: Array.isArray(result) ? false : (result.isIncomplete ?? false),
          },
        };
      } catch (error) {
        return createFailure(error);
      }
    },
    async hover(document, payload) {
      const mapped = await prepareRequest(document, payload);
      if (!mapped.ok) return mapped;
      try {
        const hovers = await vscode.commands.executeCommand<vscode.Hover[]>('vscode.executeHoverProvider', document.uri, mapped.payload.position);
        const firstRange = hovers.find((hover) => hover.range)?.range;
        const range = firstRange ? convertSourceRange(document, mapped.payload.model, firstRange) : undefined;
        return {
          ok: true,
          payload: {
            requestId: payload.requestId,
            documentUri: document.uri.toString(),
            documentVersion: document.version,
            contents: hovers.flatMap((hover) => hover.contents.map(markedStringToText)),
            range,
          },
        };
      } catch (error) {
        return createFailure(error);
      }
    },
    async definition(document, payload) {
      const mapped = await prepareRequest(document, payload);
      if (!mapped.ok) return mapped;
      try {
        const definitions = await vscode.commands.executeCommand<Array<vscode.Location | vscode.LocationLink>>(
          'vscode.executeDefinitionProvider',
          document.uri,
          mapped.payload.position,
        );
        return {
          ok: true,
          payload: {
            requestId: payload.requestId,
            documentUri: document.uri.toString(),
            documentVersion: document.version,
            targets: definitions.map((definition) => serializeDefinitionTarget(document, mapped.payload.model, definition)),
          },
        };
      } catch (error) {
        return createFailure(error);
      }
    },
  };
}

async function prepareRequest(
  document: vscode.TextDocument,
  payload: MainEditorLspCompletionRequestPayload | MainEditorLspHoverRequestPayload | MainEditorLspDefinitionRequestPayload,
): Promise<MainEditorLspBridgeResult<MappedRequest> | MainEditorLspBridgeFailure> {
  if (payload.documentVersion !== document.version) {
    return { ok: false, code: 'staleDocument', message: 'The Monaco request was based on an older TextDocument version.' };
  }
  if (payload.documentUri !== document.uri.toString()) {
    return { ok: false, code: 'staleDocument', message: 'The Monaco request document URI does not match the open TextDocument.' };
  }

  const { getCbsLanguageClientRuntimeState } = await import('../../lsp/cbsLanguageClient');
  const runtime = getCbsLanguageClientRuntimeState();
  if (!runtime.isStarted || !runtime.client?.isRunning()) {
    return { ok: false, code: 'languageClientUnavailable', message: 'CBS language client is not ready.' };
  }

  const model = parseMainEditorDocumentModel('lorebook', document.getText());
  const sourcePosition = mapContentMonacoPositionToSourcePosition(model, payload.sectionName, payload.position);
  if (!sourcePosition) {
    return { ok: false, code: 'unsupportedSection', message: `Phase 4 only supports CONTENT LSP requests; received ${payload.sectionName}.` };
  }

  return {
    ok: true,
    payload: {
      model,
      position: new vscode.Position(sourcePosition.line, sourcePosition.character),
    },
  };
}

function serializeCompletionItem(
  item: vscode.CompletionItem,
  model: ReturnType<typeof parseMainEditorDocumentModel>,
): MainEditorLspCompletionItemPayload {
  return {
    label: completionLabelToText(item.label),
    kind: item.kind,
    detail: item.detail,
    documentation: completionDocumentationToText(item.documentation),
    insertText: completionInsertTextToText(item.insertText, completionLabelToText(item.label)),
    insertTextFormat: completionInsertTextFormat(item.insertText),
    range: completionRangeToMonacoRange(item.range, model),
  };
}

function serializeDefinitionTarget(
  document: vscode.TextDocument,
  model: ReturnType<typeof parseMainEditorDocumentModel>,
  definition: vscode.Location | vscode.LocationLink,
): MainEditorLspDefinitionTargetPayload {
  const isLocationLink = 'targetUri' in definition;
  const uri = isLocationLink ? definition.targetUri : definition.uri;
  const range = isLocationLink ? (definition.targetSelectionRange ?? definition.targetRange) : definition.range;
  const sameDocument = uri.toString() === document.uri.toString();
  return {
    uri: uri.toString(),
    range: sameDocument ? convertSourceRange(document, model, range) : vscodeRangeToOneBasedRange(range),
    sameDocument,
  };
}

function completionRangeToMonacoRange(
  range: vscode.CompletionItem['range'],
  model: ReturnType<typeof parseMainEditorDocumentModel>,
): MainEditorMonacoRangePayload | undefined {
  if (!range) return undefined;
  if ('inserting' in range) return convertOffsetRange(model, range.inserting);
  return convertOffsetRange(model, range);
}

function convertSourceRange(
  document: vscode.TextDocument,
  model: ReturnType<typeof parseMainEditorDocumentModel>,
  range: vscode.Range,
): MainEditorMonacoRangePayload {
  const mapped = convertOffsetRange(model, range, document);
  return mapped ?? vscodeRangeToOneBasedRange(range);
}

function convertOffsetRange(
  model: ReturnType<typeof parseMainEditorDocumentModel>,
  range: vscode.Range,
  document?: vscode.TextDocument,
): MainEditorMonacoRangePayload | undefined {
  const source = document ?? createTextDocumentLike(model.source);
  const mapped = mapSourceRangeToContentMonacoRange(model, 'CONTENT', {
    startOffset: source.offsetAt(range.start),
    endOffset: source.offsetAt(range.end),
  });
  return mapped ?? undefined;
}

function createTextDocumentLike(source: string): Pick<vscode.TextDocument, 'offsetAt'> {
  const lineStarts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\n') lineStarts.push(index + 1);
  }
  return {
    offsetAt(position) {
      const line = Math.max(0, Math.min(position.line, lineStarts.length - 1));
      const nextLineStart = line + 1 < lineStarts.length ? lineStarts[line + 1] : source.length;
      return Math.max(lineStarts[line], Math.min(lineStarts[line] + position.character, nextLineStart));
    },
  };
}

function vscodeRangeToOneBasedRange(range: vscode.Range): MainEditorMonacoRangePayload {
  return {
    startLineNumber: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLineNumber: range.end.line + 1,
    endColumn: range.end.character + 1,
  };
}

function completionLabelToText(label: string | vscode.CompletionItemLabel): string {
  return typeof label === 'string' ? label : label.label;
}

function completionInsertTextToText(insertText: string | vscode.SnippetString | undefined, fallback: string): string {
  if (typeof insertText === 'string') return insertText;
  if (insertText) return insertText.value;
  return fallback;
}

function completionInsertTextFormat(insertText: string | vscode.SnippetString | undefined): MainEditorLspCompletionItemPayload['insertTextFormat'] {
  return insertText instanceof vscode.SnippetString ? 'snippet' : undefined;
}

function completionDocumentationToText(documentation: string | vscode.MarkdownString | undefined): string | undefined {
  if (typeof documentation === 'string') return documentation;
  return documentation?.value;
}

function markedStringToText(value: string | vscode.MarkdownString | { language: string; value: string }): string {
  if (typeof value === 'string') return value;
  if ('language' in value) return value.value;
  return value.value;
}

function createFailure(error: unknown): MainEditorLspBridgeFailure {
  return { ok: false, code: 'requestFailed', message: error instanceof Error ? error.message : 'CBS language request failed.' };
}
