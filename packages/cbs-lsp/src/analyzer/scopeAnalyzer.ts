import {
  CBSParser,
  type BlockNode,
  type CBSDocument,
  type CBSNode,
  type MacroCallNode,
  type Range,
} from 'risu-workbench-core';

import { offsetToPosition, positionToOffset } from '../utils/position';
import { extractNumberedArgumentReference } from '../core/local-functions';
import { extractEachLoopBinding, type EachLoopBinding } from './diagnostics';
import {
  SymbolTable,
  type FunctionSymbol,
  type VariableSymbol,
  type VariableSymbolKind,
} from './symbolTable';

type FragmentVariableKind = Extract<VariableSymbolKind, 'chat' | 'temp'>;

interface FragmentDefinitionMaps {
  chat: Map<string, VariableSymbol>;
  temp: Map<string, VariableSymbol>;
  func: Map<string, FunctionSymbol>;
}

interface ScopeFrame {
  parent: ScopeFrame | null;
  loopBindings: Map<string, VariableSymbol>;
  activeFunction: FunctionSymbol | null;
}

const CHAT_VARIABLE_DEFINITION_MACROS = new Set(['setvar', 'setdefaultvar', 'addvar']);
const TEMP_VARIABLE_DEFINITION_MACROS = new Set(['settempvar']);
const CHAT_VARIABLE_REFERENCE_MACROS = new Set(['getvar', 'addvar']);
const TEMP_VARIABLE_REFERENCE_MACROS = new Set(['tempvar', 'gettempvar']);

/**
 * collectVisibleLoopBindingsFromNodePath 함수.
 * 현재 cursor nodePath에서 보이는 `#each ... as alias` binding을 안쪽 scope 우선순위로 수집함.
 *
 * @param nodePath - cursor 위치를 감싸는 AST node path
 * @param sourceText - loop binding range를 계산할 fragment 원문
 * @returns shadowing을 반영한 visible loop binding 목록
 */
export function collectVisibleLoopBindingsFromNodePath(
  nodePath: readonly CBSNode[],
  sourceText: string,
  fragmentLocalOffset?: number,
): EachLoopBinding[] {
  const visibleBindings: EachLoopBinding[] = [];
  const seenBindings = new Set<string>();

  const appendBinding = (binding: EachLoopBinding | null) => {
    if (!binding || seenBindings.has(binding.bindingName)) {
      return;
    }

    seenBindings.add(binding.bindingName);
    visibleBindings.push(binding);
  };

  if (sourceText.length > 0 && fragmentLocalOffset !== undefined) {
    for (const binding of collectVisibleLoopBindingsFromSource(sourceText, fragmentLocalOffset)) {
      appendBinding(binding);
    }
  }

  if (sourceText.length > 0) {
    for (let index = nodePath.length - 1; index >= 0; index -= 1) {
      const node = nodePath[index];
      if (node?.type !== 'Block' || node.kind !== 'each') {
        continue;
      }

      appendBinding(extractEachLoopBinding(node, sourceText));
    }
  }

  return visibleBindings;
}

/**
 * resolveVisibleLoopBindingFromNodePath 함수.
 * 현재 cursor에서 실제로 보이는 `slot::name` loop alias binding을 shadowing 우선순위까지 반영해 찾음.
 *
 * @param nodePath - cursor 위치를 감싸는 AST node path
 * @param sourceText - binding range를 계산할 fragment 원문
 * @param bindingName - `slot::` 뒤에서 찾을 alias 이름
 * @param fragmentLocalOffset - malformed recovery까지 포함해 현재 visible scope를 복원할 cursor offset
 * @returns 현재 scope에서 연결된 binding과 relative scope depth, 없으면 null
 */
export function resolveVisibleLoopBindingFromNodePath(
  nodePath: readonly CBSNode[],
  sourceText: string,
  bindingName: string,
  fragmentLocalOffset?: number,
): { binding: EachLoopBinding; scopeDepth: number } | null {
  const visibleBindings = collectVisibleLoopBindingsFromNodePath(
    nodePath,
    sourceText,
    fragmentLocalOffset,
  );
  const normalizedBindingName = bindingName.trim();
  if (normalizedBindingName.length === 0) {
    return null;
  }

  const scopeDepth = visibleBindings.findIndex(
    (binding) => binding.bindingName === normalizedBindingName,
  );
  if (scopeDepth === -1) {
    return null;
  }

  return {
    binding: visibleBindings[scopeDepth],
    scopeDepth,
  };
}

interface OpenEachFrame {
  binding: EachLoopBinding | null;
}

/**
 * collectVisibleLoopBindingsFromSource 함수.
 * cursor 앞 fragment text를 스택처럼 훑어 malformed recovery 상황에서도 현재 visible `#each` alias를 복원함.
 *
 * @param sourceText - 현재 fragment 원문
 * @param fragmentLocalOffset - cursor fragment-local offset
 * @returns 안쪽 scope 우선순위로 정렬된 recoverable loop binding 목록
 */
function collectVisibleLoopBindingsFromSource(
  sourceText: string,
  fragmentLocalOffset: number,
): EachLoopBinding[] {
  const prefixText = sourceText.slice(0, fragmentLocalOffset);
  const frames: OpenEachFrame[] = [];
  const macroPattern = /\{\{([\s\S]*?)\}\}/g;

  for (const match of prefixText.matchAll(macroPattern)) {
    const rawMacro = match[1]?.trim() ?? '';
    if (/^\/each\b/i.test(rawMacro)) {
      frames.pop();
      continue;
    }

    if (!/^#each\b/i.test(rawMacro)) {
      continue;
    }

    frames.push({
      binding: extractEachLoopBindingFromMacroText(match[0], rawMacro, match.index ?? 0, sourceText),
    });
  }

  const visibleBindings: EachLoopBinding[] = [];
  const seenBindings = new Set<string>();

  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const binding = frames[index]?.binding;
    if (!binding || seenBindings.has(binding.bindingName)) {
      continue;
    }

    seenBindings.add(binding.bindingName);
    visibleBindings.push(binding);
  }

  return visibleBindings;
}

/**
 * extractEachLoopBindingFromMacroText 함수.
 * raw `{{#each ...}}` text에서 recovery-safe loop alias를 추출함.
 *
 * @param fullMacroText - braces를 포함한 전체 macro text
 * @param rawMacroText - braces 안쪽 raw text
 * @param macroStartOffset - sourceText 기준 macro 시작 offset
 * @param sourceText - position 계산에 쓸 fragment 원문
 * @returns 파싱된 loop binding 정보, 없으면 null
 */
function extractEachLoopBindingFromMacroText(
  fullMacroText: string,
  rawMacroText: string,
  macroStartOffset: number,
  sourceText: string,
): EachLoopBinding | null {
  const headerText = rawMacroText.replace(/^#each\b/i, '').trim();
  if (headerText.length === 0) {
    return null;
  }

  const asMatch = headerText.match(/^(.*?)\s+as\s+(.+)$/i);
  if (!asMatch) {
    return null;
  }

  const iteratorExpression = asMatch[1]?.trim() ?? '';
  const bindingName = asMatch[2]?.trim() ?? '';
  if (!iteratorExpression || !bindingName || !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(bindingName)) {
    return null;
  }

  const bindingIndex = fullMacroText.lastIndexOf(bindingName);
  if (bindingIndex === -1) {
    return null;
  }

  const bindingStartOffset = macroStartOffset + bindingIndex;
  const bindingEndOffset = bindingStartOffset + bindingName.length;

  return {
    iteratorExpression,
    bindingName,
    bindingRange: {
      start: offsetToPosition(sourceText, bindingStartOffset),
      end: offsetToPosition(sourceText, bindingEndOffset),
    },
  };
}

export class ScopeAnalyzer {
  private readonly parser = new CBSParser();

  analyze(document: CBSDocument, sourceText: string = ''): SymbolTable {
    const table = new SymbolTable();
    const fragmentDefinitions: FragmentDefinitionMaps = {
      chat: new Map(),
      temp: new Map(),
      func: new Map(),
    };

    this.collectFragmentDefinitions(document.nodes, table, fragmentDefinitions, sourceText);
    this.collectReferences(
      document.nodes,
      table,
      fragmentDefinitions,
      this.createScopeFrame(),
      sourceText,
    );

    return table;
  }

  private collectFragmentDefinitions(
    nodes: readonly CBSNode[],
    table: SymbolTable,
    fragmentDefinitions: FragmentDefinitionMaps,
    sourceText: string,
  ): void {
    for (const node of nodes) {
      switch (node.type) {
        case 'MacroCall':
          this.collectMacroDefinitions(node, table, fragmentDefinitions);
          for (const argument of node.arguments) {
            this.collectFragmentDefinitions(argument, table, fragmentDefinitions, sourceText);
          }
          break;
        case 'Block':
          this.collectBlockDefinitions(node, table, fragmentDefinitions, sourceText);
          this.collectFragmentDefinitions(node.condition, table, fragmentDefinitions, sourceText);
          this.collectFragmentDefinitions(
            this.getAnalyzableBodyNodes(node, sourceText),
            table,
            fragmentDefinitions,
            sourceText,
          );
          if (node.elseBody) {
            this.collectFragmentDefinitions(node.elseBody, table, fragmentDefinitions, sourceText);
          }
          break;
        default:
          break;
      }
    }
  }

  private collectBlockDefinitions(
    node: BlockNode,
    table: SymbolTable,
    fragmentDefinitions: FragmentDefinitionMaps,
    sourceText: string,
  ): void {
    if (node.kind !== 'func' || sourceText.length === 0) {
      return;
    }

    const functionDeclaration = this.extractFunctionDeclaration(node, sourceText);
    if (!functionDeclaration) {
      return;
    }

    const symbol = table.addFunctionDefinition(
      functionDeclaration.name,
      functionDeclaration.range,
      functionDeclaration.parameters,
    );
    fragmentDefinitions.func.set(functionDeclaration.name, symbol);
  }

  private collectMacroDefinitions(
    node: MacroCallNode,
    table: SymbolTable,
    fragmentDefinitions: FragmentDefinitionMaps,
  ): void {
    const normalizedName = this.normalizeLookupKey(node.name);
    const kind = this.getDefinitionKind(normalizedName);
    if (!kind) {
      return;
    }

    const identifier = this.extractStaticArgument(node, 0);
    if (!identifier) {
      return;
    }

    const symbol = table.addDefinition(identifier.text, kind, identifier.range);
    fragmentDefinitions[kind].set(identifier.text, symbol);
  }

  private collectReferences(
    nodes: readonly CBSNode[],
    table: SymbolTable,
    fragmentDefinitions: FragmentDefinitionMaps,
    scope: ScopeFrame,
    sourceText: string,
  ): void {
    for (const node of nodes) {
      switch (node.type) {
        case 'MacroCall':
          this.collectMacroReferences(node, table, fragmentDefinitions, scope, sourceText);
          for (const argument of node.arguments) {
            this.collectReferences(argument, table, fragmentDefinitions, scope, sourceText);
          }
          break;
        case 'Block':
          this.collectBlockReferences(node, table, fragmentDefinitions, scope, sourceText);
          break;
        default:
          break;
      }
    }
  }

  private collectMacroReferences(
    node: MacroCallNode,
    table: SymbolTable,
    fragmentDefinitions: FragmentDefinitionMaps,
    scope: ScopeFrame,
    sourceText: string,
  ): void {
    const normalizedName = this.normalizeLookupKey(node.name);

    if (CHAT_VARIABLE_REFERENCE_MACROS.has(normalizedName)) {
      this.collectFragmentVariableReference(node, table, fragmentDefinitions, 'chat');
      return;
    }

    if (TEMP_VARIABLE_REFERENCE_MACROS.has(normalizedName)) {
      this.collectFragmentVariableReference(node, table, fragmentDefinitions, 'temp');
      return;
    }

    if (normalizedName === 'getglobalvar') {
      const identifier = this.extractStaticArgument(node, 0);
      if (!identifier) {
        return;
      }

      const symbol = table.ensureExternalSymbol(identifier.text, 'global');
      table.addReference(symbol, identifier.range);
      return;
    }

    if (normalizedName === 'slot') {
      const identifier = this.extractStaticArgument(node, 0);
      if (!identifier) {
        return;
      }

      const loopSymbol = this.findLoopBinding(scope, identifier.text);
      if (loopSymbol) {
        table.addReference(loopSymbol, identifier.range);
      }

      return;
    }

    if (normalizedName === 'call') {
      const identifier = this.extractStaticArgument(node, 0);
      if (!identifier) {
        return;
      }

      const functionSymbol = fragmentDefinitions.func.get(identifier.text);
      if (functionSymbol) {
        table.addFunctionReference(functionSymbol, identifier.range);
      }

      return;
    }

    if (normalizedName === 'arg') {
      const reference = extractNumberedArgumentReference(node, sourceText);
      if (!reference) {
        return;
      }

      if (!scope.activeFunction) {
        table.recordInvalidArgumentReference({
          rawText: reference.rawText,
          index: reference.index,
          range: reference.range,
          reason: 'outside-function',
        });
        return;
      }

      if (reference.index >= scope.activeFunction.parameters.length) {
        table.recordInvalidArgumentReference({
          rawText: reference.rawText,
          index: reference.index,
          range: reference.range,
          reason: 'out-of-range',
          functionName: scope.activeFunction.name,
          parameterCount: scope.activeFunction.parameters.length,
        });
      }
    }
  }

  private collectBlockReferences(
    node: BlockNode,
    table: SymbolTable,
    fragmentDefinitions: FragmentDefinitionMaps,
    scope: ScopeFrame,
    sourceText: string,
  ): void {
    this.collectReferences(node.condition, table, fragmentDefinitions, scope, sourceText);

    if (node.kind === 'each') {
      const bodyScope = this.createScopeFrame(scope);
      const loopBinding = sourceText.length > 0 ? extractEachLoopBinding(node, sourceText) : null;
      if (loopBinding) {
        const loopSymbol = table.addDefinition(
          loopBinding.bindingName,
          'loop',
          loopBinding.bindingRange,
          {
            scope: 'block',
            allowDuplicate: true,
          },
        );
        bodyScope.loopBindings.set(loopBinding.bindingName, loopSymbol);
      }

      this.collectReferences(
        this.getAnalyzableBodyNodes(node, sourceText),
        table,
        fragmentDefinitions,
        bodyScope,
        sourceText,
      );
      return;
    }

    if (node.kind === 'func') {
      const bodyScope = this.createScopeFrame(scope);
      const functionDeclaration = sourceText.length
        ? this.extractFunctionDeclaration(node, sourceText)
        : null;
      bodyScope.activeFunction = functionDeclaration
        ? fragmentDefinitions.func.get(functionDeclaration.name) ?? null
        : null;

      this.collectReferences(
        this.getAnalyzableBodyNodes(node, sourceText),
        table,
        fragmentDefinitions,
        bodyScope,
        sourceText,
      );

      return;
    }

    this.collectReferences(
      this.getAnalyzableBodyNodes(node, sourceText),
      table,
      fragmentDefinitions,
      scope,
      sourceText,
    );
    if (node.elseBody) {
      this.collectReferences(node.elseBody, table, fragmentDefinitions, scope, sourceText);
    }
  }

  private collectFragmentVariableReference(
    node: MacroCallNode,
    table: SymbolTable,
    fragmentDefinitions: FragmentDefinitionMaps,
    kind: FragmentVariableKind,
  ): void {
    const identifier = this.extractStaticArgument(node, 0);
    if (!identifier) {
      return;
    }

    const symbol = fragmentDefinitions[kind].get(identifier.text);
    if (symbol) {
      table.addReference(symbol, identifier.range);
      return;
    }

    table.recordUndefinedReference(identifier.text, kind, identifier.range);
  }

  private findLoopBinding(scope: ScopeFrame, name: string): VariableSymbol | undefined {
    let currentScope: ScopeFrame | null = scope;

    while (currentScope) {
      const loopSymbol = currentScope.loopBindings.get(name);
      if (loopSymbol) {
        return loopSymbol;
      }

      currentScope = currentScope.parent;
    }

    return undefined;
  }

  private getDefinitionKind(normalizedName: string): FragmentVariableKind | null {
    if (CHAT_VARIABLE_DEFINITION_MACROS.has(normalizedName)) {
      return 'chat';
    }

    if (TEMP_VARIABLE_DEFINITION_MACROS.has(normalizedName)) {
      return 'temp';
    }

    return null;
  }

  private getAnalyzableBodyNodes(node: BlockNode, sourceText: string): readonly CBSNode[] {
    if (node.kind !== 'each' || sourceText.length === 0) {
      return node.body;
    }

    return this.reparseLiteralBody(node.body, sourceText) ?? node.body;
  }

  private reparseLiteralBody(
    body: readonly CBSNode[],
    sourceText: string,
  ): readonly CBSNode[] | null {
    const bodyRange = this.getNodesRange(body);
    if (!bodyRange) {
      return body;
    }

    const startOffset = positionToOffset(sourceText, bodyRange.start);
    const endOffset = positionToOffset(sourceText, bodyRange.end);
    const bodyText = sourceText.slice(startOffset, endOffset);
    if (bodyText.length === 0) {
      return [];
    }

    const reparsed = this.parser.parse(bodyText);
    return reparsed.nodes.map((node) => this.rebaseNode(node, bodyText, sourceText, startOffset));
  }

  private getNodesRange(nodes: readonly CBSNode[]): Range | null {
    if (nodes.length === 0) {
      return null;
    }

    return {
      start: nodes[0].range.start,
      end: nodes[nodes.length - 1].range.end,
    };
  }

  private rebaseNode(
    node: CBSNode,
    localSource: string,
    hostSource: string,
    startOffset: number,
  ): CBSNode {
    switch (node.type) {
      case 'PlainText':
        return {
          ...node,
          range: this.rebaseRange(node.range, localSource, hostSource, startOffset),
        };
      case 'Comment':
        return {
          ...node,
          range: this.rebaseRange(node.range, localSource, hostSource, startOffset),
        };
      case 'MathExpr':
        return {
          ...node,
          range: this.rebaseRange(node.range, localSource, hostSource, startOffset),
        };
      case 'MacroCall':
        return {
          ...node,
          range: this.rebaseRange(node.range, localSource, hostSource, startOffset),
          nameRange: this.rebaseRange(node.nameRange, localSource, hostSource, startOffset),
          arguments: node.arguments.map((argument) =>
            argument.map((child) => this.rebaseNode(child, localSource, hostSource, startOffset)),
          ),
        };
      case 'Block':
        return {
          ...node,
          range: this.rebaseRange(node.range, localSource, hostSource, startOffset),
          openRange: this.rebaseRange(node.openRange, localSource, hostSource, startOffset),
          closeRange: node.closeRange
            ? this.rebaseRange(node.closeRange, localSource, hostSource, startOffset)
            : undefined,
          condition: node.condition.map((child) =>
            this.rebaseNode(child, localSource, hostSource, startOffset),
          ),
          body: node.body.map((child) =>
            this.rebaseNode(child, localSource, hostSource, startOffset),
          ),
          elseBody: node.elseBody?.map((child) =>
            this.rebaseNode(child, localSource, hostSource, startOffset),
          ),
        };
    }
  }

  private rebaseRange(
    range: Range,
    localSource: string,
    hostSource: string,
    startOffset: number,
  ): Range {
    const localStartOffset = positionToOffset(localSource, range.start);
    const localEndOffset = positionToOffset(localSource, range.end);

    return {
      start: offsetToPosition(hostSource, startOffset + localStartOffset),
      end: offsetToPosition(hostSource, startOffset + localEndOffset),
    };
  }

  private extractStaticArgument(
    node: MacroCallNode,
    argumentIndex: number,
  ): { text: string; range: Range } | null {
    const argument = node.arguments[argumentIndex];
    if (!argument || argument.length === 0) {
      return null;
    }

    const literalParts: string[] = [];
    let mergedRange: Range | null = null;

    for (const child of argument) {
      if (child.type === 'Comment') {
        continue;
      }

      if (child.type !== 'PlainText') {
        return null;
      }

      literalParts.push(child.value);
      mergedRange = mergedRange ? this.mergeRanges(mergedRange, child.range) : child.range;
    }

    const text = literalParts.join('').trim();
    if (!mergedRange || text.length === 0) {
      return null;
    }

    return {
      text,
      range: mergedRange,
    };
  }

  private createScopeFrame(parent: ScopeFrame | null = null): ScopeFrame {
    return {
      parent,
      loopBindings: new Map(),
      activeFunction: null,
    };
  }

  private extractFunctionDeclaration(
    node: BlockNode,
    sourceText: string,
  ): { name: string; range: Range; parameters: string[] } | null {
    const openStartOffset = positionToOffset(sourceText, node.openRange.start);
    const openEndOffset = positionToOffset(sourceText, node.openRange.end);
    const headerText = sourceText.slice(openStartOffset, openEndOffset);
    const match = headerText.match(/^\{\{#func\s+([^\s}]+)(?:\s+([^}]+?))?\}\}$/u);
    if (!match?.[1]) {
      return null;
    }

    const name = match[1];
    const nameStartOffset = openStartOffset + headerText.indexOf(name);
    const parameters = (match[2] ?? '')
      .split(/\s+/u)
      .map((token) => token.trim())
      .filter((token) => token.length > 0);

    return {
      name,
      range: {
        start: offsetToPosition(sourceText, nameStartOffset),
        end: offsetToPosition(sourceText, nameStartOffset + name.length),
      },
      parameters,
    };
  }

  private mergeRanges(left: Range, right: Range): Range {
    return {
      start: left.start,
      end: right.end,
    };
  }

  private normalizeLookupKey(value: string): string {
    return value.toLowerCase().replace(/[\s_-]/g, '');
  }
}
