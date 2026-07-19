import type { RisuLuaModuleTableRefactorMapContract } from './module-table-contracts';
import { analyzeRisuLuaModuleTable } from './module-table-analyzer';
import { parseRisuLuaModuleTableSource } from './module-table-parser';
import type { ModuleBodyPlan } from './module-table-top-level-rewrite';

export interface ValidateRisuLuaModuleTableCapturePreservationInput {
  modulePlans: ModuleBodyPlan[];
  refactorMap: RisuLuaModuleTableRefactorMapContract;
}

/**
 * Re-analyze generated module chunks and reject original lexical captures
 * that became unresolved runtime-global lookups after extraction.
 */
export async function validateRisuLuaModuleTableCapturePreservation(
  input: ValidateRisuLuaModuleTableCapturePreservationInput,
): Promise<string[]> {
  const diagnostics: string[] = [];

  for (const modulePlan of input.modulePlans) {
    const sourceSymbols = input.refactorMap.symbols.filter(
      (symbol) => symbol.targetModule === modulePlan.modulePath && symbol.captures.length > 0,
    );
    if (sourceSymbols.length === 0) continue;

    const parseResult = await parseRisuLuaModuleTableSource(modulePlan.body);
    if (!parseResult.ok) {
      diagnostics.push(
        `RISULUA_SPLIT_CAPTURE_LOST ${modulePlan.modulePath}: generated module could not be parsed for capture validation.`,
      );
      continue;
    }

    const analysis = analyzeRisuLuaModuleTable({ source: modulePlan.body, parseResult });
    for (const sourceSymbol of sourceSymbols) {
      const generatedNames = new Set([
        sourceSymbol.originalName,
        `__impl.${sourceSymbol.exportName ?? sourceSymbol.originalName}`,
      ]);
      const generatedSymbol = analysis.lexicalSymbols.find(
        (symbol) => generatedNames.has(symbol.originalName),
      );
      if (generatedSymbol === undefined) continue;

      const unresolvedNames = new Set(
        generatedSymbol.references
          .filter((reference) => reference.resolvedScopeId === undefined)
          .map((reference) => reference.name),
      );
      for (const capture of sourceSymbol.captures) {
        if (!unresolvedNames.has(capture)) continue;
        diagnostics.push(
          `RISULUA_SPLIT_CAPTURE_LOST ${modulePlan.modulePath}: original local capture "${capture}" used by ${sourceSymbol.originalName} resolves as a runtime global after extraction.`,
        );
      }
    }
  }

  return diagnostics;
}
