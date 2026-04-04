import { Hover, TextDocumentPositionParams } from 'vscode-languageserver/node'
import { CBSBuiltinRegistry } from '../registry/builtins'
import { formatHoverContent } from '../registry/documentation'

export class HoverProvider {
  constructor(private registry: CBSBuiltinRegistry) {}

  provide(_params: TextDocumentPositionParams): Hover | null {
    // TODO: Implement hover
    // 1. Find the CBS node at cursor position
    // 2. If it's a function name → show function documentation
    // 3. If it's a variable name (in getvar/setvar) → show variable info
    // 4. If it's a block keyword → show block documentation
    // 5. If it's an operator (::is, ::not, etc.) → show operator description
    return null
  }
}
