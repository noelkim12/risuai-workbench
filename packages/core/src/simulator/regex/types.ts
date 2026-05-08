/**
 * Regex simulator flag and directive contracts.
 * @file packages/core/src/simulator/regex/types.ts
 */
import type { SimulatorDiagnostic, SimulatorSafetyLimits, SimulatorStatus } from './shared';
import type { SimulatorTraceEvent } from './shared/trace';
import type { CanonicalRegexEntry } from '../../domain/regex/contracts';
import type {
  CbsSimulationContextInput,
  CbsSimulationOptions,
  CbsSimulationResult,
  CbsSimulationStatus,
} from '../types';

/** RisuAI regex directive kinds recognized by the local simulator flag parser. */
export type RisuRegexDirectiveKind =
  | 'inject'
  | 'move_top'
  | 'move_bottom'
  | 'repeat_back'
  | 'order'
  | 'cbs'
  | 'no_end_nl';

/** Parsed RisuAI regex directive, preserving raw upstream directive text. */
export type RisuRegexDirective =
  | {
      /** Directive discriminator. */
      kind: Exclude<RisuRegexDirectiveKind, 'order'>;
      /** Exact directive token from the raw flag string. */
      raw: string;
    }
  | {
      /** Directive discriminator. */
      kind: 'order';
      /** Exact directive token from the raw flag string. */
      raw: string;
      /** Parsed numeric order value. */
      order: number;
    };

/** Result returned by the RisuAI regex flag parser. */
export interface RisuRegexFlagParseResult {
  /** Original raw flag string, preserved unchanged. */
  raw: string;
  /** Deterministically ordered native JavaScript flags. */
  jsFlags: string;
  /** Recognized RisuAI angle-bracket directives. */
  directives: RisuRegexDirective[];
  /** Unknown or malformed raw tokens skipped by the parser. */
  unknownTokens: string[];
  /** Non-throwing warnings for duplicate flags or malformed tokens. */
  diagnostics: SimulatorDiagnostic[];
}

/** Input accepted by the native JavaScript RegExp preview runner. */
export interface NativeRegexPreviewInput {
  /** Native JavaScript regex pattern source. */
  pattern: string;
  /** Native JavaScript flags after RisuAI directive parsing. */
  jsFlags: string;
  /** Sample text to match without mutation or truncation. */
  sampleInput: string;
  /** Optional caller safety limits merged over defaults for this run. */
  limits?: Partial<SimulatorSafetyLimits>;
}

/** Serializable capture group collected from a native JavaScript regex match. */
export interface RegexCaptureGroupDto {
  /** Numeric capture index or named capture key. */
  name: string;
  /** Captured text, or null when the group did not participate. */
  text: string | null;
}

/** Serializable native JavaScript regex match preview DTO. */
export interface RegexMatchDto {
  /** Full matched text. */
  text: string;
  /** Zero-based index in the sample input. */
  index: number;
  /** Matched text length. */
  length: number;
  /** Numeric capture groups in source order, starting at group 1. */
  captures: RegexCaptureGroupDto[];
  /** Named capture groups keyed by their group name. */
  namedCaptures: RegexCaptureGroupDto[];
}

/** Non-throwing native JavaScript RegExp preview result. */
export interface NativeRegexPreviewResult {
  /** Completion status for the preview run. */
  status: SimulatorStatus;
  /** Matches retained under the configured safety limits. */
  matches: RegexMatchDto[];
  /** Diagnostics explaining compile, input, or match-limit problems. */
  diagnostics: SimulatorDiagnostic[];
  /** Effective immutable limit snapshot used by this preview run. */
  limits: SimulatorSafetyLimits;
}

/** Input accepted by the native JavaScript replacement preview runner. */
export interface RegexReplacementPreviewInput {
  /** Native JavaScript regex pattern source. */
  pattern: string;
  /** Native JavaScript flags after RisuAI directive parsing. */
  jsFlags: string;
  /** Sample text used as the immutable replacement source. */
  sampleInput: string;
  /** Native JavaScript replacement template string. */
  replacement: string;
  /** Optional caller safety limits merged over defaults for this run. */
  limits?: Partial<SimulatorSafetyLimits>;
}

/** Minimal deterministic replacement diff chunk operation. */
export type RegexReplacementDiffOperation = 'equal' | 'delete' | 'insert';

/** Minimal deterministic replacement diff chunk DTO. */
export interface RegexReplacementDiffChunkDto {
  /** Stable operation label used by callers. */
  operation: RegexReplacementDiffOperation;
  /** Alias for viewers that call the operation a kind. */
  kind: RegexReplacementDiffOperation;
  /** Text represented by this chunk. */
  text: string;
}

/** Replacement template capture/reference token kind. */
export type RegexReplacementCaptureReferenceKind =
  | 'escaped-dollar'
  | 'match'
  | 'prefix'
  | 'suffix'
  | 'numeric'
  | 'named';

/** Serializable replacement template capture/reference DTO. */
export interface RegexReplacementCaptureReferenceDto {
  /** Exact reference token as written in the replacement template. */
  token: string;
  /** Parsed reference kind. */
  kind: RegexReplacementCaptureReferenceKind;
  /** Numeric capture index for `$1`-style references. */
  index?: number;
  /** Named capture key for `$<name>` references. */
  name?: string;
}

/** Non-throwing native JavaScript replacement preview result. */
export interface RegexReplacementPreviewResult {
  /** Completion status for the replacement preview run. */
  status: SimulatorStatus;
  /** Replacement output, possibly truncated by maxOutputLength. */
  output: string;
  /** Minimal deterministic before/after diff chunks. */
  diff: RegexReplacementDiffChunkDto[];
  /** Capture/reference tokens found in the replacement template. */
  captureReferences: RegexReplacementCaptureReferenceDto[];
  /** Diagnostics explaining compile, input, or output-limit problems. */
  diagnostics: SimulatorDiagnostic[];
  /** Effective immutable limit snapshot used by this preview run. */
  limits: SimulatorSafetyLimits;
}

/** Placement target chosen for a replacement plan DTO. */
export type RegexReplacementPlacement = 'match' | 'top' | 'bottom' | 'inject';

/** Confidence label for whether directive planning is verified or simulated. */
export type RegexPreviewConfidence = 'verified' | 'simulated';

/** Newline handling policy selected for planned replacement output. */
export type RegexNewlinePolicy = 'preserve' | 'preserve-without-auto-suffix';

/** Input accepted by the RisuAI directive replacement planner. */
export interface RegexReplacementPlanInput {
  /** Parsed RisuAI regex directives in source order. */
  directives: readonly RisuRegexDirective[];
  /** Replacement preview whose output must be preserved exactly. */
  replacementPreview: Pick<RegexReplacementPreviewResult, 'output'>;
}

/** Deterministic DTO describing how a replacement preview should be placed. */
export interface RegexReplacementPlanDto {
  /** Replacement output copied without trimming or newline mutation. */
  output: string;
  /** Placement target derived from movement/injection directives. */
  placement: RegexReplacementPlacement;
  /** Optional numeric ordering from `<order n>`. */
  order?: number;
  /** Newline policy requested by supported newline directives. */
  newlinePolicy: RegexNewlinePolicy;
  /** Whether `<repeat_back>` was present in parsed directives. */
  repeatBack: boolean;
  /** Whether `<cbs>` was present in parsed directives. */
  cbs: boolean;
  /** Simulated when any RisuAI directive participates, otherwise verified native replacement. */
  confidence: RegexPreviewConfidence;
  /** Parsed directives copied in source order for caller inspection. */
  appliedDirectives: readonly RisuRegexDirective[];
  /** Raw directive tokens copied in source order for deterministic display. */
  appliedDirectiveRawTokens: string[];
}

/** Input accepted by the `.risuregex` CBS section dry-run adapter. */
export interface RegexCbsSectionSimulationInput {
  /** Raw `.risuregex` IN section source used as the regex pattern. */
  patternSource: string;
  /** Raw `.risuregex` OUT section source used as the replacement template. */
  replacementSource: string;
  /** Whether the IN section should be dry-run through the CBS simulator. */
  simulatePattern: boolean;
  /** Whether the OUT section should be dry-run through the CBS simulator. */
  simulateReplacement: boolean;
  /** CBS simulator context forwarded unchanged to requested section simulations. */
  context?: CbsSimulationContextInput;
  /** CBS simulator options forwarded unchanged to requested section simulations. */
  simulationOptions?: Partial<CbsSimulationOptions>;
}

/** Result returned by the `.risuregex` CBS section dry-run adapter. */
export interface RegexCbsSectionSimulationResult {
  /** Conservative aggregate status for both section results. */
  status: CbsSimulationStatus;
  /** Raw CBS simulation result or pass-through result for the IN section. */
  pattern: CbsSimulationResult;
  /** Raw CBS simulation result or pass-through result for the OUT section. */
  replacement: CbsSimulationResult;
  /** Regex-local diagnostics mapped from requested CBS simulation runs. */
  diagnostics: SimulatorDiagnostic[];
}

/** Input accepted by the high-level `.risuregex` preview view-model simulator. */
export interface RisuRegexPreviewInput {
  /** Raw `.risuregex` document content parsed through the domain adapter. */
  rawDocument: string;
  /** Sample text used for native match and replacement preview. */
  sampleInput: string;
  /** CBS simulator context forwarded unchanged to requested CBS dry-runs. */
  context?: CbsSimulationContextInput;
  /** CBS simulator options forwarded unchanged to requested CBS dry-runs. */
  simulationOptions?: Partial<CbsSimulationOptions>;
  /** Optional caller safety limits merged over defaults by native preview runners. */
  limits?: Partial<SimulatorSafetyLimits>;
}

/** Notice intended for viewer UI display without treating it as a diagnostic. */
export interface RisuRegexPreviewNoticeDto {
  /** Stable notice code suitable for filtering and tests. */
  code: string;
  /** Notice severity for viewer grouping. */
  severity: 'info' | 'warning';
  /** Human-readable notice message. */
  message: string;
  /** Producer label for the notice. */
  source: string;
  /** Optional JSON-serializable metadata for callers. */
  details?: Readonly<Record<string, unknown>>;
}

/** Viewer-ready DTO produced by `simulateRisuRegexPreview`. */
export interface RisuRegexPreviewViewModel {
  /** Conservative aggregate status across parse, CBS, native, replacement, and planning steps. */
  status: SimulatorStatus;
  /** Canonical regex entry parsed from the raw document, or null when parsing failed. */
  entry: CanonicalRegexEntry | null;
  /** Parsed flag/directive result when an entry could be parsed. */
  flags: RisuRegexFlagParseResult | null;
  /** CBS section dry-run results when an entry could be parsed. */
  cbs: RegexCbsSectionSimulationResult | null;
  /** Native JavaScript match preview result. */
  nativePreview: NativeRegexPreviewResult;
  /** Native JavaScript replacement preview result. */
  replacementPreview: RegexReplacementPreviewResult;
  /** Directive placement plan generated from parsed directives and replacement output. */
  replacementPlan: RegexReplacementPlanDto;
  /** Aggregated serializable diagnostics from every preview stage. */
  diagnostics: SimulatorDiagnostic[];
  /** Viewer trace events explaining major preview stages. */
  trace: SimulatorTraceEvent[];
  /** Non-diagnostic viewer notices, including simulated runtime parity caveats. */
  notices: RisuRegexPreviewNoticeDto[];
}
