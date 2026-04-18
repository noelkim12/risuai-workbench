import { Definition, LocationLink, TextDocumentPositionParams } from 'vscode-languageserver/node';
import type { CBSBuiltinRegistry, Range } from 'risu-workbench-core';

import {
  fragmentAnalysisService,
  type FragmentAnalysisRequest,
  type FragmentAnalysisService,
  type FragmentCursorLookupResult,
} from '../core';
import type { VariableSymbolKind } from '../analyzer/symbolTable';

export type DefinitionRequestResolver = (
  params: TextDocumentPositionParams,
) => FragmentAnalysisRequest | null;

export interface DefinitionProviderOptions {
  analysisService?: FragmentAnalysisService;
  resolveRequest?: DefinitionRequestResolver;
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
  // In this case, check if we're inside an #each block and the token
  // looks like a slot variable reference (single word argument).
  if (tokenLookup.category === 'argument') {
    const isInsideEachBlock = lookup.nodePath.some(
      (node) => node.type === 'Block' && node.kind === 'each',
    );

    if (isInsideEachBlock) {
      const variableName = tokenLookup.token.value.trim();
      // Check if this variable exists as a loop variable in the symbol table
      // This handles the case where slot::variable is parsed as plain text
      if (variableName.length > 0) {
        return { variableName, kind: 'loop' };
      }
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

export class DefinitionProvider {
  private readonly analysisService: FragmentAnalysisService;

  private readonly resolveRequest: DefinitionRequestResolver;

  constructor(
    private readonly _registry: CBSBuiltinRegistry,
    options: DefinitionProviderOptions = {},
  ) {
    // Registry stored for API consistency with other providers
    void this._registry;
    this.analysisService = options.analysisService ?? fragmentAnalysisService;
    this.resolveRequest = options.resolveRequest ?? (() => null);
  }

  provide(params: TextDocumentPositionParams): Definition | null {
    const request = this.resolveRequest(params);
    if (!request) {
      return null;
    }

    const lookup = this.analysisService.locatePosition(request, params.position);
    if (!lookup) {
      return null;
    }

    const variablePosition = isVariablePosition(lookup);
    if (!variablePosition) {
      return null;
    }

    const { variableName, kind } = variablePosition;

    // Get symbol from local fragment symbol table
    const symbolTable = lookup.fragmentAnalysis.providerLookup.getSymbolTable();
    const symbol = symbolTable.getVariable(variableName, kind);

    if (!symbol) {
      return null;
    }

    // Return null for global variables (they're external, not locally defined)
    if (symbol.scope === 'external' || kind === 'global') {
      return null;
    }

    // Find the first definition range
    const targetRange = findFirstDefinitionRange(symbol.definitionRanges);
    if (!targetRange) {
      return null;
    }

    // Map the local range to host range
    const hostRange = lookup.fragmentAnalysis.mapper.toHostRange(request.text, targetRange);
    if (!hostRange) {
      return null;
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

    // Return as LocationLink array for richer navigation experience
    const locationLink: LocationLink = {
      targetUri: params.textDocument.uri,
      targetRange: hostRange,
      targetSelectionRange: hostRange,
      originSelectionRange: originRange ?? undefined,
    };

    // Cast to Definition to satisfy TypeScript (LocationLink[] is a valid Definition)
    return [locationLink] as unknown as Definition;
  }
}
