/**
 * LuaLS 응답 URI와 표시 문자열을 source `.risulua` 기준으로 되돌리는 helper 모음.
 * @file packages/cbs-lsp/src/providers/lua/lualsResponseRemapper.ts
 */

import type {
  CompletionItem,
  CompletionList,
  Definition,
  DocumentSymbol,
  Hover,
  Location,
  LocationLink,
  MarkupContent,
  SymbolInformation,
  WorkspaceEdit,
} from 'vscode-languageserver/node';

export interface LuaLsUriRemapResolver {
  resolveSourceUriFromTransportUri(uri: string): string | null;
  getTransportToSourceUriEntries?(): Iterable<readonly [transportUri: string, sourceUri: string]>;
}

export type LuaLsDocumentSymbolResult = DocumentSymbol[] | SymbolInformation[];

export interface LuaLsRemapContext {
  sourceUri: string;
  transportUri: string;
  remapText(text: string): string;
  remapUri(uri: string): string;
}

type LuaLsDocumentChange = NonNullable<WorkspaceEdit['documentChanges']>[number];
type LuaLsMarkupStringObject = MarkupContent | { language: string; value: string };

/**
 * remapKnownLuaLsUrisInText 함수.
 * LuaLS user-visible 문자열 안의 알려진 shadow URI만 source URI로 치환함.
 *
 * @param text - hover/completion에 표시될 문자열
 * @param transportToSourceUri - 안전하게 치환할 transport/source URI map
 * @returns 알려진 shadow URI가 source URI로 바뀐 문자열
 */
function remapKnownLuaLsUrisInText(text: string, transportToSourceUri: ReadonlyMap<string, string>): string {
  let remappedText = text;
  for (const [transportUri, sourceUri] of transportToSourceUri) {
    remappedText = remappedText.split(transportUri).join(sourceUri);
  }
  return remappedText;
}

/**
 * createLuaLsRemapContext 함수.
 * 현재 요청 문서 fallback과 workspace-wide resolver를 합쳐 LuaLS URI remap context를 만듦.
 *
 * @param sourceUri - 원본 `.risulua` URI
 * @param transportUri - 현재 요청의 shadow `.lua` URI
 * @param resolver - workspace-wide transport/source URI resolver
 * @returns URI와 표시 문자열을 remap하는 요청 단위 context
 */
export function createLuaLsRemapContext(
  sourceUri: string,
  transportUri: string,
  resolver?: LuaLsUriRemapResolver,
): LuaLsRemapContext {
  const transportToSourceUri = new Map<string, string>();

  for (const [knownTransportUri, knownSourceUri] of resolver?.getTransportToSourceUriEntries?.() ?? []) {
    transportToSourceUri.set(knownTransportUri, knownSourceUri);
  }

  transportToSourceUri.set(transportUri, sourceUri);

  return {
    sourceUri,
    transportUri,
    remapText: (text) => remapKnownLuaLsUrisInText(text, transportToSourceUri),
    remapUri: (uri) => transportToSourceUri.get(uri) ?? resolver?.resolveSourceUriFromTransportUri(uri) ?? uri,
  };
}

/**
 * remapLuaLsStringValue 함수.
 * string 또는 MarkupContent/MarkedString 형태의 user-visible 값을 remap함.
 *
 * @param value - remap할 값
 * @param context - LuaLS URI remap context
 * @returns 표시 문자열 안의 알려진 shadow URI가 source URI로 바뀐 값
 */
function remapLuaLsStringValue<TValue extends string | LuaLsMarkupStringObject>(
  value: TValue,
  context: LuaLsRemapContext,
): TValue {
  if (typeof value === 'string') {
    return context.remapText(value) as TValue;
  }

  const objectValue: LuaLsMarkupStringObject = value;
  return {
    ...objectValue,
    value: context.remapText(objectValue.value),
  } as TValue;
}

/**
 * remapLuaLsHover 함수.
 * Hover range는 보존하고 contents의 표시 문자열만 source URI 기준으로 바꿈.
 *
 * @param hover - LuaLS hover 응답
 * @param context - LuaLS URI remap context
 * @returns source URI 기준 hover 응답
 */
export function remapLuaLsHover(hover: Hover | null, context: LuaLsRemapContext): Hover | null {
  if (!hover) {
    return null;
  }

  if (typeof hover.contents === 'string') {
    return {
      ...hover,
      contents: context.remapText(hover.contents),
    };
  }

  if (Array.isArray(hover.contents)) {
    return {
      ...hover,
      contents: hover.contents.map((entry) => remapLuaLsStringValue(entry, context)),
    };
  }

  return {
    ...hover,
    contents: remapLuaLsStringValue(hover.contents, context),
  };
}

/**
 * remapLuaLsCompletionResult 함수.
 * CompletionItem 배열과 CompletionList 양쪽의 표시 문자열을 source URI 기준으로 바꿈.
 *
 * @param completion - LuaLS completion 응답
 * @param context - LuaLS URI remap context
 * @returns source URI 기준 completion 응답
 */
export function remapLuaLsCompletionResult(
  completion: CompletionItem[] | CompletionList | null,
  context: LuaLsRemapContext,
): CompletionItem[] | CompletionList {
  if (!completion) {
    return [];
  }

  const remapItem = (item: CompletionItem): CompletionItem => ({
    ...item,
    ...(item.detail ? { detail: context.remapText(item.detail) } : {}),
    ...(item.documentation
      ? { documentation: remapLuaLsStringValue(item.documentation, context) }
      : {}),
  });

  if (Array.isArray(completion)) {
    return completion.map(remapItem);
  }

  return {
    ...completion,
    items: completion.items.map(remapItem),
  };
}

/**
 * isLocationLink 함수.
 * LuaLS definition 응답 항목이 LocationLink shape인지 좁힘.
 *
 * @param value - 검사할 definition entry
 * @returns LocationLink이면 true
 */
function isLocationLink(value: Location | LocationLink): value is LocationLink {
  return 'targetUri' in value;
}

/**
 * remapLuaLsLocation 함수.
 * Location의 URI를 source URI 기준으로 되돌림.
 *
 * @param location - LuaLS Location 응답
 * @param context - LuaLS URI remap context
 * @returns source URI 기준 Location
 */
function remapLuaLsLocation(location: Location, context: LuaLsRemapContext): Location {
  return {
    ...location,
    uri: context.remapUri(location.uri),
  };
}

/**
 * remapLuaLsDefinitionResult 함수.
 * LuaLS definition 응답에 포함된 shadow document URI를 source URI로 되돌림.
 *
 * @param definition - LuaLS definition 응답
 * @param context - LuaLS URI remap context
 * @returns VS Code client가 열 수 있는 source URI 기준 definition 응답
 */
export function remapLuaLsDefinitionResult(
  definition: Definition | null,
  context: LuaLsRemapContext,
): Definition | null {
  if (!definition) {
    return null;
  }

  const entries = Array.isArray(definition) ? definition : [definition];
  const remapped = entries.map((entry) => {
    if (isLocationLink(entry)) {
      return {
        ...entry,
        targetUri: context.remapUri(entry.targetUri),
      };
    }

    return remapLuaLsLocation(entry, context);
  });

  return Array.isArray(definition) ? remapped as Definition : remapped[0] as Definition;
}

/**
 * remapLuaLsLocations 함수.
 * LuaLS location 배열에 포함된 shadow document URI를 source URI로 되돌림.
 *
 * @param locations - LuaLS location 응답
 * @param context - LuaLS URI remap context
 * @returns source URI 기준 location 배열
 */
export function remapLuaLsLocations(locations: Location[] | null, context: LuaLsRemapContext): Location[] {
  return locations?.map((location) => remapLuaLsLocation(location, context)) ?? [];
}

/**
 * mergeRemappedChanges 함수.
 * WorkspaceEdit.changes key를 remap하고 같은 source URI로 모이면 edit 배열을 병합함.
 *
 * @param changes - LuaLS WorkspaceEdit changes map
 * @param context - LuaLS URI remap context
 * @returns source URI 기준으로 병합된 changes map
 */
function mergeRemappedChanges(
  changes: NonNullable<WorkspaceEdit['changes']>,
  context: LuaLsRemapContext,
): NonNullable<WorkspaceEdit['changes']> {
  const remappedChanges: NonNullable<WorkspaceEdit['changes']> = {};

  for (const [uri, edits] of Object.entries(changes)) {
    const remappedUri = context.remapUri(uri);
    remappedChanges[remappedUri] = [...(remappedChanges[remappedUri] ?? []), ...edits];
  }

  return remappedChanges;
}

/**
 * remapLuaLsDocumentChange 함수.
 * WorkspaceEdit.documentChanges 안의 TextDocumentEdit/FileOperation URI를 source URI 기준으로 되돌림.
 *
 * @param change - LuaLS documentChanges entry
 * @param context - LuaLS URI remap context
 * @returns source URI 기준 documentChanges entry
 */
function remapLuaLsDocumentChange(
  change: LuaLsDocumentChange,
  context: LuaLsRemapContext,
): LuaLsDocumentChange {
  if ('textDocument' in change) {
    return {
      ...change,
      textDocument: {
        ...change.textDocument,
        uri: context.remapUri(change.textDocument.uri),
      },
    };
  }

  if ('kind' in change && change.kind === 'rename') {
    return {
      ...change,
      oldUri: context.remapUri(change.oldUri),
      newUri: context.remapUri(change.newUri),
    };
  }

  return {
    ...change,
    uri: context.remapUri(change.uri),
  };
}

/**
 * remapLuaLsWorkspaceEdit 함수.
 * LuaLS rename WorkspaceEdit 안의 shadow URI를 원본 `.risulua` URI로 되돌림.
 *
 * @param edit - LuaLS rename 응답
 * @param context - LuaLS URI remap context
 * @returns source URI 기준 WorkspaceEdit
 */
export function remapLuaLsWorkspaceEdit(
  edit: WorkspaceEdit | null,
  context: LuaLsRemapContext,
): WorkspaceEdit | null {
  if (!edit) {
    return null;
  }

  const changes = edit.changes ? mergeRemappedChanges(edit.changes, context) : undefined;
  const documentChanges = edit.documentChanges?.map((change) => remapLuaLsDocumentChange(change, context));

  return {
    ...edit,
    ...(changes ? { changes } : {}),
    ...(documentChanges ? { documentChanges } : {}),
  };
}

/**
 * isLuaLsSymbolInformation 함수.
 * LuaLS documentSymbol 응답 항목이 flat SymbolInformation shape인지 좁힘.
 *
 * @param symbol - 검사할 document symbol entry
 * @returns SymbolInformation이면 true
 */
export function isLuaLsSymbolInformation(symbol: DocumentSymbol | SymbolInformation): symbol is SymbolInformation {
  return 'location' in symbol;
}

/**
 * remapLuaLsDocumentSymbols 함수.
 * SymbolInformation location URI를 source URI 기준으로 되돌리고 DocumentSymbol tree는 보존함.
 *
 * @param symbols - LuaLS documentSymbol 응답
 * @param context - LuaLS URI remap context
 * @returns source URI 기준 document symbol 응답
 */
export function remapLuaLsDocumentSymbols(
  symbols: LuaLsDocumentSymbolResult | null,
  context: LuaLsRemapContext,
): LuaLsDocumentSymbolResult {
  if (!symbols) {
    return [];
  }

  if (symbols.every(isLuaLsSymbolInformation)) {
    return symbols.map((symbol) => ({
      ...symbol,
      location: remapLuaLsLocation(symbol.location, context),
    }));
  }

  return symbols.filter((symbol): symbol is DocumentSymbol => !isLuaLsSymbolInformation(symbol));
}
