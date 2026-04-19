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
  resolveVisibleLoopBindingFromNodePath,
  type AgentMetadataAvailabilityContract,
  type FragmentAnalysisRequest,
  type FragmentAnalysisService,
  type FragmentCursorLookupResult,
} from '../core';
import type { VariableSymbolKind } from '../analyzer/symbolTable';
import { isRequestCancelled } from '../request-cancellation';
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
  'local-only',
  'definition-provider:fragment-symbol-table',
  'Definition resolves only fragment-local variables, loop aliases, and local #func declarations; workspace/external symbols stay unavailable.',
);

const VARIABLE_MACRO_RULES = Object.freeze({
  addvar: { kind: 'chat', argumentIndex: 0 },
  getglobalvar: { kind: 'global', argumentIndex: 0 },
  gettempvar: { kind: 'temp', argumentIndex: 0 },
  getvar: { kind: 'chat', argumentIndex: 0 },
  setdefaultvar: { kind: 'chat', argumentIndex: 0 },
  settempvar: { kind: 'temp', argumentIndex: 0 },
  setvar: { kind: 'chat', argumentIndex: 0 },
  tempvar: { kind: 'temp', argumentIndex: 0 },
} as const);

const SLOT_MACRO_RULES = Object.freeze({
  slot: { kind: 'loop', argumentIndex: 0 },
} as const);

function isVariablePosition(lookup: FragmentCursorLookupResult): {
  variableName: string;
  kind: VariableSymbolKind;
  targetDefinitionRange?: Range;
} | null {
  const tokenLookup = lookup.token;
  const nodeSpan = lookup.nodeSpan;
  if (!tokenLookup || !nodeSpan) {
    return null;
  }

  // Check for variable macros (getvar, setvar, etc.)
  if (
    tokenLookup.category === 'argument' &&
    nodeSpan.category === 'argument' &&
    nodeSpan.owner.type === 'MacroCall'
  ) {
    const macroName = nodeSpan.owner.name.toLowerCase();
    const rule = VARIABLE_MACRO_RULES[macroName as keyof typeof VARIABLE_MACRO_RULES];
    const variableName = tokenLookup.token.value.trim();

    if (rule && nodeSpan.argumentIndex === rule.argumentIndex && variableName.length > 0) {
      return { variableName, kind: rule.kind };
    }

    // Check for slot::name inside #each blocks
    const slotRule = SLOT_MACRO_RULES[macroName as keyof typeof SLOT_MACRO_RULES];
    if (slotRule && nodeSpan.argumentIndex === slotRule.argumentIndex && variableName.length > 0) {
      const bindingMatch = resolveVisibleLoopBindingFromNodePath(
        lookup.nodePath,
        lookup.fragment.content,
        variableName,
        lookup.fragmentLocalOffset,
      );

      if (bindingMatch) {
        return {
          variableName,
          kind: slotRule.kind,
          targetDefinitionRange: bindingMatch.binding.bindingRange,
        };
      }
    }
  }

  // Handle edge case: when parser treats #each body as plain text,
  // the node span may show as 'node-range' with PlainText owner,
  // but the token still shows as 'argument' with the variable name.
  // In this case, check if we're inside an #each block and the token
  // looks like a slot variable reference (single word argument).
  if (tokenLookup.category === 'argument') {
    const variableName = tokenLookup.token.value.trim();
    const slotPrefix = lookup.fragment.content
      .slice(Math.max(0, tokenLookup.localStartOffset - 'slot::'.length), tokenLookup.localStartOffset)
      .toLowerCase();
    const bindingMatch = resolveVisibleLoopBindingFromNodePath(
      lookup.nodePath,
      lookup.fragment.content,
      variableName,
      lookup.fragmentLocalOffset,
    );

    if (slotPrefix === 'slot::' && bindingMatch) {
      return {
        variableName,
        kind: 'loop',
        targetDefinitionRange: bindingMatch.binding.bindingRange,
      };
    }
  }

  return null;
}

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

function isCrossFileVariableKind(kind: VariableSymbolKind): kind is 'chat' {
  return kind === 'chat';
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

function buildLocationKey(uri: string, range: Range): string {
  return `${uri}:${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`;
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
    const variablePosition = isVariablePosition(lookup);
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

    const links: LocationLink[] = [];
    const seen = new Set<string>();

    if (targetRange) {
      const hostRange = lookup.fragmentAnalysis.mapper.toHostRange(request.text, targetRange);
      if (hostRange) {
        const key = buildLocationKey(params.textDocument.uri, hostRange);
        seen.add(key);
        links.push(buildDefinitionLocationLink(params.textDocument.uri, hostRange, originRange));
      }
    }

    if (variableName && variableKind && isCrossFileVariableKind(variableKind) && this.variableFlowService) {
      const flowQuery = this.variableFlowService.queryVariable(variableName);
      for (const writer of flowQuery?.writers ?? []) {
        const key = buildLocationKey(writer.uri, writer.hostRange);
        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        links.push(buildDefinitionLocationLink(writer.uri, writer.hostRange, originRange));
      }
    }

    if (links.length === 0) {
      return null;
    }

    return links as unknown as Definition;
  }
}
