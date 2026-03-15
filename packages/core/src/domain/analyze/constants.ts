export const MAX_VARS_IN_REPORT = 80;
export const MAX_ENTRIES_IN_REPORT = 50;
export const MAX_SCRIPTS_IN_REPORT = 40;

export const ELEMENT_TYPES = {
  LOREBOOK: 'lorebook',
  REGEX: 'regex',
  LUA: 'lua',
  HTML: 'html',
  VARIABLES: 'variables',
  TYPESCRIPT: 'typescript',
} as const;

export const CBS_OPS = {
  READ: 'read',
  WRITE: 'write',
} as const;

export type ElementType =
  (typeof ELEMENT_TYPES)[keyof typeof ELEMENT_TYPES];
