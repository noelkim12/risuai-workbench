/**
 * CBS LSP initialize capability builder.
 * @file packages/cbs-lsp/src/server/capabilities.ts
 */

import {
  CodeActionKind,
  TextDocumentSyncKind,
  type InitializeParams,
  type InitializeResult,
} from 'vscode-languageserver/node';

import {
  createCbsRuntimeAvailabilityContract,
  createNormalizedRuntimeAvailabilitySnapshot,
  type RuntimeOperatorContractOptions,
  type LuaLsCompanionRuntime,
} from '../core';
import { CBS_COMPLETION_TRIGGER_CHARACTERS } from '../features/completion';
import { SEMANTIC_TOKEN_MODIFIERS, SEMANTIC_TOKEN_TYPES } from '../features/symbols';
import { LSP_POSITION_ENCODING } from '../utils/position';
import { createExecuteCommandProvider } from './commands';

/**
 * createInitializeResult 함수.
 * client capability와 LuaLS runtime에 맞는 truthful initialize result를 조립함.
 *
 * @param params - 현재 initialize payload
 * @param luaLsRuntime - initialize 시점 LuaLS companion runtime 스냅샷
 * @returns capability와 availability payload가 들어 있는 initialize result
 */
export function createInitializeResult(
  params: InitializeParams,
  luaLsRuntime: LuaLsCompanionRuntime,
  operatorOptions: RuntimeOperatorContractOptions = {},
): InitializeResult {
  const runtimeAvailability = createCbsRuntimeAvailabilityContract(luaLsRuntime, operatorOptions);
  const renamePrepareSupport = params.capabilities.textDocument?.rename?.prepareSupport ?? false;
  const codeActionLiteralSupport =
    params.capabilities.textDocument?.codeAction?.codeActionLiteralSupport !== undefined;
  // server-owned no-op CodeLens command도 일반 executeCommand contract로 광고해 client UX를 정직하게 맞춤.
  const executeCommandProvider = createExecuteCommandProvider();

  return {
    capabilities: {
      positionEncoding: LSP_POSITION_ENCODING,
      textDocumentSync: {
        openClose: true,
        change: TextDocumentSyncKind.Incremental,
      },
      codeLensProvider: {
        resolveProvider: false,
      },
      codeActionProvider: codeActionLiteralSupport
        ? {
            codeActionKinds: [CodeActionKind.QuickFix],
            resolveProvider: true,
          }
        : { resolveProvider: true },
      completionProvider: {
        triggerCharacters: [...CBS_COMPLETION_TRIGGER_CHARACTERS],
        resolveProvider: true,
      },
      definitionProvider: true,
      documentHighlightProvider: true,
      documentSymbolProvider: true,
      workspaceSymbolProvider: true,
      documentFormattingProvider: true,
      documentRangeFormattingProvider: true,
      documentOnTypeFormattingProvider: {
        firstTriggerCharacter: '\n',
      },
      selectionRangeProvider: true,
      referencesProvider: true,
      renameProvider: renamePrepareSupport
        ? {
            prepareProvider: true,
          }
        : true,
      ...(executeCommandProvider ? { executeCommandProvider } : {}),
      hoverProvider: true,
      inlayHintProvider: true,
      signatureHelpProvider: {
        triggerCharacters: [':'],
      },
      foldingRangeProvider: true,
      semanticTokensProvider: {
        legend: {
          tokenTypes: [...SEMANTIC_TOKEN_TYPES],
          tokenModifiers: [...SEMANTIC_TOKEN_MODIFIERS],
        },
        full: true,
        range: true,
      },
    },
    experimental: {
      cbs: {
        availability: runtimeAvailability,
        availabilitySnapshot: createNormalizedRuntimeAvailabilitySnapshot(luaLsRuntime, operatorOptions),
        excludedArtifacts: runtimeAvailability.excludedArtifacts,
        featureAvailability: runtimeAvailability.featureAvailability,
        operator: runtimeAvailability.operator,
      },
    },
  };
}
