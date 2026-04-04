import { Range } from '../lexer/tokens'

export interface VariableSymbol {
  name: string
  kind: 'chat' | 'temp' | 'global'
  definitionRange: Range
  references: Range[]
}

export class SymbolTable {
  private variables = new Map<string, VariableSymbol>()

  addDefinition(name: string, kind: VariableSymbol['kind'], range: Range): void {
    const existing = this.variables.get(name)
    if (existing) {
      // Variable already defined — just update
      return
    }
    this.variables.set(name, {
      name,
      kind,
      definitionRange: range,
      references: [],
    })
  }

  addReference(name: string, range: Range): void {
    const symbol = this.variables.get(name)
    if (symbol) {
      symbol.references.push(range)
    }
  }

  getVariable(name: string): VariableSymbol | undefined {
    return this.variables.get(name)
  }

  getAllVariables(): VariableSymbol[] {
    return Array.from(this.variables.values())
  }

  getUndefinedReferences(): { name: string; range: Range }[] {
    // TODO: Find getvar calls for variables never set with setvar
    return []
  }

  getUnusedVariables(): VariableSymbol[] {
    return this.getAllVariables().filter((v) => v.references.length === 0)
  }
}
