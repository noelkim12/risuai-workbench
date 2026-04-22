/**
 * LuaLS request/response proxy seam for shadow-mirrored Lua language features.
 * @file packages/cbs-lsp/src/providers/lua/lualsProxy.ts
 */

import type {
  CancellationToken,
  CompletionItem,
  CompletionList,
  CompletionParams,
  Hover,
  HoverParams,
  MarkedString,
  MarkupContent,
  Range as LspRange,
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

const DEFAULT_LUALS_HOVER_TIMEOUT_MS = 1_500;
const DEFAULT_LUALS_COMPLETION_TIMEOUT_MS = 1_500;
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
  constructor(private readonly client: LuaLsRequestClient) {}

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

    const transportUri = createLuaLsTransportUri(
      CbsLspPathHelper.getFilePathFromUri(params.textDocument.uri),
    );

    try {
      return (
        (await this.client.request<CompletionItem[] | CompletionList>(
          'textDocument/completion',
          {
            ...params,
            textDocument: {
              uri: transportUri,
            },
          },
          DEFAULT_LUALS_COMPLETION_TIMEOUT_MS,
        )) ?? []
      );
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

    const transportUri = createLuaLsTransportUri(
      CbsLspPathHelper.getFilePathFromUri(params.textDocument.uri),
    );

    try {
      return await this.client.request<Hover>(
        'textDocument/hover',
        {
          ...params,
          textDocument: {
            uri: transportUri,
          },
        },
        DEFAULT_LUALS_HOVER_TIMEOUT_MS,
      );
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
export function createLuaLsProxy(client: LuaLsRequestClient): LuaLsProxy {
  return new LuaLsProxy(client);
}
