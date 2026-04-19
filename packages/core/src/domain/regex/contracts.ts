import type { RegexType } from './types';

/** Canonical .risuregex entry. */
export interface CanonicalRegexEntry {
  /** Human-facing regex name/comment. */
  comment: string;
  /** Upstream regex type discriminator. */
  type: RegexType;
  /** Raw regex flag string, preserved exactly when present. */
  flag?: string;
  /** Raw ableFlag boolean, preserved exactly when present. */
  ableFlag?: boolean;
  /** `@@@ IN` section body. */
  in: string;
  /** `@@@ OUT` section body. */
  out: string;
}
