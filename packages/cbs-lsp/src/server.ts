import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { shouldRouteForDiagnostics } from './document-router'
import { routeDiagnosticsForDocument } from './diagnostics-router'

const connection = createConnection(ProposedFeatures.all)
const documents = new TextDocuments(TextDocument)

connection.onInitialize((_params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      // Document sync only. No additional LSP features are currently implemented.
      textDocumentSync: TextDocumentSyncKind.Incremental,
    },
  }
})

/**
 * Publish diagnostics for a document if it supports CBS diagnostics.
 * Clears diagnostics for unsupported file types.
 */
function publishDiagnosticsForDocument(document: TextDocument): void {
  const uri = document.uri
  const filePath = document.uri.replace(/^file:\/\//, '')

  if (!shouldRouteForDiagnostics(filePath)) {
    // Clear diagnostics for unsupported files
    connection.sendDiagnostics({ uri, diagnostics: [] })
    return
  }

  const diagnostics = routeDiagnosticsForDocument(filePath, document.getText(), {})
  connection.sendDiagnostics({ uri, diagnostics })
}

// Wire up document lifecycle events for diagnostics routing
documents.onDidOpen((event) => {
  publishDiagnosticsForDocument(event.document)
})

documents.onDidChangeContent((event) => {
  publishDiagnosticsForDocument(event.document)
})

documents.onDidClose((event) => {
  // Clear diagnostics when document is closed
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] })
})

// Features from ./features/* are registered via connection.onInitialized()

documents.listen(connection)
connection.listen()
