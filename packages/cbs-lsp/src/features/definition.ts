import {
  type CancellationToken,
  Definition,
  LocationLink,
  TextDocumentPositionParams,
} from 'vscode-languageserver/node';
import type { CBSBuiltinRegistry, Range } from 'risu-workbench-core';

import {
  createAgentMetadataAvailability,
  collectLocalFunctionDeclarations,
  fragmentAnalysisService,
  type AgentMetadataAvailabilityContract,
  type FragmentAnalysisRequest,
  type FragmentAnalysisService,
  type FragmentCursorLookupResult,
} from '../core';
import type { VariableSymbolKind } from '../analyzer/symbolTable';
import {
  isCrossFileVariableKind,
  mergeLocalFirstSegments,
  resolveVariablePosition,
  type LocalFirstRangeEntry,
} from './local-first-contract';
import { isRequestCancelled } from '../utils/request-cancellation';
import type { VariableFlowService } from '../services';

export type DefinitionRequestResolver = (
  params: TextDocumentPositionParams,
) => FragmentAnalysisRequest | null;

export interface DefinitionProviderOptions {
  analysisService?: FragmentAnalysisService;
  resolveRequest?: DefinitionRequestResolver;
  variableFlowService?: VariableFlowService;
}

export const DEFINITION_PROVIDER_AVAILABILITY = createAgentMetadataAvailability(
  'local-first',
  'definition-provider:local-first-resolution',
  'Definition resolves fragment-local variables, loop aliases, and local #func declarations first, then appends workspace chat-variable writers when VariableFlowService is available. Global and external symbols stay unavailable.',
);

function isFunctionPosition(lookup: FragmentCursorLookupResult): { functionName: string } | null {
  const tokenLookup = lookup.token;
  const nodeSpan = lookup.nodeSpan;
  if (!tokenLookup || !nodeSpan) {
    return null;
  }

  if (
    tokenLookup.category === 'argument' &&
    (nodeSpan.category === 'argument' || nodeSpan.category === 'local-function-reference') &&
    nodeSpan.owner.type === 'MacroCall' &&
    nodeSpan.owner.name.toLowerCase() === 'call' &&
    nodeSpan.argumentIndex === 0
  ) {
    const functionName = tokenLookup.token.value.trim();
    if (functionName.length > 0) {
      return { functionName };
    }
  }

  return null;
}

function findFirstDefinitionRange(definitionRanges: readonly Range[]): Range | null {
  if (definitionRanges.length === 0) {
    return null;
  }

  // Sort by position and return the first one (earliest in document order)
  const sorted = [...definitionRanges].sort((a, b) => {
    if (a.start.line !== b.start.line) {
      return a.start.line - b.start.line;
    }
    return a.start.character - b.start.character;
  });

  return sorted[0] ?? null;
}

function buildDefinitionLocationLink(
  targetUri: string,
  targetRange: Range,
  originSelectionRange?: Range | null,
): LocationLink {
  return {
    targetUri,
    targetRange,
    targetSelectionRange: targetRange,
    originSelectionRange: originSelectionRange ?? undefined,
  };
}

export class DefinitionProvider {
  private readonly analysisService: FragmentAnalysisService;

  private readonly resolveRequest: DefinitionRequestResolver;

  private readonly variableFlowService: VariableFlowService | null;

  readonly availability: AgentMetadataAvailabilityContract = DEFINITION_PROVIDER_AVAILABILITY;

  constructor(
    private readonly _registry: CBSBuiltinRegistry,
    options: DefinitionProviderOptions = {},
  ) {
    // Registry stored for API consistency with other providers
    void this._registry;
    this.analysisService = options.analysisService ?? fragmentAnalysisService;
    this.resolveRequest = options.resolveRequest ?? (() => null);
    this.variableFlowService = options.variableFlowService ?? null;
  }

  provide(params: TextDocumentPositionParams, cancellationToken?: CancellationToken): Definition | null {
    if (isRequestCancelled(cancellationToken)) {
      return null;
    }

    const request = this.resolveRequest(params);
    if (!request) {
      return null;
    }

    const lookup = this.analysisService.locatePosition(request, params.position, cancellationToken);
    if (!lookup) {
      return null;
    }

    if (isRequestCancelled(cancellationToken)) {
      return null;
    }

    const symbolTable = lookup.fragmentAnalysis.providerLookup.getSymbolTable();
    const variablePosition = resolveVariablePosition(lookup);
    const functionPosition = variablePosition ? null : isFunctionPosition(lookup);
    let targetRange: Range | null = null;
    let variableName: string | null = null;
    let variableKind: VariableSymbolKind | null = null;

    if (variablePosition) {
      const { variableName: resolvedVariableName, kind, targetDefinitionRange } = variablePosition;
      variableName = resolvedVariableName;
      variableKind = kind;

      if (kind === 'global') {
        return null;
      }

      const symbol = symbolTable.getVariable(resolvedVariableName, kind);
      if (symbol && symbol.scope !== 'external') {
        targetRange = targetDefinitionRange ?? findFirstDefinitionRange(symbol.definitionRanges);
      }
    } else if (functionPosition) {
      const symbol = symbolTable.getFunction(functionPosition.functionName);
      const fallbackDeclaration = collectLocalFunctionDeclarations(
        lookup.fragmentAnalysis.document,
        lookup.fragment.content,
      ).find((candidate) => candidate.name === functionPosition.functionName);
      if (!symbol && !fallbackDeclaration) {
        return null;
      }

      targetRange = symbol
        ? findFirstDefinitionRange(symbol.definitionRanges)
        : fallbackDeclaration?.range ?? null;
    } else {
      return null;
    }

    if (!targetRange) {
      if (!variableName || !variableKind || !isCrossFileVariableKind(variableKind)) {
        return null;
      }
    }

    // Build the origin selection range (the variable name at cursor position)
    const tokenLookup = lookup.token;
    let originRange: Range | null = null;
    if (tokenLookup) {
      originRange = lookup.fragmentAnalysis.mapper.toHostRangeFromOffsets(
        request.text,
        tokenLookup.localStartOffset,
        tokenLookup.localEndOffset,
      );
    }

    const localEntries: LocalFirstRangeEntry[] = [];

    if (targetRange) {
      const hostRange = lookup.fragmentAnalysis.mapper.toHostRange(request.text, targetRange);
      if (hostRange) {
        localEntries.push({ uri: params.textDocument.uri, range: hostRange });
      }
    }

    const workspaceEntries: LocalFirstRangeEntry[] = [];
    if (variableName && variableKind && isCrossFileVariableKind(variableKind) && this.variableFlowService) {
      const flowQuery = this.variableFlowService.queryVariable(variableName);
      for (const writer of flowQuery?.writers ?? []) {
        workspaceEntries.push({ uri: writer.uri, range: writer.hostRange });
      }
      for (const defaultDefinition of this.variableFlowService.getDefaultVariableDefinitions(variableName)) {
        workspaceEntries.push({ uri: defaultDefinition.uri, range: defaultDefinition.range });
      }
    }

    const links = mergeLocalFirstSegments([localEntries, workspaceEntries]).map((entry) =>
      buildDefinitionLocationLink(entry.uri, entry.range, originRange),
    );

    if (links.length === 0) {
      return null;
    }

    return links as unknown as Definition;
  }
}
