/**
 * scope analyzer reference 수집기.
 * @file packages/cbs-lsp/src/analyzer/scope/reference-collector.ts
 */

import {
  type BlockNode,
  type CBSDocument,
  type CBSNode,
  type MacroCallNode,
  type Range,
} from 'risu-workbench-core';

import {
  extractNumberedArgumentReference,
  type NumberedArgumentReference,
} from '../../core/local-functions';
import { offsetToPosition, positionToOffset } from '../../utils/position';
import {
  extractEachLoopBinding,
  extractFunctionDeclaration,
  isStaticEachIteratorIdentifier,
} from '../block-header';
import { ScopeIssueStore, SymbolTable, type FunctionSymbol } from '../symbolTable';
import { AnalyzableBodyResolver } from './analyzable-body-resolver';
import type { FragmentDefinitionMaps } from './definition-collector';
import { normalizeLookupKey } from './lookup-key';
import {
  createScopeFrame,
  findActiveFunction,
  findLoopBinding,
  type ScopeFrame,
} from './scope-frame';
import { getScopeMacroRules, type FragmentVariableKind } from './scope-macro-rules';
import { extractStaticArgument } from './static-argument';

/**
 * ReferenceCollector 클래스.
 * 현재 scope frame을 유지하면서 macro/block 내부 참조를 재귀적으로 수집함.
 */
export class ReferenceCollector {
  /**
   * ReferenceCollector 생성자.
   * definition pass 결과와 현재 fragment 원문을 받아 reference pass 준비를 끝냄.
   *
   * @param table - 정의와 참조를 누적할 symbol table
   * @param issues - scope 진단을 기록할 issue store
   * @param fragmentDefinitions - definition pass에서 만든 fragment-local lookup cache
   * @param sourceText - 정적 인수와 block header range 계산에 쓸 fragment 원문
   * @param bodyResolver - recoverable block body를 제공하는 resolver
   */
  constructor(
    private readonly table: SymbolTable,
    private readonly issues: ScopeIssueStore,
    private readonly fragmentDefinitions: FragmentDefinitionMaps,
    private readonly sourceText: string,
    private readonly bodyResolver: AnalyzableBodyResolver,
  ) {}

  /**
   * collect 함수.
   * 문서 AST 전체에서 reference pass를 수행함.
   *
   * @param document - 참조를 수집할 CBS 문서 AST
   */
  collect(document: CBSDocument): void {
    this.collectNodes(document.nodes, createScopeFrame());
  }

  /**
   * collectNodes 함수.
   * AST 노드 목록을 재귀 순회하며 reference를 기록함.
   *
   * @param nodes - 참조를 순회할 AST 노드 목록
   * @param scope - loop/function 문맥이 들어 있는 현재 scope frame
   */
  private collectNodes(nodes: readonly CBSNode[], scope: ScopeFrame): void {
    for (const node of nodes) {
      switch (node.type) {
        case 'MacroCall':
          this.collectMacroReferences(node, scope);
          // macro 인수 안에 중첩 macro나 수식이 있을 수 있어 argument AST도 같은 scope로 내려감.
          for (const argument of node.arguments) {
            this.collectNodes(argument, scope);
          }
          break;
        case 'Block':
          this.collectBlockReferences(node, scope);
          break;
        case 'MathExpr':
          this.collectNodes(node.children, scope);
          break;
        case 'PlainText':
          this.collectLiteralArgumentReferences(node, scope);
          break;
        default:
          break;
      }
    }
  }

  /**
   * collectMacroReferences 함수.
   * builtin macro 의미에 따라 변수, loop alias, local function, arg slot 참조를 해석함.
   *
   * @param node - 참조 여부를 판별할 macro call 노드
   * @param scope - loop alias와 active function이 들어 있는 현재 scope frame
   */
  private collectMacroReferences(node: MacroCallNode, scope: ScopeFrame): void {
    const normalizedName = normalizeLookupKey(node.name);
    const rules = getScopeMacroRules(normalizedName);
    let handledArgumentReference = false;

    for (const rule of rules) {
      switch (rule.kind) {
        case 'reference-variable':
          this.collectFragmentVariableReference(node, rule.variableKind, rule.argumentIndex);
          break;
        case 'reference-global-variable':
          this.collectGlobalVariableReference(node, rule.argumentIndex);
          break;
        case 'reference-loop-binding':
          this.collectLoopBindingReference(node, scope, rule.argumentIndex);
          break;
        case 'reference-function':
          this.collectFunctionReference(node, rule.argumentIndex);
          break;
        case 'reference-function-argument':
          handledArgumentReference = true;
          this.collectArgumentReference(node, scope);
          break;
        default:
          break;
      }
    }

    if (!handledArgumentReference && extractNumberedArgumentReference(node, this.sourceText)) {
      this.collectArgumentReference(node, scope);
    }
  }

  /**
   * collectBlockReferences 함수.
   * block 종류에 맞는 child scope를 만들고 condition/body/else 참조를 이어서 수집함.
   *
   * @param node - 내부 body를 내려가며 분석할 block 노드
   * @param scope - 부모 block까지 연결된 현재 scope frame
   */
  private collectBlockReferences(node: BlockNode, scope: ScopeFrame): void {
    this.collectNodes(node.condition, scope);

    if (node.kind === 'each') {
      const bodyScope = createScopeFrame(scope);
      const loopBinding = this.sourceText.length > 0 ? extractEachLoopBinding(node, this.sourceText) : null;
      if (loopBinding) {
        // iterator source는 body alias 정의보다 먼저 읽힌 값이라 부모 scope 기준 참조로 기록함.
        this.collectEachIteratorReference(loopBinding.iteratorExpression, loopBinding.iteratorRange);
        const loopSymbol = this.table.addDefinition(loopBinding.bindingName, 'loop', loopBinding.bindingRange, {
          scope: 'block',
          allowDuplicate: true,
        });
        bodyScope.loopBindings.set(loopBinding.bindingName, loopSymbol);
      }

      // body는 새 loop scope를 쓰고 else branch는 alias가 보이지 않는 부모 scope를 유지함.
      this.collectNodes(this.bodyResolver.getBodyNodes(node, this.sourceText), bodyScope);
      if (node.elseBody) {
        this.collectNodes(node.elseBody, scope);
      }
      return;
    }

    if (node.kind === 'func') {
      const bodyScope = createScopeFrame(scope);
      const functionDeclaration = this.sourceText.length
        ? extractFunctionDeclaration(node, this.sourceText)
        : null;
      // arg::N은 현재 함수 선언의 parameter list에만 연결되므로 active function을 좁힘.
      bodyScope.activeFunction = functionDeclaration
        ? this.fragmentDefinitions.func.get(functionDeclaration.name) ?? null
        : bodyScope.activeFunction;

      this.collectNodes(this.bodyResolver.getBodyNodes(node, this.sourceText), bodyScope);
      return;
    }

    this.collectNodes(this.bodyResolver.getBodyNodes(node, this.sourceText), scope);
    if (node.elseBody) {
      this.collectNodes(node.elseBody, scope);
    }
  }

  /**
   * collectEachIteratorReference 함수.
   * 정적 `#each` iterator source를 fragment-local chat variable read로 기록함.
   *
   * @param iteratorExpression - `#each` header의 iterator source 표현식
   * @param iteratorRange - iterator source가 차지하는 fragment-local 범위
   */
  private collectEachIteratorReference(iteratorExpression: string, iteratorRange: Range): void {
    if (!isStaticEachIteratorIdentifier(iteratorExpression)) {
      return;
    }

    const symbol = this.fragmentDefinitions.chat.get(iteratorExpression);
    if (!symbol) {
      return;
    }

    this.table.addVariableReference(symbol, iteratorRange);
  }

  /**
   * collectFragmentVariableReference 함수.
   * chat/temp 변수 참조를 정의 cache와 대조해 reference 또는 undefined 진단으로 기록함.
   *
   * @param node - 변수 이름이 들어 있는 macro call 노드
   * @param kind - 조회할 fragment variable 종류
   * @param argumentIndex - 이름을 읽을 macro argument 위치
   */
  private collectFragmentVariableReference(
    node: MacroCallNode,
    kind: FragmentVariableKind,
    argumentIndex: number,
  ): void {
    const identifier = extractStaticArgument(node, argumentIndex, this.sourceText);
    if (!identifier) {
      return;
    }

    const symbol = this.fragmentDefinitions[kind].get(identifier.text);
    if (symbol) {
      this.table.addVariableReference(symbol, identifier.range);
      return;
    }

    this.issues.recordUndefinedReference(identifier.text, kind, identifier.range);
  }

  /**
   * collectGlobalVariableReference 함수.
   * `getglobalvar` 참조를 external symbol로 기록함.
   *
   * @param node - global variable 이름이 들어 있는 macro call 노드
   * @param argumentIndex - 이름을 읽을 macro argument 위치
   */
  private collectGlobalVariableReference(node: MacroCallNode, argumentIndex: number): void {
    const identifier = extractStaticArgument(node, argumentIndex, this.sourceText);
    if (!identifier) {
      return;
    }

    const symbol = this.table.ensureExternalSymbol(identifier.text, 'global');
    this.table.addVariableReference(symbol, identifier.range);
  }

  /**
   * collectLoopBindingReference 함수.
   * `slot::name` loop alias를 현재 scope 체인과 대조해 참조 또는 undefined 진단으로 기록함.
   *
   * @param node - loop alias 이름이 들어 있는 macro call 노드
   * @param scope - 현재 scope frame
   * @param argumentIndex - 이름을 읽을 macro argument 위치
   */
  private collectLoopBindingReference(
    node: MacroCallNode,
    scope: ScopeFrame,
    argumentIndex: number,
  ): void {
    const identifier = extractStaticArgument(node, argumentIndex, this.sourceText);
    if (!identifier) {
      return;
    }

    const loopSymbol = findLoopBinding(scope, identifier.text);
    if (loopSymbol) {
      this.table.addVariableReference(loopSymbol, identifier.range);
      return;
    }

    this.issues.recordUndefinedReference(identifier.text, 'loop', identifier.range);
  }

  /**
   * collectFunctionReference 함수.
   * `call::name` 로컬 함수 참조를 fragment-local 정의와 연결함.
   *
   * @param node - 함수 이름이 들어 있는 macro call 노드
   * @param argumentIndex - 이름을 읽을 macro argument 위치
   */
  private collectFunctionReference(node: MacroCallNode, argumentIndex: number): void {
    const identifier = extractStaticArgument(node, argumentIndex, this.sourceText);
    if (!identifier) {
      return;
    }

    const functionSymbol = this.fragmentDefinitions.func.get(identifier.text);
    if (functionSymbol) {
      this.table.addFunctionReference(functionSymbol, identifier.range);
    } else {
      this.issues.recordInvalidFunctionReference({
        name: identifier.text,
        range: identifier.range,
        reason: 'unresolved-call',
      });
    }

    this.collectUnsafeNestedCallArguments(node, argumentIndex, identifier.text);
  }

  /**
   * collectUnsafeNestedCallArguments 함수.
   * call:: 값 인자 안에 upstream plain split이 보존할 수 없는 nested :: macro가 있는지 기록함.
   *
   * @param node - call:: macro 노드
   * @param functionNameArgumentIndex - 함수 이름 슬롯의 argument index
   * @param functionName - diagnostics 메시지에 표시할 local function 이름
   */
  private collectUnsafeNestedCallArguments(
    node: MacroCallNode,
    functionNameArgumentIndex: number,
    functionName: string,
  ): void {
    for (const argument of node.arguments.slice(functionNameArgumentIndex + 1)) {
      if (!containsNestedSeparatorMacro(argument, this.sourceText)) {
        continue;
      }

      this.issues.recordInvalidFunctionReference({
        name: functionName,
        range: getArgumentRange(argument) ?? node.range,
        reason: 'unsafe-nested-argument',
        detail:
          'call:: uses upstream plain split semantics; nested CBS arguments containing :: may be split incorrectly.',
      });
    }
  }

  /**
   * collectArgumentReference 함수.
   * `arg::N` numbered slot을 active function parameter 범위와 대조해 기록함.
   *
   * @param node - numbered argument reference가 들어 있는 macro call 노드
   * @param scope - 현재 scope frame
   */
  private collectArgumentReference(node: MacroCallNode, scope: ScopeFrame): void {
    const reference = extractNumberedArgumentReference(node, this.sourceText);
    if (!reference) {
      return;
    }

    this.recordArgumentReference(reference, scope);
  }

  /**
   * collectLiteralArgumentReferences 함수.
   * pure-mode `#func` body에 plain text로 남은 `{{arg::N}}` 참조를 복구해 검증함.
   *
   * @param node - 검사할 plain-text AST 노드
   * @param scope - 현재 scope frame
   */
  private collectLiteralArgumentReferences(
    node: { value: string; range: Range },
    scope: ScopeFrame,
  ): void {
    if (this.sourceText.length === 0 || !node.value.includes('arg::')) {
      return;
    }

    const nodeStartOffset = positionToOffset(this.sourceText, node.range.start);
    for (const match of node.value.matchAll(/\{\{\s*arg::(\d+)\s*\}\}/giu)) {
      const rawText = match[1];
      if (!rawText) {
        continue;
      }

      const matchStart = match.index ?? 0;
      const rawTextStart = match[0].indexOf(rawText);
      const indexStartOffset = nodeStartOffset + matchStart + rawTextStart;
      this.recordArgumentReference(
        {
          index: Number.parseInt(rawText, 10),
          rawText,
          range: {
            start: offsetToPosition(this.sourceText, indexStartOffset),
            end: offsetToPosition(this.sourceText, indexStartOffset + rawText.length),
          },
        },
        scope,
      );
    }
  }

  /**
   * recordArgumentReference 함수.
   * 추출된 `arg::N` 참조를 active function의 upstream runtime slot range와 대조함.
   *
   * @param reference - 검증할 numbered argument 참조
   * @param scope - 현재 scope frame
   */
  private recordArgumentReference(reference: NumberedArgumentReference, scope: ScopeFrame): void {

    const activeFunction = findActiveFunction(scope);
    if (!activeFunction) {
      this.issues.recordInvalidArgumentReference({
        rawText: reference.rawText,
        index: reference.index,
        range: reference.range,
        reason: 'outside-function',
      });
      return;
    }

    const runtimeSlotCount = getRuntimeSlotCountForFunctionSymbol(activeFunction);
    if (reference.index >= runtimeSlotCount) {
      this.issues.recordInvalidArgumentReference({
        rawText: reference.rawText,
        index: reference.index,
        range: reference.range,
        reason: 'out-of-range',
        functionName: activeFunction.name,
        parameterCount: activeFunction.parameters.length,
      });
    }
  }
}

/**
 * getRuntimeSlotCountForFunctionSymbol 함수.
 * scope pass의 FunctionSymbol에서 upstream `arg::N` 런타임 슬롯 수를 계산함.
 *
 * @param activeFunction - 현재 scope에서 활성화된 로컬 함수 심볼
 * @returns function-name 슬롯 1개를 포함한 런타임 슬롯 개수
 */
function getRuntimeSlotCountForFunctionSymbol(activeFunction: FunctionSymbol): number {
  return activeFunction.parameters.length + 1;
}

/**
 * containsNestedSeparatorMacro 함수.
 * node 목록 안에서 raw source에 `::`를 포함한 nested CBS macro 호출을 찾음.
 *
 * @param nodes - 검사할 argument/body node 목록
 * @param sourceText - raw macro source를 잘라낼 fragment 원문
 * @returns separator macro가 하나라도 있으면 true
 */
function containsNestedSeparatorMacro(nodes: readonly CBSNode[], sourceText: string): boolean {
  return nodes.some((node) => {
    if (node.type === 'MacroCall') {
      const raw = sourceText.slice(
        positionToOffset(sourceText, node.range.start),
        positionToOffset(sourceText, node.range.end),
      );
      return raw.includes('::');
    }

    if (node.type === 'Block') {
      return (
        containsNestedSeparatorMacro(node.condition, sourceText) ||
        containsNestedSeparatorMacro(node.body, sourceText) ||
        containsNestedSeparatorMacro(node.elseBody ?? [], sourceText)
      );
    }

    if (node.type === 'MathExpr') {
      return containsNestedSeparatorMacro(node.children, sourceText);
    }

    return false;
  });
}

/**
 * getArgumentRange 함수.
 * macro argument node 목록 전체가 차지하는 범위를 계산함.
 *
 * @param nodes - 단일 macro argument를 구성하는 node 목록
 * @returns argument 전체 범위, 비어 있으면 null
 */
function getArgumentRange(nodes: readonly CBSNode[]): Range | null {
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (!first || !last) {
    return null;
  }

  return {
    start: first.range.start,
    end: last.range.end,
  };
}
