/**
 * scope analyzer reference 수집기.
 * @file packages/cbs-lsp/src/analyzer/scope/reference-collector.ts
 */

import {
  type BlockNode,
  type CBSDocument,
  type CBSNode,
  type MacroCallNode,
} from 'risu-workbench-core';

import { extractNumberedArgumentReference } from '../../core/local-functions';
import { extractEachLoopBinding, extractFunctionDeclaration } from '../block-header';
import { ScopeIssueStore, SymbolTable } from '../symbolTable';
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
          this.collectArgumentReference(node, scope);
          break;
        default:
          break;
      }
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
        const loopSymbol = this.table.addDefinition(loopBinding.bindingName, 'loop', loopBinding.bindingRange, {
          scope: 'block',
          allowDuplicate: true,
        });
        bodyScope.loopBindings.set(loopBinding.bindingName, loopSymbol);
      }

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

    if (reference.index >= activeFunction.parameters.length) {
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
