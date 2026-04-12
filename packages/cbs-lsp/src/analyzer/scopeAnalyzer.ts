import type { CBSDocument } from 'risu-workbench-core'
import { walkAST } from 'risu-workbench-core'
import { SymbolTable } from './symbolTable'

export class ScopeAnalyzer {
  analyze(document: CBSDocument): SymbolTable {
    const table = new SymbolTable()

    walkAST(document.nodes, {
      visitMacroCall(node) {
        // TODO: Track variable definitions and references
        // - setvar(name, value) → definition
        // - setdefaultvar(name, value) → definition
        // - settempvar(name, value) → definition (temp)
        // - addvar(name, value) → definition + reference
        // - getvar(name) → reference
        // - gettempvar(name) / tempvar(name) → reference (temp)
        // - getglobalvar(name) → reference (global)
        //
        // Also track #each loop variables:
        // - {{#each array as item}} → 'item' is scoped to block body
        // - {{slot::item}} → reference to loop variable
      },
    })

    return table
  }
}
