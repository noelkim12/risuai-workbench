import { TextEdit, DocumentFormattingParams } from 'vscode-languageserver/node'

export class FormattingProvider {
  provide(_params: DocumentFormattingParams): TextEdit[] {
    // TODO: Format CBS code
    // - Normalize indentation inside blocks
    // - No spaces around :: separator
    // - Align block open/close tags
    return []
  }
}
