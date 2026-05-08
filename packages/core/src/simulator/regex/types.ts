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
