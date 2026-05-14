/**
 * Main Editor advanced LSP command bridge helpers.
 * @file packages/vscode/src/editors/mainEditor/mainEditorAdvancedLsp.ts
 */

import * as vscode from 'vscode';
import type {
  MainEditorAdvancedLspErrorPayload,
  MainEditorCodeLensPayload,
  MainEditorCodeLensRequestPayload,
  MainEditorCodeLensResultPayload,
  MainEditorFormatKind,
  MainEditorLocationPayload,
  MainEditorPrepareRenameRequestPayload,
  MainEditorPrepareRenameResultPayload,
  MainEditorReferencesRequestPayload,
  MainEditorReferencesResultPayload,
  MainEditorRenameRequestPayload,
  MainEditorRenameResultPayload,
  MainEditorSectionName,
  MainEditorWorkspaceEditPayload,
  MainEditorWorkspaceSymbolPayload,
  MainEditorWorkspaceSymbolsRequestPayload,
  MainEditorWorkspaceSymbolsResultPayload,
} from './mainEditorTypes';
import { mapMainEditorMonacoPositionToSource, mapMainEditorSourceRangeToMonaco } from './mainEditorAdvancedLspMapping';

interface SerializableLocationInput {
  uri: string;
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
}

type AdvancedLspResult<TPayload> = { ok: true; payload: TPayload } | { ok: false; error: MainEditorAdvancedLspErrorPayload };

/**
 * serializeMainEditorLocation 함수.
 * VS Code location-like 값을 JSON 직렬화 가능한 Main Editor location DTO로 변환함.
 *
 * @param input - URI 문자열과 source range
 * @returns serializable location payload
 */
export function serializeMainEditorLocation(input: SerializableLocationInput): MainEditorLocationPayload {
  return {
    uri: input.uri,
    sourceRange: {
      start: { line: input.range.start.line, character: input.range.start.character },
      end: { line: input.range.end.line, character: input.range.end.character },
    },
  };
}

/**
 * createMainEditorRenameSummary 함수.
 * host-applied rename 결과를 사용자에게 보여줄 짧은 요약으로 만듦.
 *
 * @param input - affected URI 목록과 새 이름
 * @returns rename 요약 문구
 */
export function createMainEditorRenameSummary(input: { affectedUris: string[]; newName: string }): string {
  return `Rename to ${input.newName} will update ${input.affectedUris.length} file(s).`;
}

export function serializeLocations(locations: readonly vscode.Location[], document: vscode.TextDocument, formatKind: MainEditorFormatKind, sectionName: MainEditorSectionName): MainEditorLocationPayload[] {
  return locations.map((location) => withSameDocumentMonacoRange(serializeMainEditorLocation({ uri: location.uri.toString(), range: serializeRange(location.range) }), document, formatKind, sectionName));
}

export function serializeCodeLenses(codeLenses: readonly vscode.CodeLens[], document: vscode.TextDocument, formatKind: MainEditorFormatKind, sectionName: MainEditorSectionName): MainEditorCodeLensPayload[] {
  return codeLenses.map((lens) => {
    const sourceRange = serializeRange(lens.range);
    const monacoRange = mapMainEditorSourceRangeToMonaco({ sourceText: document.getText(), formatKind, sectionName, sourceRange });
    return {
      sourceRange,
      ...(monacoRange ? { monacoRange } : {}),
      title: lens.command?.title ?? 'CodeLens',
      command: lens.command?.command,
      arguments: lens.command?.arguments,
      tooltip: lens.command?.tooltip,
    };
  });
}

export function serializeWorkspaceSymbols(symbols: readonly vscode.SymbolInformation[]): MainEditorWorkspaceSymbolPayload[] {
  return symbols.map((symbol) => ({
    name: symbol.name,
    kind: symbol.kind,
    containerName: symbol.containerName,
    location: serializeMainEditorLocation({ uri: symbol.location.uri.toString(), range: serializeRange(symbol.location.range) }),
  }));
}

export function serializeWorkspaceEdit(editId: string, edit: vscode.WorkspaceEdit, newName: string): MainEditorWorkspaceEditPayload {
  const affectedUris = edit.entries().map(([uri]) => uri.toString());
  return {
    editId,
    affectedUris,
    summary: createMainEditorRenameSummary({ affectedUris, newName }),
  };
}

export function createAdvancedLspError(
  requestId: string,
  kind: MainEditorAdvancedLspErrorPayload['kind'],
  code: MainEditorAdvancedLspErrorPayload['code'],
  message: string,
): MainEditorAdvancedLspErrorPayload {
  return { requestId, kind, code, message };
}

export async function createMainEditorReferencesResult(document: vscode.TextDocument, payload: MainEditorReferencesRequestPayload): Promise<AdvancedLspResult<MainEditorReferencesResultPayload>> {
  const position = prepareSourcePosition(document, payload, 'references');
  if (!position.ok) return position;
  try {
    const locations = await vscode.commands.executeCommand<vscode.Location[]>('vscode.executeReferenceProvider', document.uri, position.value);
    return { ok: true, payload: { requestId: payload.requestId, locations: serializeLocations(locations ?? [], document, payload.formatKind, payload.sectionName) } };
  } catch (error) {
    return { ok: false, error: toError(payload.requestId, 'references', 'provider-unavailable', error) };
  }
}

export async function createMainEditorPrepareRenameResult(document: vscode.TextDocument, payload: MainEditorPrepareRenameRequestPayload): Promise<AdvancedLspResult<MainEditorPrepareRenameResultPayload>> {
  const position = prepareSourcePosition(document, payload, 'prepareRename');
  if (!position.ok) return position;
  try {
    const result = await vscode.commands.executeCommand<{ range: vscode.Range; placeholder: string } | vscode.Range | undefined>('vscode.prepareRename', document.uri, position.value);
    const normalized = normalizePrepareRenameResult(result, document, payload.formatKind, payload.sectionName);
    return { ok: true, payload: { requestId: payload.requestId, ...normalized } };
  } catch (error) {
    return { ok: false, error: toError(payload.requestId, 'prepareRename', 'rename-rejected', error) };
  }
}

export async function createMainEditorRenameResult(document: vscode.TextDocument, payload: MainEditorRenameRequestPayload): Promise<AdvancedLspResult<MainEditorRenameResultPayload>> {
  const position = prepareSourcePosition(document, payload, 'rename');
  if (!position.ok) return position;
  try {
    const edit = await vscode.commands.executeCommand<vscode.WorkspaceEdit | undefined>('vscode.executeDocumentRenameProvider', document.uri, position.value, payload.newName);
    if (!edit) return { ok: false, error: createAdvancedLspError(payload.requestId, 'rename', 'rename-rejected', 'Rename provider did not return edits.') };
    if (payload.documentVersion !== document.version) {
      return { ok: false, error: createAdvancedLspError(payload.requestId, 'rename', 'stale-document', 'Rename result is stale because the document changed before apply.') };
    }
    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) return { ok: false, error: createAdvancedLspError(payload.requestId, 'rename', 'rename-rejected', 'VS Code rejected the rename workspace edit.') };
    return { ok: true, payload: { requestId: payload.requestId, edit: serializeWorkspaceEdit(`rename-${payload.requestId}`, edit, payload.newName) } };
  } catch (error) {
    return { ok: false, error: toError(payload.requestId, 'rename', 'rename-rejected', error) };
  }
}

export async function createMainEditorCodeLensResult(document: vscode.TextDocument, payload: MainEditorCodeLensRequestPayload): Promise<AdvancedLspResult<MainEditorCodeLensResultPayload>> {
  const guard = validateDocumentRequest(document, payload, 'codeLens');
  if (!guard.ok) return guard;
  try {
    const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>('vscode.executeCodeLensProvider', document.uri, 100);
    return { ok: true, payload: { requestId: payload.requestId, lenses: serializeCodeLenses(lenses ?? [], document, payload.formatKind, payload.sectionName) } };
  } catch (error) {
    return { ok: false, error: toError(payload.requestId, 'codeLens', 'provider-unavailable', error) };
  }
}

export async function createMainEditorWorkspaceSymbolsResult(payload: MainEditorWorkspaceSymbolsRequestPayload): Promise<AdvancedLspResult<MainEditorWorkspaceSymbolsResultPayload>> {
  try {
    const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>('vscode.executeWorkspaceSymbolProvider', payload.query);
    return { ok: true, payload: { requestId: payload.requestId, symbols: serializeWorkspaceSymbols((symbols ?? []).slice(0, payload.limit)) } };
  } catch (error) {
    return { ok: false, error: toError(payload.requestId, 'workspaceSymbols', 'provider-unavailable', error) };
  }
}

function prepareSourcePosition(
  document: vscode.TextDocument,
  payload: MainEditorReferencesRequestPayload | MainEditorPrepareRenameRequestPayload | MainEditorRenameRequestPayload,
  kind: 'references' | 'prepareRename' | 'rename',
): { ok: true; value: vscode.Position } | { ok: false; error: MainEditorAdvancedLspErrorPayload } {
  const guard = validateDocumentRequest(document, payload, kind);
  if (!guard.ok) return guard;
  const mapped = mapMainEditorMonacoPositionToSource({ sourceText: document.getText(), formatKind: payload.formatKind, sectionName: payload.sectionName, position: payload.position });
  if (!mapped) return { ok: false, error: createAdvancedLspError(payload.requestId, kind, 'unsupported-section', 'The requested editor section cannot be mapped to the source document.') };
  return { ok: true, value: new vscode.Position(mapped.line, mapped.character) };
}

function validateDocumentRequest(
  document: vscode.TextDocument,
  payload: MainEditorReferencesRequestPayload | MainEditorPrepareRenameRequestPayload | MainEditorRenameRequestPayload | MainEditorCodeLensRequestPayload,
  kind: MainEditorAdvancedLspErrorPayload['kind'],
): { ok: true } | { ok: false; error: MainEditorAdvancedLspErrorPayload } {
  if (payload.documentUri !== document.uri.toString()) return { ok: false, error: createAdvancedLspError(payload.requestId, kind, 'stale-document', 'Request document URI does not match the open document.') };
  if (payload.documentVersion !== document.version) return { ok: false, error: createAdvancedLspError(payload.requestId, kind, 'stale-document', 'Request is based on an older document version.') };
  return { ok: true };
}

function serializeRange(range: vscode.Range): MainEditorLocationPayload['sourceRange'] {
  return {
    start: { line: range.start.line, character: range.start.character },
    end: { line: range.end.line, character: range.end.character },
  };
}

function withSameDocumentMonacoRange(location: MainEditorLocationPayload, document: vscode.TextDocument, formatKind: MainEditorFormatKind, sectionName: MainEditorSectionName): MainEditorLocationPayload {
  if (location.uri !== document.uri.toString()) return location;
  const monacoRange = mapMainEditorSourceRangeToMonaco({ sourceText: document.getText(), formatKind, sectionName, sourceRange: location.sourceRange });
  return monacoRange ? { ...location, sectionName, monacoRange } : location;
}

function normalizePrepareRenameResult(result: { range: vscode.Range; placeholder: string } | vscode.Range | undefined, document: vscode.TextDocument, formatKind: MainEditorFormatKind, sectionName: MainEditorSectionName): Omit<MainEditorPrepareRenameResultPayload, 'requestId'> {
  if (!result) return { placeholder: '', rejected: true };
  if (result instanceof vscode.Range) {
    return { placeholder: '', rejected: false, range: mapMainEditorSourceRangeToMonaco({ sourceText: document.getText(), formatKind, sectionName, sourceRange: serializeRange(result) }) ?? undefined };
  }
  return {
    placeholder: result.placeholder,
    rejected: false,
    range: mapMainEditorSourceRangeToMonaco({ sourceText: document.getText(), formatKind, sectionName, sourceRange: serializeRange(result.range) }) ?? undefined,
  };
}

function toError(requestId: string, kind: MainEditorAdvancedLspErrorPayload['kind'], code: MainEditorAdvancedLspErrorPayload['code'], error: unknown): MainEditorAdvancedLspErrorPayload {
  const message = error instanceof Error ? error.message : 'Advanced LSP request failed.';
  return createAdvancedLspError(requestId, kind, code, message);
}
