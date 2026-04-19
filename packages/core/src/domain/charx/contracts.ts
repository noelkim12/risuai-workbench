import type { RegexType } from '../regex';

/** Root-package compatibility DTO for regex script summaries. */
export interface RegexScript {
  id: string;
  comment: string;
  type: RegexType;
  findRegex: string;
  replaceString: string;
  trimStrings?: string[];
  placement?: number[];
  disabled?: boolean;
}

/** Root-package compatibility DTO for lorebook entry summaries. */
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

/** Root-package compatibility DTO for variable declarations. */
export interface Variable {
  name: string;
  value: string;
  source: 'card' | 'runtime';
}

/** Root-package compatibility DTO for card-shaped summary data. */
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
