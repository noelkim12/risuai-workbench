/**
 * CBS document symbol / outline provider.
 * @file packages/cbs-lsp/src/features/documentSymbol.ts
 */

import type {
  CancellationToken,
  DocumentSymbol,
  DocumentSymbolParams,
  SymbolKind,
} from 'vscode-languageserver/node';
import {
  SymbolKind as LspSymbolKind,
} from 'vscode-languageserver/node';
import type { BlockKind, BlockNode, CBSNode } from 'risu-workbench-core';

import {
  fragmentAnalysisService,
  type FragmentAnalysisRequest,
  type FragmentAnalysisService,
  type FragmentDocumentAnalysis,
} from '../core';
import { CbsLspTextHelper } from '../helpers/text-helper';
import { isRequestCancelled } from '../utils/request-cancellation';

const OUTLINE_BLOCK_KINDS = new Set<BlockKind>(['when', 'each', 'escape', 'puredisplay', 'func']);
const FRAGMENT_CONTAINER_KIND = LspSymbolKind.Namespace;

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
