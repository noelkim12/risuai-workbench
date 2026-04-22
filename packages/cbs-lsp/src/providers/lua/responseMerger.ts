/**
 * LuaLS completion overlay/merge helpers for read-only VariableGraph bridge.
 * @file packages/cbs-lsp/src/providers/lua/responseMerger.ts
 */

import {
  CompletionItemKind,
  MarkupKind,
  InsertTextFormat,
  Range,
  type CompletionItem,
  type CompletionList,
  type CompletionParams,
  type Hover,
  type HoverParams,
  type MarkedString,
  type MarkupContent,
} from 'vscode-languageserver/node';

import {
  createAgentMetadataEnvelope,
  createAgentMetadataExplanation,
  type FragmentAnalysisRequest,
} from '../../core';
import type { VariableFlowQueryResult, VariableFlowService } from '../../services';
import { offsetToPosition, positionToOffset } from '../../utils/position';

type LuaCompletionResponse = CompletionItem[] | CompletionList;
type LuaHoverResponse = Hover | null;
type LuaStateOverlayService = Pick<
  VariableFlowService,
  'getAllVariableNames' | 'queryAt' | 'queryVariable'
>;
type LuaStateOverlayQuery = Pick<VariableFlowQueryResult, 'matchedOccurrence'>;

export interface LuaStateNameOverlayContext {
  params: CompletionParams;
  request: Pick<FragmentAnalysisRequest, 'text' | 'uri'> | null;
  variableFlowService: LuaStateOverlayService | null;
}

export interface LuaStateHoverOverlayContext {
  params: HoverParams;
  request: Pick<FragmentAnalysisRequest, 'text' | 'uri'> | null;
  variableFlowService: LuaStateOverlayService | null;
}

interface LuaStateNameEditRange {
  currentValue: string;
  prefix: string;
  replacementRange: Range;
}

interface LuaStateOverlayResolution {
  matchedOccurrence: NonNullable<VariableFlowQueryResult['matchedOccurrence']>;
  query: VariableFlowQueryResult;
}

/**
 * isCompletionList 함수.
 * LuaLS completion 응답이 list shape인지 판별함.
 *
 * @param response - 판별할 completion 응답
 * @returns CompletionList shape면 true
 */
function isCompletionList(response: LuaCompletionResponse): response is CompletionList {
  return !Array.isArray(response);
}

/**
 * containsLuaStateKeyCursor 함수.
 * cursor가 read-only bridge 대상 key occurrence 위에 있는지 확인함.
 *
 * @param query - position 기반 VariableGraph 조회 결과
 * @returns `getState` / `setState` key 문자열 위치면 true
 */
function containsLuaStateKeyCursor(query: LuaStateOverlayQuery | null): boolean {
  return Boolean(
    query?.matchedOccurrence &&
      query.matchedOccurrence.sourceKind === 'lua-state-api' &&
      (query.matchedOccurrence.sourceName === 'getState' ||
        query.matchedOccurrence.sourceName === 'setState'),
  );
}

/**
 * normalizeHoverContents 함수.
 * Hover payload를 markdown string 하나로 정규화함.
 *
 * @param contents - 병합 전에 정규화할 hover contents
 * @returns markdown으로 이어붙일 수 있는 문자열
 */
function normalizeHoverContents(contents: Hover['contents']): string {
  if (typeof contents === 'string') {
    return contents;
  }

  if (Array.isArray(contents)) {
    return contents.map((entry) => (typeof entry === 'string' ? entry : entry.value)).join('\n');
  }

  const markup = contents as MarkupContent | MarkedString;
  return typeof markup === 'string' ? markup : markup.value;
}

/**
 * formatLuaStateOccurrenceSummary 함수.
 * Hover summary에 넣을 workspace occurrence 한 줄 설명을 만듦.
 *
 * @param occurrence - 요약할 workspace occurrence
 * @returns `relativePath — sourceName` 형태의 markdown line
 */
function formatLuaStateOccurrenceSummary(
  occurrence: VariableFlowQueryResult['occurrences'][number],
): string {
  return `- ${occurrence.relativePath} — \`${occurrence.sourceName}\``;
}

/**
 * pickRepresentativeOccurrences 함수.
 * Hover에 노출할 대표 occurrence 몇 개만 stable ordering으로 골라냄.
 *
 * @param occurrences - 후보 occurrence 목록
 * @param limit - 최대 노출 개수
 * @returns 대표 occurrence 목록
 */
function pickRepresentativeOccurrences<T extends VariableFlowQueryResult['occurrences'][number]>(
  occurrences: readonly T[],
  limit: number = 3,
): readonly T[] {
  return [...occurrences]
    .sort(
      (left, right) =>
        left.relativePath.localeCompare(right.relativePath) ||
        left.hostStartOffset - right.hostStartOffset ||
        left.sourceName.localeCompare(right.sourceName),
    )
    .slice(0, limit);
}

/**
 * resolveLuaStateOverlayQuery 함수.
 * cursor가 `getState`/`setState` key 문자열 위에 있을 때 matched occurrence와 variable query를 함께 돌려줌.
 *
 * @param text - host `.risulua` 문서 전체 텍스트
 * @param uri - host 문서 URI
 * @param position - 현재 cursor position
 * @param variableFlowService - VariableGraph query surface
 * @returns hover/completion overlay에 쓸 occurrence/query 묶음 또는 null
 */
function resolveLuaStateOverlayQuery(params: {
  text: string;
  uri: string;
  position: HoverParams['position'] | CompletionParams['position'];
  variableFlowService: LuaStateOverlayService;
}): LuaStateOverlayResolution | null {
  const hostOffset = positionToOffset(params.text, params.position);
  const primaryQuery = params.variableFlowService.queryAt(params.uri, hostOffset);
  const query =
    containsLuaStateKeyCursor(primaryQuery) || hostOffset <= 0
      ? primaryQuery
      : params.variableFlowService.queryAt(params.uri, hostOffset - 1);

  if (!containsLuaStateKeyCursor(query) || !query?.matchedOccurrence?.variableName) {
    return null;
  }

  const variableQuery = params.variableFlowService.queryVariable(query.matchedOccurrence.variableName);
  if (!variableQuery) {
    return null;
  }

  return {
    matchedOccurrence: query.matchedOccurrence,
    query: {
      ...variableQuery,
      matchedOccurrence: query.matchedOccurrence,
    },
  };
}

/**
 * resolveLuaStateNameEditRange 함수.
 * 문자열 리터럴 내부 텍스트만 교체하도록 textEdit 범위와 typed prefix를 계산함.
 *
 * @param text - host `.risulua` 문서 전체 텍스트
 * @param startOffset - key argument 시작 offset
 * @param endOffset - key argument 종료 offset
 * @param cursorOffset - 현재 cursor offset
 * @returns prefix와 inner string replacement range, 계산 불가면 null
 */
function resolveLuaStateNameEditRange(
  text: string,
  startOffset: number,
  endOffset: number,
  cursorOffset: number,
): LuaStateNameEditRange | null {
  if (startOffset < 0 || endOffset <= startOffset || endOffset > text.length) {
    return null;
  }

  const literalText = text.slice(startOffset, endOffset);
  const openingQuote = literalText[0];
  const closingQuote = literalText.at(-1);
  const hasBalancedQuotes =
    literalText.length >= 2 &&
    (openingQuote === '"' || openingQuote === "'") &&
    openingQuote === closingQuote;

  const replacementStart = hasBalancedQuotes ? startOffset + 1 : startOffset;
  const replacementEnd = hasBalancedQuotes ? endOffset - 1 : endOffset;

  if (cursorOffset < replacementStart || cursorOffset > replacementEnd) {
    return null;
  }

  return {
    currentValue: text.slice(replacementStart, replacementEnd),
    prefix: text.slice(replacementStart, cursorOffset),
    replacementRange: Range.create(
      offsetToPosition(text, replacementStart),
      offsetToPosition(text, replacementEnd),
    ),
  };
}

/**
 * buildLuaStateNameOverlayCompletions 함수.
 * `getState` / `setState` key 문자열 위치에서 VariableGraph 기반 상태 이름 후보를 additive completion으로 만듦.
 *
 * @param context - 요청 위치, host document, workspace VariableGraph query surface
 * @returns overlay completion item 배열
 */
export function buildLuaStateNameOverlayCompletions(
  context: LuaStateNameOverlayContext,
): CompletionItem[] {
  if (!context.request || !context.variableFlowService) {
    return [];
  }

  const resolution = resolveLuaStateOverlayQuery({
    text: context.request.text,
    uri: context.request.uri,
    position: context.params.position,
    variableFlowService: context.variableFlowService,
  });
  if (!resolution) {
    return [];
  }

  const hostOffset = positionToOffset(context.request.text, context.params.position);
  const occurrence = resolution.matchedOccurrence;

  const editRange = resolveLuaStateNameEditRange(
    context.request.text,
    occurrence.hostStartOffset,
    occurrence.hostEndOffset,
    hostOffset,
  );
  if (!editRange) {
    return [];
  }

  const normalizedPrefix = editRange.prefix.toLowerCase();
  return context.variableFlowService
    .getAllVariableNames()
    .filter((variableName) => {
      if (!variableName.toLowerCase().startsWith(normalizedPrefix)) {
        return false;
      }

      const variableQuery = context.variableFlowService?.queryVariable(variableName);
      const occurrenceCount = variableQuery?.occurrences.length ?? 0;
      if (variableName === editRange.currentValue && occurrenceCount <= 1) {
        return false;
      }

      return true;
    })
    .map((variableName) => {
      const variableQuery = context.variableFlowService?.queryVariable(variableName);
      const readerCount = variableQuery?.readers.length ?? 0;
      const writerCount = variableQuery?.writers.length ?? 0;

      return {
        label: variableName,
        kind: CompletionItemKind.Variable,
        detail: 'Workspace state key',
        documentation: {
          kind: 'markdown',
          value: [
            `**Workspace state key:** \`${variableName}\``,
            '',
            '- Source: VariableGraph read-only bridge overlay',
            `- Workspace readers: ${readerCount}`,
            `- Workspace writers: ${writerCount}`,
          ].join('\n'),
        },
        insertText: variableName,
        insertTextFormat: InsertTextFormat.PlainText,
        sortText: `0000-${variableName}`,
        textEdit: {
          range: editRange.replacementRange,
          newText: variableName,
        },
        data: createAgentMetadataEnvelope(
          {
            category: 'variable',
            kind: 'chat-variable',
          },
          createAgentMetadataExplanation(
            'contextual-inference',
            'lua-state-key-overlay',
            'Lua completion overlaid VariableGraph workspace state keys into a getState/setState string argument slot.',
          ),
        ),
      } satisfies CompletionItem;
    });
}

/**
 * buildLuaStateHoverOverlayMarkdown 함수.
 * `getState`/`setState` key 문자열 위에서 cross-language state bridge 요약 markdown을 만듦.
 *
 * @param context - hover 위치, host document, workspace VariableGraph query surface
 * @returns 읽기 전용 bridge summary markdown 또는 null
 */
export function buildLuaStateHoverOverlayMarkdown(
  context: LuaStateHoverOverlayContext,
): string | null {
  if (!context.request || !context.variableFlowService) {
    return null;
  }

  const resolution = resolveLuaStateOverlayQuery({
    text: context.request.text,
    uri: context.request.uri,
    position: context.params.position,
    variableFlowService: context.variableFlowService,
  });
  if (!resolution) {
    return null;
  }

  const { matchedOccurrence, query } = resolution;
  const luaWriters = query.writers.filter((occurrence) => occurrence.artifact === 'lua');
  const cbsWriters = query.writers.filter((occurrence) => occurrence.artifact !== 'lua');
  const luaReaders = query.readers.filter((occurrence) => occurrence.artifact === 'lua');
  const cbsReaders = query.readers.filter((occurrence) => occurrence.artifact !== 'lua');
  const accessVerb = matchedOccurrence.direction === 'write' ? 'writes' : 'reads';
  const lines = [
    `**Workspace state bridge:** \`${query.variableName}\``,
    '',
    `- Current Lua access: ${accessVerb} via \`${matchedOccurrence.sourceName}\``,
    `- Lua writers: ${luaWriters.length}`,
    `- CBS writers: ${cbsWriters.length}`,
    `- Lua readers: ${luaReaders.length}`,
    `- CBS readers: ${cbsReaders.length}`,
  ];

  if (query.defaultValue) {
    lines.push(`- Default value: ${query.defaultValue}`);
  }

  const representativeSections: Array<[string, readonly VariableFlowQueryResult['occurrences'][number][]]> = [
    ['Representative Lua writers', luaWriters],
    ['Representative CBS writers', cbsWriters],
  ];

  if (matchedOccurrence.direction === 'write') {
    representativeSections.push(['Representative CBS readers', cbsReaders]);
  } else {
    representativeSections.push(['Representative Lua writers', luaWriters]);
  }

  for (const [label, occurrences] of representativeSections) {
    const representatives = pickRepresentativeOccurrences(occurrences);
    if (representatives.length === 0) {
      continue;
    }

    lines.push('', `${label}:`);
    lines.push(...representatives.map((occurrence) => formatLuaStateOccurrenceSummary(occurrence)));
  }

  if (query.issues.length > 0) {
    lines.push(
      '',
      `- Workspace issues: ${query.issues.map((entry) => entry.issue.type).join(', ')}`,
    );
  }

  return lines.join('\n');
}

/**
 * mergeLuaCompletionResponse 함수.
 * LuaLS 원본 completion과 RisuAI overlay completion을 stable dedupe 규칙으로 병합함.
 *
 * @param base - LuaLS가 돌려준 원본 completion 응답
 * @param overlay - VariableGraph overlay completion 배열
 * @returns LuaLS shape를 유지한 병합 결과
 */
export function mergeLuaCompletionResponse(
  base: LuaCompletionResponse,
  overlay: readonly CompletionItem[],
): LuaCompletionResponse {
  if (overlay.length === 0) {
    return base;
  }

  const baseItems = isCompletionList(base) ? base.items : base;
  const merged: CompletionItem[] = [];
  const seenLabels = new Set<string>();

  for (const item of [...overlay, ...baseItems]) {
    if (seenLabels.has(item.label)) {
      continue;
    }
    seenLabels.add(item.label);
    merged.push(item);
  }

  if (isCompletionList(base)) {
    return {
      ...base,
      items: merged,
    };
  }

  return merged;
}

/**
 * mergeLuaHoverResponse 함수.
 * LuaLS 기본 hover와 read-only workspace bridge 요약을 markdown 하나로 병합함.
 *
 * @param base - LuaLS가 돌려준 원본 hover 결과
 * @param overlayMarkdown - VariableGraph bridge에서 만든 추가 markdown 섹션
 * @param fallbackRange - base hover가 없을 때 사용할 host range
 * @returns base hover shape를 유지한 병합 결과
 */
export function mergeLuaHoverResponse(
  base: LuaHoverResponse,
  overlayMarkdown: string | null,
  fallbackRange?: Range,
): LuaHoverResponse {
  if (!overlayMarkdown) {
    return base;
  }

  if (!base) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: overlayMarkdown,
      },
      range: fallbackRange,
    };
  }

  const baseMarkdown = normalizeHoverContents(base.contents);
  return {
    ...base,
    contents: {
      kind: MarkupKind.Markdown,
      value: [baseMarkdown, overlayMarkdown].filter(Boolean).join('\n\n---\n\n'),
    },
    range: base.range ?? fallbackRange,
  };
}
