/**
 * scope analyzer definition 수집기.
 * @file packages/cbs-lsp/src/analyzer/scope/definition-collector.ts
 */

import { type CBSDocument, type CBSNode, type MacroCallNode } from 'risu-workbench-core';

import { extractFunctionDeclaration } from '../block-header';
import { SymbolTable, type FunctionSymbol, type VariableSymbol } from '../symbolTable';
import { AnalyzableBodyResolver } from './analyzable-body-resolver';
import { normalizeLookupKey } from './lookup-key';
import { getScopeMacroRules, type FragmentVariableKind } from './scope-macro-rules';
import { extractStaticArgument } from './static-argument';

/**
 * FragmentDefinitionMaps 인터페이스.
 * reference pass가 빠르게 조회할 fragment-local 정의 cache 묶음.
 */
export interface FragmentDefinitionMaps {
  chat: Map<string, VariableSymbol>;
  temp: Map<string, VariableSymbol>;
  func: Map<string, FunctionSymbol>;
}

/**
 * createFragmentDefinitionMaps 함수.
 * fragment-local variable/function lookup cache를 초기화함.
 *
 * @returns kind별 definition map 묶음
 */
export function createFragmentDefinitionMaps(): FragmentDefinitionMaps {
  return {
    chat: new Map(),
    temp: new Map(),
    func: new Map(),
  };
}

/**
 * DefinitionCollector 클래스.
 * AST를 순회하면서 chat/temp 변수와 local function 정의를 먼저 수집함.
 */
export class DefinitionCollector {
  /**
   * DefinitionCollector 생성자.
   * symbol table과 fragment-local cache를 받아 definition pass 준비를 끝냄.
   *
   * @param table - 정의 symbol을 누적할 symbol table
   * @param fragmentDefinitions - kind별 definition lookup cache
   * @param sourceText - block header와 static argument range 계산에 쓸 fragment 원문
   * @param bodyResolver - recoverable block body를 제공하는 resolver
   */
  constructor(
    private readonly table: SymbolTable,
    private readonly fragmentDefinitions: FragmentDefinitionMaps,
    private readonly sourceText: string,
    private readonly bodyResolver: AnalyzableBodyResolver,
  ) {}

  /**
   * collect 함수.
   * 문서 AST 전체에서 definition pass를 수행함.
   *
   * @param document - 정의를 수집할 CBS 문서 AST
   */
  collect(document: CBSDocument): void {
    this.collectNodes(document.nodes);
  }

  /**
   * collectNodes 함수.
   * AST 노드 목록을 재귀 순회하며 definition을 기록함.
   *
   * @param nodes - 정의를 순회할 AST 노드 목록
   */
  private collectNodes(nodes: readonly CBSNode[]): void {
    for (const node of nodes) {
      switch (node.type) {
        case 'MacroCall':
          this.collectMacroDefinitions(node);
          // 정의 macro의 값 인수 안에도 nested macro가 올 수 있어 재귀 분석을 이어감.
          for (const argument of node.arguments) {
            this.collectNodes(argument);
          }
          break;
        case 'Block':
          // 함수 정의는 body 참조보다 먼저 등록돼야 recursive call과 후속 call을 안정적으로 연결함.
          if (node.kind === 'func' && this.sourceText.length > 0) {
            const functionDeclaration = extractFunctionDeclaration(node, this.sourceText);
            if (functionDeclaration) {
              const symbol = this.table.addFunctionDefinition(
                functionDeclaration.name,
                functionDeclaration.range,
                functionDeclaration.parameters,
              );
              this.fragmentDefinitions.func.set(functionDeclaration.name, symbol);
            }
          }

          this.collectNodes(node.condition);
          this.collectNodes(this.bodyResolver.getBodyNodes(node, this.sourceText));
          if (node.elseBody) {
            this.collectNodes(node.elseBody);
          }
          break;
        case 'MathExpr':
          this.collectNodes(node.children);
          break;
        default:
          break;
      }
    }
  }

  /**
   * collectMacroDefinitions 함수.
   * 변수 정의 macro의 정적 인수를 읽어 fragment-local 정의를 등록함.
   *
   * @param node - 정의 여부를 판별할 macro call 노드
   */
  private collectMacroDefinitions(node: MacroCallNode): void {
    const normalizedName = normalizeLookupKey(node.name);
    const rules = getScopeMacroRules(normalizedName);

    for (const rule of rules) {
      if (rule.kind !== 'define-variable') {
        continue;
      }

      this.addVariableDefinition(node, rule.variableKind, rule.argumentIndex);
    }
  }

  /**
   * addVariableDefinition 함수.
   * 정적 인수를 fragment variable 정의로 기록하고 lookup cache를 갱신함.
   *
   * @param node - 이름이 들어 있는 macro call 노드
   * @param kind - 등록할 fragment variable 종류
   * @param argumentIndex - 이름을 읽을 macro argument 위치
   */
  private addVariableDefinition(
    node: MacroCallNode,
    kind: FragmentVariableKind,
    argumentIndex: number,
  ): void {
    const identifier = extractStaticArgument(node, argumentIndex, this.sourceText);
    if (!identifier) {
      return;
    }

    const symbol = this.table.addDefinition(identifier.text, kind, identifier.range);
    this.fragmentDefinitions[kind].set(identifier.text, symbol);
  }
}
