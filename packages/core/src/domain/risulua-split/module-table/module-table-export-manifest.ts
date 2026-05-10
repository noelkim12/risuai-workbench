import type {
  RisuLuaModuleTableExportManifestContract,
  RisuLuaModuleTableExportManifestOccurrence,
  RisuLuaModuleTableRefactorMapContract,
} from './module-table-contracts';
import type { RisuLuaModuleTableRuntimeRootFact } from './module-table-analyzer-types';

export interface BuildRisuLuaModuleTableExportManifestInput {
  sourceFile: string;
  refactorMap: RisuLuaModuleTableRefactorMapContract;
  runtimeRoots: RisuLuaModuleTableRuntimeRootFact[];
  generatedAt?: string;
}

export function buildRisuLuaModuleTableExportManifest(
  input: BuildRisuLuaModuleTableExportManifestInput,
): RisuLuaModuleTableExportManifestContract {
  const bridgeOccurrences = input.refactorMap.symbols
    .filter((symbol) => symbol.globalBridge)
    .map((symbol) => ({
      id: symbol.id,
      name: symbol.originalName,
      line: symbol.sourceRange.startLine,
      classification: symbol.classification,
      targetModule: symbol.targetModule,
    }));
  const preservedOccurrences = input.refactorMap.preserved
    .filter((entry) => entry.reason === 'preserve:host-visible-global-unsafe-bridge')
    .map((entry) => ({
      id: entry.id,
      name: entry.originalName,
      line: entry.sourceRange.startLine,
      classification: entry.reason,
      preservedReason: entry.reason,
    }));
  const hostVisibleGlobals = [...bridgeOccurrences, ...preservedOccurrences]
    .sort((left, right) => left.line - right.line)
    .map((entry, order) => ({ ...entry, order }));

  const byName = new Map<string, RisuLuaModuleTableExportManifestOccurrence[]>();
  for (const occurrence of hostVisibleGlobals) {
    byName.set(occurrence.name, [...(byName.get(occurrence.name) ?? []), occurrence]);
  }

  return {
    version: 1,
    mode: 'module-table-export-manifest',
    sourceFile: input.sourceFile,
    ...(input.generatedAt === undefined ? {} : { generatedAt: input.generatedAt }),
    hostVisibleGlobals,
    duplicateGroups: [...byName.entries()]
      .filter(([, occurrences]) => occurrences.length > 1)
      .map(([name, occurrences]) => ({
        name,
        occurrences,
        finalWinner: occurrences[occurrences.length - 1],
      })),
    listenerRegistrations: input.runtimeRoots
      .filter((root) => root.kind === 'listener-registration')
      .sort((left, right) => left.sourceRange.startLine - right.sourceRange.startLine)
      .map((root) => ({
        name: root.name,
        kind: root.kind,
        line: root.sourceRange.startLine,
        preservedReason: input.refactorMap.preserved.find((entry) => entry.id === root.id)?.reason,
      })),
    preserved: input.refactorMap.preserved,
  };
}

export function serializeRisuLuaModuleTableExportManifest(
  manifest: RisuLuaModuleTableExportManifestContract,
): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
