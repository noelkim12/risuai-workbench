/**
 * LuaLS request/response proxy seam for shadow-mirrored Lua language features.
 * @file packages/cbs-lsp/src/providers/lua/lualsProxy.ts
 */

import type {
  CancellationToken,
  CompletionItem,
  CompletionList,
  CompletionParams,
  Definition,
  DefinitionParams,
  DocumentHighlight,
  DocumentHighlightParams,
  DocumentSymbol,
  DocumentSymbolParams,
  Hover,
  HoverParams,
  Location,
  MarkedString,
  MarkupContent,
  Range as LspRange,
  RenameParams,
  ReferenceParams,
  SignatureHelp,
  SignatureHelpParams,
  TextDocumentPositionParams,
  WorkspaceEdit,
} from 'vscode-languageserver/node';

import {
  createAgentMetadataExplanation,
  createCbsAgentProtocolMarker,
  createLuaLsCompanionRuntime,
  createNormalizedRuntimeAvailabilitySnapshot,
  type AgentMetadataExplanationContract,
  type LuaLsCompanionRuntime,
  type NormalizedRuntimeAvailabilitySnapshot,
  type RuntimeOperatorContractOptions,
} from '../../core';
import { CbsLspPathHelper } from '../../helpers/path-helper';
import { createLuaLsTransportUri } from './lualsDocuments';
import {
  createLuaLsRemapContext,
  remapLuaLsCompletionResult,
  remapLuaLsDefinitionResult,
  remapLuaLsDocumentSymbols,
  remapLuaLsHover,
  remapLuaLsLocations,
  remapLuaLsWorkspaceEdit,
  type LuaLsDocumentSymbolResult,
  type LuaLsRemapContext,
  type LuaLsUriRemapResolver,
} from './lualsResponseRemapper';

export { isLuaLsSymbolInformation } from './lualsResponseRemapper';
export type { LuaLsDocumentSymbolResult, LuaLsUriRemapResolver } from './lualsResponseRemapper';

const DEFAULT_LUALS_HOVER_TIMEOUT_MS = 1_500;
const DEFAULT_LUALS_COMPLETION_TIMEOUT_MS = 1_500;
const DEFAULT_LUALS_DEFINITION_TIMEOUT_MS = 1_500;
const DEFAULT_LUALS_DOCUMENT_HIGHLIGHT_TIMEOUT_MS = 1_500;
const DEFAULT_LUALS_DOCUMENT_SYMBOL_TIMEOUT_MS = 1_500;
const DEFAULT_LUALS_REFERENCES_TIMEOUT_MS = 1_500;
const DEFAULT_LUALS_RENAME_TIMEOUT_MS = 1_500;
const DEFAULT_LUALS_SIGNATURE_TIMEOUT_MS = 1_500;
const LUA_HOVER_SNAPSHOT_PROVENANCE = Object.freeze(
  createAgentMetadataExplanation(
    'contextual-inference',
    'lua-provider:hover-proxy',
    'Lua hover snapshots normalize live LuaLS hover responses from mirrored `.risulua` documents, preserve range/content deterministically, and keep deferred Lua completion/diagnostics boundaries visible through the shared availability envelope.',
  ),
);

export interface NormalizedLuaHoverSnapshot {
  contents: {
    kind: string | null;
    value: string;
  };
  range: LspRange | null;
}

export interface NormalizedLuaHoverEnvelopeSnapshot {
  availability: NormalizedRuntimeAvailabilitySnapshot;
  hover: NormalizedLuaHoverSnapshot | null;
  provenance: AgentMetadataExplanationContract;
  schema: string;
  schemaVersion: string;
}

export interface LuaLsRequestClient {
  getRuntime(): LuaLsCompanionRuntime;
  request<TResult>(method: string, params: unknown, timeoutMs?: number): Promise<TResult | null>;
}

export interface LuaLsProxyOptions {
  uriRemapResolver?: LuaLsUriRemapResolver;
}

interface LuaLsTextDocumentParams {
  textDocument: {
    uri: string;
  };
}

/**
 * normalizeLuaHoverContents 함수.
 * LuaLS hover contents를 snapshot/golden 비교에 적합한 stable shape로 정규화함.
 *
 * @param contents - 정규화할 LuaLS hover contents
 * @returns stable `kind/value` pair
 */
function normalizeLuaHoverContents(contents: Hover['contents']): NormalizedLuaHoverSnapshot['contents'] {
  if (typeof contents === 'string') {
    return { kind: null, value: contents };
  }

  if (Array.isArray(contents)) {
    return {
      kind: null,
      value: contents.map((entry) => (typeof entry === 'string' ? entry : entry.value)).join('\n'),
    };
  }

  const markup = contents as MarkupContent | MarkedString;

  if (typeof markup === 'string') {
    return { kind: null, value: markup };
  }

  return {
    kind: 'kind' in markup ? markup.kind : null,
    value: markup.value,
  };
}

/**
 * normalizeLuaHoverForSnapshot 함수.
 * live Lua hover payload를 deterministic normalized snapshot으로 고정함.
 *
 * @param hover - 정규화할 Lua hover 결과
 * @returns stable contents/range shape
 */
export function normalizeLuaHoverForSnapshot(hover: Hover | null): NormalizedLuaHoverSnapshot | null {
  if (!hover) {
    return null;
  }

  return {
    contents: normalizeLuaHoverContents(hover.contents),
    range: hover.range ?? null,
  };
}

/**
 * normalizeLuaHoverEnvelopeForSnapshot 함수.
 * live Lua hover surface에 shared schema/version + availability/provenance envelope를 붙임.
 *
 * @param hover - 정규화할 Lua hover 결과
 * @param lualsRuntime - snapshot에 반영할 현재 LuaLS runtime 상태
 * @param operatorOptions - workspace/operator availability snapshot에 반영할 선택 옵션
 * @returns Lua hover snapshot envelope
 */
export function normalizeLuaHoverEnvelopeForSnapshot(
  hover: Hover | null,
  lualsRuntime: LuaLsCompanionRuntime = createLuaLsCompanionRuntime(),
  operatorOptions: RuntimeOperatorContractOptions = {},
): NormalizedLuaHoverEnvelopeSnapshot {
  return {
    ...createCbsAgentProtocolMarker(),
    availability: createNormalizedRuntimeAvailabilitySnapshot(lualsRuntime, operatorOptions),
    hover: normalizeLuaHoverForSnapshot(hover),
    provenance: LUA_HOVER_SNAPSHOT_PROVENANCE,
  };
}

/**
 * LuaLsProxy 클래스.
 * shadow file:// `.lua` mirror를 대상으로 read-only LuaLS 요청을 프록시함.
 */
export class LuaLsProxy {
  constructor(
    private readonly client: LuaLsRequestClient,
    private readonly options: LuaLsProxyOptions = {},
  ) {}

  /**
   * createRequestContext 함수.
   * source URI에서 LuaLS transport URI와 response remap context를 함께 생성함.
   *
   * @param sourceUri - 원본 `.risulua` URI
   * @returns transport URI와 remap context 묶음
   */
  private createRequestContext(sourceUri: string): { transportUri: string; remapContext: LuaLsRemapContext } {
    const transportUri = createLuaLsTransportUri(CbsLspPathHelper.getFilePathFromUri(sourceUri));
    return {
      transportUri,
      remapContext: createLuaLsRemapContext(sourceUri, transportUri, this.options.uriRemapResolver),
    };
  }

  /**
   * createTransportParams 함수.
   * host textDocument URI만 LuaLS transport URI로 바꾼 요청 params를 만듦.
   *
   * @param params - host LSP params
   * @param transportUri - LuaLS shadow `.lua` URI
   * @returns LuaLS에 전달할 params
   */
  private createTransportParams<TParams extends LuaLsTextDocumentParams>(
    params: TParams,
    transportUri: string,
  ): TParams {
    return {
      ...params,
      textDocument: {
        ...params.textDocument,
        uri: transportUri,
      },
    };
  }

  /**
   * getRuntime 함수.
   * 현재 LuaLS companion runtime 상태를 외부 trace/availability에서 읽을 수 있게 노출함.
   *
   * @returns 현재 LuaLS runtime snapshot
   */
  getRuntime(): LuaLsCompanionRuntime {
    return this.client.getRuntime();
  }

  /**
   * provideCompletion 함수.
   * source `.risulua` URI를 shadow `.lua` file:// URI로 바꿔 LuaLS `textDocument/completion` 요청을 전달함.
   *
   * @param params - host LSP completion params
   * @param cancellationToken - 취소 여부를 확인할 선택적 토큰
   * @returns LuaLS completion 결과, 준비되지 않았거나 실패하면 빈 배열
   */
  async provideCompletion(
    params: CompletionParams,
    cancellationToken?: CancellationToken,
  ): Promise<CompletionItem[] | CompletionList> {
    if (cancellationToken?.isCancellationRequested) {
      return [];
    }

    const { transportUri, remapContext } = this.createRequestContext(params.textDocument.uri);

    try {
      const completion = await this.client.request<CompletionItem[] | CompletionList>(
          'textDocument/completion',
          this.createTransportParams(params, transportUri),
          DEFAULT_LUALS_COMPLETION_TIMEOUT_MS,
        );
      return remapLuaLsCompletionResult(completion, remapContext);
    } catch {
      return [];
    }
  }

  /**
   * provideHover 함수.
   * source `.risulua` URI를 shadow `.lua` file:// URI로 바꿔 LuaLS `textDocument/hover` 요청을 전달함.
   *
   * @param params - host LSP hover params
   * @param cancellationToken - 취소 여부를 확인할 선택적 토큰
   * @returns LuaLS hover 결과, 준비되지 않았거나 실패하면 null
   */
  async provideHover(
    params: HoverParams,
    cancellationToken?: CancellationToken,
  ): Promise<Hover | null> {
    if (cancellationToken?.isCancellationRequested) {
      return null;
    }

    const { transportUri, remapContext } = this.createRequestContext(params.textDocument.uri);

    try {
      const hover = await this.client.request<Hover>(
        'textDocument/hover',
        this.createTransportParams(params, transportUri),
        DEFAULT_LUALS_HOVER_TIMEOUT_MS,
      );
      return remapLuaLsHover(hover, remapContext);
    } catch {
      return null;
    }
  }

  /**
   * provideDefinition 함수.
   * source `.risulua` URI를 shadow `.lua` file:// URI로 바꿔 LuaLS `textDocument/definition` 요청을 전달함.
   *
   * @param params - host LSP definition params
   * @param cancellationToken - 취소 여부를 확인할 선택적 토큰
   * @returns LuaLS definition 결과, 준비되지 않았거나 실패하면 null
   */
  async provideDefinition(
    params: DefinitionParams,
    cancellationToken?: CancellationToken,
  ): Promise<Definition | null> {
    if (cancellationToken?.isCancellationRequested) {
      return null;
    }

    const { transportUri, remapContext } = this.createRequestContext(params.textDocument.uri);

    try {
      const definition = await this.client.request<Definition>(
        'textDocument/definition',
        this.createTransportParams(params, transportUri),
        DEFAULT_LUALS_DEFINITION_TIMEOUT_MS,
      );
      return remapLuaLsDefinitionResult(definition, remapContext);
    } catch {
      return null;
    }
  }

  /**
   * provideReferences 함수.
   * source `.risulua` URI를 shadow `.lua` file:// URI로 바꿔 LuaLS `textDocument/references` 요청을 전달함.
   *
   * @param params - host LSP references params
   * @param cancellationToken - 취소 여부를 확인할 선택적 토큰
   * @returns source URI 기준 LuaLS reference location 배열, 실패하면 빈 배열
   */
  async provideReferences(
    params: ReferenceParams,
    cancellationToken?: CancellationToken,
  ): Promise<Location[]> {
    if (cancellationToken?.isCancellationRequested) {
      return [];
    }

    const { transportUri, remapContext } = this.createRequestContext(params.textDocument.uri);

    try {
      const references = await this.client.request<Location[]>(
        'textDocument/references',
        this.createTransportParams(params, transportUri),
        DEFAULT_LUALS_REFERENCES_TIMEOUT_MS,
      );
      return remapLuaLsLocations(references, remapContext);
    } catch {
      return [];
    }
  }

  /**
   * provideDocumentHighlight 함수.
   * source `.risulua` URI를 shadow `.lua` file:// URI로 바꿔 LuaLS `textDocument/documentHighlight` 요청을 전달함.
   *
   * @param params - host LSP document highlight params
   * @param cancellationToken - 취소 여부를 확인할 선택적 토큰
   * @returns LuaLS document highlight 배열, 실패하면 빈 배열
   */
  async provideDocumentHighlight(
    params: DocumentHighlightParams,
    cancellationToken?: CancellationToken,
  ): Promise<DocumentHighlight[]> {
    if (cancellationToken?.isCancellationRequested) {
      return [];
    }

    const { transportUri } = this.createRequestContext(params.textDocument.uri);

    try {
      return (
        (await this.client.request<DocumentHighlight[]>(
          'textDocument/documentHighlight',
          {
            ...this.createTransportParams(params, transportUri),
          },
          DEFAULT_LUALS_DOCUMENT_HIGHLIGHT_TIMEOUT_MS,
        )) ?? []
      );
    } catch {
      return [];
    }
  }

  /**
   * provideDocumentSymbol 함수.
   * source `.risulua` URI를 shadow `.lua` file:// URI로 바꿔 LuaLS `textDocument/documentSymbol` 요청을 전달함.
   *
   * @param params - host LSP document symbol params
   * @param cancellationToken - 취소 여부를 확인할 선택적 토큰
   * @returns LuaLS document symbol 배열, 실패하면 빈 배열
   */
  async provideDocumentSymbol(
    params: DocumentSymbolParams,
    cancellationToken?: CancellationToken,
  ): Promise<LuaLsDocumentSymbolResult> {
    if (cancellationToken?.isCancellationRequested) {
      return [];
    }

    const { transportUri, remapContext } = this.createRequestContext(params.textDocument.uri);

    try {
      const symbols = await this.client.request<LuaLsDocumentSymbolResult>(
          'textDocument/documentSymbol',
          this.createTransportParams(params, transportUri),
          DEFAULT_LUALS_DOCUMENT_SYMBOL_TIMEOUT_MS,
        );
      return remapLuaLsDocumentSymbols(symbols, remapContext);
    } catch {
      return [];
    }
  }

  /**
   * provideSignatureHelp 함수.
   * source `.risulua` URI를 shadow `.lua` file:// URI로 바꿔 LuaLS `textDocument/signatureHelp` 요청을 전달함.
   *
   * @param params - host LSP signature help params
   * @param cancellationToken - 취소 여부를 확인할 선택적 토큰
   * @returns LuaLS signature help 결과, 실패하면 null
   */
  async provideSignatureHelp(
    params: SignatureHelpParams,
    cancellationToken?: CancellationToken,
  ): Promise<SignatureHelp | null> {
    if (cancellationToken?.isCancellationRequested) {
      return null;
    }

    const { transportUri } = this.createRequestContext(params.textDocument.uri);

    try {
      return await this.client.request<SignatureHelp>(
        'textDocument/signatureHelp',
        {
          ...this.createTransportParams(params, transportUri),
        },
        DEFAULT_LUALS_SIGNATURE_TIMEOUT_MS,
      );
    } catch {
      return null;
    }
  }

  /**
   * prepareRename 함수.
   * LuaLS `textDocument/prepareRename`을 shadow 문서로 프록시함.
   *
   * @param params - host LSP prepareRename params
   * @param cancellationToken - 취소 여부를 확인할 선택적 토큰
   * @returns LuaLS prepareRename 결과, 실패하면 null
   */
  async prepareRename(
    params: TextDocumentPositionParams,
    cancellationToken?: CancellationToken,
  ): Promise<LspRange | { placeholder: string; range: LspRange } | null> {
    if (cancellationToken?.isCancellationRequested) {
      return null;
    }

    const { transportUri } = this.createRequestContext(params.textDocument.uri);

    try {
      return await this.client.request<LspRange | { placeholder: string; range: LspRange }>(
        'textDocument/prepareRename',
        {
          ...this.createTransportParams(params, transportUri),
        },
        DEFAULT_LUALS_RENAME_TIMEOUT_MS,
      );
    } catch {
      return null;
    }
  }

  /**
   * provideRename 함수.
   * LuaLS `textDocument/rename` 응답 안의 shadow URI를 원본 `.risulua` URI로 되돌림.
   *
   * @param params - host LSP rename params
   * @param cancellationToken - 취소 여부를 확인할 선택적 토큰
   * @returns source URI 기준 WorkspaceEdit, 실패하면 null
   */
  async provideRename(
    params: RenameParams,
    cancellationToken?: CancellationToken,
  ): Promise<WorkspaceEdit | null> {
    if (cancellationToken?.isCancellationRequested) {
      return null;
    }

    const { transportUri, remapContext } = this.createRequestContext(params.textDocument.uri);

    try {
      const edit = await this.client.request<WorkspaceEdit>(
        'textDocument/rename',
        this.createTransportParams(params, transportUri),
        DEFAULT_LUALS_RENAME_TIMEOUT_MS,
      );
      return remapLuaLsWorkspaceEdit(edit, remapContext);
    } catch {
      return null;
    }
  }
}

/**
 * createLuaLsProxy 함수.
 * server wiring이 재사용할 기본 LuaLS proxy seam을 생성함.
 *
 * @param client - LuaLS request/response를 수행할 companion client
 * @returns Lua hover proxy provider seam
 */
export function createLuaLsProxy(client: LuaLsRequestClient, options: LuaLsProxyOptions = {}): LuaLsProxy {
  return new LuaLsProxy(client, options);
}
