import {
  SemanticTokens,
  SemanticTokensParams,
} from 'vscode-languageserver/node'

export const SEMANTIC_TOKEN_TYPES = [
  'function', // function names (char, user, setvar ...)
  'variable', // variable names (in getvar/setvar args)
  'keyword', // block keywords (#when, #each, :else, /)
  'operator', // operators (::is, ::not, ::>, ?)
  'string', // string arguments
  'number', // number arguments
  'comment', // {{// ...}}
  'deprecated', // deprecated functions
  'punctuation', // {{ }} ::
] as const

export const SEMANTIC_TOKEN_MODIFIERS = ['deprecated', 'readonly'] as const

export class SemanticTokensProvider {
  provide(_params: SemanticTokensParams): SemanticTokens {
    // TODO: Provide semantic tokens for enhanced syntax highlighting
    // Walk the AST and emit tokens with appropriate types
    return { data: [] }
  }
}
