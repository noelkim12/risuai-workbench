/**
 * symbol table 기반 diagnostics 수집기.
 * @file packages/cbs-lsp/src/analyzer/diagnostics/symbol-diagnostics.ts
 */

import type { DiagnosticInfo, DiagnosticRelatedInfo } from 'risu-workbench-core';

import { compareRanges } from './compare';
import { createDiagnosticInfo } from './diagnostic-info';
import { DiagnosticCode } from './taxonomy';
import {
  type InvalidArgumentReference,
  type InvalidFunctionReference,
  type ScopeAnalysisResult,
  type SymbolTable,
  type UndefinedVariableReference,
  type VariableSymbol,
} from '../symbolTable';

/**
 * collectSymbolDiagnostics 함수.
 * symbol table에서 undefined/unused/invalid-argument diagnostics를 수집함.
 *
 * @param scopeAnalysis - symbol table과 semantic issue store가 묶인 scope analysis 결과
 * @returns symbol-based diagnostics 목록
 */
export function collectSymbolDiagnostics(scopeAnalysis: ScopeAnalysisResult): DiagnosticInfo[] {
  const diagnostics: DiagnosticInfo[] = [];
  const { symbolTable, issues } = scopeAnalysis;

  for (const reference of issues.getUndefinedReferences()) {
    diagnostics.push(
      createDiagnosticInfo(
        DiagnosticCode.UndefinedVariable,
        reference.range,
        formatUndefinedVariableMessage(reference),
      ),
    );
  }

  for (const reference of issues.getInvalidArgumentReferences()) {
    diagnostics.push(
      createDiagnosticInfo(
        DiagnosticCode.WrongArgumentCount,
        reference.range,
        formatInvalidArgumentReferenceMessage(reference),
        createInvalidArgumentRelatedInformation(reference, symbolTable),
      ),
    );
  }

  for (const reference of issues.getInvalidFunctionReferences()) {
    diagnostics.push(
      createDiagnosticInfo(
        reference.reason === 'unresolved-call'
          ? DiagnosticCode.UnknownFunction
          : DiagnosticCode.WrongArgumentCount,
        reference.range,
        formatInvalidFunctionReferenceMessage(reference),
      ),
    );
  }

  for (const symbol of symbolTable.getUnusedVariables()) {
    if (!symbol.definitionRange) {
      continue;
    }

    diagnostics.push(
      createDiagnosticInfo(
        DiagnosticCode.UnusedVariable,
        symbol.definitionRange,
        formatUnusedVariableMessage(symbol),
        createUnusedVariableRelatedInformation(symbol),
      ),
    );
  }

  return diagnostics;
}

function formatUndefinedVariableMessage(reference: UndefinedVariableReference): string {
  switch (reference.kind) {
    case 'temp':
      return `CBS temporary variable ${JSON.stringify(reference.name)} is referenced without a local definition`;
    case 'loop':
      return `CBS loop binding ${JSON.stringify(reference.name)} is not available in the current #each scope`;
    case 'chat':
    default:
      return `CBS variable ${JSON.stringify(reference.name)} is referenced without a local definition`;
  }
}

function formatUnusedVariableMessage(symbol: VariableSymbol): string {
  switch (symbol.kind) {
    case 'temp':
      return `CBS temporary variable ${JSON.stringify(symbol.name)} is defined but never read`;
    case 'loop':
      return `CBS loop binding ${JSON.stringify(symbol.name)} is defined but never used via {{slot::${symbol.name}}}`;
    case 'chat':
    default:
      return `CBS variable ${JSON.stringify(symbol.name)} is defined but never read`;
  }
}

function formatInvalidArgumentReferenceMessage(reference: InvalidArgumentReference): string {
  if (reference.reason === 'outside-function') {
    return `CBS argument reference ${JSON.stringify(`arg::${reference.rawText}`)} is only valid inside a local #func body resolved through {{call::...}} recursion`;
  }

  const parameterCount = reference.parameterCount ?? 0;
  const maxIndex = Math.max(0, parameterCount);
  return `CBS argument reference ${JSON.stringify(`arg::${reference.rawText}`)} is outside upstream runtime slots for local function ${JSON.stringify(reference.functionName ?? 'unknown')} (expected 0..${maxIndex}; arg::0 is the function name)`;
}

function formatInvalidFunctionReferenceMessage(reference: InvalidFunctionReference): string {
  if (reference.reason === 'unsafe-nested-argument') {
    return `CBS local function call ${JSON.stringify(`call::${reference.name}`)} contains a nested CBS argument with ::; upstream call:: uses plain split semantics, so this argument may not be preserved.`;
  }

  return `CBS local function call references unknown #func ${JSON.stringify(reference.name)} in this fragment`;
}

function createInvalidArgumentRelatedInformation(
  reference: InvalidArgumentReference,
  symbolTable: SymbolTable,
): DiagnosticRelatedInfo[] | undefined {
  if (!reference.functionName) {
    return undefined;
  }

  const functionSymbol = symbolTable.getFunction(reference.functionName);
  if (!functionSymbol?.definitionRange) {
    return undefined;
  }

  const parameterSummary =
    functionSymbol.parameters.length > 0
      ? `Parameters: ${functionSymbol.parameters.map((parameter) => `\`${parameter}\``).join(', ')}`
      : 'Parameters are inferred at runtime.';

  return [
    {
      message: `Local #func ${JSON.stringify(reference.functionName)} is declared here. ${parameterSummary}`,
      range: functionSymbol.definitionRange,
    },
  ];
}

function createUnusedVariableRelatedInformation(
  symbol: VariableSymbol,
): DiagnosticRelatedInfo[] | undefined {
  if (!symbol.definitionRange) {
    return undefined;
  }

  const secondaryDefinitions = symbol.definitionRanges
    .filter(
      (range) =>
        range.start.line !== symbol.definitionRange?.start.line ||
        range.start.character !== symbol.definitionRange?.start.character ||
        range.end.line !== symbol.definitionRange?.end.line ||
        range.end.character !== symbol.definitionRange?.end.character,
    )
    .sort(compareRanges);

  if (secondaryDefinitions.length === 0) {
    return undefined;
  }

  return secondaryDefinitions.map((range, index) => ({
    message: `Additional unused definition #${index + 2} for ${JSON.stringify(symbol.name)} appears here.`,
    range,
  }));
}
