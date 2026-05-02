/**
 * server helper registrar들이 공유하는 context와 provider 타입 모음.
 * @file packages/cbs-lsp/src/helpers/server/types.ts
 */

import type { CBSBuiltinRegistry } from 'risu-workbench-core';
import type { Connection } from 'vscode-languageserver/node';

import type { LuaLsCompanionController } from '../../controllers/LuaLsCompanionController';
import type { FragmentAnalysisRequest } from '../../core';
import type { CompletionProvider } from '../../features/completion';
import type {
  CodeActionProvider,
  FormattingProvider,
  OnTypeFormattingProvider,
  SelectionRangeProvider,
} from '../../features/editing';
import type { HoverProvider } from '../../features/hover';
import type { DefinitionProvider, ReferencesProvider, RenameProvider } from '../../features/navigation';
import type { CodeLensProvider, FoldingProvider, InlayHintProvider, SignatureHelpProvider } from '../../features/presentation';
import type {
  DocumentHighlightProvider,
  DocumentSymbolProvider,
  SemanticTokensProvider,
  WorkspaceSymbolProvider,
} from '../../features/symbols';
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
