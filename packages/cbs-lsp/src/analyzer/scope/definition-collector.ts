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
          for (const argument of node.arguments) {
            this.collectNodes(argument);
          }
          break;
        case 'Block':
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
