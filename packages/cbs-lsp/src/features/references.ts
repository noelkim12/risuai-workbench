import { Location, ReferenceParams } from 'vscode-languageserver/node';
import type { Range } from 'risu-workbench-core';

import {
  fragmentAnalysisService,
  type FragmentAnalysisRequest,
  type FragmentAnalysisService,
  type FragmentCursorLookupResult,
} from '../core';
import type { VariableSymbol, VariableSymbolKind } from '../analyzer/symbolTable';

export type ReferencesRequestResolver = (
  params: ReferenceParams,
) => FragmentAnalysisRequest | null;

export interface ReferencesProviderOptions {
  analysisService?: FragmentAnalysisService;
  resolveRequest?: ReferencesRequestResolver;
}

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

  constructor(options: ReferencesProviderOptions = {}) {
    this.analysisService = options.analysisService ?? fragmentAnalysisService;
    this.resolveRequest = options.resolveRequest ?? (() => null);
  }

  provide(params: ReferenceParams): Location[] {
    const request = this.resolveRequest(params);
    if (!request) {
      return [];
    }

    const lookup = this.analysisService.locatePosition(request, params.position);
    if (!lookup) {
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

    if (!symbol) {
      return [];
    }

    // Return [] for globals - they are external and not local to the fragment
    if (symbol.kind === 'global' || symbol.scope === 'external') {
      return [];
    }

    return this.buildLocations(symbol, lookup, request, params.context?.includeDeclaration ?? false);
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
