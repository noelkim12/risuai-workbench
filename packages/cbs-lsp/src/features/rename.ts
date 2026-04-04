import { WorkspaceEdit, RenameParams } from 'vscode-languageserver/node'
import { SymbolTable } from '../analyzer/symbolTable'

export class RenameProvider {
  provide(_params: RenameParams, _symbolTable: SymbolTable): WorkspaceEdit | null {
    // TODO: Rename variable across all setvar/getvar/addvar occurrences
    return null
  }
}
