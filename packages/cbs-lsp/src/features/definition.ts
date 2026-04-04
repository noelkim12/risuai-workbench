import { Definition, TextDocumentPositionParams } from 'vscode-languageserver/node'
import { SymbolTable } from '../analyzer/symbolTable'

export class DefinitionProvider {
  provide(
    _params: TextDocumentPositionParams,
    _symbolTable: SymbolTable
  ): Definition | null {
    // TODO: Go-to-definition for:
    // - {{getvar::myScore}} → jump to {{setvar::myScore::...}}
    // - {{gettempvar::x}} → jump to {{settempvar::x::...}}
    // - {{slot::n}} → jump to {{#each ... as n}} declaration
    return null
  }
}
