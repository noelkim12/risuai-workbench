import { type CancellationToken, Location, ReferenceParams } from 'vscode-languageserver/node';
import type { Range } from 'risu-workbench-core';

import {
  createAgentMetadataAvailability,
  fragmentAnalysisService,
  type AgentMetadataAvailabilityContract,
  type FragmentAnalysisRequest,
  type FragmentAnalysisService,
  type FragmentCursorLookupResult,
} from '../core';
import type { VariableSymbol, VariableSymbolKind } from '../analyzer/symbolTable';
import { isRequestCancelled } from '../request-cancellation';
import type { VariableFlowService } from '../services';

export type ReferencesRequestResolver = (
  params: ReferenceParams,
) => FragmentAnalysisRequest | null;

export interface ReferencesProviderOptions {
  analysisService?: FragmentAnalysisService;
  resolveRequest?: ReferencesRequestResolver;
  variableFlowService?: VariableFlowService;
}

function isCrossFileVariableKind(kind: VariableSymbolKind): kind is 'chat' {
  return kind === 'chat';
}

function buildLocationKey(uri: string, range: Range): string {
  return `${uri}:${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`;
}

export const REFERENCES_PROVIDER_AVAILABILITY = createAgentMetadataAvailability(
  'local-only',
  'references-provider:fragment-symbol-table',
  'References resolve only fragment-local variable and loop-alias symbols; globals and workspace-wide references stay unavailable.',
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

/**
 * Determines if the cursor position is on a variable reference.
 * Uses the same contract as DefinitionProvider for consistency.
 */
function isVariablePosition(lookup: FragmentCursorLookupResult): {
  variableName: string;
  kind: VariableSymbolKind;
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
      // Verify we're inside an #each block by checking the node path
      const isInsideEachBlock = lookup.nodePath.some(
        (node) => node.type === 'Block' && node.kind === 'each',
      );

      if (isInsideEachBlock) {
        return { variableName, kind: slotRule.kind };
      }
    }
  }

  // Handle edge case: when parser treats #each body as plain text,
  // the node span may show as 'node-range' with PlainText owner,
  // but the token still shows as 'argument' with the variable name.
  // In this case, check if we're inside an #each block.
  if (tokenLookup.category === 'argument') {
    const isInsideEachBlock = lookup.nodePath.some(
      (node) => node.type === 'Block' && node.kind === 'each',
    );

    if (isInsideEachBlock) {
      const variableName = tokenLookup.token.value.trim();
      if (variableName.length > 0) {
        return { variableName, kind: 'loop' };
      }
    }
  }

  return null;
}

export class ReferencesProvider {
  private readonly analysisService: FragmentAnalysisService;

  private readonly resolveRequest: ReferencesRequestResolver;

  private readonly variableFlowService: VariableFlowService | null;

  readonly availability: AgentMetadataAvailabilityContract = REFERENCES_PROVIDER_AVAILABILITY;

  constructor(options: ReferencesProviderOptions = {}) {
    this.analysisService = options.analysisService ?? fragmentAnalysisService;
    this.resolveRequest = options.resolveRequest ?? (() => null);
    this.variableFlowService = options.variableFlowService ?? null;
  }

  provide(params: ReferenceParams, cancellationToken?: CancellationToken): Location[] {
    if (isRequestCancelled(cancellationToken)) {
      return [];
    }

    const request = this.resolveRequest(params);
    if (!request) {
      return [];
    }

    const lookup = this.analysisService.locatePosition(request, params.position, cancellationToken);
    if (!lookup) {
      return [];
    }

    if (isRequestCancelled(cancellationToken)) {
      return [];
    }

    const variablePosition = isVariablePosition(lookup);
    if (!variablePosition) {
      return [];
    }

    const { variableName, kind } = variablePosition;

    // Get symbol from local fragment symbol table
    const symbolTable = lookup.fragmentAnalysis.providerLookup.getSymbolTable();
    const symbol = symbolTable.getVariable(variableName, kind);
    const includeDeclaration = params.context?.includeDeclaration ?? false;
    const locations: Location[] = [];
    const seen = new Set<string>();

    if (symbol && symbol.kind !== 'global' && symbol.scope !== 'external') {
      for (const location of this.buildLocations(symbol, lookup, request, includeDeclaration)) {
        const key = buildLocationKey(location.uri, location.range);
        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        locations.push(location);
      }
    }

    if (isCrossFileVariableKind(kind) && this.variableFlowService) {
      const flowQuery = this.variableFlowService.queryVariable(variableName);
      const occurrences = [
        ...(includeDeclaration ? (flowQuery?.writers ?? []) : []),
        ...(flowQuery?.readers ?? []),
      ];

      for (const occurrence of occurrences) {
        const key = buildLocationKey(occurrence.uri, occurrence.hostRange);
        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        locations.push({
          uri: occurrence.uri,
          range: occurrence.hostRange,
        });
      }
    }

    return locations;
  }

  private buildLocations(
    symbol: VariableSymbol,
    lookup: FragmentCursorLookupResult,
    request: FragmentAnalysisRequest,
    includeDeclaration: boolean,
  ): Location[] {
    const mapper = lookup.fragmentAnalysis.mapper;
    const locations: Location[] = [];

    // Add definitions first if includeDeclaration is true
    if (includeDeclaration) {
      for (const defRange of symbol.definitionRanges) {
        const hostRange = this.toHostRange(mapper, request.text, defRange);
        if (hostRange) {
          locations.push({
            uri: request.uri,
            range: hostRange,
          });
        }
      }
    }

    // Add references
    for (const refRange of symbol.references) {
      const hostRange = this.toHostRange(mapper, request.text, refRange);
      if (hostRange) {
        locations.push({
          uri: request.uri,
          range: hostRange,
        });
      }
    }

    return locations;
  }

  private toHostRange(
    mapper: FragmentCursorLookupResult['fragmentAnalysis']['mapper'],
    documentContent: string,
    localRange: Range,
  ): Range | null {
    return mapper.toHostRange(documentContent, localRange);
  }
}
