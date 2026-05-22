/**
 * Supported RisuAI regex directive reference registry.
 * @file packages/core/src/simulator/regex/directive-registry.ts
 */
import type { RisuRegexDirectiveKind } from './types';

/** Supported RisuAI regex directive kinds recognized by this simulator layer. */
export const RISU_REGEX_DIRECTIVE_REFERENCES: readonly RisuRegexDirectiveKind[] = [
  'inject',
  'move_top',
  'move_bottom',
  'repeat_back',
  'order',
  'cbs',
  'no_end_nl',
] as const;
