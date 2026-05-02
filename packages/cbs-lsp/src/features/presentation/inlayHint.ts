/**
 * CBS inlay hint provider.
 * CBS fragment 내에서 parameter name, block header, variable scope 힌트를 노출함.
 * @file packages/cbs-lsp/src/features/inlayHint.ts
 */

import {
  type CancellationToken,
  InlayHint,
  InlayHintKind,
  type InlayHintParams,
} from 'vscode-languageserver/node';
import {
  TokenType,
  type BlockNode,
  type CBSNode,
  type MacroCallNode,
  type Position,
  type Range,
  type Token,
} from 'risu-workbench-core';

import {
  ACTIVE_FEATURE_AVAILABILITY,
  fragmentAnalysisService,
  type AgentMetadataAvailabilityContract,
  type FragmentAnalysisRequest,
  type FragmentAnalysisService,
  type FragmentOffsetMapper,
  collectLocalFunctionDeclarations,
  extractNumberedArgumentReference,
  resolveRuntimeArgumentSlot,
  type LocalFunctionDeclaration,
} from '../../core';
import { extractEachLoopBinding } from '../../analyzer/block-header';
import { isRequestCancelled } from '../../utils/request-cancellation';
import { positionToOffset } from '../../utils/position';

export type InlayHintRequestResolver = (params: InlayHintParams) => FragmentAnalysisRequest | null;

export interface InlayHintProviderOptions {
  analysisService?: FragmentAnalysisService;
  resolveRequest?: InlayHintRequestResolver;
}

export const INLAY_HINT_PROVIDER_AVAILABILITY: AgentMetadataAvailabilityContract =
  ACTIVE_FEATURE_AVAILABILITY.inlayHint;

/**
 * positionLessThanOrEqual 함수.
 * 왼쪽 position이 오른쪽 position보다 앞에 있거나 같은지 비교함.
 *
 * @param left - 비교 기준 왼쪽 position
 * @param right - 비교 기준 오른쪽 position
 * @returns left가 right보다 앞이거나 같으면 true
 */
function positionLessThanOrEqual(left: Position, right: Position): boolean {
  return left.line < right.line || (left.line === right.line && left.character <= right.character);
}

/**
 * positionGreaterThanOrEqual 함수.
 * 왼쪽 position이 오른쪽 position보다 뒤에 있거나 같은지 비교함.
 *
 * @param left - 비교 기준 왼쪽 position
 * @param right - 비교 기준 오른쪽 position
 * @returns left가 right보다 뒤이거나 같으면 true
 */
function positionGreaterThanOrEqual(left: Position, right: Position): boolean {
  return left.line > right.line || (left.line === right.line && left.character >= right.character);
}

/**
 * rangeContainsPosition 함수.
 * 주어진 position이 range 안에 들어오는지 판별함.
 *
 * @param range - 검사할 range
 * @param position - 검사할 position
 * @returns position이 range 안에 있으면 true
 */
function rangeContainsPosition(range: Range, position: Position): boolean {
  return positionGreaterThanOrEqual(position, range.start) && positionLessThanOrEqual(position, range.end);
}

/**
 * getArgumentStartPosition 함수.
 * MacroCallNode.arguments[i] 중 첫 번째 노드의 시작 position을 반환함.
 *
 * @param argumentNodes - macro call의 한 argument에 해당하는 CBSNode 배열
 * @returns argument 시작 position, 비어 있으면 null
 */
function getArgumentStartPosition(argumentNodes: readonly CBSNode[]): Position | null {
  const firstNode = argumentNodes[0];
  if (!firstNode) {
    return null;
  }
  return firstNode.range.start;
}

/**
 * InlayHintCollector 클래스.
 * 단일 fragment 분석 결과를 순회하며 inlay hint를 수집함.
 */
class InlayHintCollector {
  readonly hints: InlayHint[] = [];

  private readonly fragmentContent: string;

  private readonly mapper: FragmentOffsetMapper;

  private readonly hostRange: Range;

  private readonly documentText: string;

  private readonly localFunctionDeclarations: LocalFunctionDeclaration[];

  private readonly tokens: readonly Token[];

  private functionContextStack: Array<LocalFunctionDeclaration | null> = [];

  constructor(
    fragmentContent: string,
    mapper: FragmentOffsetMapper,
    hostRange: Range,
    documentText: string,
    localFunctionDeclarations: LocalFunctionDeclaration[],
    tokens: readonly Token[],
  ) {
    this.fragmentContent = fragmentContent;
    this.mapper = mapper;
    this.hostRange = hostRange;
    this.documentText = documentText;
    this.localFunctionDeclarations = localFunctionDeclarations;
    this.tokens = tokens;
  }

  /**
   * walkNodes 함수.
   * AST node 배열을 순회하며 visitNode를 호출함.
   *
   * @param nodes - 순회할 CBSNode 배열
   */
  walkNodes(nodes: readonly CBSNode[]): void {
    for (const node of nodes) {
      this.visitNode(node);
    }
  }

  private visitNode(node: CBSNode): void {
    switch (node.type) {
      case 'MacroCall':
        this.visitMacroCall(node);
        break;
      case 'Block':
        this.visitBlock(node);
        break;
      default:
        break;
    }
  }

  private visitMacroCall(node: MacroCallNode): void {
    const normalizedName = node.name.toLowerCase();

    switch (normalizedName) {
      case 'setvar':
        this.addArgumentHints(node, ['name', 'value']);
        this.walkNestedNodes(node.arguments);
        break;
      case 'getvar':
        this.addArgumentHints(node, ['name']);
        this.walkNestedNodes(node.arguments);
        break;
      case 'call':
        this.visitCallMacro(node);
        this.walkNestedNodes(node.arguments);
        break;
      case 'arg':
        this.visitArgMacro(node);
        this.walkNestedNodes(node.arguments);
        break;
      default:
        this.walkNestedNodes(node.arguments);
        break;
    }
  }

  private visitBlock(node: BlockNode): void {
    switch (node.kind) {
      case 'when':
        this.addBlockConditionHint(node, 'condition');
        this.walkNodes(node.condition);
        this.walkNodes(node.body);
        if (node.elseBody) {
          this.walkNodes(node.elseBody);
        }
        break;
      case 'each':
        this.visitEachBlock(node);
        this.walkNodes(node.condition);
        this.walkNodes(node.body);
        if (node.elseBody) {
          this.walkNodes(node.elseBody);
        }
        break;
      case 'func': {
        // collectLocalFunctionDeclarations로 미리 수집한 declaration 중 openRange가 일치하는
        // 것을 찾아 정확한 parameterDeclarations를 재사용합니다.
        const matchedDeclaration = this.localFunctionDeclarations.find((decl) => {
          const declOffset = positionToOffset(this.fragmentContent, decl.range.start);
          const blockNameOffset = positionToOffset(this.fragmentContent, node.openRange.start);
          const headerText = this.fragmentContent.slice(blockNameOffset);
          const nameIndex = headerText.indexOf(decl.name);
          return nameIndex >= 0 && declOffset === blockNameOffset + nameIndex;
        });
        this.visitFuncBlock(matchedDeclaration ?? null);
        this.functionContextStack.push(matchedDeclaration ?? null);
        if (matchedDeclaration) {
          this.scanArgReferencesInFuncBody(node, matchedDeclaration);
        }
        this.walkNodes(node.condition);
        this.walkNodes(node.body);
        if (node.elseBody) {
          this.walkNodes(node.elseBody);
        }
        this.functionContextStack.pop();
        break;
      }
      default:
        this.walkNodes(node.condition);
        this.walkNodes(node.body);
        if (node.elseBody) {
          this.walkNodes(node.elseBody);
        }
        break;
    }
  }

  private walkNestedNodes(argumentsList: readonly (readonly CBSNode[])[]): void {
    for (const argumentNodes of argumentsList) {
      this.walkNodes(argumentNodes);
    }
  }

  /**
   * addArgumentHints 함수.
   * MacroCallNode의 각 argument 시작 위치에 parameter name inlay hint를 추가함.
   *
   * @param node - 대상 macro call 노드
   * @param labels - 각 argument 슬롯에 표시할 label 문자열 배열
   */
  private addArgumentHints(node: MacroCallNode, labels: readonly string[]): void {
    for (let index = 0; index < labels.length && index < node.arguments.length; index += 1) {
      const startPosition = getArgumentStartPosition(node.arguments[index]);
      if (startPosition) {
        this.addHint(startPosition, `${labels[index]}:`, InlayHintKind.Parameter);
      }
    }
  }

  /**
   * visitCallMacro 함수.
   * `call::funcName::arg0::arg1...`에서 함수 이름 뒤 argument에 parameter hint를 추가함.
   * 문서 내에 동일 이름의 `#func` 선언이 있으면 해당 파라미터 이름을, 없으면 슬롯 번호를 보여줌.
   *
   * @param node - call macro call 노드
   */
  private visitCallMacro(node: MacroCallNode): void {
    if (node.arguments.length === 0) {
      return;
    }

    const functionNameArgument = getArgumentStartPosition(node.arguments[0]);
    if (functionNameArgument) {
      this.addHint(functionNameArgument, 'func:', InlayHintKind.Parameter);
    }

    if (node.arguments.length < 2) {
      return;
    }

    const functionNameNode = node.arguments[0][0];
    const functionName =
      functionNameNode?.type === 'PlainText' ? functionNameNode.value : '';
    const declaration = functionName
      ? this.localFunctionDeclarations.find((decl) => decl.name === functionName) ?? null
      : null;

    for (let index = 1; index < node.arguments.length; index += 1) {
      const startPosition = getArgumentStartPosition(node.arguments[index]);
      if (!startPosition) {
        continue;
      }
      const runtimeArgumentIndex = index;
      const runtimeSlot = declaration
        ? resolveRuntimeArgumentSlot(declaration, runtimeArgumentIndex)
        : null;
      const parameterName = runtimeSlot?.kind === 'call-argument' ? runtimeSlot.parameterName : null;
      const label = parameterName
        ? `arg::${runtimeArgumentIndex} \u2192 ${parameterName}:`
        : `arg::${runtimeArgumentIndex}:`;
      this.addHint(startPosition, label, InlayHintKind.Parameter);
    }
  }

  /**
   * visitArgMacro 함수.
   * `arg::N` macro에서 현재 함수 문맥의 파라미터 이름을 hint로 추가함.
   * 문맥이 없으면 슬롯 번호만 보여줌.
   *
   * @param node - arg macro call 노드
   */
  private visitArgMacro(node: MacroCallNode): void {
    const argRef = extractNumberedArgumentReference(node, this.fragmentContent);
    if (!argRef) {
      return;
    }

    const startPosition = getArgumentStartPosition(node.arguments[0]);
    if (!startPosition) {
      return;
    }

    const currentFunction = this.functionContextStack[this.functionContextStack.length - 1];
    const runtimeSlot = currentFunction
      ? resolveRuntimeArgumentSlot(currentFunction, argRef.index)
      : null;
    const parameterName = runtimeSlot?.kind === 'call-argument' ? runtimeSlot.parameterName : null;
    const label = parameterName ? `${parameterName}:` : `arg::${argRef.index}:`;
    this.addHint(startPosition, label, InlayHintKind.Parameter);
  }

  /**
   * addBlockConditionHint 함수.
   * BlockNode condition 첫 노드 시작 위치에 label inlay hint를 추가함.
   *
   * @param node - 대상 block 노드
   * @param label - condition 앞에 표시할 label
   */
  private addBlockConditionHint(node: BlockNode, label: string): void {
    const startPosition = getArgumentStartPosition(node.condition);
    if (startPosition) {
      this.addHint(startPosition, `${label}:`, InlayHintKind.Parameter);
    }
  }

  /**
   * visitEachBlock 함수.
   * `#each` block header에서 iterator와 alias 위치에 inlay hint를 추가함.
   *
   * @param node - each block 노드
   */
  private visitEachBlock(node: BlockNode): void {
    const iteratorStart = getArgumentStartPosition(node.condition);
    if (iteratorStart) {
      this.addHint(iteratorStart, 'iterator:', InlayHintKind.Parameter);
    }

    const binding = extractEachLoopBinding(node, this.fragmentContent);
    if (binding) {
      this.addHint(binding.bindingRange.start, 'alias:', InlayHintKind.Parameter);
    }
  }

  /**
   * visitFuncBlock 함수.
   * `#func` block header에서 함수 이름 뒤 각 파라미터 시작 위치에 arg slot mapping hint를 추가함.
   *
   * @param node - func block 노드
   * @param declaration - 문서에서 수집한 local function 선언 정보, 없으면 null
   */
  private visitFuncBlock(declaration: LocalFunctionDeclaration | null): void {
    if (!declaration || declaration.parameterDeclarations.length === 0) {
      return;
    }

    for (const parameter of declaration.parameterDeclarations) {
      const label = `arg::${parameter.runtimeArgumentIndex} \u2192 ${parameter.name}:`;
      this.addHint(parameter.range.start, label, InlayHintKind.Parameter);
    }
  }

  /**
   * scanArgReferencesInFuncBody 함수.
   * `#func` body 내에서 tokenizer token stream을 순회하며 `{{arg::N}}` 패턴을 찾고,
   * 해당 slot에 대응하는 parameter name inlay hint를 추가함.
   * parser는 `#func` body를 PlainText로 처리하므로 AST 기반 순회가 아닌 token 기반 스캔이 필요함.
   *
   * @param node - func block 노드
   * @param declaration - 현재 함수의 parameter 선언 정보
   */
  private scanArgReferencesInFuncBody(node: BlockNode, declaration: LocalFunctionDeclaration): void {
    const bodyStartOffset = positionToOffset(this.fragmentContent, node.openRange.end);
    const bodyEndOffset = node.closeRange
      ? positionToOffset(this.fragmentContent, node.closeRange.start)
      : this.fragmentContent.length;
    const nestedRanges = this.collectNestedFunctionRanges(node.body);

    for (let index = 0; index < this.tokens.length - 2; index += 1) {
      const functionNameToken = this.tokens[index];
      const separatorToken = this.tokens[index + 1];
      const argumentToken = this.tokens[index + 2];

      if (
        functionNameToken?.type !== TokenType.FunctionName ||
        functionNameToken.value.toLowerCase() !== 'arg' ||
        separatorToken?.type !== TokenType.ArgumentSeparator ||
        argumentToken?.type !== TokenType.Argument
      ) {
        continue;
      }

      const tokenStartOffset = positionToOffset(this.fragmentContent, functionNameToken.range.start);
      if (tokenStartOffset < bodyStartOffset || tokenStartOffset >= bodyEndOffset) {
        continue;
      }

      if (this.isOffsetInsideNestedFunction(tokenStartOffset, nestedRanges)) {
        continue;
      }

      const argIndex = Number.parseInt(argumentToken.value.trim(), 10);
      const runtimeSlot = resolveRuntimeArgumentSlot(declaration, argIndex);
      const parameterName = runtimeSlot?.kind === 'call-argument' ? runtimeSlot.parameterName : null;
      const label = parameterName ? `${parameterName}:` : `arg::${argIndex}:`;
      this.addHint(argumentToken.range.start, label, InlayHintKind.Parameter);
    }
  }

  /**
   * collectNestedFunctionRanges 함수.
   * 현재 func body subtree 안의 nested `#func` block 전체 range를 수집함.
   *
   * @param nodes - 현재 subtree의 AST 노드 목록
   * @returns nested local function range 목록
   */
  private collectNestedFunctionRanges(nodes: readonly CBSNode[]): Range[] {
    const ranges: Range[] = [];
    this.collectNestedFunctionRangesFromNodes(nodes, ranges);
    return ranges;
  }

  private collectNestedFunctionRangesFromNodes(nodes: readonly CBSNode[], ranges: Range[]): void {
    for (const child of nodes) {
      if (child.type === 'Block') {
        this.collectNestedFunctionRangesFromBlock(child, ranges);
        continue;
      }
      if (child.type === 'MacroCall') {
        for (const argument of child.arguments) {
          this.collectNestedFunctionRangesFromNodes(argument, ranges);
        }
      }
    }
  }

  private collectNestedFunctionRangesFromBlock(block: BlockNode, ranges: Range[]): void {
    if (block.kind === 'func') {
      ranges.push({
        start: block.openRange.start,
        end: block.closeRange?.end ?? block.openRange.end,
      });
      return;
    }
    this.collectNestedFunctionRangesFromNodes(block.condition, ranges);
    this.collectNestedFunctionRangesFromNodes(block.body, ranges);
    if (block.elseBody) {
      this.collectNestedFunctionRangesFromNodes(block.elseBody, ranges);
    }
  }

  /**
   * isOffsetInsideNestedFunction 함수.
   * 현재 offset이 nested `#func` range 안에 들어오는지 판별함.
   *
   * @param offset - 검사할 fragment-local offset
   * @param nestedRanges - nested local function range 목록
   * @returns nested local function range 안이면 true
   */
  private isOffsetInsideNestedFunction(offset: number, nestedRanges: readonly Range[]): boolean {
    return nestedRanges.some((range) => {
      const startOffset = positionToOffset(this.fragmentContent, range.start);
      const endOffset = positionToOffset(this.fragmentContent, range.end);
      return offset >= startOffset && offset <= endOffset;
    });
  }

  /**
   * addHint 함수.
   * fragment-local position을 host position으로 변환하고, 요청 range와 교차하는 경우만
   * inlay hint를 수집 목록에 추가함.
   *
   * @param localPosition - fragment-local 기준 hint position
   * @param label - 표시할 label 문자열
   * @param kind - inlay hint 종류
   */
  private addHint(localPosition: Position, label: string, kind: InlayHintKind): void {
    const localOffset = positionToOffset(this.fragmentContent, localPosition);
    const hostPosition = this.mapper.toHostPosition(this.documentText, localOffset);
    if (!hostPosition) {
      return;
    }

    if (!rangeContainsPosition(this.hostRange, hostPosition)) {
      return;
    }

    this.hints.push({
      position: hostPosition,
      label,
      kind,
    });
  }
}

/**
 * InlayHintProvider 클래스.
 * CBS fragment 내에서 setvar/getvar/#when/#each/#func/call/arg에 대한
 * fragment-safe inlay hint를 계산함.
 */
export class InlayHintProvider {
  private readonly analysisService: FragmentAnalysisService;

  private readonly resolveRequest: InlayHintRequestResolver;

  readonly availability: AgentMetadataAvailabilityContract = INLAY_HINT_PROVIDER_AVAILABILITY;

  /**
   * constructor 함수.
   * inlay hint 계산에 필요한 fragment analysis seam을 보관함.
   *
   * @param options - analysis service와 request resolver override
   */
  constructor(options: InlayHintProviderOptions = {}) {
    this.analysisService = options.analysisService ?? fragmentAnalysisService;
    this.resolveRequest = options.resolveRequest ?? (() => null);
  }

  /**
   * provide 함수.
   * 현재 문서 range 내의 CBS fragment-safe inlay hint 목록을 계산함.
   * non-CBS 문서나 지원하지 않는 구조에서는 빈 배열을 반환함.
   *
   * @param params - 현재 inlay hint 요청
   * @param cancellationToken - 요청 취소 여부를 확인할 토큰
   * @returns fragment-safe inlay hint 목록
   */
  provide(params: InlayHintParams, cancellationToken?: CancellationToken): InlayHint[] {
    if (isRequestCancelled(cancellationToken)) {
      return [];
    }

    const request = this.resolveRequest(params);
    if (!request) {
      return [];
    }

    const analysis = this.analysisService.analyzeDocument(request, cancellationToken);
    if (!analysis) {
      return [];
    }

    if (isRequestCancelled(cancellationToken)) {
      return [];
    }

    const hints: InlayHint[] = [];

    for (const fragmentAnalysis of analysis.fragmentAnalyses) {
      if (isRequestCancelled(cancellationToken)) {
        return hints;
      }

      const { mapper, document, fragment } = fragmentAnalysis;
      const localFunctionDeclarations = collectLocalFunctionDeclarations(document, fragment.content);

      const collector = new InlayHintCollector(
        fragment.content,
        mapper,
        params.range,
        request.text,
        localFunctionDeclarations,
        fragmentAnalysis.tokens,
      );
      collector.walkNodes(document.nodes);
      hints.push(...collector.hints);
    }

    return hints;
  }
}
