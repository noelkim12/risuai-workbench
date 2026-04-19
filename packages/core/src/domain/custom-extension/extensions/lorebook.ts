import { sanitizeFilename } from '../../../utils/filenames';
import type { CustomExtensionTarget } from '../contracts';

/** Accepted canonical lorebook modes. */
export const LOREBOOK_MODES = ['normal', 'folder', 'constant', 'multiple', 'child'] as const;

/** Canonical lorebook mode. */
export type LorebookMode = (typeof LOREBOOK_MODES)[number];

/** Canonical .risulorebook content. */
export interface LorebookContent {
  /** Human-facing display name. */
  name: string;
  /** Human-facing comment/summary. */
  comment: string;
  /** Upstream lorebook mode. */
  mode: LorebookMode;
  /** Always-active flag unified across targets. */
  constant: boolean;
  /** Secondary-key AND matching flag. */
  selective: boolean;
  /** Insertion order unified across targets. */
  insertion_order: number;
  /** Stored case sensitivity flag. */
  case_sensitive: boolean;
  /** Regex matching flag. */
  use_regex: boolean;
  /** Primary key list from `@@@ KEYS`. */
  keys: string[];
  /** Body content from `@@@ CONTENT`. */
  content: string;
  /** Optional secondary key list from `@@@ SECONDARY_KEYS`. */
  secondary_keys?: string[];
  /** Optional parent folder reference. */
  folder?: string | null;
  /** Optional extension metadata. */
  extensions?: Record<string, unknown>;
  /** Optional module/native book version. */
  book_version?: number;
  /** Optional module/native activation percent. */
  activation_percent?: number;
  /** Optional upstream-passthrough id. */
  id?: string;
}

/** Canonical folder manifest record stored in `_folders.json`. */
export interface LorebookFolderRecord {
  /** Human-facing folder name. */
  name: string;
  /** Human-facing folder comment. */
  comment: string;
  /** Folder mode, always `folder`. */
  mode: 'folder';
  /** Always-active flag preserved for upstream parity. */
  constant: boolean;
  /** Selective flag preserved for upstream parity. */
  selective: boolean;
  /** Folder insertion order. */
  insertion_order: number;
  /** Stored case sensitivity flag. */
  case_sensitive: boolean;
  /** Regex matching flag. */
  use_regex: boolean;
  /** Optional parent folder reference. */
  folder?: string | null;
  /** Optional extension metadata. */
  extensions?: Record<string, unknown>;
  /** Optional module/native book version. */
  book_version?: number;
  /** Optional module/native activation percent. */
  activation_percent?: number;
  /** Optional upstream-passthrough id. */
  id?: string;
}

/** `_folders.json` manifest keyed by stable folder key. */
export type LorebookFolders = Record<string, LorebookFolderRecord>;

/** Canonical lorebook file coupled with its relative path. */
export interface LorebookCanonicalFile {
  /** Relative path beneath `lorebooks/`. */
  relativePath: string;
  /** Canonical file content. */
  content: LorebookContent;
}

/** Upstream charx lorebook entry shape. */
export interface UpstreamCharxLorebookEntry {
  keys: string[];
  content: string;
  extensions: Record<string, unknown>;
  enabled: true;
  insertion_order: number;
  constant: boolean;
  selective: boolean;
  name: string;
  comment: string;
  case_sensitive: boolean;
  use_regex: boolean;
  mode: LorebookMode;
  secondary_keys?: string[];
  folder?: string;
}

/** Upstream module lorebook entry shape. */
export interface UpstreamModuleLorebookEntry {
  key: string;
  secondkey: string;
  comment: string;
  content: string;
  mode: LorebookMode;
  alwaysActive: boolean;
  selective: boolean;
  insertorder: number;
  useRegex: boolean;
  extentions: Record<string, unknown>;
  folder?: string;
  bookVersion?: number;
  activationPercent?: number;
  id?: string;
}

const SUPPORTED_TARGETS: readonly CustomExtensionTarget[] = ['charx', 'module'];
const PROMOTED_EXTENSION_KEYS = new Set([
  'risu_case_sensitive',
  'risu_bookVersion',
  'risu_activationPercent',
  'risu_loreCache',
]);

/** Error thrown when lorebook parsing or mapping fails. */
export class LorebookAdapterError extends Error {
  constructor(message: string) {
    super(`[risulorebook] ${message}`);
    this.name = 'LorebookAdapterError';
  }
}

/** parseLorebookContent parses one canonical .risulorebook file. */
export function parseLorebookContent(rawContent: string): LorebookContent {
  const { frontmatter, body } = splitFrontmatter(rawContent);
  const metadata = parseFrontmatter(frontmatter);
  const sections = parseLorebookSections(body);

  return normalizeLorebookContent(
    {
      ...metadata,
      keys: sections.keys,
      ...(sections.secondary_keys !== undefined ? { secondary_keys: sections.secondary_keys } : {}),
      content: sections.content,
    },
    'canonical lorebook content'
  );
}

/** serializeLorebookContent serializes one canonical .risulorebook file deterministically. */
export function serializeLorebookContent(content: LorebookContent): string {
  const normalized = normalizeLorebookContent(content, 'canonical lorebook content');
  const headerLines = [
    '---',
    `name: ${formatFrontmatterString(normalized.name)}`,
    `comment: ${formatFrontmatterString(normalized.comment)}`,
    `mode: ${normalized.mode}`,
    `constant: ${String(normalized.constant)}`,
    `selective: ${String(normalized.selective)}`,
    `insertion_order: ${String(normalized.insertion_order)}`,
    `case_sensitive: ${String(normalized.case_sensitive)}`,
    `use_regex: ${String(normalized.use_regex)}`,
    ...(normalized.folder !== undefined
      ? [`folder: ${normalized.folder === null ? 'null' : formatFrontmatterString(normalized.folder)}`]
      : []),
    ...(normalized.extensions !== undefined
      ? [`extensions: ${JSON.stringify(sortJsonValue(normalized.extensions))}`]
      : []),
    ...(normalized.book_version !== undefined ? [`book_version: ${String(normalized.book_version)}`] : []),
    ...(normalized.activation_percent !== undefined
      ? [`activation_percent: ${String(normalized.activation_percent)}`]
      : []),
    ...(normalized.id !== undefined ? [`id: ${formatFrontmatterString(normalized.id)}`] : []),
    '---',
    '@@@ KEYS',
    serializeKeySection(normalized.keys),
    ...(normalized.secondary_keys !== undefined
      ? ['@@@ SECONDARY_KEYS', serializeKeySection(normalized.secondary_keys)]
      : []),
    '@@@ CONTENT',
    normalized.content,
    '',
  ];

  return headerLines.join('\n');
}

/** parseLorebookOrder parses one `_order.json` marker.
 * Accepts safe relative paths for folders and .risulorebook files.
 */
export function parseLorebookOrder(rawContent: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch (error) {
    throw new LorebookAdapterError(`Invalid _order.json: ${(error as Error).message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new LorebookAdapterError('Expected _order.json to contain an array of relative paths.');
  }

  return parsed.map((entry, index) => normalizeLorebookOrderEntry(entry, `_order.json[${index}]`));
}

/** serializeLorebookOrder serializes one `_order.json` marker deterministically. */
export function serializeLorebookOrder(relativePaths: readonly string[]): string {
  const normalized = dedupePreservingOrder(
    relativePaths.map((relativePath, index) =>
      normalizeLorebookRelativePath(relativePath, `_order.json input[${index}]`)
    )
  );
  return `${JSON.stringify(normalized, null, 2)}\n`;
}

/** parseLorebookFolders parses one `_folders.json` marker. */
export function parseLorebookFolders(rawContent: string): LorebookFolders {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch (error) {
    throw new LorebookAdapterError(`Invalid _folders.json: ${(error as Error).message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new LorebookAdapterError('Expected _folders.json to contain an object keyed by folder ids.');
  }

  const folders: LorebookFolders = {};
  for (const [folderKey, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!folderKey.trim()) {
      throw new LorebookAdapterError('Folder keys in _folders.json must be non-empty strings.');
    }
    folders[folderKey] = normalizeLorebookFolderRecord(value, `_folders.json.${folderKey}`);
  }

  return folders;
}

/** serializeLorebookFolders serializes one `_folders.json` marker deterministically. */
export function serializeLorebookFolders(folders: LorebookFolders): string {
  const normalized = normalizeLorebookFolders(folders, '_folders.json');
  const sortedEntries = Object.entries(normalized).sort(([left], [right]) => left.localeCompare(right));
  const serialized: Record<string, unknown> = {};

  for (const [folderKey, record] of sortedEntries) {
    serialized[folderKey] = buildSerializableFolderRecord(record);
  }

  return `${JSON.stringify(serialized, null, 2)}\n`;
}

/** resolveLorebookOrder applies `_order.json` deterministically to discovered files. */
export function resolveLorebookOrder(
  availableRelativePaths: readonly string[],
  declaredOrder?: readonly string[] | null
): string[] {
  const available = dedupePreservingOrder(
    availableRelativePaths.map((relativePath, index) =>
      normalizeLorebookRelativePath(relativePath, `availableRelativePaths[${index}]`)
    )
  );
  const availableSet = new Set(available);
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const relativePath of declaredOrder ?? []) {
    const normalized = normalizeLorebookRelativePath(relativePath, '_order.json');
    if (!availableSet.has(normalized) || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    ordered.push(normalized);
  }

  const remaining = available.filter((relativePath) => !seen.has(relativePath)).sort((left, right) =>
    left.localeCompare(right)
  );
  return [...ordered, ...remaining];
}

/** buildLorebookFolders lifts folder-mode lorebooks into `_folders.json` shape. */
export function buildLorebookFolders(contents: readonly LorebookContent[]): LorebookFolders {
  const folders: LorebookFolders = {};

  for (const content of contents) {
    const normalized = normalizeLorebookContent(content, 'lorebook folder source');
    if (normalized.mode !== 'folder') {
      continue;
    }
    if (normalized.keys.length === 0) {
      throw new LorebookAdapterError('Folder lorebooks require a folder key in the first @@@ KEYS line.');
    }
    if (normalized.keys.length > 1) {
      throw new LorebookAdapterError('Folder lorebooks must declare exactly one folder key in @@@ KEYS.');
    }
    if (normalized.secondary_keys && normalized.secondary_keys.length > 0) {
      throw new LorebookAdapterError('Folder lorebooks cannot store @@@ SECONDARY_KEYS.');
    }
    if (normalized.content !== '') {
      throw new LorebookAdapterError('Folder lorebooks cannot store non-empty @@@ CONTENT.');
    }

    const folderKey = normalized.keys[0];
    if (folders[folderKey]) {
      throw new LorebookAdapterError(`Duplicate folder key "${folderKey}" detected while building _folders.json.`);
    }

    folders[folderKey] = buildFolderRecordFromLorebook(normalized);
  }

  return folders;
}

/** assembleLorebookCollection merges files plus path-based `_order.json` into export order.
 * Folder entries are derived from parent directory paths in declaredOrder, not from _folders.json.
 * Folder keys are generated deterministically during assembly for upstream compatibility.
 */
export function assembleLorebookCollection(
  files: readonly LorebookCanonicalFile[],
  folders: LorebookFolders,
  declaredOrder?: readonly string[] | null
): LorebookContent[];
/** assembleLorebookCollection merges files plus path-based `_order.json` into export order.
 * Folder entries are derived from parent directory paths in declaredOrder.
 * Folder keys are generated deterministically during assembly for upstream compatibility.
 */
export function assembleLorebookCollection(
  files: readonly LorebookCanonicalFile[],
  declaredOrder?: readonly string[] | null
): LorebookContent[];
export function assembleLorebookCollection(
  files: readonly LorebookCanonicalFile[],
  foldersOrOrder?: LorebookFolders | readonly string[] | null,
  declaredOrder?: readonly string[] | null
): LorebookContent[] {
  // Handle overloads: determine if first arg after files is folders or declaredOrder
  const isFoldersArg = foldersOrOrder && typeof foldersOrOrder === 'object' && !Array.isArray(foldersOrOrder);
  const folders: LorebookFolders = isFoldersArg ? (foldersOrOrder as LorebookFolders) : {};
  const order: readonly string[] | null = isFoldersArg
    ? (declaredOrder ?? null)
    : (foldersOrOrder as readonly string[] | null ?? null);

  // Normalize legacy folders (for backward compatibility during transition)
  const normalizedFolders = Object.keys(folders).length > 0
    ? normalizeLorebookFolders(folders, '_folders.json')
    : {};

  const fileMap = new Map<string, LorebookContent>();

  for (const [index, file] of files.entries()) {
    const relativePath = normalizeLorebookOrderEntry(file.relativePath, `files[${index}].relativePath`);
    const content = normalizeLorebookContent(file.content, `files[${index}].content`);
    if (content.mode === 'folder') {
      throw new LorebookAdapterError('Folder lorebooks cannot be stored as .risulorebook files.');
    }
    if (fileMap.has(relativePath)) {
      throw new LorebookAdapterError(`Duplicate lorebook file path "${relativePath}" detected.`);
    }
    fileMap.set(relativePath, content);
  }

  // Build folder info from declaredOrder paths (new path-based contract)
  const folderInfoFromPaths = buildFolderInfoFromOrder(order || []);

  // Merge with legacy folders (if any) - path-based takes precedence
  const allFolderInfo = new Map<string, FolderInfo>();
  for (const [key, record] of Object.entries(normalizedFolders)) {
    allFolderInfo.set(key, { name: record.name, insertionOrder: record.insertion_order, parentKey: record.folder || null });
  }
  for (const [pathKey, info] of folderInfoFromPaths.entries()) {
    // Generate a stable folder key from path if not already set
    if (!allFolderInfo.has(pathKey)) {
      allFolderInfo.set(pathKey, info);
    }
  }

  // Generate folder keys from paths for upstream compatibility
  const folderKeyMap = new Map<string, string>(); // path -> generated key
  const generatedKeys = new Set<string>();
  let keyCounter = 1;

  for (const folderPath of folderInfoFromPaths.keys()) {
    // Generate a stable key from path
    const generatedKey = `folder-${keyCounter}`;
    folderKeyMap.set(folderPath, generatedKey);
    generatedKeys.add(generatedKey);
    keyCounter += 1;
  }

  // Also map legacy folder keys
  for (const legacyKey of Object.keys(normalizedFolders)) {
    if (!generatedKeys.has(legacyKey)) {
      folderKeyMap.set(legacyKey, legacyKey);
    }
  }

  const orderedPaths = resolveLorebookOrder([...fileMap.keys()], order);
  const emittedFolders = new Set<string>();

  // Build folder entries with generated keys
  const folderEntries = new Map<string, LorebookContent>();
  for (const [folderPath, info] of allFolderInfo.entries()) {
    const folderKey = folderKeyMap.get(folderPath) || folderPath;
    const parentKey = info.parentKey ? (folderKeyMap.get(info.parentKey) || info.parentKey) : null;

    folderEntries.set(folderKey, {
      name: info.name,
      comment: info.name,
      mode: 'folder',
      constant: false,
      selective: false,
      insertion_order: info.insertionOrder,
      case_sensitive: false,
      use_regex: false,
      keys: [folderKey],
      content: '',
      ...(parentKey ? { folder: parentKey } : {}),
    });
  }

  const collection: LorebookContent[] = [];

  const emitFolderChain = (folderKey: string | null | undefined): void => {
    if (!folderKey) {
      return;
    }
    if (emittedFolders.has(folderKey)) {
      return;
    }

    const folderEntry = folderEntries.get(folderKey);
    if (!folderEntry) {
      // Legacy folder reference not in our map - skip
      return;
    }

    emitFolderChain(folderEntry.folder);
    collection.push(folderEntry);
    emittedFolders.add(folderKey);
  };

  // Process files in order, deriving folder from path
  for (const relativePath of orderedPaths) {
    const content = fileMap.get(relativePath)!;
    const parentDir = relativePath.includes('/') ? relativePath.split('/').slice(0, -1).join('/') : null;

    if (parentDir && folderKeyMap.has(parentDir)) {
      // Assign folder reference based on path
      const folderKey = folderKeyMap.get(parentDir)!;
      const updatedContent = { ...content, folder: folderKey };
      emitFolderChain(folderKey);
      collection.push(updatedContent);
    } else {
      // No parent folder or folder not in order - emit as root-level
      emitFolderChain(content.folder);
      collection.push(content);
    }
  }

  // Emit any remaining folders not referenced by files
  for (const folderKey of folderEntries.keys()) {
    emitFolderChain(folderKey);
  }

  return collection;
}

/** Folder info derived from path-based order entries */
interface FolderInfo {
  name: string;
  insertionOrder: number;
  parentKey: string | null;
}

/** Build folder info map from declared order paths */
function buildFolderInfoFromOrder(order: readonly string[]): Map<string, FolderInfo> {
  const folderInfo = new Map<string, FolderInfo>();
  const seenPaths = new Set<string>();

  for (let i = 0; i < order.length; i += 1) {
    const entry = order[i];

    // Skip file entries (they have .risulorebook extension)
    if (entry.endsWith('.risulorebook')) {
      continue;
    }

    // This is a folder path
    const folderPath = entry;
    if (seenPaths.has(folderPath)) {
      continue;
    }
    seenPaths.add(folderPath);

    // Derive folder name from path (last segment)
    const segments = folderPath.split('/');
    const folderName = segments[segments.length - 1] || folderPath;

    // Determine parent folder from path
    const parentKey = segments.length > 1 ? segments.slice(0, -1).join('/') : null;

    folderInfo.set(folderPath, {
      name: folderName,
      insertionOrder: i,
      parentKey,
    });
  }

  return folderInfo;
}

/** extractLorebooksFromCharx reads canonical lorebooks from charx character_book entries. */
export function extractLorebooksFromCharx(
  upstream: { data?: { character_book?: { entries?: unknown } } },
  target: CustomExtensionTarget
): LorebookContent[] | null {
  assertExpectedTarget(target, 'charx');
  const entries = upstream.data?.character_book?.entries;
  if (entries === undefined || entries === null) {
    return null;
  }
  if (!Array.isArray(entries)) {
    throw new LorebookAdapterError('Expected charx data.character_book.entries to be an array.');
  }

  return entries.map((entry, index) => fromCharxLorebookEntry(entry, `charx entries[${index}]`));
}

/** extractLorebooksFromModule reads canonical lorebooks from module lorebook entries. */
export function extractLorebooksFromModule(
  upstream: { lorebook?: unknown },
  target: CustomExtensionTarget
): LorebookContent[] | null {
  assertExpectedTarget(target, 'module');
  const entries = upstream.lorebook;
  if (entries === undefined || entries === null) {
    return null;
  }
  if (!Array.isArray(entries)) {
    throw new LorebookAdapterError('Expected module lorebook to be an array.');
  }

  return entries.map((entry, index) => fromModuleLorebookEntry(entry, `module lorebook[${index}]`));
}

/** injectLorebooksIntoCharx writes canonical lorebooks into charx character_book entries. */
export function injectLorebooksIntoCharx(
  upstream: { data?: { character_book?: { entries?: UpstreamCharxLorebookEntry[] } } },
  contents: readonly LorebookContent[] | null,
  target: CustomExtensionTarget
): void {
  assertExpectedTarget(target, 'charx');

  if (contents === null) {
    upstream.data?.character_book && delete upstream.data.character_book.entries;
    return;
  }

  if (!upstream.data) {
    upstream.data = {};
  }
  if (!upstream.data.character_book) {
    upstream.data.character_book = {};
  }

  upstream.data.character_book.entries = contents.map((content, index) =>
    toCharxLorebookEntry(content, `charx lorebook[${index}]`)
  );
}

/** injectLorebooksIntoModule writes canonical lorebooks into module lorebook entries. */
export function injectLorebooksIntoModule(
  upstream: { lorebook?: UpstreamModuleLorebookEntry[] },
  contents: readonly LorebookContent[] | null,
  target: CustomExtensionTarget
): void {
  assertExpectedTarget(target, 'module');

  if (contents === null) {
    delete upstream.lorebook;
    return;
  }

  upstream.lorebook = contents.map((content, index) =>
    toModuleLorebookEntry(content, `module lorebook[${index}]`)
  );
}

/** buildLorebookPath builds the canonical file path for one lorebook entry. */
export function buildLorebookPath(target: CustomExtensionTarget, stem?: string): string {
  assertSupportedTarget(target);
  return `lorebooks/${sanitizeFilename(stem, 'entry')}.risulorebook`;
}

function assertSupportedTarget(target: CustomExtensionTarget): void {
  if (!SUPPORTED_TARGETS.includes(target)) {
    throw new LorebookAdapterError(
      `Target "${target}" does not support .risulorebook. Only charx and module are supported.`
    );
  }
}

function assertExpectedTarget(target: CustomExtensionTarget, expected: CustomExtensionTarget): void {
  assertSupportedTarget(target);
  if (target !== expected) {
    throw new LorebookAdapterError(`Expected target "${expected}", got "${target}"`);
  }
}

function splitFrontmatter(rawContent: string): { frontmatter: string; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(rawContent);
  if (!match) {
    throw new LorebookAdapterError('Expected a leading YAML frontmatter header delimited by --- lines.');
  }

  return {
    frontmatter: match[1],
    body: match[2],
  };
}

function parseFrontmatter(
  frontmatter: string
): Omit<LorebookContent, 'keys' | 'content' | 'secondary_keys'> {
  const lines = frontmatter.split(/\r?\n/);
  const parsed: Partial<Omit<LorebookContent, 'keys' | 'content' | 'secondary_keys'>> = {};
  const seenKeys = new Set<string>();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) {
      continue;
    }
    if (/^\s/.test(line)) {
      throw new LorebookAdapterError(`Unexpected indented frontmatter line: ${line}`);
    }

    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      throw new LorebookAdapterError(`Invalid frontmatter line: ${line}`);
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trimStart();
    if (seenKeys.has(key)) {
      throw new LorebookAdapterError(`Duplicate frontmatter field "${key}".`);
    }
    seenKeys.add(key);

    switch (key) {
      case 'name':
      case 'comment':
      case 'id':
        parsed[key] = parseFrontmatterString(rawValue) as never;
        break;
      case 'mode':
        parsed.mode = parseLorebookMode(parseFrontmatterString(rawValue));
        break;
      case 'constant':
      case 'selective':
      case 'case_sensitive':
      case 'use_regex':
        parsed[key] = parseFrontmatterBoolean(rawValue) as never;
        break;
      case 'insertion_order':
      case 'book_version':
      case 'activation_percent':
        parsed[key] = parseFrontmatterInteger(rawValue, key) as never;
        break;
      case 'folder':
        parsed.folder = parseOptionalFolder(rawValue);
        break;
      case 'extensions': {
        if (rawValue) {
          parsed.extensions = parseFrontmatterObject(rawValue, 'extensions');
          break;
        }

        const blockLines: string[] = [];
        let probe = index + 1;
        while (probe < lines.length) {
          const nextLine = lines[probe];
          if (!nextLine.trim()) {
            blockLines.push(nextLine);
            probe += 1;
            continue;
          }
          if (!/^\s+/.test(nextLine)) {
            break;
          }
          blockLines.push(nextLine);
          probe += 1;
        }

        parsed.extensions = blockLines.length === 0 ? {} : parseIndentedObjectBlock(blockLines, 'extensions');
        index = probe - 1;
        break;
      }
      default:
        throw new LorebookAdapterError(`Unsupported frontmatter field "${key}".`);
    }
  }

  for (const requiredField of [
    'name',
    'comment',
    'mode',
    'constant',
    'selective',
    'insertion_order',
    'case_sensitive',
    'use_regex',
  ] as const) {
    if (parsed[requiredField] === undefined) {
      throw new LorebookAdapterError(`Frontmatter must include required field "${requiredField}".`);
    }
  }

  return parsed as Omit<LorebookContent, 'keys' | 'content' | 'secondary_keys'>;
}

function parseLorebookSections(body: string): Pick<LorebookContent, 'keys' | 'content' | 'secondary_keys'> {
  const keysMatch = /^@@@ KEYS(?:\r?\n|$)/.exec(body);
  if (!keysMatch) {
    throw new LorebookAdapterError('Expected body to begin with an @@@ KEYS section.');
  }

  const afterKeys = body.slice(keysMatch[0].length);
  const nextBoundary = /(?:^|\r?\n)@@@ (SECONDARY_KEYS|CONTENT)(?:\r?\n|$)/.exec(afterKeys);
  if (!nextBoundary) {
    throw new LorebookAdapterError('Expected @@@ CONTENT after the @@@ KEYS section.');
  }

  const keys = parseKeySection(afterKeys.slice(0, nextBoundary.index));
  if (nextBoundary[1] === 'CONTENT') {
    return {
      keys,
      content: stripStructuralTrailingLineEnding(afterKeys.slice(nextBoundary.index + nextBoundary[0].length)),
    };
  }

  const afterSecondary = afterKeys.slice(nextBoundary.index + nextBoundary[0].length);
  const contentBoundary = /(?:^|\r?\n)@@@ CONTENT(?:\r?\n|$)/.exec(afterSecondary);
  if (!contentBoundary) {
    throw new LorebookAdapterError('Expected @@@ CONTENT after the @@@ SECONDARY_KEYS section.');
  }

  return {
    keys,
    secondary_keys: parseKeySection(afterSecondary.slice(0, contentBoundary.index)),
    content: stripStructuralTrailingLineEnding(
      afterSecondary.slice(contentBoundary.index + contentBoundary[0].length)
    ),
  };
}

function parseKeySection(rawSection: string): string[] {
  const normalized = stripStructuralTrailingLineEnding(rawSection);
  if (normalized === '') {
    return [];
  }

  return normalized
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function serializeKeySection(keys: readonly string[]): string {
  return keys.join('\n');
}

function stripStructuralTrailingLineEnding(content: string): string {
  if (content.endsWith('\r\n')) {
    return content.slice(0, -2);
  }
  if (content.endsWith('\n')) {
    return content.slice(0, -1);
  }
  return content;
}

function parseFrontmatterString(rawValue: string): string {
  if (rawValue.length === 0) {
    return '';
  }

  if (rawValue.startsWith('"') !== rawValue.endsWith('"')) {
    throw new LorebookAdapterError(`Invalid quoted string value ${rawValue}`);
  }
  if (rawValue.startsWith("'") !== rawValue.endsWith("'")) {
    throw new LorebookAdapterError(`Invalid quoted string value ${rawValue}`);
  }

  if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
    try {
      const parsed = JSON.parse(rawValue) as unknown;
      if (typeof parsed !== 'string') {
        throw new Error('not a string');
      }
      return parsed;
    } catch {
      throw new LorebookAdapterError(`Invalid quoted string value ${rawValue}`);
    }
  }

  if (rawValue.startsWith("'") && rawValue.endsWith("'")) {
    return rawValue.slice(1, -1).replace(/''/g, "'");
  }

  return rawValue;
}

function parseFrontmatterBoolean(rawValue: string): boolean {
  const value = parseFrontmatterString(rawValue);
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  throw new LorebookAdapterError(`Invalid boolean value "${value}". Expected true or false.`);
}

function parseFrontmatterInteger(rawValue: string, fieldName: string): number {
  const value = parseFrontmatterString(rawValue);
  if (!/^-?\d+$/.test(value)) {
    throw new LorebookAdapterError(`Invalid integer value for "${fieldName}": ${value}`);
  }
  return Number.parseInt(value, 10);
}

function parseOptionalFolder(rawValue: string): string | null {
  const value = parseFrontmatterString(rawValue);
  if (value === '' || value === 'null' || value === '~') {
    return null;
  }
  return value;
}

function parseFrontmatterObject(rawValue: string, context: string): Record<string, unknown> {
  const parsed = parseJsonLikeValue(rawValue, context);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new LorebookAdapterError(`Expected ${context} to be an object.`);
  }
  return cloneJsonObject(parsed as Record<string, unknown>, context);
}

function parseIndentedObjectBlock(blockLines: string[], context: string): Record<string, unknown> {
  const firstIndentedLine = blockLines.find((line) => line.trim());
  if (!firstIndentedLine) {
    return {};
  }
  const baseIndent = getLeadingSpaceCount(firstIndentedLine);
  const { value, nextIndex } = parseIndentedObject(blockLines, 0, baseIndent, context);
  if (nextIndex < blockLines.length) {
    throw new LorebookAdapterError(`Could not parse full ${context} block.`);
  }
  return value;
}

function parseIndentedObject(
  lines: string[],
  startIndex: number,
  indent: number,
  context: string
): { value: Record<string, unknown>; nextIndex: number } {
  const value: Record<string, unknown> = {};
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const lineIndent = getLeadingSpaceCount(line);
    if (lineIndent < indent) {
      break;
    }
    if (lineIndent > indent) {
      throw new LorebookAdapterError(`Invalid nested indentation in ${context}: ${line}`);
    }

    const trimmed = line.trimStart();
    const separatorIndex = trimmed.indexOf(':');
    if (separatorIndex === -1) {
      throw new LorebookAdapterError(`Invalid ${context} line: ${trimmed}`);
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trimStart();
    if (!key) {
      throw new LorebookAdapterError(`Invalid ${context} key in line: ${trimmed}`);
    }
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      throw new LorebookAdapterError(`Duplicate ${context} key "${key}".`);
    }

    if (rawValue) {
      value[key] = parseJsonLikeValue(rawValue, `${context}.${key}`);
      index += 1;
      continue;
    }

    let probe = index + 1;
    while (probe < lines.length && !lines[probe].trim()) {
      probe += 1;
    }

    if (probe >= lines.length || getLeadingSpaceCount(lines[probe]) <= lineIndent) {
      value[key] = null;
      index = probe;
      continue;
    }

    const nestedIndent = getLeadingSpaceCount(lines[probe]);
    const nested = parseIndentedObject(lines, probe, nestedIndent, `${context}.${key}`);
    value[key] = nested.value;
    index = nested.nextIndex;
  }

  return { value, nextIndex: index };
}

function parseJsonLikeValue(rawValue: string, context: string): unknown {
  if (rawValue === 'null' || rawValue === '~') {
    return null;
  }
  if (rawValue === 'true') {
    return true;
  }
  if (rawValue === 'false') {
    return false;
  }
  if (/^-?\d+$/.test(rawValue)) {
    return Number.parseInt(rawValue, 10);
  }
  if ((rawValue.startsWith('{') && rawValue.endsWith('}')) || (rawValue.startsWith('[') && rawValue.endsWith(']'))) {
    try {
      return cloneJsonValue(JSON.parse(rawValue) as unknown, context);
    } catch {
      throw new LorebookAdapterError(`Invalid JSON value for ${context}: ${rawValue}`);
    }
  }

  return parseFrontmatterString(rawValue);
}

function formatFrontmatterString(value: string): string {
  if (value === '') {
    return '""';
  }
  if (/^\s|\s$|:|"|\{|\}|\[|\]/.test(value)) {
    return JSON.stringify(value);
  }
  return value;
}

function parseLorebookMode(value: string): LorebookMode {
  if (!LOREBOOK_MODES.includes(value as LorebookMode)) {
    throw new LorebookAdapterError(
      `Unsupported lorebook mode "${value}". Expected one of: ${LOREBOOK_MODES.join(', ')}.`
    );
  }
  return value as LorebookMode;
}

function normalizeLorebookContent(entry: unknown, context: string): LorebookContent {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new LorebookAdapterError(`Expected ${context} to be an object.`);
  }

  const record = entry as Record<string, unknown>;
  rejectForbiddenEnabledField(record, context);
  rejectUnknownKeys(
    record,
    [
      'name',
      'comment',
      'mode',
      'constant',
      'selective',
      'insertion_order',
      'case_sensitive',
      'use_regex',
      'keys',
      'content',
      'secondary_keys',
      'folder',
      'extensions',
      'book_version',
      'activation_percent',
      'id',
    ],
    context
  );

  const normalized: LorebookContent = {
    name: requireString(record.name, `${context}.name`),
    comment: requireString(record.comment, `${context}.comment`),
    mode: parseLorebookMode(requireString(record.mode, `${context}.mode`)),
    constant: requireBoolean(record.constant, `${context}.constant`),
    selective: requireBoolean(record.selective, `${context}.selective`),
    insertion_order: requireInteger(record.insertion_order, `${context}.insertion_order`),
    case_sensitive: requireBoolean(record.case_sensitive, `${context}.case_sensitive`),
    use_regex: requireBoolean(record.use_regex, `${context}.use_regex`),
    keys: normalizeKeyArray(record.keys, `${context}.keys`),
    content: requireString(record.content, `${context}.content`),
  };

  if (record.secondary_keys !== undefined) {
    normalized.secondary_keys = normalizeKeyArray(record.secondary_keys, `${context}.secondary_keys`);
  }
  if (record.folder !== undefined) {
    normalized.folder = normalizeOptionalFolder(record.folder, `${context}.folder`);
  }
  if (record.extensions !== undefined) {
    normalized.extensions = cloneJsonObject(requireObject(record.extensions, `${context}.extensions`), `${context}.extensions`);
  }
  if (record.book_version !== undefined) {
    normalized.book_version = requireInteger(record.book_version, `${context}.book_version`);
  }
  if (record.activation_percent !== undefined) {
    normalized.activation_percent = requireInteger(
      record.activation_percent,
      `${context}.activation_percent`
    );
  }
  if (record.id !== undefined) {
    normalized.id = requireString(record.id, `${context}.id`);
  }

  return normalized;
}

function normalizeLorebookFolderRecord(entry: unknown, context: string): LorebookFolderRecord {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new LorebookAdapterError(`Expected ${context} to be an object.`);
  }

  const record = entry as Record<string, unknown>;
  rejectForbiddenEnabledField(record, context);
  rejectUnknownKeys(
    record,
    [
      'name',
      'comment',
      'mode',
      'constant',
      'selective',
      'insertion_order',
      'case_sensitive',
      'use_regex',
      'folder',
      'extensions',
      'book_version',
      'activation_percent',
      'id',
    ],
    context
  );

  const normalized: LorebookFolderRecord = {
    name: requireString(record.name, `${context}.name`),
    comment: requireString(record.comment, `${context}.comment`),
    mode: parseFolderMode(record.mode, `${context}.mode`),
    constant: requireBoolean(record.constant, `${context}.constant`),
    selective: requireBoolean(record.selective, `${context}.selective`),
    insertion_order: requireInteger(record.insertion_order, `${context}.insertion_order`),
    case_sensitive: requireBoolean(record.case_sensitive, `${context}.case_sensitive`),
    use_regex: requireBoolean(record.use_regex, `${context}.use_regex`),
  };

  if (record.folder !== undefined) {
    normalized.folder = normalizeOptionalFolder(record.folder, `${context}.folder`);
  }
  if (record.extensions !== undefined) {
    normalized.extensions = cloneJsonObject(requireObject(record.extensions, `${context}.extensions`), `${context}.extensions`);
  }
  if (record.book_version !== undefined) {
    normalized.book_version = requireInteger(record.book_version, `${context}.book_version`);
  }
  if (record.activation_percent !== undefined) {
    normalized.activation_percent = requireInteger(
      record.activation_percent,
      `${context}.activation_percent`
    );
  }
  if (record.id !== undefined) {
    normalized.id = requireString(record.id, `${context}.id`);
  }

  return normalized;
}

function normalizeLorebookFolders(folders: LorebookFolders, context: string): LorebookFolders {
  if (!folders || typeof folders !== 'object' || Array.isArray(folders)) {
    throw new LorebookAdapterError(`Expected ${context} to be an object keyed by folder ids.`);
  }

  const normalized: LorebookFolders = {};
  for (const [folderKey, record] of Object.entries(folders)) {
    if (!folderKey.trim()) {
      throw new LorebookAdapterError(`${context} keys must be non-empty strings.`);
    }
    normalized[folderKey] = normalizeLorebookFolderRecord(record, `${context}.${folderKey}`);
  }
  return normalized;
}

function fromCharxLorebookEntry(entry: unknown, context: string): LorebookContent {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new LorebookAdapterError(`Expected ${context} to be an object.`);
  }

  const record = entry as Record<string, unknown>;
  const extensions = cloneJsonObject(requireObject(record.extensions ?? {}, `${context}.extensions`), `${context}.extensions`);
  const bookVersion = parseOptionalInteger(extensions.risu_bookVersion, `${context}.extensions.risu_bookVersion`);
  const activationPercent = parseOptionalInteger(
    extensions.risu_activationPercent,
    `${context}.extensions.risu_activationPercent`
  );
  const filteredExtensions = filterExtensions(extensions);

  return normalizeLorebookContent(
    {
      name: requireString(record.name, `${context}.name`),
      comment: requireString(record.comment, `${context}.comment`),
      mode: parseLorebookMode(String(record.mode ?? 'normal')),
      constant: Boolean(record.constant ?? false),
      selective: Boolean(record.selective ?? false),
      insertion_order: requireInteger(record.insertion_order ?? 0, `${context}.insertion_order`),
      case_sensitive: requireBoolean(record.case_sensitive ?? false, `${context}.case_sensitive`),
      use_regex: requireBoolean(record.use_regex ?? false, `${context}.use_regex`),
      keys: normalizeKeyArray(record.keys ?? [], `${context}.keys`),
      ...(record.secondary_keys !== undefined
        ? { secondary_keys: normalizeKeyArray(record.secondary_keys, `${context}.secondary_keys`) }
        : {}),
      content: requireString(record.content ?? '', `${context}.content`),
      ...(record.folder !== undefined ? { folder: normalizeOptionalFolder(record.folder, `${context}.folder`) } : {}),
      ...(Object.keys(filteredExtensions).length > 0 ? { extensions: filteredExtensions } : {}),
      ...(bookVersion !== undefined ? { book_version: bookVersion } : {}),
      ...(activationPercent !== undefined ? { activation_percent: activationPercent } : {}),
    },
    context
  );
}

function fromModuleLorebookEntry(entry: unknown, context: string): LorebookContent {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new LorebookAdapterError(`Expected ${context} to be an object.`);
  }

  const record = entry as Record<string, unknown>;
  const extentions = cloneJsonObject(
    requireObject(record.extentions ?? {}, `${context}.extentions`),
    `${context}.extentions`
  );
  const filteredExtensions = filterExtensions(extentions);

  return normalizeLorebookContent(
    {
      name: requireString(record.comment, `${context}.comment`),
      comment: requireString(record.comment, `${context}.comment`),
      mode: parseLorebookMode(String(record.mode ?? 'normal')),
      constant: Boolean(record.alwaysActive ?? false),
      selective: Boolean(record.selective ?? false),
      insertion_order: requireInteger(record.insertorder ?? 0, `${context}.insertorder`),
      case_sensitive: requireBoolean(extentions.risu_case_sensitive ?? false, `${context}.extentions.risu_case_sensitive`),
      use_regex: requireBoolean(record.useRegex ?? false, `${context}.useRegex`),
      keys: splitDelimitedKeys(record.key, `${context}.key`),
      ...(String(record.secondkey ?? '').trim() !== ''
        ? { secondary_keys: splitDelimitedKeys(record.secondkey, `${context}.secondkey`) }
        : {}),
      content: requireString(record.content ?? '', `${context}.content`),
      ...(record.folder !== undefined ? { folder: normalizeOptionalFolder(record.folder, `${context}.folder`) } : {}),
      ...(Object.keys(filteredExtensions).length > 0 ? { extensions: filteredExtensions } : {}),
      ...(record.bookVersion !== undefined
        ? { book_version: parseOptionalInteger(record.bookVersion, `${context}.bookVersion`) }
        : {}),
      ...(record.activationPercent !== undefined
        ? { activation_percent: parseOptionalInteger(record.activationPercent, `${context}.activationPercent`) }
        : {}),
      ...(record.id !== undefined ? { id: requireString(record.id, `${context}.id`) } : {}),
    },
    context
  );
}

function toCharxLorebookEntry(entry: LorebookContent, context: string): UpstreamCharxLorebookEntry {
  const normalized = normalizeLorebookContent(entry, context);
  const extensions = {
    ...(normalized.extensions ? (sortJsonValue(normalized.extensions) as Record<string, unknown>) : {}),
    risu_case_sensitive: normalized.case_sensitive,
    ...(normalized.book_version !== undefined ? { risu_bookVersion: normalized.book_version } : {}),
    ...(normalized.activation_percent !== undefined ? { risu_activationPercent: normalized.activation_percent } : {}),
  };

  return {
    keys: normalized.keys,
    ...(normalized.selective && normalized.secondary_keys && normalized.secondary_keys.length > 0
      ? { secondary_keys: normalized.secondary_keys }
      : {}),
    content: normalized.content,
    extensions,
    enabled: true,
    insertion_order: normalized.insertion_order,
    constant: normalized.constant,
    selective: normalized.selective,
    name: normalized.name,
    comment: normalized.comment,
    case_sensitive: normalized.case_sensitive,
    use_regex: normalized.use_regex,
    mode: normalized.mode,
    ...(normalized.folder ? { folder: normalized.folder } : {}),
  };
}

function toModuleLorebookEntry(entry: LorebookContent, context: string): UpstreamModuleLorebookEntry {
  const normalized = normalizeLorebookContent(entry, context);
  const extentions = {
    ...(normalized.extensions ? (sortJsonValue(normalized.extensions) as Record<string, unknown>) : {}),
    risu_case_sensitive: normalized.case_sensitive,
  };

  return {
    key: normalized.keys.join(', '),
    secondkey: normalized.secondary_keys?.join(', ') ?? '',
    comment: normalized.comment,
    content: normalized.content,
    mode: normalized.mode,
    alwaysActive: normalized.constant,
    selective: normalized.selective,
    insertorder: normalized.insertion_order,
    useRegex: normalized.use_regex,
    extentions,
    ...(normalized.folder ? { folder: normalized.folder } : {}),
    ...(normalized.book_version !== undefined ? { bookVersion: normalized.book_version } : {}),
    ...(normalized.activation_percent !== undefined
      ? { activationPercent: normalized.activation_percent }
      : {}),
    ...(normalized.id !== undefined ? { id: normalized.id } : {}),
  };
}

function buildFolderRecordFromLorebook(content: LorebookContent): LorebookFolderRecord {
  return {
    name: content.name,
    comment: content.comment,
    mode: 'folder',
    constant: content.constant,
    selective: content.selective,
    insertion_order: content.insertion_order,
    case_sensitive: content.case_sensitive,
    use_regex: content.use_regex,
    ...(content.folder !== undefined ? { folder: content.folder } : {}),
    ...(content.extensions !== undefined ? { extensions: content.extensions } : {}),
    ...(content.book_version !== undefined ? { book_version: content.book_version } : {}),
    ...(content.activation_percent !== undefined
      ? { activation_percent: content.activation_percent }
      : {}),
    ...(content.id !== undefined ? { id: content.id } : {}),
  };
}

function inflateFolderRecord(folderKey: string, record: LorebookFolderRecord): LorebookContent {
  return {
    name: record.name,
    comment: record.comment,
    mode: 'folder',
    constant: record.constant,
    selective: record.selective,
    insertion_order: record.insertion_order,
    case_sensitive: record.case_sensitive,
    use_regex: record.use_regex,
    ...(record.folder !== undefined ? { folder: record.folder } : {}),
    ...(record.extensions !== undefined ? { extensions: record.extensions } : {}),
    ...(record.book_version !== undefined ? { book_version: record.book_version } : {}),
    ...(record.activation_percent !== undefined ? { activation_percent: record.activation_percent } : {}),
    ...(record.id !== undefined ? { id: record.id } : {}),
    keys: [folderKey],
    content: '',
  };
}

function buildSerializableFolderRecord(record: LorebookFolderRecord): Record<string, unknown> {
  return {
    name: record.name,
    comment: record.comment,
    mode: record.mode,
    constant: record.constant,
    selective: record.selective,
    insertion_order: record.insertion_order,
    case_sensitive: record.case_sensitive,
    use_regex: record.use_regex,
    ...(record.folder !== undefined ? { folder: record.folder } : {}),
    ...(record.extensions !== undefined ? { extensions: sortJsonValue(record.extensions) } : {}),
    ...(record.book_version !== undefined ? { book_version: record.book_version } : {}),
    ...(record.activation_percent !== undefined ? { activation_percent: record.activation_percent } : {}),
    ...(record.id !== undefined ? { id: record.id } : {}),
  };
}

function filterExtensions(extensions: Record<string, unknown>): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(extensions)) {
    if (PROMOTED_EXTENSION_KEYS.has(key)) {
      continue;
    }
    filtered[key] = value;
  }
  return filtered;
}

function parseFolderMode(value: unknown, context: string): 'folder' {
  if (value !== 'folder') {
    throw new LorebookAdapterError(`Expected ${context} to be "folder".`);
  }
  return 'folder';
}

function splitDelimitedKeys(value: unknown, context: string): string[] {
  return requireString(value ?? '', context)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeKeyArray(value: unknown, context: string): string[] {
  if (!Array.isArray(value)) {
    throw new LorebookAdapterError(`Expected ${context} to be an array.`);
  }
  return value.map((entry) => requireString(entry, `${context}[]`).trim()).filter(Boolean);
}

function normalizeOptionalFolder(value: unknown, context: string): string | null {
  if (value === null) {
    return null;
  }
  const folder = requireString(value, context);
  return folder === '' ? null : folder;
}

function normalizeLorebookOrderEntry(value: unknown, context: string): string {
  const relativePath = requireString(value, context).replace(/\\/g, '/').replace(/^\.\//, '');
  if (!relativePath || relativePath.startsWith('/') || relativePath.includes('..')) {
    throw new LorebookAdapterError(`Expected ${context} to be a safe relative lorebook path.`);
  }
  // Reject marker files
  if (relativePath === '_order.json' || relativePath === '_folders.json') {
    throw new LorebookAdapterError(`Marker file ${relativePath} cannot appear in lorebook order.`);
  }
  // Accept folder paths (no extension) or .risulorebook files
  const isFolder = !relativePath.includes('.') || relativePath.endsWith('/');
  const isLorebookFile = relativePath.endsWith('.risulorebook');
  if (!isFolder && !isLorebookFile) {
    throw new LorebookAdapterError(`Expected ${context} to be a folder path or end with .risulorebook.`);
  }
  return relativePath;
}

/** @deprecated Use normalizeLorebookOrderEntry which accepts both folders and files */
function normalizeLorebookRelativePath(value: unknown, context: string): string {
  return normalizeLorebookOrderEntry(value, context);
}

function rejectForbiddenEnabledField(record: Record<string, unknown>, context: string): void {
  if ('enabled' in record) {
    throw new LorebookAdapterError(`${context} must not contain an enabled field.`);
  }
}

function rejectUnknownKeys(record: Record<string, unknown>, allowedKeys: readonly string[], context: string): void {
  const allowedSet = new Set(allowedKeys);
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) {
      throw new LorebookAdapterError(`Unsupported field "${key}" in ${context}.`);
    }
  }
}

function requireString(value: unknown, context: string): string {
  if (typeof value !== 'string') {
    throw new LorebookAdapterError(`Expected ${context} to be a string.`);
  }
  return value;
}

function requireBoolean(value: unknown, context: string): boolean {
  if (typeof value !== 'boolean') {
    throw new LorebookAdapterError(`Expected ${context} to be a boolean.`);
  }
  return value;
}

function requireInteger(value: unknown, context: string): number {
  if (!Number.isInteger(value)) {
    throw new LorebookAdapterError(`Expected ${context} to be an integer.`);
  }
  return value as number;
}

function requireObject(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new LorebookAdapterError(`Expected ${context} to be an object.`);
  }
  return value as Record<string, unknown>;
}

function parseOptionalInteger(value: unknown, context: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return undefined;
    }
    if (!/^-?\d+$/.test(trimmed)) {
      throw new LorebookAdapterError(`Expected ${context} to be an integer.`);
    }
    return Number.parseInt(trimmed, 10);
  }
  return requireInteger(value, context);
}

function cloneJsonObject(value: Record<string, unknown>, context: string): Record<string, unknown> {
  return cloneJsonValue(value, context) as Record<string, unknown>;
}

function cloneJsonValue(value: unknown, context: string): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => cloneJsonValue(entry, `${context}[${index}]`));
  }
  if (value && typeof value === 'object') {
    const cloned: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      if (nestedValue === undefined) {
        continue;
      }
      cloned[key] = cloneJsonValue(nestedValue, `${context}.${key}`);
    }
    return cloned;
  }

  throw new LorebookAdapterError(`Expected ${context} to contain only JSON-compatible values.`);
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortJsonValue(entry));
  }
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort((left, right) => left.localeCompare(right))) {
      sorted[key] = sortJsonValue((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

function dedupePreservingOrder(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    deduped.push(value);
  }
  return deduped;
}

function getLeadingSpaceCount(value: string): number {
  return value.length - value.trimStart().length;
}
