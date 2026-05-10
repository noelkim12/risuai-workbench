import type {
  RisuLuaModuleTableButtonActionIndexContract,
  RisuLuaModuleTableButtonActionSourceContract,
  RisuLuaModuleTableButtonActionUsageContract,
  RisuLuaModuleTableRefactorMapContract,
} from './module-table-contracts';
import { buildLineStarts, offsetToLineColumn } from '../shared/range-utils';
import type { LuaSourceRange } from '../shared/types';

export interface BuildRisuLuaModuleTableButtonActionIndexInput {
  sourceFile: string;
  refactorMap: RisuLuaModuleTableRefactorMapContract;
  buttonActionSources: RisuLuaModuleTableButtonActionSourceInput[];
  generatedAt?: string;
}

export type RisuLuaModuleTableButtonActionSourceInput = string | RisuLuaModuleTableButtonActionSourceContract;

export interface RawButtonActionUsage {
  name: string;
  source: RisuLuaModuleTableButtonActionUsageContract['source'];
  rawText: string;
  sourceFile: string;
  sourceRange: LuaSourceRange;
}

export function buildRisuLuaModuleTableButtonActionIndex(
  input: BuildRisuLuaModuleTableButtonActionIndexInput,
): RisuLuaModuleTableButtonActionIndexContract {
  const usages = collectButtonActionUsages(input.buttonActionSources);
  const usagesByName = new Map<string, RawButtonActionUsage[]>();
  for (const usage of usages) {
    usagesByName.set(usage.name, [...(usagesByName.get(usage.name) ?? []), usage]);
  }

  const declarations = input.refactorMap.symbols
    .filter((symbol) => symbol.classification === 'extract:button-action')
    .sort((left, right) => left.sourceRange.startOffset - right.sourceRange.startOffset);
  const declarationNames = new Set(declarations.map((symbol) => symbol.originalName));
  const usageNames = new Set(usages.map((usage) => usage.name));
  const names = [...new Set([...declarationNames, ...usageNames])].sort((left, right) => left.localeCompare(right));

  return {
    version: 1,
    mode: 'module-table-button-action-index',
    sourceFile: input.sourceFile,
    ...(input.generatedAt === undefined ? {} : { generatedAt: input.generatedAt }),
    actions: names.map((name) => {
      const declaration = declarations.find((symbol) => symbol.originalName === name);
      return {
        name,
        ...(declaration?.targetModule === undefined ? {} : { targetModule: declaration.targetModule }),
        ...(declaration === undefined ? {} : {
          declaration: {
            id: declaration.id,
            sourceFile: input.sourceFile,
            sourceRange: declaration.sourceRange,
            classification: declaration.classification,
          },
        }),
        usages: (usagesByName.get(name) ?? []).map(({ name: _name, ...usage }) => usage),
      };
    }),
  };
}

export function serializeRisuLuaModuleTableButtonActionIndex(
  index: RisuLuaModuleTableButtonActionIndexContract,
): string {
  return `${JSON.stringify(index, null, 2)}\n`;
}

export function collectButtonActionUsages(sources: RisuLuaModuleTableButtonActionSourceInput[]): RawButtonActionUsage[] {
  return sources.flatMap((entry, index) => {
    const source = typeof entry === 'string' ? entry : entry.source;
    const sourceFile = typeof entry === 'string' ? `button-action-source:${index}` : entry.sourceFile;
    return collectButtonActionUsagesFromSource(source, sourceFile);
  });
}

function collectButtonActionUsagesFromSource(source: string, sourceFile: string): RawButtonActionUsage[] {
  const usages: RawButtonActionUsage[] = [];
  const lineStarts = buildLineStarts(source);
  const attributePattern = /\brisu-trigger\s*=\s*(["'])([A-Za-z_][A-Za-z0-9_]*)\1/g;
  const cbsButtonPattern = /\{\{\s*button\s*::([\s\S]*?)\}\}/g;

  let attributeMatch = attributePattern.exec(source);
  while (attributeMatch !== null) {
    usages.push({
      name: attributeMatch[2],
      source: 'risu-trigger-attribute',
      rawText: attributeMatch[0],
      sourceFile,
      sourceRange: rangeFromOffsets(attributeMatch.index, attributeMatch.index + attributeMatch[0].length, lineStarts),
    });
    attributeMatch = attributePattern.exec(source);
  }

  let cbsButtonMatch = cbsButtonPattern.exec(source);
  while (cbsButtonMatch !== null) {
    const triggerName = cbsButtonTriggerName(cbsButtonMatch[1]);
    if (triggerName !== undefined) {
      usages.push({
        name: triggerName,
        source: 'cbs-button',
        rawText: cbsButtonMatch[0],
        sourceFile,
        sourceRange: rangeFromOffsets(cbsButtonMatch.index, cbsButtonMatch.index + cbsButtonMatch[0].length, lineStarts),
      });
    }
    cbsButtonMatch = cbsButtonPattern.exec(source);
  }

  return usages.sort((left, right) => left.sourceFile.localeCompare(right.sourceFile) || left.sourceRange.startOffset - right.sourceRange.startOffset);
}

function cbsButtonTriggerName(buttonBody: string): string | undefined {
  const segments = buttonBody.split('::').map((segment) => segment.trim()).filter((segment) => segment.length > 0);
  const triggerName = segments[segments.length - 1];
  return triggerName !== undefined && /^[A-Za-z_][A-Za-z0-9_]*$/.test(triggerName) ? triggerName : undefined;
}

function rangeFromOffsets(startOffset: number, endOffset: number, lineStarts: number[]): LuaSourceRange {
  return {
    startLine: offsetToLineColumn(startOffset, lineStarts).line,
    endLine: offsetToLineColumn(endOffset, lineStarts).line,
    startOffset,
    endOffset,
  };
}
