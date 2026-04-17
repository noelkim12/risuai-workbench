/** Accepted upstream regex types shared across Risu regex surfaces. */
export const REGEX_TYPES = [
  'editinput',
  'editoutput',
  'editdisplay',
  'editprocess',
  'edittrans',
  'disabled',
] as const;

/** Upstream regex type discriminator. */
export type RegexType = (typeof REGEX_TYPES)[number];

/** Upstream regex/customscript shape shared by charx/module/preset. */
export interface UpstreamRegexEntry {
  comment: string;
  type: string;
  flag?: string;
  ableFlag?: boolean;
  in: string;
  out: string;
}
