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
import { extractEachLoopBinding } from './diagnostics';
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
