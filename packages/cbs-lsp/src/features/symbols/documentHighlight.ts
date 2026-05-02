/**
 * CBS document highlight provider.
 * @file packages/cbs-lsp/src/features/documentHighlight.ts
 */

import {
  type CancellationToken,
  DocumentHighlightKind,
  type DocumentHighlight,
  type DocumentHighlightParams,
} from 'vscode-languageserver/node';
import { TokenType, type BlockNode, type CBSNode, type Range } from 'risu-workbench-core';

import {
  ACTIVE_FEATURE_AVAILABILITY,
  fragmentAnalysisService,
  type AgentMetadataAvailabilityContract,
  type FragmentAnalysisRequest,
  type FragmentAnalysisService,
  type FragmentCursorLookupResult,
} from '../../core';
import type { FunctionSymbol, VariableSymbol } from '../../analyzer/symbolTable';
import {
  mergeLocalFirstSegments,
  resolveArgumentPosition,
  resolveFunctionPosition,
  resolveVariablePosition,
  type LocalFirstRangeEntry,
} from '../shared/local-first-contract';
import { isRequestCancelled } from '../../utils/request-cancellation';
import { positionToOffset } from '../../utils/position';

export type DocumentHighlightRequestResolver = (
  params: DocumentHighlightParams,
) => FragmentAnalysisRequest | null;

export interface DocumentHighlightProviderOptions {
  analysisService?: FragmentAnalysisService;
  resolveRequest?: DocumentHighlightRequestResolver;
}

interface HighlightEntry extends LocalFirstRangeEntry {
  kind: DocumentHighlightKind;
}

export const DOCUMENT_HIGHLIGHT_PROVIDER_AVAILABILITY: AgentMetadataAvailabilityContract =
  ACTIVE_FEATURE_AVAILABILITY.documentHighlight;

/**
 * DocumentHighlightProvider 클래스.
 * 현재 CBS fragment 안에서만 symbol read/write occurrence highlight를 계산함.
 */
export class DocumentHighlightProvider {
  private readonly analysisService: FragmentAnalysisService;

  private readonly resolveRequest: DocumentHighlightRequestResolver;

  readonly availability: AgentMetadataAvailabilityContract = DOCUMENT_HIGHLIGHT_PROVIDER_AVAILABILITY;

  /**
   * constructor 함수.
   * document highlight 계산에 필요한 fragment analysis seam을 보관함.
   *
   * @param options - analysis service와 request resolver override
   */
  constructor(options: DocumentHighlightProviderOptions = {}) {
    this.analysisService = options.analysisService ?? fragmentAnalysisService;
    this.resolveRequest = options.resolveRequest ?? (() => null);
  }

  /**
   * provide 함수.
   * 현재 커서 symbol의 fragment-local read/write highlight 목록을 계산함.
   *
   * @param params - 현재 document highlight 요청
   * @param cancellationToken - 요청 취소 여부를 확인할 토큰
   * @returns fragment-safe document highlight 목록
   */
  provide(params: DocumentHighlightParams, cancellationToken?: CancellationToken): DocumentHighlight[] {
    if (isRequestCancelled(cancellationToken)) {
      return [];
    }

    const request = this.resolveRequest(params);
    if (!request) {
      return [];
    }

    const lookup = this.analysisService.locatePosition(request, params.position, cancellationToken);
    if (!lookup) {
      return [];
    }

    if (isRequestCancelled(cancellationToken)) {
      return [];
    }

    if (!lookup.recovery.tokenContextReliable || !lookup.recovery.structureReliable) {
      return [];
    }

    const highlightEntries = this.resolveHighlightEntries(lookup, request.uri, request.text);
    return highlightEntries.map((entry) => ({
      range: entry.range,
      kind: entry.kind,
    }));
  }

  /**
   * resolveHighlightEntries 함수.
   * 현재 커서를 variable/function/arg 문맥으로 해석해 대응 highlight를 계산함.
   *
   * @param lookup - fragment cursor lookup 결과
   * @param documentContent - host document 원문
   * @returns current symbol에 대응하는 highlight entry 목록
   */
  private resolveHighlightEntries(
    lookup: FragmentCursorLookupResult,
    requestUri: string,
    documentContent: string,
  ): HighlightEntry[] {
    const symbolTable = lookup.fragmentAnalysis.providerLookup.getSymbolTable();
    const variablePosition = resolveVariablePosition(lookup);
    if (variablePosition) {
      if (variablePosition.kind === 'global') {
        return [];
      }

      const symbol = symbolTable.getVariable(variablePosition.variableName, variablePosition.kind);
      if (!symbol || symbol.scope === 'external') {
        return [];
      }

      return this.buildSymbolHighlights(symbol, lookup, requestUri, documentContent);
    }

    const declarationFunctionSymbol = symbolTable.getAllFunctions().find((symbol) =>
      rangeContainsOffset(symbol.definitionRange, lookup.fragment.content, lookup.fragmentLocalOffset),
    );
    if (declarationFunctionSymbol) {
      return this.buildFunctionHighlights(declarationFunctionSymbol, lookup, requestUri, documentContent);
    }

    const functionPosition = resolveFunctionPosition(lookup);
    if (functionPosition) {
      const functionSymbol = symbolTable.getFunction(functionPosition.functionName);
      if (!functionSymbol) {
        return [];
      }

      return this.buildFunctionHighlights(functionSymbol, lookup, requestUri, documentContent);
    }

    const argumentPosition = resolveArgumentPosition(lookup);
    if (argumentPosition) {
      return this.buildArgumentHighlights(
        argumentPosition.argumentIndex,
        argumentPosition.parameterDeclaration?.range,
        lookup,
        requestUri,
        documentContent,
      );
    }

    return [];
  }

  /**
   * buildSymbolHighlights 함수.
   * variable symbol의 definition/reference range를 write/read highlight로 변환함.
   *
   * @param symbol - highlight할 변수 심볼
   * @param lookup - 현재 fragment lookup 결과
   * @param documentContent - host document 원문
   * @returns write/read highlight entry 목록
   */
  private buildSymbolHighlights(
    symbol: VariableSymbol,
    lookup: FragmentCursorLookupResult,
    requestUri: string,
    documentContent: string,
  ): HighlightEntry[] {
    return this.buildMappedHighlights(
      symbol.definitionRanges,
      symbol.references,
      lookup,
      requestUri,
      documentContent,
    );
  }

  /**
   * buildFunctionHighlights 함수.
   * local #func declaration/call occurrence를 write/read highlight로 변환함.
   *
   * @param symbol - highlight할 로컬 함수 심볼
   * @param lookup - 현재 fragment lookup 결과
   * @param documentContent - host document 원문
   * @returns write/read highlight entry 목록
   */
  private buildFunctionHighlights(
    symbol: FunctionSymbol,
    lookup: FragmentCursorLookupResult,
    requestUri: string,
    documentContent: string,
  ): HighlightEntry[] {
    return this.buildMappedHighlights(
      symbol.definitionRanges,
      symbol.references,
      lookup,
      requestUri,
      documentContent,
    );
  }

  /**
   * buildArgumentHighlights 함수.
   * 현재 local #func body 안의 `arg::N` reference와 parameter declaration을 highlight로 변환함.
   *
   * @param argumentIndex - highlight할 numbered argument slot
   * @param parameterRange - 대응 parameter declaration range
   * @param lookup - 현재 fragment lookup 결과
   * @param documentContent - host document 원문
   * @returns write/read highlight entry 목록
   */
  private buildArgumentHighlights(
    argumentIndex: number,
    parameterRange: Range | undefined,
    lookup: FragmentCursorLookupResult,
    requestUri: string,
    documentContent: string,
  ): HighlightEntry[] {
    const functionBlock = findEnclosingFunctionBlock(lookup);
    if (!functionBlock) {
      return [];
    }

    const referenceRanges = collectArgumentReferenceRanges(
      functionBlock,
      lookup.fragmentAnalysis.tokens,
      lookup.fragment.content,
      argumentIndex,
    );

    return this.buildMappedHighlights(
      parameterRange ? [parameterRange] : [],
      referenceRanges,
      lookup,
      requestUri,
      documentContent,
    );
  }

  /**
   * buildMappedHighlights 함수.
   * fragment-local range 집합을 host document highlight entry로 remap하고 dedupe함.
   *
   * @param writeRanges - write highlight로 표시할 local range 목록
   * @param readRanges - read highlight로 표시할 local range 목록
   * @param lookup - 현재 fragment lookup 결과
   * @param documentContent - host document 원문
   * @returns host document 기준 highlight entry 목록
   */
  private buildMappedHighlights(
    writeRanges: readonly Range[],
    readRanges: readonly Range[],
    lookup: FragmentCursorLookupResult,
    requestUri: string,
    documentContent: string,
  ): HighlightEntry[] {
    const writes = this.mapRanges(
      writeRanges,
      DocumentHighlightKind.Write,
      lookup,
      requestUri,
      documentContent,
    );
    const reads = this.mapRanges(
      readRanges,
      DocumentHighlightKind.Read,
      lookup,
      requestUri,
      documentContent,
    );
    return mergeLocalFirstSegments([writes, reads]);
  }

  /**
   * mapRanges 함수.
   * fragment-local range 목록을 host document highlight entry로 변환함.
   *
   * @param ranges - 변환할 fragment-local range 목록
   * @param kind - highlight kind
   * @param lookup - 현재 fragment lookup 결과
   * @param documentContent - host document 원문
   * @returns host document 기준 highlight entry 목록
   */
  private mapRanges(
    ranges: readonly Range[],
    kind: DocumentHighlightKind,
    lookup: FragmentCursorLookupResult,
    requestUri: string,
    documentContent: string,
  ): HighlightEntry[] {
    const entries: HighlightEntry[] = [];
    for (const range of ranges) {
      const hostRange = lookup.fragmentAnalysis.mapper.toHostRange(documentContent, range);
      if (!hostRange) {
        continue;
      }

      entries.push({
        uri: requestUri,
        range: hostRange,
        kind,
      });
    }

    return entries;
  }
}

/**
 * rangeContainsOffset 함수.
 * cursor offset이 declaration range 안에 들어오는지 판별함.
 *
 * @param range - 검사할 local range
 * @param sourceText - fragment 원문 텍스트
 * @param offset - 현재 fragment-local cursor offset
 * @returns offset이 range 안에 있으면 true
 */
function rangeContainsOffset(
  range: Range | undefined,
  sourceText: string,
  offset: number,
): boolean {
  if (!range) {
    return false;
  }

  const startOffset = positionToOffset(sourceText, range.start);
  const endOffset = positionToOffset(sourceText, range.end);
  return offset >= startOffset && offset <= endOffset;
}

/**
 * findEnclosingFunctionBlock 함수.
 * 현재 cursor node path에서 가장 안쪽 local `#func` block을 찾음.
 *
 * @param lookup - fragment cursor lookup 결과
 * @returns enclosing function block, 없으면 null
 */
function findEnclosingFunctionBlock(lookup: FragmentCursorLookupResult): BlockNode | null {
  for (let index = lookup.nodePath.length - 1; index >= 0; index -= 1) {
    const candidate = lookup.nodePath[index];
    if (candidate?.type === 'Block' && candidate.kind === 'func') {
      return candidate;
    }
  }

  return null;
}

/**
 * collectArgumentReferenceRanges 함수.
 * 현재 local #func body 안의 `arg::N` occurrence만 재귀적으로 수집함.
 *
 * @param nodes - 현재 function body에서 순회할 AST 노드 목록
 * @param sourceText - fragment 원문 텍스트
 * @param argumentIndex - 찾을 numbered argument slot
 * @returns 같은 slot index를 가리키는 local range 목록
 */
function collectArgumentReferenceRanges(
  functionBlock: BlockNode,
  tokens: readonly { type: TokenType; value: string; range: Range }[],
  sourceText: string,
  argumentIndex: number,
): Range[] {
  const bodyStartOffset = positionToOffset(sourceText, functionBlock.openRange.end);
  const bodyEndOffset = functionBlock.closeRange
    ? positionToOffset(sourceText, functionBlock.closeRange.start)
    : sourceText.length;
  const nestedFunctionRanges = collectNestedFunctionRanges(functionBlock.body, sourceText);
  const ranges: Range[] = [];

  for (let index = 0; index < tokens.length - 2; index += 1) {
    const functionNameToken = tokens[index];
    const separatorToken = tokens[index + 1];
    const argumentToken = tokens[index + 2];
    if (
      functionNameToken?.type !== TokenType.FunctionName ||
      functionNameToken.value.toLowerCase() !== 'arg' ||
      separatorToken?.type !== TokenType.ArgumentSeparator ||
      argumentToken?.type !== TokenType.Argument
    ) {
      continue;
    }

    const tokenStartOffset = positionToOffset(sourceText, functionNameToken.range.start);
    if (tokenStartOffset < bodyStartOffset || tokenStartOffset >= bodyEndOffset) {
      continue;
    }

    if (isOffsetInsideNestedFunction(tokenStartOffset, sourceText, nestedFunctionRanges)) {
      continue;
    }

    if (argumentToken.value.trim() === String(argumentIndex)) {
      ranges.push(argumentToken.range);
    }
  }

  return ranges;
}

/**
 * collectNestedFunctionRanges 함수.
 * 현재 function body 안의 nested local `#func` 전체 range를 수집함.
 *
 * @param nodes - 현재 function body subtree
 * @param sourceText - fragment 원문 텍스트
 * @returns nested local function range 목록
 */
function collectNestedFunctionRanges(
  nodes: readonly CBSNode[],
  sourceText: string,
): Range[] {
  const ranges: Range[] = [];
  collectNestedFunctionRangesFromNodes(nodes, sourceText, ranges);
  return ranges;
}

/**
 * collectNestedFunctionRangesFromNodes 함수.
 * nested `#func` range를 재귀적으로 누적함.
 *
 * @param nodes - 현재 subtree의 AST 노드 목록
 * @param sourceText - fragment 원문 텍스트
 * @param ranges - nested function range 누적 배열
 */
function collectNestedFunctionRangesFromNodes(
  nodes: readonly CBSNode[],
  sourceText: string,
  ranges: Range[],
): void {
  for (const node of nodes) {
    if (node.type === 'Block') {
      collectNestedFunctionRangesFromBlock(node, sourceText, ranges);
      continue;
    }

    if (node.type === 'MacroCall') {
      for (const argument of node.arguments) {
        collectNestedFunctionRangesFromNodes(argument, sourceText, ranges);
      }
    }
  }
}

/**
 * collectNestedFunctionRangesFromBlock 함수.
 * nested local `#func` range를 기록하고 그 하위 subtree는 더 내려가지 않음.
 *
 * @param block - 검사할 block node
 * @param sourceText - fragment 원문 텍스트
 * @param ranges - nested function range 누적 배열
 */
function collectNestedFunctionRangesFromBlock(
  block: BlockNode,
  sourceText: string,
  ranges: Range[],
): void {
  if (block.kind === 'func') {
    ranges.push({
      start: block.openRange.start,
      end: block.closeRange?.end ?? block.openRange.end,
    });
    return;
  }

  collectNestedFunctionRangesFromNodes(block.condition, sourceText, ranges);
  collectNestedFunctionRangesFromNodes(block.body, sourceText, ranges);
  if (block.elseBody) {
    collectNestedFunctionRangesFromNodes(block.elseBody, sourceText, ranges);
  }
}

/**
 * isOffsetInsideNestedFunction 함수.
 * 현재 token offset이 nested `#func` 안에 들어오는지 판별함.
 *
 * @param offset - 검사할 fragment-local offset
 * @param sourceText - fragment 원문 텍스트
 * @param nestedRanges - nested local function range 목록
 * @returns nested local function range 안이면 true
 */
function isOffsetInsideNestedFunction(
  offset: number,
  sourceText: string,
  nestedRanges: readonly Range[],
): boolean {
  return nestedRanges.some((range) => rangeContainsOffset(range, sourceText, offset));
}
