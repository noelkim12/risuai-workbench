import {
  type ElementCBSData,
  type LorebookRegexCorrelation,
} from '@/domain/analyze/correlation';

export type { ElementCBSData, LorebookRegexCorrelation };

export interface VariablesResult {
  variables: Record<string, string>;
  cbsData: ElementCBSData[];
}

export interface HtmlResult {
  cbsData: ElementCBSData | null;
  assetRefs: string[];
}

export interface UnifiedVarEntry {
  varName: string;
  sources: Record<string, { readers: string[]; writers: string[] }>;
  defaultValue: string | null;
  elementCount: number;
  direction: string;
  crossElementWriters: string[];
  crossElementReaders: string[];
}
