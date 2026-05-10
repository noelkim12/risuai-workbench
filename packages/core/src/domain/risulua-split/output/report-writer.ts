import fs from 'node:fs';
import path from 'node:path';

import { renderRisuLuaModuleTableReportSections } from '../module-table/module-table-rendering';
import type { RisuLuaModuleTableRefactorMapContract } from '../module-table/module-table-contracts';
import type { RisuLuaSplitPlan } from '../shared/types';

export const RISULUA_SPLIT_REPORT_PATH = 'docs/risulua-split-report.md';

export interface RisuLuaSplitReportContext {
  plan: RisuLuaSplitPlan;
  moduleTableRefactorMap?: RisuLuaModuleTableRefactorMapContract;
  profileMap: string[];
  pureCandidates: string[];
  runtimeCoupledHelpers: string[];
  riskyBlocks: string[];
  dynamicPatterns: string[];
  refactorTasks: string[];
  verificationSuggestions: string[];
}

export interface WriteRisuLuaSplitReportOptions {
  outputRoot: string;
}

export interface WriteRisuLuaSplitReportResult {
  path: string;
  markdown: string;
}

const RUNTIME_INVOCATION_OVERVIEW = [
  'RisuAI executes the Lua chunk first. After that, the host may call script-defined global hooks such as `onStart(id)`, `onInput(id)`, `onOutput(id)`, and `onButtonClick(id, data)`. The script may also register callbacks through `listenEdit("editRequest" | "editDisplay" | "editInput" | "editOutput", fn)`.',
  '',
  'These hook shapes are runtime boundaries. `risulua-split coarse` preserves them instead of rewriting them into exported module functions.',
  '',
  'Host globals such as `getChatVar`, `setChatVar`, `getState`, `setState`, `getChat`, `setChat`, `addChat`, `reloadDisplay`, `alertNormal`, `alertInput`, `LLM`, `request`, `json`, `Promise`, and `async` are external RisuAI capabilities. Generated modules should not shadow them.',
].join('\n');

export function writeRisuLuaSplitReport(
  context: RisuLuaSplitReportContext,
  options: WriteRisuLuaSplitReportOptions,
): WriteRisuLuaSplitReportResult {
  const outputPath = path.join(options.outputRoot, ...RISULUA_SPLIT_REPORT_PATH.split('/'));
  const markdown = renderRisuLuaSplitReport(context);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, markdown, 'utf8');
  return { path: outputPath, markdown };
}

export function renderRisuLuaSplitReport(context: RisuLuaSplitReportContext): string {
  const { plan } = context;
  const lines = [
    '# RisuLua split report',
    '',
    '## Summary',
    '',
    `- Mode: \`${plan.mode}\``,
    `- Source profile: \`${plan.sourceProfile}\``,
    `- Confidence: \`${plan.sourceProfileSummary.confidence}\``,
    `- Selected strategy: \`${plan.buildStrategy}\``,
    `- Packable in this plan: \`${String(plan.packable)}\``,
    `- Dist output: ${renderDistStatus(plan)}`,
    `- Actual generated Lua source files: ${inlinePathList(actualLuaSourceFiles(plan))}`,
    `- Actual runtime-required module files: ${inlinePathList(actualRuntimeModuleFiles(plan))}`,
    `- Actual build-time local fragment files: ${inlinePathList(actualBuildTimeFragmentFiles(plan))}`,
    ...renderPreservedMainSummary(plan),
    ...renderNoExtractedModulesNote(plan),
    '',
    '## Actual generated files',
    '',
    '### Lua source graph',
    '',
    ...bulletList(actualLuaSourceFiles(plan)),
    '',
    '### Extracted modules',
    '',
    ...bulletList(actualRuntimeModuleFiles(plan)),
    '',
    '### Build-time local fragments',
    '',
    ...bulletList(actualBuildTimeFragmentFiles(plan)),
    '',
    '### Recovery and audit files',
    '',
    ...bulletList(actualRecoveryFiles(plan)),
    '',
    '## Suggested split map (not automatically applied when marked unsafe)',
    '',
    'This section lists detected split/recovery candidates. It is not a guarantee that every listed candidate was generated as a separate output file; compare it with the actual generated files above.',
    '',
    ...bulletList(context.profileMap),
    '',
    '## Source profile detection result',
    '',
    `- Detected profile: \`${plan.sourceProfileSummary.profile}\``,
    `- Confidence: \`${plan.sourceProfileSummary.confidence}\``,
    `- package.preload modules: ${plan.sourceProfileSummary.preloadModuleCount}`,
    `- [BUNDLE] markers: ${plan.sourceProfileSummary.sectionMarkerCount}`,
    `- Static require calls: ${plan.sourceProfileSummary.staticRequireCount}`,
    `- Dynamic require calls: ${plan.sourceProfileSummary.dynamicRequireCount}`,
    '',
    'Evidence:',
    ...bulletList(plan.sourceProfileSummary.reasons),
    '',
    '## Runtime invocation overview',
    '',
    RUNTIME_INVOCATION_OVERVIEW,
    '',
    '## Detected inbound roots',
    '',
    ...bulletList(plan.detectedRoots.map((root) => `\`${root.name}\` (${root.kind}, lines ${root.sourceRange.startLine}-${root.sourceRange.endLine})`)),
    '',
    '## Host capability usage',
    '',
    `- Reads: ${inlineList(plan.hostApiSummary.reads)}`,
    `- Writes: ${inlineList(plan.hostApiSummary.writes)}`,
    `- Async calls: ${inlineList(plan.hostApiSummary.asyncCalls)}`,
    `- Unknown globals: ${inlineList(plan.hostApiSummary.unknownGlobals)}`,
    '',
    '## High-confidence pure candidates',
    '',
    ...bulletList(context.pureCandidates),
    '',
    '## Runtime-coupled helpers',
    '',
    ...bulletList(context.runtimeCoupledHelpers),
    '',
    '## Risky blocks preserved',
    '',
    ...bulletList(context.riskyBlocks),
    '',
    '## Dynamic patterns',
    '',
    ...bulletList(context.dynamicPatterns),
    '',
    '## Suggested human/LLM refactor tasks',
    '',
    ...bulletList(context.refactorTasks),
    '',
    '## Verification suggestions',
    '',
    ...bulletList(context.verificationSuggestions),
    '',
    ...renderModuleTableSections(context),
    '## Validator results',
    '',
    ...bulletList(renderValidationResults(plan)),
    '',
  ];

  return `${lines.join('\n')}\n`;
}

function renderModuleTableSections(context: RisuLuaSplitReportContext): string[] {
  if (context.moduleTableRefactorMap === undefined) return [];
  return [
    ...renderRisuLuaModuleTableReportSections(context.moduleTableRefactorMap),
    '',
  ];
}

function actualLuaSourceFiles(plan: RisuLuaSplitPlan): string[] {
  return plan.files
    .map((file) => file.path)
    .filter((filePath) => filePath.startsWith('lua/'));
}

function actualExtractedModuleFiles(plan: RisuLuaSplitPlan): string[] {
  return [...actualRuntimeModuleFiles(plan), ...actualBuildTimeFragmentFiles(plan)];
}

function actualRuntimeModuleFiles(plan: RisuLuaSplitPlan): string[] {
  return plan.files
    .filter((file) => file.path.startsWith('lua/') && file.path !== plan.entryPath && file.kind !== 'chunk-fragment')
    .map((file) => file.path);
}

function actualBuildTimeFragmentFiles(plan: RisuLuaSplitPlan): string[] {
  return plan.files
    .filter((file) => file.path.startsWith('lua/') && file.kind === 'chunk-fragment')
    .map((file) => file.path);
}

function actualRecoveryFiles(plan: RisuLuaSplitPlan): string[] {
  return plan.files
    .map((file) => file.path)
    .filter((filePath) => !filePath.startsWith('lua/'));
}

function renderDistStatus(plan: RisuLuaSplitPlan): string {
  if (plan.distPath === null) return 'not planned for this mode/profile.';
  if (!plan.validation) return `planned at \`${plan.distPath}\` (write status not recorded in report context).`;
  return plan.validation.wroteDist
    ? `written to \`${plan.distPath}\`.`
    : `not written to \`${plan.distPath}\` (${plan.validation.packable ? 'packable' : 'not packable'} validation status).`;
}

function renderPreservedMainSummary(plan: RisuLuaSplitPlan): string[] {
  const mainFile = plan.files.find((file) => file.path === plan.entryPath);
  if (!mainFile) return ['- Preserved main: no generated main file in this report.'];
  return [
    `- Preserved main ranges: ${mainFile.sourceRanges.length}`,
    `- Preserved main reason: ${mainFile.reason}`,
  ];
}

function renderNoExtractedModulesNote(plan: RisuLuaSplitPlan): string[] {
  if (actualExtractedModuleFiles(plan).length > 0) return [];
  return ['- Note: no modules were extracted; the executable Lua remains in `lua/main.risulua` or this report-only plan generated no Lua source files.'];
}

function renderValidationResults(plan: RisuLuaSplitPlan): string[] {
  if (!plan.validation) return [];
  return [
    `Status: ${plan.validation.ok ? 'ok' : 'failed'}; packable=${String(plan.validation.packable)}; wroteDist=${String(plan.validation.wroteDist)}.`,
    ...plan.validation.findings.map((finding) => `${finding.severity}: ${finding.code} — ${finding.message}`),
  ];
}

function bulletList(items: string[]): string[] {
  if (items.length === 0) return ['- None detected.'];
  return items.map((item) => `- ${item}`);
}

function inlineList(items: string[]): string {
  return items.length === 0 ? 'None detected.' : items.map((item) => `\`${item}\``).join(', ');
}

function inlinePathList(items: string[]): string {
  return items.length === 0 ? 'None.' : items.map((item) => `\`${item}\``).join(', ');
}
