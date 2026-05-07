import fs from 'node:fs';
import path from 'node:path';

import {
  RISULUA_MODULE_TABLE_CLASSIFICATION_CODES,
  RISULUA_MODULE_TABLE_DOMAIN_CANDIDATES_PATH,
  RISULUA_MODULE_TABLE_HOST_EFFECT_CLASSES,
  RISULUA_MODULE_TABLE_REFACTOR_MAP_PATH,
  validateRisuLuaModuleTableRefactorMap,
  type RisuLuaModuleTableDomainCandidateContract,
  type RisuLuaModuleTableHostEffects,
  type RisuLuaModuleTableInvariantFinding,
  type RisuLuaModuleTableModuleContract,
  type RisuLuaModuleTableRefactorMapContract,
  type RisuLuaModuleTableSymbolContract,
} from './module-table-contracts';

export interface RisuLuaModuleTableArtifactSummary {
  path: string;
  requireId: string;
  alias: string;
  category: RisuLuaModuleTableModuleContract['category'];
  exports: string[];
}

export interface RisuLuaModuleTableBridgeSummary {
  symbolId: string;
  originalPublicName: string;
  moduleAlias: string;
  exportName: string;
  assignment: string;
}

export interface RisuLuaModuleTableRefactorMapDocument {
  version: 1;
  mode: 'module-table';
  sourceFile: string;
  source: {
    file: string;
  };
  modules: RisuLuaModuleTableModuleContract[];
  artifacts: RisuLuaModuleTableArtifactSummary[];
  symbols: RisuLuaModuleTableSymbolContract[];
  preserved: RisuLuaModuleTableRefactorMapContract['preserved'];
  bridges: RisuLuaModuleTableBridgeSummary[];
  hostEffects: RisuLuaModuleTableHostEffects;
  warnings: RisuLuaModuleTableInvariantFinding[];
  domainCandidates: RisuLuaModuleTableDomainCandidateContract[];
}

export interface RisuLuaModuleTableDomainCandidatesDocument {
  version: 1;
  mode: 'module-table';
  candidates: RisuLuaModuleTableDomainCandidateContract[];
}

export interface WriteRisuLuaModuleTableJsonOptions {
  outputRoot: string;
  cwd?: string;
}

export interface WriteRisuLuaModuleTableJsonResult {
  path: string;
  json: string;
}

export function writeRisuLuaModuleTableRefactorMap(
  refactorMap: RisuLuaModuleTableRefactorMapContract,
  options: WriteRisuLuaModuleTableJsonOptions,
): WriteRisuLuaModuleTableJsonResult {
  return writeModuleTableJson(
    RISULUA_MODULE_TABLE_REFACTOR_MAP_PATH,
    serializeRisuLuaModuleTableRefactorMap(refactorMap, { cwd: options.cwd }),
    options.outputRoot,
  );
}

export function writeRisuLuaModuleTableDomainCandidates(
  candidates: RisuLuaModuleTableDomainCandidateContract[],
  options: WriteRisuLuaModuleTableJsonOptions,
): WriteRisuLuaModuleTableJsonResult {
  return writeModuleTableJson(
    RISULUA_MODULE_TABLE_DOMAIN_CANDIDATES_PATH,
    serializeRisuLuaModuleTableDomainCandidates(candidates, { cwd: options.cwd }),
    options.outputRoot,
  );
}

export function serializeRisuLuaModuleTableRefactorMap(
  refactorMap: RisuLuaModuleTableRefactorMapContract,
  options?: { cwd?: string },
): string {
  return serializeStableJson(createRisuLuaModuleTableRefactorMapDocument(refactorMap), options);
}

export function serializeRisuLuaModuleTableDomainCandidates(
  candidates: RisuLuaModuleTableDomainCandidateContract[],
  options?: { cwd?: string },
): string {
  return serializeStableJson(createRisuLuaModuleTableDomainCandidatesDocument(candidates), options);
}

export function createRisuLuaModuleTableRefactorMapDocument(
  refactorMap: RisuLuaModuleTableRefactorMapContract,
): RisuLuaModuleTableRefactorMapDocument {
  const domainCandidates = normalizeDomainCandidates(refactorMap.domainCandidates);
  const normalizedMap: RisuLuaModuleTableRefactorMapContract = {
    ...refactorMap,
    domainCandidates,
  };

  return {
    version: 1,
    mode: 'module-table',
    sourceFile: refactorMap.sourceFile,
    source: {
      file: refactorMap.sourceFile,
    },
    modules: refactorMap.modules,
    artifacts: refactorMap.modules.map(moduleToArtifactSummary),
    symbols: refactorMap.symbols,
    preserved: refactorMap.preserved,
    bridges: refactorMap.symbols.flatMap(symbolToBridgeSummary),
    hostEffects: summarizeHostEffects(refactorMap),
    warnings: validateRisuLuaModuleTableRefactorMap(normalizedMap),
    domainCandidates,
  };
}

export function createRisuLuaModuleTableDomainCandidatesDocument(
  candidates: RisuLuaModuleTableDomainCandidateContract[],
): RisuLuaModuleTableDomainCandidatesDocument {
  return {
    version: 1,
    mode: 'module-table',
    candidates: normalizeDomainCandidates(candidates),
  };
}

export function renderRisuLuaModuleTableReportSections(
  refactorMap: RisuLuaModuleTableRefactorMapContract,
): string[] {
  const document = createRisuLuaModuleTableRefactorMapDocument(refactorMap);
  return [
    '## Module-table extraction contract',
    '',
    `- Refactor map: \`${RISULUA_MODULE_TABLE_REFACTOR_MAP_PATH}\``,
    `- Domain candidates: \`${RISULUA_MODULE_TABLE_DOMAIN_CANDIDATES_PATH}\``,
    `- Source file: \`${document.source.file}\``,
    `- Reason codes: ${inlineCodeList([...RISULUA_MODULE_TABLE_CLASSIFICATION_CODES])}`,
    '',
    '### Runtime roots and modules',
    '',
    ...renderRuntimeRoots(document.symbols),
    '',
    '### Generated module artifacts',
    '',
    ...document.artifacts.map((artifact) => `- \`${artifact.path}\` (${artifact.category}, alias \`${artifact.alias}\`, exports ${inlineCodeList(artifact.exports)})`),
    '',
    '### Host global bridges',
    '',
    ...renderBridgeSummaries(document.bridges),
    '',
    '### Preserved unsafe symbols and procedural blocks',
    '',
    ...renderPreservedSummaries(document),
    '',
    '### Host effects by class',
    '',
    ...renderHostEffectSummary(document.hostEffects),
    '',
    '### Domain candidates',
    '',
    ...renderDomainCandidateSummaries(document.domainCandidates),
    '',
    '### Module-table warnings',
    '',
    ...renderWarningSummaries(document.warnings),
  ];
}

function writeModuleTableJson(relativePath: string, json: string, outputRoot: string): WriteRisuLuaModuleTableJsonResult {
  const outputPath = path.join(outputRoot, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, json, 'utf8');
  return { path: outputPath, json };
}

function moduleToArtifactSummary(moduleContract: RisuLuaModuleTableModuleContract): RisuLuaModuleTableArtifactSummary {
  return {
    path: moduleContract.path,
    requireId: moduleContract.requireId,
    alias: moduleContract.alias,
    category: moduleContract.category,
    exports: moduleContract.exports,
  };
}

function symbolToBridgeSummary(symbol: RisuLuaModuleTableSymbolContract): RisuLuaModuleTableBridgeSummary[] {
  if (symbol.bridge === undefined) return [];
  return [{
    symbolId: symbol.id,
    originalPublicName: symbol.bridge.originalPublicName,
    moduleAlias: symbol.bridge.moduleAlias,
    exportName: symbol.bridge.exportName,
    assignment: symbol.bridge.mainAssignment.text,
  }];
}

function summarizeHostEffects(refactorMap: RisuLuaModuleTableRefactorMapContract): RisuLuaModuleTableHostEffects {
  const effects = createHostEffectsAccumulator();
  for (const symbol of refactorMap.symbols) addHostEffects(effects, symbol.hostEffects);
  for (const candidate of refactorMap.domainCandidates) addHostEffects(effects, candidate.hostEffects);
  return effects;
}

function addHostEffects(target: RisuLuaModuleTableHostEffects, source: RisuLuaModuleTableHostEffects): void {
  for (const key of RISULUA_MODULE_TABLE_HOST_EFFECT_CLASSES) {
    target[key] = uniqueSorted([...target[key], ...source[key]]);
  }
}

function createHostEffectsAccumulator(): RisuLuaModuleTableHostEffects {
  return {
    reads: [],
    writes: [],
    uiInteraction: [],
    asyncModelNetwork: [],
    dynamicEnvironment: [],
  };
}

function normalizeDomainCandidates(
  candidates: RisuLuaModuleTableDomainCandidateContract[],
): RisuLuaModuleTableDomainCandidateContract[] {
  return candidates.map((candidate) => ({
    ...candidate,
    autoGenerated: false,
  }));
}

function renderRuntimeRoots(symbols: RisuLuaModuleTableSymbolContract[]): string[] {
  const roots = symbols.filter((symbol) => symbol.parent === undefined && (
    symbol.declarationKind === 'top-level-global-function'
    || symbol.declarationKind === 'top-level-global-assignment'
    || symbol.declarationKind === 'procedural-block'
  ));
  if (roots.length === 0) return ['- None recorded.'];
  return roots.map((symbol) => `- \`${symbol.originalName}\` (${symbol.declarationKind}, ${symbol.classification}, lines ${symbol.sourceRange.startLine}-${symbol.sourceRange.endLine})`);
}

function renderBridgeSummaries(bridges: RisuLuaModuleTableBridgeSummary[]): string[] {
  if (bridges.length === 0) return ['- None required.'];
  return bridges.map((bridge) => `- \`${bridge.originalPublicName}\` stays host-visible through direct assignment \`${bridge.assignment}\` from \`${bridge.moduleAlias}.${bridge.exportName}\`.`);
}

function renderPreservedSummaries(document: RisuLuaModuleTableRefactorMapDocument): string[] {
  const procedural = document.symbols.filter((symbol) => symbol.declarationKind === 'procedural-block');
  const preserved = document.preserved.map((entry) => `- \`${entry.originalName}\` preserved because \`${entry.reason}\`; evidence: ${entry.evidence.join(', ')}`);
  const blocks = procedural.map((symbol) => `- \`${symbol.originalName}\` remains procedural report-only code because \`${symbol.classification}\`.`);
  if (preserved.length === 0 && blocks.length === 0) return ['- None recorded.'];
  return [...preserved, ...blocks];
}

function renderHostEffectSummary(effects: RisuLuaModuleTableHostEffects): string[] {
  return RISULUA_MODULE_TABLE_HOST_EFFECT_CLASSES.map((key) => `- ${key}: ${inlineCodeList(effects[key])}`);
}

function renderDomainCandidateSummaries(candidates: RisuLuaModuleTableDomainCandidateContract[]): string[] {
  if (candidates.length === 0) return ['- None recorded.'];
  return candidates.map((candidate) => `- \`${candidate.name}\` confidence ${candidate.confidence}; proposed target \`${candidate.recommendedPath}\`; autoGenerated=${String(candidate.autoGenerated)}; evidence: ${candidate.evidence.join(', ')}`);
}

function renderWarningSummaries(warnings: RisuLuaModuleTableInvariantFinding[]): string[] {
  if (warnings.length === 0) return ['- None.'];
  return warnings.map((warning) => `- ${warning.code}: ${warning.message}`);
}

function inlineCodeList(items: string[]): string {
  if (items.length === 0) return 'None.';
  return items.map((item) => `\`${item}\``).join(', ');
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function serializeStableJson(value: unknown, options?: { cwd?: string }): string {
  const cwd = normalizeSeparators(options?.cwd ?? process.cwd());
  return `${JSON.stringify(normalizeStableValue(value, cwd), null, 2)}\n`;
}

function normalizeStableValue(value: unknown, cwd: string): unknown {
  if (typeof value === 'string') return normalizeStableString(value, cwd);
  if (Array.isArray(value)) return value.map((item) => normalizeStableValue(item, cwd));
  if (value !== null && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      output[key] = normalizeStableValue(nested, cwd);
    }
    return output;
  }
  return value;
}

function normalizeStableString(value: string, cwd: string): string {
  const normalized = normalizeSeparators(value);
  if (normalized === cwd) return '<repo-root>';
  if (normalized.startsWith(`${cwd}/`)) return `<repo-root>/${normalized.slice(cwd.length + 1)}`;
  return normalized;
}

function normalizeSeparators(value: string): string {
  return value.replace(/\\/g, '/');
}
