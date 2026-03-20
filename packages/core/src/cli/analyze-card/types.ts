import { type ElementCBSData, type LorebookRegexCorrelation } from '../../domain/analyze/correlation';

export type { ElementCBSData, LorebookRegexCorrelation };

export interface VariablesResult {
  variables: Record<string, string>;
  cbsData: ElementCBSData[];
}

export interface HtmlResult {
  cbsData: ElementCBSData | null;
  assetRefs: string[];
}
