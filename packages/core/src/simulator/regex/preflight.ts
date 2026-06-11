/**
 * CBS/static preflight for .risuregex Main Editor preview.
 * This module intentionally does not execute native RegExp.
 * @file packages/core/src/simulator/regex/preflight.ts
 */
import { parseRegexContent } from '../../domain/regex/adapter';
import type { CanonicalRegexEntry } from '../../domain/regex/contracts';
import { simulateRegexCbsSections } from './cbs-adapter';
import { parseRisuRegexFlags } from './flags';
import { analyzeRegexRisks } from './static-analysis';
import { DEFAULT_SIMULATOR_SAFETY_LIMITS, type SimulatorDiagnostic, type SimulatorStatus } from './shared';
import type { RegexPreflightResult, RisuRegexPreviewInput } from './types';

const DIAGNOSTIC_SOURCE = 'risuregex-preflight';
const DEFAULT_JS_FLAGS = 'g';

type RegexPreflightInput = Pick<RisuRegexPreviewInput, 'rawDocument' | 'context' | 'simulationOptions' | 'limits'>;

interface RegexPreflightLimits {
  maxPatternLength: number;
}

export function createRisuRegexPreflight(input: RegexPreflightInput): RegexPreflightResult {
  let entry: CanonicalRegexEntry;
  try {
    entry = parseRegexContent(input.rawDocument);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to parse .risuregex document.';
    return createErrorPreflight(message);
  }

  const flags = parseRisuRegexFlags(entry.flag ?? '');
  const hasPatternCbsDirective = flags.directives.some((directive) => directive.kind === 'cbs');
  const cbs = simulateRegexCbsSections({
    patternSource: entry.in,
    replacementSource: entry.out,
    simulatePattern: hasPatternCbsDirective,
    simulateReplacement: true,
    context: input.context,
    simulationOptions: input.simulationOptions,
  });
  const jsFlags = flags.jsFlags || DEFAULT_JS_FLAGS;
  const limits = createPreflightLimits(input.limits);
  const risks = analyzeRegexRisks({
    pattern: cbs.pattern.output,
    flags: jsFlags,
    maxPatternLength: limits.maxPatternLength,
  });
  const diagnostics = [...flags.diagnostics, ...cbs.diagnostics];

  return {
    status: aggregateStatus([cbs.status], diagnostics),
    pattern: {
      raw: entry.in,
      effective: cbs.pattern.output,
      cbsStatus: cbs.pattern.status,
    },
    replacement: {
      raw: entry.out,
      effective: cbs.replacement.output,
      cbsStatus: cbs.replacement.status,
    },
    jsFlags,
    directives: flags.directives.map((directive) => directive.raw),
    diagnostics,
    risks,
    executionRequired: true,
    nativeExecution: 'webview-worker-required',
  };
}

function createErrorPreflight(message: string): RegexPreflightResult {
  const diagnostic: SimulatorDiagnostic = {
    code: 'RISUREGEX_PARSE_ERROR',
    severity: 'error',
    message,
    source: DIAGNOSTIC_SOURCE,
  };
  return {
    status: 'error',
    pattern: { raw: '', effective: '', cbsStatus: 'error' },
    replacement: { raw: '', effective: '', cbsStatus: 'error' },
    jsFlags: DEFAULT_JS_FLAGS,
    directives: [],
    diagnostics: [diagnostic],
    risks: [],
    executionRequired: false,
    nativeExecution: 'webview-worker-required',
  };
}

function createPreflightLimits(inputLimits: RegexPreflightInput['limits']): RegexPreflightLimits {
  const limits = { ...DEFAULT_SIMULATOR_SAFETY_LIMITS, ...inputLimits };
  const maxPatternLength = getNumericLimit(inputLimits, 'maxPatternLength') ?? limits.maxInputLength;
  return { maxPatternLength };
}

function getNumericLimit(limits: RegexPreflightInput['limits'], key: string): number | undefined {
  if (!limits || !(key in limits)) {
    return undefined;
  }
  const value = (limits as Readonly<Record<string, unknown>>)[key];
  return typeof value === 'number' ? value : undefined;
}

function aggregateStatus(statuses: readonly SimulatorStatus[], diagnostics: readonly SimulatorDiagnostic[]): SimulatorStatus {
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return 'error';
  }
  if (statuses.includes('aborted')) {
    return 'aborted';
  }
  if (statuses.includes('partial') || diagnostics.length > 0) {
    return 'partial';
  }
  return 'ok';
}
