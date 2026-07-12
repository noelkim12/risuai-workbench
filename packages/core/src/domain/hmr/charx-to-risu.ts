import type { CharxV3Envelope } from '../charx/blank-char';

/**
 * card v3 → RisuAI 네이티브 character 정의 변환.
 * risuai-pork characterCards.ts의 v3 import 매핑과 convertCharbook을 미러링한다.
 * SillyTavern extension 마이그레이션 분기는 HMR 입력이 워크벤치 pack 산출물이므로 생략한다.
 */

interface CardBookEntry {
  readonly keys?: readonly string[];
  readonly secondary_keys?: readonly string[];
  readonly insertion_order?: number;
  readonly name?: string;
  readonly comment?: string;
  readonly content?: string;
  readonly mode?: string;
  readonly constant?: boolean;
  readonly selective?: boolean;
  readonly use_regex?: boolean;
  readonly case_sensitive?: boolean;
  readonly folder?: string;
  readonly extensions?: Record<string, unknown>;
}

interface CharxAssetRef {
  readonly type?: string;
  readonly name?: string;
  readonly ext?: string;
  readonly uri?: string;
}

interface CharbookLike {
  readonly entries?: readonly unknown[];
  readonly recursive_scanning?: boolean;
  readonly scan_depth?: number;
  readonly token_budget?: number;
  readonly extensions?: Record<string, unknown>;
}

interface HmrCharxDataExtras {
  readonly assets?: readonly unknown[];
  readonly mes_example?: string;
  readonly character_book?: CharbookLike;
}

type RisuExtension = CharxV3Envelope['data']['extensions']['risuai'] & {
  readonly backgroundHTML?: unknown;
  readonly defaultVariables?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toStringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function toCardBookEntry(value: unknown): CardBookEntry | null {
  if (!isRecord(value)) return null;
  return {
    keys: toStringArray(value.keys),
    secondary_keys: toStringArray(value.secondary_keys),
    insertion_order: typeof value.insertion_order === 'number' ? value.insertion_order : undefined,
    name: typeof value.name === 'string' ? value.name : undefined,
    comment: typeof value.comment === 'string' ? value.comment : undefined,
    content: typeof value.content === 'string' ? value.content : undefined,
    mode: typeof value.mode === 'string' ? value.mode : undefined,
    constant: typeof value.constant === 'boolean' ? value.constant : undefined,
    selective: typeof value.selective === 'boolean' ? value.selective : undefined,
    use_regex: typeof value.use_regex === 'boolean' ? value.use_regex : undefined,
    case_sensitive: typeof value.case_sensitive === 'boolean' ? value.case_sensitive : undefined,
    folder: typeof value.folder === 'string' ? value.folder : undefined,
    extensions: isRecord(value.extensions) ? value.extensions : undefined,
  };
}

function toAssetRef(value: unknown): CharxAssetRef | null {
  if (!isRecord(value)) return null;
  return {
    type: typeof value.type === 'string' ? value.type : undefined,
    name: typeof value.name === 'string' ? value.name : undefined,
    ext: typeof value.ext === 'string' ? value.ext : undefined,
    uri: typeof value.uri === 'string' ? value.uri : undefined,
  };
}

/**
 * convertCharbookEntriesToGlobalLore 함수.
 * card v3 character_book entries를 risu loreBook 배열로 변환한다.
 */
export function convertCharbookEntriesToGlobalLore(entries: readonly unknown[]): Record<string, unknown>[] {
  const lorebook: Record<string, unknown>[] = [];
  for (const raw of entries) {
    const book = toCardBookEntry(raw);
    if (!book) continue;
    const extensions = { ...(book.extensions ?? {}) };
    lorebook.push({
      key: (book.keys ?? []).join(', '),
      secondkey: (book.secondary_keys ?? []).join(', '),
      insertorder: book.insertion_order ?? 0,
      comment: book.name ?? book.comment ?? '',
      content: book.content ?? '',
      mode: book.mode ?? 'normal',
      alwaysActive: book.constant ?? false,
      selective: book.selective ?? false,
      extentions: { ...extensions, risu_case_sensitive: book.case_sensitive ?? false },
      activationPercent: extensions.risu_activationPercent,
      loreCache: extensions.risu_loreCache ?? null,
      useRegex: book.use_regex ?? false,
      folder: book.folder,
    });
  }
  return lorebook;
}

/**
 * convertCharxV3ToRisuDefinition 함수.
 * card v3 envelope를 HMR가 소유하는 정의 필드만 담은 risu-native 부분 객체로 변환한다.
 */
export function convertCharxV3ToRisuDefinition(
  envelope: CharxV3Envelope,
  assetPlaceholders: ReadonlyMap<number, string>,
): Record<string, unknown> {
  const data = envelope.data as CharxV3Envelope['data'] & HmrCharxDataExtras;
  const risuExt = data.extensions.risuai as RisuExtension;
  let image: string | undefined;
  const emotionImages: Array<[string, string]> = [];
  const additionalAssets: Array<[string, string, string]> = [];
  const ccAssets: Array<{ readonly type: string; readonly uri: string; readonly name: string; readonly ext: string }> = [];

  (data.assets ?? []).forEach((rawAsset, index) => {
    const asset = toAssetRef(rawAsset);
    const placeholder = assetPlaceholders.get(index);
    if (!asset || !placeholder) return;
    const fileName = asset.name ?? `asset_${index}`;
    if (asset.type === 'emotion') {
      emotionImages.push([fileName, placeholder]);
    } else if (asset.type === 'x-risu-asset') {
      additionalAssets.push([fileName, placeholder, asset.ext ?? 'unknown']);
    } else if (asset.type === 'icon' && asset.name === 'main') {
      image = placeholder;
    } else {
      ccAssets.push({ type: asset.type ?? 'asset', uri: placeholder, name: fileName, ext: asset.ext ?? 'unknown' });
    }
  });

  const charbook = data.character_book;
  const definition: Record<string, unknown> = {
    name: data.name ?? '',
    desc: data.description ?? '',
    firstMessage: data.first_mes ?? '',
    exampleMessage: data.mes_example ?? '',
    creatorNotes: data.creator_notes ?? '',
    systemPrompt: data.system_prompt ?? '',
    replaceGlobalNote: data.post_history_instructions ?? '',
    alternateGreetings: data.alternate_greetings ?? [],
    tags: data.tags ?? [],
    creator: data.creator ?? '',
    characterVersion: `${data.character_version ?? ''}`,
    personality: data.personality ?? '',
    scenario: data.scenario ?? '',
    globalLore: charbook?.entries ? convertCharbookEntriesToGlobalLore(charbook.entries) : [],
    customscript: risuExt.customScripts ?? [],
    triggerscript: risuExt.triggerscript ?? [],
    additionalText: risuExt.additionalText ?? '',
    utilityBot: risuExt.utilityBot ?? false,
    emotionImages,
    additionalAssets,
    ccAssets,
  };

  if (image !== undefined) definition.image = image;
  if (risuExt.backgroundHTML !== undefined) definition.backgroundHTML = risuExt.backgroundHTML;
  if (risuExt.defaultVariables !== undefined) definition.defaultVariables = risuExt.defaultVariables;
  if (
    charbook &&
    charbook.recursive_scanning !== undefined &&
    charbook.scan_depth !== undefined &&
    charbook.token_budget !== undefined
  ) {
    definition.loreSettings = {
      tokenBudget: charbook.token_budget,
      scanDepth: charbook.scan_depth,
      recursiveScanning: charbook.recursive_scanning,
      fullWordMatching: charbook.extensions?.risu_fullWordMatching ?? false,
    };
  }

  return definition;
}
