/**
 * server helper registrar들이 공유하는 context와 provider 타입 모음.
 * @file packages/cbs-lsp/src/helpers/server/types.ts
 */

import type { CBSBuiltinRegistry } from 'risu-workbench-core';
import type { Connection } from 'vscode-languageserver/node';

import type { LuaLsCompanionController } from '../../controllers/LuaLsCompanionController';
import type { FragmentAnalysisRequest } from '../../core';
import type { CodeActionProvider } from '../../features/codeActions';
import type { CodeLensProvider } from '../../features/codelens';
import type { CompletionProvider } from '../../features/completion';
import type { DefinitionProvider } from '../../features/definition';
import type { DocumentHighlightProvider } from '../../features/documentHighlight';
import type { DocumentSymbolProvider } from '../../features/documentSymbol';
import type { FoldingProvider } from '../../features/folding';
import type { FormattingProvider } from '../../features/formatting';
import type { HoverProvider } from '../../features/hover';
import type { InlayHintProvider } from '../../features/inlayHint';
import type { OnTypeFormattingProvider } from '../../features/onTypeFormatting';
import type { ReferencesProvider } from '../../features/references';
import type { RenameProvider } from '../../features/rename';
import type { SelectionRangeProvider } from '../../features/selectionRange';
import type { SemanticTokensProvider } from '../../features/semanticTokens';
import type { SignatureHelpProvider } from '../../features/signature';
import type { WorkspaceSymbolProvider } from '../../features/workspaceSymbol';
import type { VariableFlowService, WorkspaceSnapshotState } from '../../services';

export interface ServerFeatureRegistrarProviders {
  codeActionProvider: CodeActionProvider;
  codeLensProvider: CodeLensProvider;
  completionProvider: CompletionProvider;
  documentHighlightProvider: DocumentHighlightProvider;
  documentSymbolProvider: DocumentSymbolProvider;
  foldingProvider: FoldingProvider;
  formattingProvider: FormattingProvider;
  hoverProvider: HoverProvider;
  onTypeFormattingProvider?: OnTypeFormattingProvider;
  inlayHintProvider: InlayHintProvider;
  selectionRangeProvider: SelectionRangeProvider;
  resolveRequest: (uri: string) => FragmentAnalysisRequest | null;
  semanticTokensProvider: SemanticTokensProvider;
  signatureHelpProvider: SignatureHelpProvider;
  workspaceSymbolProvider: WorkspaceSymbolProvider;
}

export interface ServerFeatureRegistrarContext {
  connection: Connection;
  luaLsProxy: Pick<
    LuaLsCompanionController,
    | 'getRuntime'
    | 'prepareRename'
    | 'provideCompletion'
    | 'provideDefinition'
    | 'provideDocumentHighlight'
    | 'provideDocumentSymbol'
    | 'provideHover'
    | 'provideReferences'
    | 'provideRename'
    | 'provideSignatureHelp'
  >;
  providers: ServerFeatureRegistrarProviders;
  registry: CBSBuiltinRegistry;
  resolveWorkspaceRequest: (uri: string) => FragmentAnalysisRequest | null;
  resolveWorkspaceVariableFlowContext: (uri: string) => ServerWorkspaceVariableFlowContext | null;
}

export interface ServerWorkspaceVariableFlowContext {
  variableFlowService: VariableFlowService;
  workspaceSnapshot: WorkspaceSnapshotState;
}

export interface WorkspaceAwareProviderFactoryContext {
  completionProvider: CompletionProvider;
  hoverProvider: HoverProvider;
  registry: CBSBuiltinRegistry;
  resolveRequest: (uri: string) => FragmentAnalysisRequest | null;
  resolveWorkspaceRequest: (uri: string) => FragmentAnalysisRequest | null;
  resolveWorkspaceVariableFlowContext: (uri: string) => ServerWorkspaceVariableFlowContext | null;
}

export interface WorkspaceAwareProviders {
  definitionProvider: DefinitionProvider;
  referencesProvider: ReferencesProvider;
  renameProvider: RenameProvider;
  hoverProvider: HoverProvider;
  completionProvider: CompletionProvider;
}
