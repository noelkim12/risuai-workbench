import fs from 'node:fs';
import path from 'node:path';

import {
  detectRisuLuaSourceProfile,
  writeRisuLuaSplitPlan,
  parseRisuLuaModuleTableSource,
  attachRisuLuaSplitValidation,
  buildRisuLuaSplitDist,
  createRisuLuaModuleTableArtifacts,
  renderRisuLuaSplitReport,
  validateRisuLuaSplitWorkspace,
  writeRisuLuaModuleTableWorkspace,
  type RisuLuaSplitPlan,
  type SourceProfileSummary,
  type SourceProfileResult,
} from '@/domain/risulua-split';

import type { RunRisuLuaSplitOptions } from './risulua-split';

// ─── Module-table dry-run helpers ────────────────────────────────────────────

interface ModuleTableErrorDocInput {
  profile: string;
  sourcePath: string;
  targetName: string;
  sourceProfileSummary: SourceProfileSummary;
  errorCode: string;
  errorMessage: string;
}

function createErrorPlan(input: ModuleTableErrorDocInput): RisuLuaSplitPlan {
  return {
    version: 1,
    mode: 'module-table',
    sourceProfile: input.profile as import('@/domain/risulua-split').RisuLuaSourceProfile,
    sourceProfileSummary: input.sourceProfileSummary,
    sourcePath: input.sourcePath,
    targetName: input.targetName,
    buildStrategy: 'report-only',
    packable: false,
    entryPath: 'lua/main.risulua',
    distPath: null,
    files: [],
    risks: [{
      id: input.errorCode,
      severity: 'error',
      message: input.errorMessage,
      sourceRanges: [],
      riskFlags: [input.errorCode],
    }],
    detectedRoots: [],
    hostApiSummary: { reads: [], writes: [], asyncCalls: [], unknownGlobals: [] },
    validation: {
      ok: false,
      packable: false,
      strategy: 'report-only',
      distPath: null,
      wroteDist: false,
      findings: [{
        code: 'unsupported-dist-strategy',
        severity: 'error',
        message: input.errorMessage,
      }],
    },
  };
}

function writeErrorDocs(
  options: RunRisuLuaSplitOptions,
  plan: RisuLuaSplitPlan,
  reportContent: string,
): void {
  const docsDir = path.join(options.outputRoot, 'docs');
  fs.mkdirSync(docsDir, { recursive: true });
  writeRisuLuaSplitPlan(plan, { outputRoot: options.outputRoot, cwd: options.cwd });
  fs.writeFileSync(path.join(docsDir, 'risulua-split-report.md'), reportContent, 'utf8');
}

function buildUnsupportedProfileReport(profile: string): string {
  return `# RisuLua Split Report: module-table (dry-run)

## Summary

- Mode: module-table
- Source Profile: ${profile}
- Status: FAILED - Unsupported source profile

## Validation Findings

- [error] module-table-unsupported-profile: Module-table mode does not support source profile "${profile}". Only "plain-single" is supported.

## Module-Table Refactor Map

Not generated - unsupported source profile.

## Domain Candidates

Not generated - unsupported source profile.
`;
}

function buildParseFailureReport(errors: string): string {
  return `# RisuLua Split Report: module-table (dry-run)

## Summary

- Mode: module-table
- Source Profile: plain-single
- Status: FAILED - Parse error

## Validation Findings

- [error] module-table-parse-failed: Failed to parse Lua source: ${errors}

## Module-Table Refactor Map

Not generated - parse failed.

## Domain Candidates

Not generated - parse failed.
`;
}

function buildSourceProfileSummary(profileResult: SourceProfileResult): SourceProfileSummary {
  return {
    profile: profileResult.profile,
    confidence: profileResult.confidence,
    reasons: profileResult.reasons,
    preloadModuleCount: profileResult.preloadModules.length,
    sectionMarkerCount: profileResult.sectionMarkers.length,
    staticRequireCount: profileResult.staticRequires.length,
    dynamicRequireCount: profileResult.dynamicRequires.length,
  };
}

/**
 * Run module-table artifact generation for plain-single source profile.
 * Produces workspace artifacts (lua/main, lua/common, lua/handler_helpers, lua/host_globals,
 * legacy), docs (refactor-map.json, domain-candidates.json, plan, report), and dist.
 * Fails closed on unsupported profiles and parse errors with diagnostic docs.
 */
export async function runModuleTableDryRunAsync(options: RunRisuLuaSplitOptions): Promise<void> {
  const profileResult = detectRisuLuaSourceProfile(options.source);
  const sourceProfileSummary = buildSourceProfileSummary(profileResult);

  // Handle unsupported profiles
  if (profileResult.profile !== 'plain-single') {
    const errorInput: ModuleTableErrorDocInput = {
      profile: profileResult.profile,
      sourcePath: options.sourcePath,
      targetName: options.targetName,
      sourceProfileSummary,
      errorCode: 'module-table-unsupported-profile',
      errorMessage: `Module-table mode does not support source profile "${profileResult.profile}". Only "plain-single" is supported.`,
    };
    const plan = createErrorPlan(errorInput);
    const report = buildUnsupportedProfileReport(profileResult.profile);
    writeErrorDocs(options, plan, report);
    throw new Error(errorInput.errorMessage + ' Diagnostics written to docs/.');
  }

  // Parse the source
  const parseResult = await parseRisuLuaModuleTableSource(options.source);

  // Handle parse failures
  if (!parseResult.ok) {
    const errorMessages = parseResult.syntaxErrors.map((e) => e.message).join(', ');
    const errorInput: ModuleTableErrorDocInput = {
      profile: 'plain-single',
      sourcePath: options.sourcePath,
      targetName: options.targetName,
      sourceProfileSummary,
      errorCode: 'module-table-parse-failed',
      errorMessage: `Failed to parse Lua source: ${errorMessages}`,
    };
    const plan = createErrorPlan(errorInput);
    const report = buildParseFailureReport(errorMessages);
    writeErrorDocs(options, plan, report);
    throw new Error(errorInput.errorMessage + ' Diagnostics written to docs/.');
  }

  const artifacts = await createRisuLuaModuleTableArtifacts({
    source: options.source,
    sourcePath: options.sourcePath,
    targetName: options.targetName,
    cwd: options.cwd,
    profileResult,
    parseResult,
    domainGeneration: options.domainGeneration ?? 'validated',
    buttonActionSources: options.buttonActionSources,
  });
  writeRisuLuaModuleTableWorkspace(artifacts, { outputRoot: options.outputRoot, cwd: options.cwd });
  const buildResult = buildRisuLuaSplitDist({ outputRoot: options.outputRoot, plan: artifacts.plan });
  const validation = validateRisuLuaSplitWorkspace({
    outputRoot: options.outputRoot,
    plan: artifacts.plan,
    buildResult,
    source: options.source,
    workspaceFiles: artifacts.workspaceFiles,
    moduleTableRefactorMap: artifacts.dryRunResult.refactorMap,
    cwd: options.cwd,
  });
  const validatedPlan = attachRisuLuaSplitValidation(artifacts.plan, validation);
  writeRisuLuaSplitPlan(validatedPlan, { outputRoot: options.outputRoot, cwd: options.cwd });
  fs.writeFileSync(
    path.join(options.outputRoot, 'docs', 'risulua-split-report.md'),
    renderRisuLuaSplitReport({ ...artifacts, plan: validatedPlan }),
    'utf8',
  );
  if (!validation.ok) {
    throw new Error('Module-table split validation failed; diagnostics were written to docs/.');
  }
}
