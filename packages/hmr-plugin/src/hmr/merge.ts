import { HMR_ASSET_PLACEHOLDER_PREFIX } from './protocol';

export const PRESERVED_CHARACTER_KEYS = ['chats', 'chatPage', 'chaId'] as const;
export const NAMED_LIST_KEYS = {
  character: ['globalLore', 'customscript', 'triggerscript'],
  module: ['lorebook', 'regex', 'trigger'],
} as const;

const NAMED_LIST_LABELS: Record<string, string> = {
  globalLore: '로어북(globalLore)',
  customscript: '정규식(customscript)',
  triggerscript: '트리거(triggerscript)',
  lorebook: '로어북(lorebook)',
  regex: '정규식(regex)',
  trigger: '트리거(trigger)',
};

/** 이름 기준 병합 목록의 화면 표시명. */
export const namedListLabel = (key: string): string => NAMED_LIST_LABELS[key] ?? key;

export type MergeMode = 'merge-by-name' | 'replace';
export interface NameConflict {
  readonly key: string;
  readonly side: 'existing' | 'incoming';
  readonly reason: 'duplicate-name';
  readonly name: string;
  readonly index: number;
}
export interface PreservedEntries {
  readonly key: string;
  readonly labels: readonly string[];
}
export interface EffectiveDefinition {
  readonly status: 'ready' | 'conflict';
  readonly after: Record<string, unknown>;
  readonly conflicts: readonly NameConflict[];
  readonly preserved: readonly PreservedEntries[];
  readonly legacyFields: readonly string[];
}

export class NameMergeConflictError extends Error {
  constructor(readonly conflicts: readonly NameConflict[]) {
    super('이름 병합 충돌: 항목 이름을 수정하거나 전체 치환을 선택하세요.');
    this.name = 'NameMergeConflictError';
  }
}

type JsonLikeRecord = Record<string, unknown>;
type CharacterIndicator = 'character_desc' | 'character_first_message' | 'replace_global_note';

function isPlainRecord(value: unknown): value is JsonLikeRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isPreservedCharacterKey(key: string): key is (typeof PRESERVED_CHARACTER_KEYS)[number] {
  return PRESERVED_CHARACTER_KEYS.some((preservedKey) => preservedKey === key);
}

function entryName(entry: unknown): unknown {
  return typeof entry === 'object' && entry !== null ? Reflect.get(entry, 'comment') : undefined;
}

export function mergeLoreEntries(existing: unknown, incoming: unknown): unknown {
  const result = calculateEffectiveDefinition({ kind: 'character', existing: { globalLore: existing }, incoming: { globalLore: incoming } });
  if (result.status === 'conflict') throw new NameMergeConflictError(result.conflicts);
  return result.after['globalLore'];
}

function hasName(name: unknown): name is string {
  return typeof name === 'string' && name.trim().length > 0;
}

// 이름 없는 항목(예: Lua 모드 트리거는 comment가 "")은 이름 없는 항목끼리 순서대로 짝짓는다.
function matchKeys(entries: readonly unknown[]): string[] {
  let blank = 0;
  return entries.map((entry) => {
    const name = entryName(entry);
    return hasName(name) ? `name:${name}` : `blank:${blank++}`;
  });
}

function mergeNamedEntries(existing: readonly unknown[], incoming: readonly unknown[]): unknown[] {
  const existingKeys = matchKeys(existing);
  const incomingKeys = matchKeys(incoming);
  const byKey = new Map(incomingKeys.map((key, index) => [key, incoming[index]]));
  const used = new Set(existingKeys);
  const kept = existing.map((entry, index) => (byKey.has(existingKeys[index]!) ? byKey.get(existingKeys[index]!) : entry));

  return [...kept, ...incoming.filter((_, index) => !used.has(incomingKeys[index]!))];
}

function nameConflicts(entries: readonly unknown[], key: string, side: NameConflict['side']): NameConflict[] {
  const seen = new Set<string>();
  const conflicts: NameConflict[] = [];
  entries.forEach((entry, index) => {
    const name = entryName(entry);
    if (!hasName(name)) return;
    if (seen.has(name)) conflicts.push({ key, side, reason: 'duplicate-name', name, index });
    else seen.add(name);
  });
  return conflicts;
}

export function calculateEffectiveDefinition(input: {
  readonly kind: 'character' | 'module';
  readonly existing: Record<string, unknown>;
  readonly incoming: Record<string, unknown>;
  readonly mode?: MergeMode;
}): EffectiveDefinition {
  const { kind, existing, incoming } = input;
  const after: Record<string, unknown> = kind === 'character' ? { ...existing } : { id: existing['id'] };
  const conflicts: NameConflict[] = [];
  const preserved: PreservedEntries[] = [];
  const legacyFields: string[] = [];
  const namedKeys: readonly string[] = NAMED_LIST_KEYS[kind];
  for (const [key, value] of Object.entries(incoming)) {
    if (kind === 'character' ? isPreservedCharacterKey(key) : key === 'id') continue;
    if (kind === 'character' && key === 'loreSettings' && value === null) {
      delete after[key];
      continue;
    }
    const previous = existing[key];
    if (namedKeys.includes(key) && (input.mode ?? 'merge-by-name') === 'merge-by-name') {
      if (Array.isArray(value) && (previous === undefined || Array.isArray(previous))) {
        const before: readonly unknown[] = Array.isArray(previous) ? previous : [];
        conflicts.push(...nameConflicts(before, key, 'existing'), ...nameConflicts(value, key, 'incoming'));
        after[key] = mergeNamedEntries(before, value);
        const incomingKeys = new Set(matchKeys(value));
        const labels = matchKeys(before).flatMap((matchKey, index) => {
          if (incomingKeys.has(matchKey)) return [];
          const name = entryName(before[index]);
          return [hasName(name) ? name : '(이름 없음)'];
        });
        if (labels.length > 0) preserved.push({ key, labels });
        continue;
      }
      legacyFields.push(key);
    }
    after[key] = value;
  }
  if (kind === 'character') {
    for (const key of Object.keys(existing)) {
      if (!(key in incoming) && !isPreservedCharacterKey(key)) preserved.push({ key, labels: [] });
    }
  }
  return { status: conflicts.length === 0 ? 'ready' : 'conflict', after: conflicts.length === 0 ? after : { ...existing }, conflicts, preserved, legacyFields };
}

function createIndicatorLoreEntry(
  comment: string,
  indicator: CharacterIndicator,
  content: string,
): Record<string, unknown> {
  return {
    key: '',
    secondkey: '',
    insertorder: 0,
    comment,
    content: `@@indicator ${indicator}\n\n${content}`,
    mode: 'constant',
    alwaysActive: indicator !== 'character_first_message',
    selective: false,
  };
}

export function mergeCharacterDefinition(
  existing: Record<string, unknown>,
  definition: Record<string, unknown>,
  mode: MergeMode = 'merge-by-name',
): Record<string, unknown> {
  const result = calculateEffectiveDefinition({ kind: 'character', existing, incoming: definition, mode });
  if (result.status === 'conflict') throw new NameMergeConflictError(result.conflicts);
  return result.after;
}

export function convertCharacterToModuleDefinition(
  definition: Record<string, unknown>,
): Record<string, unknown> {
  const lorebook = Array.isArray(definition['globalLore'])
    ? structuredClone(definition['globalLore'])
    : [];
  const converted: Record<string, unknown> = {
    name: typeof definition['name'] === 'string' ? definition['name'] : '',
    description: typeof definition['creatorNotes'] === 'string' ? definition['creatorNotes'] : '',
    lorebook,
    regex: definition['customscript'],
    trigger: definition['triggerscript'],
    lowLevelAccess: definition['lowLevelAccess'],
    hideIcon: definition['hideChatIcon'],
    backgroundEmbedding: definition['backgroundHTML'],
    assets: definition['additionalAssets'],
    namespace: definition['moduleNamespace'],
    customModuleToggle: definition['customModuleToggle'],
    icon: definition['image'],
  };

  const description = definition['desc'];
  if (typeof description === 'string' && description.length > 0) {
    lorebook.push(createIndicatorLoreEntry('From Character Description', 'character_desc', description));
  }

  const firstMessage = typeof definition['firstMessage'] === 'string' ? definition['firstMessage'] : '';
  const alternateGreetings = Array.isArray(definition['alternateGreetings'])
    ? definition['alternateGreetings'].filter((value): value is string => typeof value === 'string')
    : [];
  if (firstMessage.length > 0 || alternateGreetings.length > 0) {
    let firstMessages = `<FM>\n${firstMessage}\n</FM>`;
    for (const greeting of alternateGreetings) {
      firstMessages += `\n<FM_alt>\n${greeting}\n</FM_alt>`;
    }
    lorebook.push(createIndicatorLoreEntry('From First Messages', 'character_first_message', firstMessages));
  }

  const globalNote = definition['replaceGlobalNote'];
  if (typeof globalNote === 'string' && globalNote.length > 0) {
    lorebook.push(createIndicatorLoreEntry('From Global Note Replacement', 'replace_global_note', globalNote));
  }

  return converted;
}

export function applyAssetPlaceholders<T>(value: T, resolve: (hash: string) => string): T {
  if (typeof value === 'string') {
    if (value.startsWith(HMR_ASSET_PLACEHOLDER_PREFIX)) {
      return resolve(value.slice(HMR_ASSET_PLACEHOLDER_PREFIX.length)) as T;
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => applyAssetPlaceholders(item, resolve)) as T;
  }

  if (isPlainRecord(value)) {
    const output: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(value)) {
      output[key] = applyAssetPlaceholders(item, resolve);
    }

    return output as T;
  }

  return value;
}

export function findCharacterIndexByChaId(characters: readonly unknown[], chaId: string): number {
  return characters.findIndex((candidate) => {
    if (!isPlainRecord(candidate)) {
      return false;
    }

    return candidate['chaId'] === chaId && candidate['type'] !== 'group';
  });
}

export function replaceModuleById(
  modules: readonly unknown[],
  moduleId: string,
  incoming: Record<string, unknown>,
  mode: MergeMode = 'merge-by-name',
): unknown[] | null {
  const index = modules.findIndex((candidate) => isPlainRecord(candidate) && candidate['id'] === moduleId);

  if (index < 0) {
    return null;
  }

  const next = [...modules];
  const existing = modules[index];
  if (!isPlainRecord(existing)) return null;
  const result = calculateEffectiveDefinition({ kind: 'module', existing, incoming, mode });
  if (result.status === 'conflict') throw new NameMergeConflictError(result.conflicts);
  next[index] = result.after;
  return next;
}
