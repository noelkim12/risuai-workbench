/**
 * CBS document symbol / outline provider.
 * @file packages/cbs-lsp/src/features/documentSymbol.ts
 */

import type {
  CancellationToken,
  DocumentSymbol,
  DocumentSymbolParams,
  Range as LspRange,
  SymbolKind,
} from 'vscode-languageserver/node';
import {
  SymbolKind as LspSymbolKind,
} from 'vscode-languageserver/node';
import type { BlockKind, BlockNode, CBSNode } from 'risu-workbench-core';

import {
  ACTIVE_FEATURE_AVAILABILITY,
  createAgentMetadataExplanation,
  createCbsAgentProtocolMarker,
  createNormalizedRuntimeAvailabilitySnapshot,
  fragmentAnalysisService,
  type AgentMetadataExplanationContract,
  type FragmentAnalysisRequest,
  type FragmentAnalysisService,
  type FragmentDocumentAnalysis,
  type NormalizedRuntimeAvailabilitySnapshot,
} from '../../core';
import { CbsLspTextHelper } from '../../helpers/text-helper';
import { isRequestCancelled } from '../../utils/request-cancellation';

const OUTLINE_BLOCK_KINDS = new Set<BlockKind>(['when', 'each', 'escape', 'puredisplay', 'func']);
const FRAGMENT_CONTAINER_KIND = LspSymbolKind.Namespace;
const DOCUMENT_SYMBOL_SNAPSHOT_PROVENANCE = Object.freeze(
  createAgentMetadataExplanation(
    'contextual-inference',
    'document-symbol:outline-builder',
    'Document symbol snapshots are derived from routed CBS fragment AST blocks, keep host selection/range coordinates, and add section containers only when multiple CBS-bearing fragments exist in the same host document.',
  ),
);

export interface NormalizedDocumentSymbolSnapshot {
  children: NormalizedDocumentSymbolSnapshot[];
  fragmentContainer: boolean;
  name: string;
  range: LspRange;
  section: string | null;
  selectionRange: LspRange;
  symbolKind: string;
}

export interface NormalizedDocumentSymbolsEnvelopeSnapshot {
  schema: string;
  schemaVersion: string;
  availability: NormalizedRuntimeAvailabilitySnapshot;
  provenance: AgentMetadataExplanationContract;
  symbols: NormalizedDocumentSymbolSnapshot[];
}

/**
 * getSupportedBlockSymbolKind 함수.
 * outline에 노출할 block kind를 안정적인 LSP SymbolKind로 매핑함.
 *
 * @param kind - AST block kind
 * @returns outline에 사용할 SymbolKind
 */
function getSupportedBlockSymbolKind(kind: BlockKind): SymbolKind {
  switch (kind) {
    case 'func':
      return LspSymbolKind.Function;
    case 'each':
      return LspSymbolKind.Array;
    case 'when':
      return LspSymbolKind.Object;
    case 'escape':
    case 'puredisplay':
      return LspSymbolKind.String;
    default:
      return LspSymbolKind.Object;
  }
}

/**
 * extractRangeText 함수.
 * fragment-local range가 가리키는 원문 일부를 잘라 안정적인 심볼 이름 계산에 재사용함.
 *
 * @param sourceText - fragment 원문 텍스트
 * @param range - 추출할 fragment-local range
 * @returns range에 대응하는 원문 문자열
 */
/**
 * normalizeBlockOutlineName 함수.
 * block open header를 outline label로 쓰기 좋게 brace 없이 정규화함.
 *
 * @param block - 이름을 만들 block AST 노드
 * @param sourceText - 현재 fragment 원문
 * @returns outline tree에 표시할 안정적인 block 이름
 */
function normalizeBlockOutlineName(block: BlockNode, sourceText: string): string {
  const headerText = CbsLspTextHelper.extractRangeText(sourceText, block.openRange).trim();
  const normalizedHeader = headerText.replace(/^\{\{/u, '').replace(/\}\}$/u, '').trim();
  if (block.kind !== 'func') {
    return normalizedHeader;
  }

  const functionName = normalizedHeader.match(/^#func\s+([^\s}]+)/u)?.[1];
  return functionName ? `#func ${functionName}` : normalizedHeader;
}

/**
 * createFragmentContainerName 함수.
 * multi-fragment 문서에서 section 이름이 중복될 때도 stable한 container label을 만듦.
 *
 * @param section - fragment section 이름
 * @param occurrenceIndex - 같은 section 안에서 현재 fragment 순번(0-based)
 * @param totalCount - 같은 section fragment 총 개수
 * @returns outline container에 표시할 이름
 */
function createFragmentContainerName(
  section: string,
  occurrenceIndex: number,
  totalCount: number,
): string {
  return totalCount > 1 ? `${section} [${occurrenceIndex + 1}]` : section;
}

/**
 * createFragmentContainerSymbol 함수.
 * fragment-aware outline을 위해 section 단위 container 심볼을 생성함.
 *
 * @param request - 현재 host 문서 분석 요청
 * @param fragmentAnalysis - container를 만들 fragment 분석 결과
 * @param name - 표시할 section 이름
 * @param children - fragment 아래에 붙일 CBS child symbols
 * @returns fragment container symbol, host range 계산 실패 시 null
 */
function createFragmentContainerSymbol(
  request: FragmentAnalysisRequest,
  fragmentAnalysis: FragmentDocumentAnalysis,
  name: string,
  children: DocumentSymbol[],
): DocumentSymbol | null {
  const range = fragmentAnalysis.mapper.toHostRangeFromOffsets(
    request.text,
    0,
    fragmentAnalysis.fragment.content.length,
  );
  const selectionRange = fragmentAnalysis.mapper.toHostRangeFromOffsets(request.text, 0, 0);
  if (!range || !selectionRange) {
    return null;
  }

  return {
    name,
    kind: FRAGMENT_CONTAINER_KIND,
    range,
    selectionRange,
    children,
  };
}

/**
 * collectDocumentSymbolsFromNodes 함수.
 * supported block만 outline symbol로 올리고, unsupported block 아래의 supported child는 평탄하게 이어붙임.
 *
 * @param nodes - 현재 depth에서 순회할 AST 노드 목록
 * @param request - 현재 host 문서 분석 요청
 * @param fragmentAnalysis - host range remap에 필요한 fragment 분석 결과
 * @returns 현재 depth에 속한 DocumentSymbol 목록
 */
function collectDocumentSymbolsFromNodes(
  nodes: readonly CBSNode[],
  request: FragmentAnalysisRequest,
  fragmentAnalysis: FragmentDocumentAnalysis,
): DocumentSymbol[] {
  const symbols: DocumentSymbol[] = [];

  for (const node of nodes) {
    if (node.type !== 'Block') {
      continue;
    }

    const childSymbols = collectDocumentSymbolsFromNodes(
      [...node.body, ...(node.elseBody ?? [])],
      request,
      fragmentAnalysis,
    );
    if (!OUTLINE_BLOCK_KINDS.has(node.kind)) {
      symbols.push(...childSymbols);
      continue;
    }

    const range = fragmentAnalysis.mapper.toHostRange(request.text, node.range);
    const selectionRange = fragmentAnalysis.mapper.toHostRange(request.text, node.openRange);
    if (!range || !selectionRange) {
      continue;
    }

    symbols.push({
      name: normalizeBlockOutlineName(node, fragmentAnalysis.fragment.content),
      kind: getSupportedBlockSymbolKind(node.kind),
      range,
      selectionRange,
      children: childSymbols,
    });
  }

  return symbols;
}

/**
 * normalizeDocumentSymbolForSnapshot 함수.
 * DocumentSymbol 한 건을 agent/golden 친화적인 stable JSON shape로 정규화함.
 *
 * @param symbol - 정규화할 outline symbol
 * @returns deterministic field names와 child ordering을 가진 snapshot node
 */
export function normalizeDocumentSymbolForSnapshot(
  symbol: DocumentSymbol,
): NormalizedDocumentSymbolSnapshot {
  const children = normalizeDocumentSymbolsForSnapshot(symbol.children ?? []);
  const fragmentContainer = isFragmentContainerSymbol(symbol);

  return {
    children,
    fragmentContainer,
    name: symbol.name,
    range: symbol.range,
    section: fragmentContainer ? normalizeFragmentSectionName(symbol.name) : null,
    selectionRange: symbol.selectionRange,
    symbolKind: normalizeDocumentSymbolKindForSnapshot(symbol.kind),
  };
}

/**
 * normalizeDocumentSymbolsForSnapshot 함수.
 * DocumentSymbol 배열 전체를 deterministic ordering의 normalized tree로 정규화함.
 *
 * @param symbols - 정규화할 outline symbol 목록
 * @returns stable ordering을 가진 normalized symbol tree
 */
export function normalizeDocumentSymbolsForSnapshot(
  symbols: readonly DocumentSymbol[],
): NormalizedDocumentSymbolSnapshot[] {
  return [...symbols].map(normalizeDocumentSymbolForSnapshot).sort(compareNormalizedDocumentSymbols);
}

/**
 * normalizeDocumentSymbolsEnvelopeForSnapshot 함수.
 * document symbol normalized tree에 shared availability/provenance envelope를 붙임.
 *
 * @param symbols - 정규화할 outline symbol 목록
 * @returns schema/version과 availability/provenance를 포함한 snapshot envelope
 */
export function normalizeDocumentSymbolsEnvelopeForSnapshot(
  symbols: readonly DocumentSymbol[],
): NormalizedDocumentSymbolsEnvelopeSnapshot {
  return {
    ...createCbsAgentProtocolMarker(),
    availability: createNormalizedRuntimeAvailabilitySnapshot(),
    provenance: DOCUMENT_SYMBOL_SNAPSHOT_PROVENANCE,
    symbols: normalizeDocumentSymbolsForSnapshot(symbols),
  };
}

/**
 * isFragmentContainerSymbol 함수.
 * document symbol이 multi-fragment section container인지 판별함.
 *
 * @param symbol - 판별할 outline symbol
 * @returns section container이면 true
 */
function isFragmentContainerSymbol(symbol: DocumentSymbol): boolean {
  return symbol.kind === FRAGMENT_CONTAINER_KIND;
}

/**
 * normalizeFragmentSectionName 함수.
 * container label에서 section grouping key만 떼어냄.
 *
 * @param name - 원본 container label
 * @returns 중복 suffix를 제거한 section 이름
 */
function normalizeFragmentSectionName(name: string): string {
  return name.replace(/\s+\[\d+\]$/u, '');
}

/**
 * normalizeDocumentSymbolKindForSnapshot 함수.
 * LSP numeric SymbolKind를 agent가 바로 읽을 string label로 고정함.
 *
 * @param kind - LSP SymbolKind 값
 * @returns stable string label
 */
function normalizeDocumentSymbolKindForSnapshot(kind: SymbolKind): string {
  switch (kind) {
    case LspSymbolKind.Function:
      return 'function';
    case LspSymbolKind.Array:
      return 'array';
    case LspSymbolKind.Object:
      return 'object';
    case LspSymbolKind.String:
      return 'string';
    case LspSymbolKind.Namespace:
      return 'namespace';
    default:
      return `symbol-kind:${kind}`;
  }
}

/**
 * compareNormalizedDocumentSymbols 함수.
 * normalized outline snapshot의 deterministic ordering을 비교함.
 *
 * @param left - 왼쪽 symbol snapshot
 * @param right - 오른쪽 symbol snapshot
 * @returns 정렬 비교값
 */
function compareNormalizedDocumentSymbols(
  left: NormalizedDocumentSymbolSnapshot,
  right: NormalizedDocumentSymbolSnapshot,
): number {
  return (
    compareRanges(left.selectionRange, right.selectionRange) ||
    compareRanges(left.range, right.range) ||
    compareStrings(left.section, right.section) ||
    compareBooleans(left.fragmentContainer, right.fragmentContainer) ||
    compareStrings(left.name, right.name) ||
    compareStrings(left.symbolKind, right.symbolKind) ||
    compareStrings(JSON.stringify(left.children), JSON.stringify(right.children))
  );
}

/**
 * compareRanges 함수.
 * LSP range 둘의 정렬 순서를 비교함.
 *
 * @param left - 왼쪽 range
 * @param right - 오른쪽 range
 * @returns 정렬 비교값
 */
function compareRanges(left: LspRange | null, right: LspRange | null): number {
  return comparePositions(left?.start ?? null, right?.start ?? null) || comparePositions(left?.end ?? null, right?.end ?? null);
}

/**
 * comparePositions 함수.
 * LSP position 둘의 정렬 순서를 비교함.
 *
 * @param left - 왼쪽 position
 * @param right - 오른쪽 position
 * @returns 정렬 비교값
 */
function comparePositions(
  left: { line: number; character: number } | null,
  right: { line: number; character: number } | null,
): number {
  return compareNumbers(left?.line ?? null, right?.line ?? null) || compareNumbers(left?.character ?? null, right?.character ?? null);
}

/**
 * compareStrings 함수.
 * null-safe 문자열 비교를 수행함.
 *
 * @param left - 왼쪽 문자열
 * @param right - 오른쪽 문자열
 * @returns 정렬 비교값
 */
function compareStrings(left: string | null, right: string | null): number {
  return (left ?? '').localeCompare(right ?? '');
}

/**
 * compareNumbers 함수.
 * null-safe 숫자 비교를 수행함.
 *
 * @param left - 왼쪽 숫자
 * @param right - 오른쪽 숫자
 * @returns 정렬 비교값
 */
function compareNumbers(left: number | null, right: number | null): number {
  return (left ?? Number.NEGATIVE_INFINITY) - (right ?? Number.NEGATIVE_INFINITY);
}

/**
 * compareBooleans 함수.
 * false를 true보다 먼저 두는 stable boolean 비교를 수행함.
 *
 * @param left - 왼쪽 boolean
 * @param right - 오른쪽 boolean
 * @returns 정렬 비교값
 */
function compareBooleans(left: boolean, right: boolean): number {
  return Number(left) - Number(right);
}

/**
 * DocumentSymbolProvider 클래스.
 * routed CBS fragment의 top-level block 구조를 outline tree로 변환함.
 */
export class DocumentSymbolProvider {
  constructor(
    private readonly analysisService: FragmentAnalysisService = fragmentAnalysisService,
  ) {}

  /**
   * provide 함수.
   * current document의 fragment-local AST를 outline용 DocumentSymbol 배열로 변환함.
   *
   * @param _params - LSP document symbol request params
   * @param request - host document 기반 fragment analysis request
   * @param cancellationToken - 요청 취소 여부
   * @returns outline tree로 반환할 DocumentSymbol 목록
   */
  provide(
    _params: DocumentSymbolParams,
    request: FragmentAnalysisRequest,
    cancellationToken?: CancellationToken,
  ): DocumentSymbol[] {
    if (isRequestCancelled(cancellationToken)) {
      return [];
    }

    const analysis = this.analysisService.analyzeDocument(request, cancellationToken);
    if (!analysis) {
      return [];
    }

    const useFragmentContainers = analysis.fragmentAnalyses.length > 1;
    const sectionOccurrences = new Map<string, number>();
    const sectionTotals = new Map<string, number>();

    for (const fragmentAnalysis of analysis.fragmentAnalyses) {
      const currentCount = sectionTotals.get(fragmentAnalysis.fragment.section) ?? 0;
      sectionTotals.set(fragmentAnalysis.fragment.section, currentCount + 1);
    }

    const symbols: DocumentSymbol[] = [];
    for (const fragmentAnalysis of analysis.fragmentAnalyses) {
      if (isRequestCancelled(cancellationToken)) {
        return [];
      }

      if (!fragmentAnalysis.recovery.structureReliable) {
        continue;
      }

      const blockSymbols = collectDocumentSymbolsFromNodes(
        fragmentAnalysis.document.nodes,
        request,
        fragmentAnalysis,
      );
      if (blockSymbols.length === 0) {
        continue;
      }

      if (!useFragmentContainers) {
        symbols.push(...blockSymbols);
        continue;
      }

      const section = fragmentAnalysis.fragment.section;
      const occurrenceIndex = sectionOccurrences.get(section) ?? 0;
      sectionOccurrences.set(section, occurrenceIndex + 1);
      const containerName = createFragmentContainerName(
        section,
        occurrenceIndex,
        sectionTotals.get(section) ?? 1,
      );
      const container = createFragmentContainerSymbol(
        request,
        fragmentAnalysis,
        containerName,
        blockSymbols,
      );
      if (container) {
        symbols.push(container);
      }
    }

    return symbols;
  }
}

export const DOCUMENT_SYMBOL_SNAPSHOT_AVAILABILITY = ACTIVE_FEATURE_AVAILABILITY.documentSymbol;
export const DOCUMENT_SYMBOL_SNAPSHOT_PROVENANCE_CONTRACT = DOCUMENT_SYMBOL_SNAPSHOT_PROVENANCE;
