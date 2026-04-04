import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node'
import { TextDocument } from 'vscode-languageserver-textdocument'

const connection = createConnection(ProposedFeatures.all)
const documents = new TextDocuments(TextDocument)

connection.onInitialize((_params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        triggerCharacters: ['{', ':', '#'],
      },
      hoverProvider: true,
      signatureHelpProvider: {
        triggerCharacters: [':'],
      },
      definitionProvider: true,
      referencesProvider: true,
      documentFormattingProvider: true,
      foldingRangeProvider: true,
      renameProvider: true,
      semanticTokensProvider: {
        legend: {
          tokenTypes: [
            'function',
            'variable',
            'keyword',
            'operator',
            'string',
            'number',
            'comment',
            'deprecated',
            'punctuation',
          ],
          tokenModifiers: ['deprecated', 'readonly'],
        },
        full: true,
      },
    },
  }
})

// TODO: Wire up features from ./features/*

documents.listen(connection)
connection.listen()
