// Extracted from template/src/lib/types/workbench.ts

export interface RegexScript {
  id: string;
  comment: string;
  type: 'editprocess' | 'editdisplay' | 'editoutput' | 'editinput';
  findRegex: string;
  replaceString: string;
  trimStrings?: string[];
  placement?: number[];
  disabled?: boolean;
}

export interface LorebookEntry {
  id: string;
  keys: string[];
  content: string;
  comment: string;
  constant: boolean;
  selective: boolean;
  caseSensitive: boolean;
  useRegex: boolean;
  insertionOrder: number;
  enabled: boolean;
}

export interface Variable {
  name: string;
  value: string;
  source: 'card' | 'runtime';
}

export interface CharxData {
  name: string;
  creator: string;
  createdAt: string;
  specVersion: string;
  regexScripts: RegexScript[];
  triggerScripts: string;
  backgroundHTML: string;
  lorebook: LorebookEntry[];
  defaultVariables: Variable[];
  hasLua: boolean;
  hasHTML: boolean;
  hasLorebook: boolean;
  isNew: boolean;
}

export type CardData = CharxData;
