import fs from 'node:fs';
import path from 'node:path';

import {
  RISULUA_MODULE_TABLE_DOMAIN_CANDIDATES_PATH,
  RISULUA_MODULE_TABLE_REFACTOR_MAP_PATH,
  RISULUA_MODULE_TABLE_VARIABLE_STORE_PATH,
  type RisuLuaModuleTableRefactorMapContract,
} from './module-table-contracts';
import { detectRisuLuaSourceProfile } from '../profiling/source-profile';
import { parseRisuLuaModuleTableSource, type RisuLuaModuleTableParseSuccess } from './module-table-parser';
import { analyzeRisuLuaModuleTable } from './module-table-analyzer';
import { classifyRisuLuaModuleTableDecisions } from './module-table-classifier';
import { planDryRunRefactorMap, validateWriterParity, type DryRunPlanResult } from './module-table-refactor-map';
import { planTopLevelRewrite, type TopLevelRewriteResult } from './module-table-top-level-rewrite';
import { planNestedHandlerRewrite, type NestedHandlerRewriteResult } from './module-table-nested-handler-rewrite';
import { getNodeRange, parseLuaBody, type LuaLocalStatement, type LuaNode } from './module-table-analyzer-lua-ast';
import { serializeRisuLuaModuleTableDomainCandidates, serializeRisuLuaModuleTableRefactorMap } from './module-table-rendering';
import { RISULUA_SPLIT_PLAN_PATH, serializeRisuLuaSplitPlan } from '../output/plan-writer';
import { RISULUA_SPLIT_REPORT_PATH, renderRisuLuaSplitReport, type RisuLuaSplitReportContext } from '../output/report-writer';
import type { LuaHostApiSummary, LuaPlannedFile, LuaSourceRange, RisuLuaSplitPlan, SourceProfileResult, SourceProfileSummary } from '../shared/types';
import type { RisuLuaWorkspaceFile } from '../output/workspace-writer';

export interface CreateRisuLuaModuleTableArtifactsInput {
  source: string;
  sourcePath: string;
  targetName?: string;
  cwd?: string;
  profileResult?: SourceProfileResult;
  parseResult?: RisuLuaModuleTableParseSuccess;
}

export interface RisuLuaModuleTableArtifacts extends RisuLuaSplitReportContext {
  plan: RisuLuaSplitPlan;
  workspaceFiles: RisuLuaWorkspaceFile[];
  dryRunResult: DryRunPlanResult;
  topLevelRewrite: TopLevelRewriteResult;
  nestedHandlerRewrite: NestedHandlerRewriteResult;
}

export interface WriteRisuLuaModuleTableWorkspaceOptions {
  outputRoot: string;
  cwd?: string;
  validateBeforeWrite?: (artifacts: RisuLuaModuleTableArtifacts) => string[];
}

interface PipelineResult {
  profileResult: SourceProfileResult;
  dryRunResult: DryRunPlanResult;
  topLevelRewrite: TopLevelRewriteResult;
  nestedHandlerRewrite: NestedHandlerRewriteResult;
}

interface VariableStoreExtractionResult {
  mainText: string;
  storeFile?: RisuLuaWorkspaceFile;
  exportNames: string[];
}

interface LocalTableDeclaration {
  name: string;
  text: string;
  startOffset: number;
  endOffset: number;
}

const HANDLER_HELPER_PATH_RE = /^lua\/handler_helpers\/[^/]+_helpers\.risulua$/;
const VARIABLE_STORE_ALIAS = '__variable_store';
const VARIABLE_STORE_REQUIRE = `local ${VARIABLE_STORE_ALIAS} = require("state.variable_store")`;

export async function createRisuLuaModuleTableArtifacts(
  input: CreateRisuLuaModuleTableArtifactsInput,
): Promise<RisuLuaModuleTableArtifacts> {
  const pipeline = await runPipeline(input);
  const targetName = input.targetName ?? inferTargetName(input.sourcePath);
  const variableStore = extractVariableStore(composeMainText(pipeline));
  const pipelineWithVariableStore = withVariableStoreModule(pipeline, variableStore);
  const workspaceLuaFiles = buildLuaWorkspaceFiles(input.source, variableStore.mainText, pipelineWithVariableStore, variableStore.storeFile);
  const plan = buildPlan(input, targetName, pipelineWithVariableStore, workspaceLuaFiles);
  const context = buildReportContext(plan, pipelineWithVariableStore.dryRunResult.refactorMap);
  const docs = buildDocWorkspaceFiles(plan, context, pipelineWithVariableStore.dryRunResult.refactorMap, input.cwd);
  const artifacts: RisuLuaModuleTableArtifacts = {
    ...context,
    plan,
    workspaceFiles: [...workspaceLuaFiles, ...docs],
    dryRunResult: pipelineWithVariableStore.dryRunResult,
    topLevelRewrite: pipeline.topLevelRewrite,
    nestedHandlerRewrite: pipeline.nestedHandlerRewrite,
  };
  const findings = validateModuleTableArtifacts(artifacts);
  if (findings.length > 0) {
    throw new Error(`Module-table writer validation failed: ${findings.join('; ')}`);
  }
  return artifacts;
}

export function writeRisuLuaModuleTableWorkspace(
  artifacts: RisuLuaModuleTableArtifacts,
  options: WriteRisuLuaModuleTableWorkspaceOptions,
): void {
  const validationFindings = options.validateBeforeWrite?.(artifacts) ?? [];
  if (validationFindings.length > 0) {
    throw new Error(`Module-table workspace validation failed: ${validationFindings.join('; ')}`);
  }
  const tempRoot = createTempRoot(options.outputRoot);
  try {
    writeFilesToRoot(artifacts.workspaceFiles, tempRoot);
    moveStagedRoots(tempRoot, options.outputRoot);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function buildLuaWorkspaceFiles(
  source: string,
  mainText: string,
  pipeline: PipelineResult,
  variableStoreFile: RisuLuaWorkspaceFile | undefined,
): RisuLuaWorkspaceFile[] {
  return [
    { path: 'lua/main.risulua', content: mainText },
    ...(variableStoreFile === undefined ? [] : [variableStoreFile]),
    ...pipeline.topLevelRewrite.modulePlans
      .filter((plan) => plan.exportNames.length > 0)
      .map((plan) => ({ path: plan.modulePath, content: plan.body })),
    ...pipeline.nestedHandlerRewrite.handlerModulePlans
      .filter((plan) => plan.exportNames.length > 0)
      .map((plan) => ({ path: plan.modulePath, content: plan.body })),
    { path: 'legacy/original.risulua', content: source },
  ];
}

function buildDocWorkspaceFiles(
  plan: RisuLuaSplitPlan,
  context: RisuLuaSplitReportContext,
  refactorMap: RisuLuaModuleTableRefactorMapContract,
  cwd: string | undefined,
): RisuLuaWorkspaceFile[] {
  return [
    { path: RISULUA_SPLIT_PLAN_PATH, content: serializeRisuLuaSplitPlan(plan, { cwd }) },
    { path: RISULUA_SPLIT_REPORT_PATH, content: renderRisuLuaSplitReport(context) },
    { path: RISULUA_MODULE_TABLE_REFACTOR_MAP_PATH, content: serializeRisuLuaModuleTableRefactorMap(refactorMap, { cwd }) },
    { path: RISULUA_MODULE_TABLE_DOMAIN_CANDIDATES_PATH, content: serializeRisuLuaModuleTableDomainCandidates(refactorMap.domainCandidates, { cwd }) },
  ];
}

async function runPipeline(input: CreateRisuLuaModuleTableArtifactsInput): Promise<PipelineResult> {
  const profileResult = input.profileResult ?? detectRisuLuaSourceProfile(input.source);
  if (profileResult.profile !== 'plain-single') {
    throw new Error(`Module-table mode does not support source profile "${profileResult.profile}". Only "plain-single" is supported.`);
  }
  const parseResult = input.parseResult ?? (await parseRisuLuaModuleTableSource(input.source));
  if (!parseResult.ok) {
    const errors = parseResult.syntaxErrors.map((error) => error.message).join(', ');
    throw new Error(`Failed to parse Lua source: ${errors}`);
  }
  const analyzerResult = analyzeRisuLuaModuleTable({ source: input.source, parseResult });
  const classificationResult = classifyRisuLuaModuleTableDecisions({
    source: input.source,
    sourceFile: input.sourcePath,
    analyzerResult,
  });
  const dryRunResult = planDryRunRefactorMap({
    source: input.source,
    sourceFile: input.sourcePath,
    parseResult,
    classificationResult,
  });
  const topLevelRewrite = planTopLevelRewrite({ source: input.source, sourceFile: input.sourcePath, dryRunResult, parseResult });
  const nestedHandlerRewrite = planNestedHandlerRewrite({ source: input.source, sourceFile: input.sourcePath, dryRunResult, parseResult });
  if (!dryRunResult.ok || !topLevelRewrite.ok || !nestedHandlerRewrite.ok) {
    throw new Error('Module-table rewrite planning failed; artifact writer blocked.');
  }
  return { profileResult, dryRunResult, topLevelRewrite, nestedHandlerRewrite };
}

function composeMainText(pipeline: PipelineResult): string {
  const handlerRequires = pipeline.dryRunResult.editPlan.mainRequireBindings
    .filter((binding) => HANDLER_HELPER_PATH_RE.test(binding.targetModule))
    .map((binding) => binding.text);
  let mainText = pipeline.topLevelRewrite.mainRewritePlan.fullMainText;
  for (const rewrite of pipeline.nestedHandlerRewrite.handlerBodyRewrites) {
    mainText = applyPlannedHandlerRewrite(mainText, rewrite.originalSource, rewrite.rewrittenSource);
  }
  return insertRequireStatements(mainText, handlerRequires);
}

function withVariableStoreModule(
  pipeline: PipelineResult,
  variableStore: VariableStoreExtractionResult,
): PipelineResult {
  if (variableStore.storeFile === undefined) return pipeline;
  const existing = pipeline.dryRunResult.refactorMap.modules.some(
    (moduleContract) => moduleContract.path === RISULUA_MODULE_TABLE_VARIABLE_STORE_PATH,
  );
  if (existing) return pipeline;

  const refactorMap: RisuLuaModuleTableRefactorMapContract = {
    ...pipeline.dryRunResult.refactorMap,
    modules: [
      ...pipeline.dryRunResult.refactorMap.modules,
      {
        path: RISULUA_MODULE_TABLE_VARIABLE_STORE_PATH,
        requireId: 'state.variable_store',
        alias: VARIABLE_STORE_ALIAS,
        category: 'state-store',
        exports: variableStore.exportNames,
      },
    ],
  };

  return {
    ...pipeline,
    dryRunResult: {
      ...pipeline.dryRunResult,
      refactorMap,
      editPlan: {
        ...pipeline.dryRunResult.editPlan,
        moduleContracts: refactorMap.modules,
      },
    },
  };
}

function extractVariableStore(mainText: string): VariableStoreExtractionResult {
  const declarations = findTopLevelLocalTableDeclarations(mainText);
  if (declarations.length === 0) return { mainText, exportNames: [] };

  const storeLines: string[] = [
    '-- @generated by risuai-workbench',
    '-- risulua-split=module-table variable-store',
    '',
    'local M = {}',
    '',
  ];
  const replacements: Array<{ startOffset: number; endOffset: number; text: string }> = [];
  for (const declaration of declarations) {
    storeLines.push(declaration.text.trimEnd(), '', `M.${declaration.name} = ${declaration.name}`, '');
    replacements.push({
      startOffset: declaration.startOffset,
      endOffset: declaration.endOffset,
      text: `local ${declaration.name} = ${VARIABLE_STORE_ALIAS}.${declaration.name}\n`,
    });
  }
  storeLines.push('return M');

  let rewrittenMain = applyMainTextReplacements(mainText, replacements);
  rewrittenMain = insertRequireStatements(rewrittenMain, [VARIABLE_STORE_REQUIRE]);

  return {
    mainText: rewrittenMain,
    storeFile: { path: RISULUA_MODULE_TABLE_VARIABLE_STORE_PATH, content: `${storeLines.join('\n')}\n` },
    exportNames: declarations.map((declaration) => declaration.name),
  };
}

function findTopLevelLocalTableDeclarations(text: string): LocalTableDeclaration[] {
  const declarations: LocalTableDeclaration[] = [];
  let body: LuaNode[];
  try {
    body = parseLuaBody(text);
  } catch {
    return declarations;
  }

  for (const statement of body) {
    if (!isSingleLocalTableStatement(statement)) continue;
    const name = statement.variables[0].name;
    if (name.startsWith('__') || !shouldExtractVariableStoreName(name)) continue;
    const range = getNodeRange(statement);
    if (range === undefined) continue;
    const endOffset = includeTrailingNewline(text, range.endOffset);
    declarations.push({
      name,
      text: text.slice(range.startOffset, endOffset),
      startOffset: range.startOffset,
      endOffset,
    });
  }
  return declarations;
}

function isSingleLocalTableStatement(node: LuaNode): node is LuaLocalStatement {
  if (node.type !== 'LocalStatement') return false;
  const statement = node as LuaLocalStatement;
  return statement.variables.length === 1
    && statement.init.length === 1
    && statement.init[0]?.type === 'TableConstructorExpression';
}

function shouldExtractVariableStoreName(name: string): boolean {
  return /^(?:[a-z][A-Za-z0-9]*|[A-Z][A-Za-z0-9]*)$/.test(name);
}

function includeTrailingNewline(text: string, offset: number): number {
  let cursor = offset;
  while (cursor < text.length && (text[cursor] === ' ' || text[cursor] === '\t' || text[cursor] === '\r')) cursor += 1;
  if (text[cursor] === '\n') return cursor + 1;
  return cursor;
}

function applyMainTextReplacements(
  text: string,
  replacements: Array<{ startOffset: number; endOffset: number; text: string }>,
): string {
  let output = text;
  for (const replacement of [...replacements].sort((left, right) => right.startOffset - left.startOffset)) {
    output = output.slice(0, replacement.startOffset) + replacement.text + output.slice(replacement.endOffset);
  }
  return output;
}

function applyPlannedHandlerRewrite(
  mainText: string,
  originalSource: string,
  rewrittenSource: string,
): string {
  const originalSegment = locatePlannedHandlerSegment(mainText, originalSource);
  if (originalSegment === null) return mainText;
  const edit = buildSingleSpanEdit(originalSource, rewrittenSource);
  const suffixOffset = originalSegment.text.indexOf(edit.suffixText, edit.prefixLength);
  if (suffixOffset < 0) return mainText;
  const replacement = originalSegment.text.slice(0, edit.prefixLength)
    + edit.replacement
    + originalSegment.text.slice(suffixOffset);
  return mainText.slice(0, originalSegment.startOffset) + replacement + mainText.slice(originalSegment.endOffset);
}

function locatePlannedHandlerSegment(
  mainText: string,
  originalSource: string,
): { startOffset: number; endOffset: number; text: string } | null {
  const originalLines = originalSource.split('\n');
  const firstLine = originalLines.find((line) => line.length > 0);
  const lastLine = [...originalLines].reverse().find((line) => line.length > 0);
  if (firstLine === undefined || lastLine === undefined) return null;
  const startOffset = mainText.indexOf(firstLine);
  if (startOffset < 0) return null;
  const occurrence = countLineOccurrences(originalSource, lastLine);
  const lastLineOffset = findLineOccurrence(mainText, lastLine, startOffset + firstLine.length, occurrence);
  if (lastLineOffset < 0) return null;
  const lineEnd = mainText.indexOf('\n', lastLineOffset);
  const endOffset = lineEnd < 0 ? mainText.length : lineEnd + 1;
  return { startOffset, endOffset, text: mainText.slice(startOffset, endOffset) };
}

function countLineOccurrences(text: string, line: string): number {
  let count = 0;
  for (const candidate of text.split('\n')) {
    if (candidate === line) count += 1;
  }
  return count;
}

function findLineOccurrence(text: string, line: string, fromOffset: number, occurrence: number): number {
  let count = 0;
  let cursor = fromOffset;
  while (cursor < text.length) {
    const found = text.indexOf(line, cursor);
    if (found < 0) return -1;
    const atLineStart = found === 0 || text[found - 1] === '\n';
    const afterLine = found + line.length;
    const atLineEnd = afterLine === text.length || text[afterLine] === '\n';
    if (atLineStart && atLineEnd) {
      count += 1;
      if (count === occurrence) return found;
    }
    cursor = found + line.length;
  }
  return -1;
}

function buildSingleSpanEdit(
  originalSource: string,
  rewrittenSource: string,
): { prefixLength: number; suffixText: string; replacement: string } {
  let prefixLength = 0;
  while (
    prefixLength < originalSource.length
    && prefixLength < rewrittenSource.length
    && originalSource[prefixLength] === rewrittenSource[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < originalSource.length - prefixLength
    && suffixLength < rewrittenSource.length - prefixLength
    && originalSource[originalSource.length - 1 - suffixLength] === rewrittenSource[rewrittenSource.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  return {
    prefixLength,
    suffixText: originalSource.slice(originalSource.length - suffixLength),
    replacement: rewrittenSource.slice(prefixLength, rewrittenSource.length - suffixLength),
  };
}

function insertRequireStatements(mainText: string, statements: string[]): string {
  const unique = [...new Set(statements)].filter((statement) => !mainText.includes(statement));
  if (unique.length === 0) return mainText;
  const lines = mainText.split('\n');
  let insertIndex = 2;
  if (lines[insertIndex] === '') insertIndex += 1;
  while (insertIndex < lines.length && /^local\s+__\w+\s*=\s*require\("[^"]+"\)$/.test(lines[insertIndex])) {
    insertIndex += 1;
  }
  lines.splice(insertIndex, 0, ...unique);
  if (lines[insertIndex + unique.length] !== '') lines.splice(insertIndex + unique.length, 0, '');
  return lines.join('\n');
}

function buildPlan(
  input: CreateRisuLuaModuleTableArtifactsInput,
  targetName: string,
  pipeline: PipelineResult,
  luaFiles: RisuLuaWorkspaceFile[],
): RisuLuaSplitPlan {
  return {
    version: 1,
    mode: 'module-table',
    sourceProfile: 'plain-single',
    sourceProfileSummary: summarizeProfile(pipeline.profileResult),
    sourcePath: normalizePath(input.sourcePath),
    targetName,
    entryPath: 'lua/main.risulua',
    distPath: `dist/${targetName}.risulua`,
    packable: true,
    buildStrategy: 'concat-build-time-require',
    files: buildPlannedFiles(input.source, luaFiles, pipeline.dryRunResult.refactorMap),
    risks: [],
    detectedRoots: pipeline.dryRunResult.refactorMap.preserved
      .filter((entry) => entry.reason === 'preserve:top-level-side-effect')
      .map((entry) => ({ name: entry.originalName, kind: rootKind(entry.originalName), sourceRange: entry.sourceRange })),
    hostApiSummary: summarizeHostApis(pipeline.dryRunResult.refactorMap),
    validation: { ok: true, packable: true, strategy: 'concat-build-time-require', distPath: `dist/${targetName}.risulua`, wroteDist: false, findings: [] },
  };
}

function buildPlannedFiles(
  source: string,
  files: RisuLuaWorkspaceFile[],
  refactorMap: RisuLuaModuleTableRefactorMapContract,
): LuaPlannedFile[] {
  return files.map((file, index) => ({
    path: file.path,
    kind: file.path === 'legacy/original.risulua' ? 'legacy-original' : 'coarse-block',
    sourceRanges: sourceRangesForPath(file.path, source, refactorMap),
    confidence: 'high',
    reason: reasonForPath(file.path),
    preserveOrderIndex: index,
  }));
}

function sourceRangesForPath(
  filePath: string,
  source: string,
  refactorMap: RisuLuaModuleTableRefactorMapContract,
): LuaSourceRange[] {
  if (filePath === 'legacy/original.risulua' || filePath === 'lua/main.risulua') return [wholeSourceRange(source)];
  const ranges = refactorMap.symbols
    .filter((symbol) => symbol.targetModule === filePath)
    .map((symbol) => symbol.sourceRange);
  return ranges.length > 0 ? ranges : [wholeSourceRange(source)];
}

function validateModuleTableArtifacts(artifacts: RisuLuaModuleTableArtifacts): string[] {
  const findings: string[] = [];
  for (const file of artifacts.workspaceFiles) {
    if (!isDerivedDocumentationPath(file.path)) {
      const parity = validateWriterParity(file.path, artifacts.dryRunResult.refactorMap);
      if (parity !== null) findings.push(parity.message);
    }
    if (file.path.startsWith('lua/') && file.path !== 'lua/main.risulua' && file.content.trim().length === 0) {
      findings.push(`Empty module artifact is not allowed: ${file.path}`);
    }
  }
  for (const planned of artifacts.plan.files) {
    if (planned.path.includes('/handler_helpers/') && planned.kind === 'chunk-fragment') {
      findings.push(`Module-table helper must not be planned as chunk-fragment: ${planned.path}`);
    }
  }
  return findings;
}

function isDerivedDocumentationPath(filePath: string): boolean {
  return filePath === RISULUA_SPLIT_PLAN_PATH || filePath === RISULUA_SPLIT_REPORT_PATH;
}

function buildReportContext(
  plan: RisuLuaSplitPlan,
  refactorMap: RisuLuaModuleTableRefactorMapContract,
): RisuLuaSplitReportContext {
  return {
    plan,
    moduleTableRefactorMap: refactorMap,
    profileMap: refactorMap.symbols.map((symbol) => `\`${symbol.originalName}\` → \`${symbol.targetModule ?? 'lua/main.risulua'}\` (${symbol.classification})`),
    pureCandidates: refactorMap.symbols.filter((symbol) => symbol.classification.startsWith('extract:')).map((symbol) => `\`${symbol.originalName}\` → \`${symbol.targetModule}\``),
    runtimeCoupledHelpers: refactorMap.preserved.map((entry) => `\`${entry.originalName}\`: ${entry.reason}`),
    riskyBlocks: [],
    dynamicPatterns: [],
    refactorTasks: ['Review module-table refactor map before manual edits.'],
    verificationSuggestions: ['Verify generated module-table artifacts match docs/refactor-map.json.'],
  };
}

function summarizeHostApis(refactorMap: RisuLuaModuleTableRefactorMapContract): LuaHostApiSummary {
  const reads = new Set<string>();
  const writes = new Set<string>();
  const asyncCalls = new Set<string>();
  for (const symbol of refactorMap.symbols) {
    for (const item of symbol.hostEffects.reads) reads.add(item);
    for (const item of symbol.hostEffects.writes) writes.add(item);
    for (const item of symbol.hostEffects.asyncModelNetwork) asyncCalls.add(item);
  }
  return { reads: sorted([...reads]), writes: sorted([...writes]), asyncCalls: sorted([...asyncCalls]), unknownGlobals: [] };
}

function writeFilesToRoot(files: RisuLuaWorkspaceFile[], root: string): void {
  for (const file of files) {
    const outputPath = path.join(root, ...file.path.split('/'));
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, file.content, 'utf8');
  }
}

function moveStagedRoots(tempRoot: string, outputRoot: string): void {
  for (const root of ['lua', 'legacy', 'docs']) {
    const sourcePath = path.join(tempRoot, root);
    if (!fs.existsSync(sourcePath)) continue;
    const targetPath = path.join(outputRoot, root);
    fs.rmSync(targetPath, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.renameSync(sourcePath, targetPath);
  }
}

function createTempRoot(outputRoot: string): string {
  const parent = path.dirname(outputRoot);
  fs.mkdirSync(parent, { recursive: true });
  return fs.mkdtempSync(path.join(parent, `.tmp-risulua-module-table-${path.basename(outputRoot)}-`));
}

function summarizeProfile(result: SourceProfileResult): SourceProfileSummary {
  return { profile: result.profile, confidence: result.confidence, reasons: result.reasons, preloadModuleCount: result.preloadModules.length, sectionMarkerCount: result.sectionMarkers.length, staticRequireCount: result.staticRequires.length, dynamicRequireCount: result.dynamicRequires.length };
}

function wholeSourceRange(source: string): LuaSourceRange {
  return { startLine: 1, endLine: Math.max(1, source.split('\n').length), startOffset: 0, endOffset: source.length };
}

function rootKind(name: string): 'function' | 'listener' | 'handler-assignment' {
  if (name === 'listenEdit') return 'listener';
  return 'function';
}

function reasonForPath(filePath: string): string {
  if (filePath === 'lua/main.risulua') return 'Module-table composition root generated from dry-run rewrite plans.';
  if (filePath === 'legacy/original.risulua') return 'Original source preserved outside the lua source graph for recovery and audit.';
  if (filePath.startsWith('docs/')) return 'Module-table documentation generated from dry-run refactor-map output.';
  return 'Module-table artifact generated only because it is present in the dry-run refactor map.';
}

function inferTargetName(sourcePath: string): string {
  const fileName = normalizePath(sourcePath).split('/').pop() ?? 'main.risulua';
  return fileName.replace(/\.risulua$/i, '') || 'main';
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}

function sorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
