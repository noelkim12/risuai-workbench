/**
 * Regex simulator flag and directive contracts.
 * @file packages/core/src/simulator/regex/types.ts
 */
import type { SimulatorDiagnostic, SimulatorSafetyLimits, SimulatorStatus } from './shared';

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
