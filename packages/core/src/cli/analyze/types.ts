export type { ApiMeta } from '../../domain/analyze/lua-api';

export interface CollectedFunction {
  name: string;
  displayName: string;
  startLine: number;
  endLine: number;
  lineCount: number;
  isLocal: boolean;
  isAsync: boolean;
  params: string[];
  parentFunction: string | null;
  isListenEditHandler: boolean;
  listenEditEventType: string | null;
  apiCategories: Set<string>;
  apiNames: Set<string>;
  stateReads: Set<string>;
  stateWrites: Set<string>;
}

export interface CollectedStateVar {
  key: string;
  readBy: Set<string>;
  writtenBy: Set<string>;
  apis: Set<string>;
  firstWriteValue: string | null;
  firstWriteFunction: string | null;
  firstWriteLine: number;
  hasDualWrite: boolean;
}

export interface CollectedCall {
  caller: string | null;
  callee: string | null;
  line: number;
}

export interface CollectedApiCall {
  apiName: string;
  category: string;
  access: string;
  rw: 'read' | 'write';
  line: number;
  containingFunction: string;
}

export interface CollectedLoreApiCall {
  apiName: string;
  keyword: string | null;
  line: number;
  containingFunction: string;
}

export interface CollectedData {
  functions: CollectedFunction[];
  calls: CollectedCall[];
  apiCalls: CollectedApiCall[];
  handlers: Array<{
    type: string;
    line: number;
    isAsync: boolean;
    functionName: string | null;
    detail: string | null;
  }>;
  dataTables: Array<{
    name: string;
    fieldCount: number;
    startLine: number;
    endLine: number;
    depth: number;
  }>;
  stateVars: Map<string, CollectedStateVar>;
  functionIndexByName: Map<string, CollectedFunction[]>;
  prefixBuckets: Map<string, CollectedFunction[]>;
  loreApiCalls: CollectedLoreApiCall[];
}

export interface AnalyzePhaseResult {
  commentSections: Array<{ title: string; line: number; source: string }>;
  sectionMapSections: Array<{ title: string; source: string; startLine: number; endLine: number }>;
  callGraph: Map<string, Set<string>>;
  calledBy: Map<string, Set<string>>;
  apiByCategory: Map<string, { apis: Set<string>; count: number }>;
  moduleGroups: Array<{
    name: string;
    title: string;
    reason: string;
    source: string;
    functions: Set<string>;
    tables: Set<string>;
    apiCats: Set<string>;
    stateKeys: Set<string>;
    dir: string;
  }>;
  moduleByFunction: Map<string, string>;
  stateOwnership: Array<{
    key: string;
    readBy: string[];
    writers: string[];
    ownerModule: string;
    crossModule: boolean;
  }>;
  registryVars: Array<{
    key: string;
    suggestedDefault: string;
    suggestNumber: boolean;
    isInitPattern: boolean;
    readCount: number;
    writeCount: number;
    firstWriteFunction: string;
    hasDualWrite: boolean;
  }>;
  rootFunctions: CollectedFunction[];
  getDescendants: (name: string) => CollectedFunction[];
}

export interface CorrelationEntry {
  varName: string;
  luaReaders: string[];
  luaWriters: string[];
  direction: string;
}

export interface LorebookCorrelation {
  correlations: Array<
    CorrelationEntry & {
      lorebookReaders: string[];
      lorebookWriters: string[];
      luaOnly: boolean;
      lorebookOnly: boolean;
    }
  >;
  entryInfos: Array<{
    name: string;
    folder: string | null;
    vars: string[];
    luaDeps: string[];
  }>;
  loreApiCalls: CollectedLoreApiCall[];
  totalEntries: number;
  totalFolders: number;
  bridgedVars: Array<CorrelationEntry>;
  luaOnlyVars: Array<CorrelationEntry>;
  lorebookOnlyVars: Array<CorrelationEntry>;
}

export interface RegexCorrelation {
  correlations: Array<
    CorrelationEntry & {
      regexReaders: string[];
      regexWriters: string[];
      luaOnly: boolean;
      regexOnly: boolean;
    }
  >;
  scriptInfos: Array<{
    comment: string;
    type: string;
    inPattern: string;
    vars: string[];
    luaDeps: string[];
  }>;
  totalScripts: number;
  activeScripts: number;
  bridgedVars: Array<CorrelationEntry>;
  luaOnlyVars: Array<CorrelationEntry>;
  regexOnlyVars: Array<CorrelationEntry>;
}
