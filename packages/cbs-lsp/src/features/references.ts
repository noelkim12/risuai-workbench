import { Location, ReferenceParams } from 'vscode-languageserver/node'
import { SymbolTable } from '../analyzer/symbolTable'

export class ReferencesProvider {
  provide(_params: ReferenceParams, _symbolTable: SymbolTable): Location[] {
    // TODO: Find all references for a variable
    // Select "myScore" → show all setvar, getvar, addvar locations
    return []
  }
}
