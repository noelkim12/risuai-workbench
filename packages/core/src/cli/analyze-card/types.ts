export interface ElementCBSData {
  elementType: string;
  elementName: string;
  reads: Set<string>;
  writes: Set<string>;
  readersByVar?: Record<string, string[]>;
  writersByVar?: Record<string, string[]>;
}

export interface VariablesResult {
  variables: Record<string, string>;
  cbsData: ElementCBSData[];
}

export interface HtmlResult {
  cbsData: ElementCBSData | null;
  assetRefs: string[];
}

export interface LorebookRegexCorrelation {
  sharedVars: Array<{
    varName: string;
    direction: string;
    lorebookEntries: string[];
    regexScripts: string[];
  }>;
  lorebookOnlyVars: string[];
  regexOnlyVars: string[];
  summary: {
    totalShared: number;
    totalLBOnly: number;
    totalRXOnly: number;
  };
}
