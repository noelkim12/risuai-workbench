/**
 * Regex simulator flag and directive contracts.
 * @file packages/core/src/simulator/regex/types.ts
 */
import type { SimulatorDiagnostic } from './shared';

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
