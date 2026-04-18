import type { Range } from 'risu-workbench-core';

export type VariableSymbolKind = 'chat' | 'temp' | 'global' | 'loop';
export type VariableSymbolScope = 'fragment' | 'block' | 'external';

export interface VariableSymbol {
  id: string;
  name: string;
  kind: VariableSymbolKind;
  scope: VariableSymbolScope;
  definitionRange?: Range;
  definitionRanges: Range[];
  references: Range[];
}

export interface UndefinedVariableReference {
  name: string;
  kind: Exclude<VariableSymbolKind, 'global'>;
  range: Range;
}

export class SymbolTable {
  private nextSymbolId = 0;
  private readonly variables: VariableSymbol[] = [];
  private readonly variablesByKey = new Map<string, VariableSymbol[]>();
  private readonly undefinedReferences: UndefinedVariableReference[] = [];

  addDefinition(
    name: string,
    kind: VariableSymbolKind,
    range: Range,
    options: {
      scope?: VariableSymbolScope;
      allowDuplicate?: boolean;
    } = {},
  ): VariableSymbol {
    const { scope = 'fragment', allowDuplicate = false } = options;
    const existing = !allowDuplicate ? this.findSymbol(name, kind, scope) : undefined;
    if (existing) {
      if (!this.hasRange(existing.definitionRanges, range)) {
        existing.definitionRanges.push(range);
      }

      if (!existing.definitionRange) {
        existing.definitionRange = range;
      }

      return existing;
    }

    const symbol: VariableSymbol = {
      id: `symbol-${this.nextSymbolId++}`,
      name,
      kind,
      scope,
      definitionRange: range,
      definitionRanges: [range],
      references: [],
    };

    this.registerSymbol(symbol);
    return symbol;
  }

  ensureExternalSymbol(name: string, kind: Extract<VariableSymbolKind, 'global'>): VariableSymbol {
    const existing = this.findSymbol(name, kind, 'external');
    if (existing) {
      return existing;
    }

    const symbol: VariableSymbol = {
      id: `symbol-${this.nextSymbolId++}`,
      name,
      kind,
      scope: 'external',
      definitionRanges: [],
      references: [],
    };

    this.registerSymbol(symbol);
    return symbol;
  }

  addReference(name: string, range: Range, kind?: VariableSymbolKind): void;
  addReference(symbol: VariableSymbol, range: Range): void;
  addReference(
    symbolOrName: VariableSymbol | string,
    range: Range,
    kind?: VariableSymbolKind,
  ): void {
    const symbol =
      typeof symbolOrName === 'string' ? this.getVariable(symbolOrName, kind) : symbolOrName;
    if (!symbol) {
      return;
    }

    symbol.references.push(range);
  }

  recordUndefinedReference(
    name: string,
    kind: UndefinedVariableReference['kind'],
    range: Range,
  ): void {
    this.undefinedReferences.push({
      name,
      kind,
      range,
    });
  }

  getVariable(name: string, kind?: VariableSymbolKind): VariableSymbol | undefined {
    return this.getVariables(name, kind)[0];
  }

  getVariables(name: string, kind?: VariableSymbolKind): VariableSymbol[] {
    if (kind) {
      return [...(this.variablesByKey.get(this.createKey(name, kind)) ?? [])];
    }

    return this.variables.filter((variable) => variable.name === name);
  }

  getAllVariables(): VariableSymbol[] {
    return [...this.variables];
  }

  getUndefinedReferences(): UndefinedVariableReference[] {
    return [...this.undefinedReferences];
  }

  getUnusedVariables(): VariableSymbol[] {
    return this.variables.filter(
      (variable) => variable.definitionRanges.length > 0 && variable.references.length === 0,
    );
  }

  private registerSymbol(symbol: VariableSymbol): void {
    this.variables.push(symbol);

    const key = this.createKey(symbol.name, symbol.kind);
    const existing = this.variablesByKey.get(key);
    if (existing) {
      existing.push(symbol);
      return;
    }

    this.variablesByKey.set(key, [symbol]);
  }

  private findSymbol(
    name: string,
    kind: VariableSymbolKind,
    scope: VariableSymbolScope,
  ): VariableSymbol | undefined {
    return this.variablesByKey
      .get(this.createKey(name, kind))
      ?.find((variable) => variable.scope === scope);
  }

  private createKey(name: string, kind: VariableSymbolKind): string {
    return `${kind}::${name}`;
  }

  private hasRange(existingRanges: Range[], targetRange: Range): boolean {
    return existingRanges.some((range) => this.rangesEqual(range, targetRange));
  }

  private rangesEqual(left: Range, right: Range): boolean {
    return (
      left.start.line === right.start.line &&
      left.start.character === right.start.character &&
      left.end.line === right.end.line &&
      left.end.character === right.end.character
    );
  }
}
