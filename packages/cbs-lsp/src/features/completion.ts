import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  TextDocumentPositionParams,
} from 'vscode-languageserver/node'
import type { CBSBuiltinRegistry } from 'risu-workbench-core'

export class CompletionProvider {
  constructor(private registry: CBSBuiltinRegistry) {}

  provide(_params: TextDocumentPositionParams): CompletionItem[] {
    // TODO: Implement context-aware completion
    //
    // Trigger contexts:
    // {{ → all function names
    // {{# → block functions only (#when, #each, #escape, #puredisplay)
    // {{: → :else
    // {{/ → matching block end tag for current open block
    // {{getvar:: → variable names from setvar calls in document
    // {{gettempvar:: → temp variable names from settempvar calls
    // {{metadata:: → valid metadata keys (mobile, local, node, version, lang, etc.)
    // {{#when condition:: → operators (is, isnot, not, and, or, >, >=, <=, <, keep, toggle)
    // {{asset:: → asset names (if workspace scanning is implemented)
    //
    // Snippet completions for blocks:
    // #when → {{#when ${1:condition}}}\n\t${2:body}\n{{/when}}
    // #each → {{#each ${1:array} as ${2:item}}}\n\t{{slot::${2:item}}}\n{{/each}}
    return []
  }
}
