/**
 * 캐릭터 manifest, prose, HTML, 변수 artifact 추출 phase 모음.
 * @file packages/core/src/cli/extract/character/phases/character-fields.ts
 */

import path from 'node:path';
import { sanitizeFilename } from '@/domain';
import { writeJson, writeText, ensureDir } from '@/node';
import {
  extractVariablesFromCharx,
  serializeVariableContent,
} from '@/domain/custom-extension/extensions/variable';
import {
  extractHtmlFromCharx,
  serializeHtmlContent,
} from '@/domain/custom-extension/extensions/html';
import { toPosix } from '@/domain/lorebook/folders';
import type { ExtractedAssetManifest } from './types';

const CHARACTER_PROSE_FIELDS: Array<[string, (data: any, risuai: any) => string]> = [
  ['description', (data) => data.description || ''],
  ['first_mes', (data) => data.first_mes || ''],
  ['system_prompt', (data) => data.system_prompt || ''],
  ['replace_global_note', (data) => data.replaceGlobalNote || ''],
  ['creator_notes', (data) => data.creator_notes || ''],
  ['additional_text', (_data, risuai) => risuai.additionalText || ''],
];

const CANONICAL_RISUAI_KEYS = new Set([
  'additionalText',
  'backgroundHTML',
  'customScripts',
  'defaultVariables',
  'lowLevelAccess',
  'triggerscript',
  'utilityBot',
  '_moduleLorebook',
]);

/**
 * isPlainRecord 함수.
 * JSON object record 여부를 확인함.
 *
 * @param value - 검사할 값
 * @returns plain object record이면 true
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * buildCharacterExtensionsSidecar 함수.
 * canonical artifact가 직접 소유하지 않는 extension namespace를 보존 sidecar로 분리함.
 *
 * @param extensions - upstream data.extensions 객체
 * @returns pack 단계에서 다시 병합할 sidecar payload 또는 null
 */
function buildCharacterExtensionsSidecar(extensions: unknown): Record<string, unknown> | null {
  if (!isPlainRecord(extensions)) return null;

  const sidecar: Record<string, unknown> = {};
  for (const [namespace, namespaceValue] of Object.entries(extensions)) {
    if (namespace !== 'risuai') {
      sidecar[namespace] = namespaceValue;
      continue;
    }

    if (!isPlainRecord(namespaceValue)) continue;
    const unknownRisuaiEntries = Object.entries(namespaceValue).filter(
      ([key]) => !CANONICAL_RISUAI_KEYS.has(key),
    );
    if (unknownRisuaiEntries.length > 0) {
      sidecar.risuai = Object.fromEntries(unknownRisuaiEntries);
    }
  }

  return Object.keys(sidecar).length > 0 ? sidecar : null;
}

/** normalizeStringArray 함수.
 * unknown 배열을 빈 문자열 없는 string 배열로 정규화함.
 *
 * @param value - 정규화할 upstream 값
 * @returns 문자열만 남긴 배열
 */
function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

/** selectCharacterImagePath 함수.
 * 추출된 icon asset 중 `.risuchar.image`로 쓸 대표 썸네일 경로를 고름.
 *
 * @param manifest - assets/manifest.json에 기록된 asset 추출 결과
 * @returns 워크스페이스 상대 이미지 경로 또는 null
 */
function selectCharacterImagePath(manifest: ExtractedAssetManifest | null): string | null {
  if (!manifest || !Array.isArray(manifest.assets)) return null;

  const extractedIcons = manifest.assets.filter(
    (entry) =>
      entry.type === 'icon' &&
      entry.status === 'extracted' &&
      typeof entry.extracted_path === 'string',
  );
  const mainIcon = extractedIcons.find((entry) => entry.name === 'main');
  const selected = mainIcon ?? extractedIcons[0];
  if (!selected || typeof selected.extracted_path !== 'string') return null;
  return `assets/${toPosix(selected.extracted_path)}`;
}

/**
 * buildCharacterManifest 함수.
 * 캐릭터 루트 메타데이터 소유자인 `.risuchar` 페이로드를 구성함.
 *
 * @param data - charx.data 객체
 * @param risuai - data.extensions.risuai 객체
 * @param assetManifest - Phase 5에서 추출한 asset manifest 데이터
 * @returns `.risuchar`에 기록할 canonical metadata 객체
 */
function buildCharacterManifest(
  data: any,
  risuai: any,
  assetManifest: ExtractedAssetManifest | null,
): Record<string, unknown> {
  return {
    $schema: 'https://risuai-workbench.dev/schemas/risuchar.schema.json',
    kind: 'risu.character',
    schemaVersion: 1,
    id: data.character_id || data.id || '',
    name: data.name || '',
    creator: data.creator || '',
    characterVersion: data.character_version || '',
    createdAt: data.creation_date || null,
    modifiedAt: data.modification_date || null,
    sourceFormat: 'charx',
    image: selectCharacterImagePath(assetManifest),
    tags: normalizeStringArray(data.tags),
    flags: {
      utilityBot: risuai.utilityBot ?? false,
      lowLevelAccess: risuai.lowLevelAccess ?? false,
    },
  };
}

export function phase6_extractBackgroundHTML(charx: any, outputDir: string): number {
  console.log('\n  🌐 Phase 6: BackgroundHTML 추출 (canonical)');

  const htmlDir = path.join(outputDir, 'html');
  ensureDir(htmlDir);

  // Extract canonical HTML from charx using verified adapter
  const htmlContent = extractHtmlFromCharx(charx, 'charx');
  if (!htmlContent) {
    console.log('     (backgroundHTML 없음)');
    return 0;
  }

  // Write as canonical .risuhtml file
  const fileName = path.join(htmlDir, 'background.risuhtml');
  writeText(fileName, serializeHtmlContent(htmlContent));

  console.log(`     ✅ html/background.risuhtml → ${path.relative('.', htmlDir)}/`);
  return 1;
}

export function phase7_extractVariables(charx: any, outputDir: string): number {
  console.log('\n  📋 Phase 7: DefaultVariables 추출 (canonical)');

  const variablesDir = path.join(outputDir, 'variables');
  ensureDir(variablesDir);

  // Extract canonical variables from charx using verified adapter
  const variables = extractVariablesFromCharx(charx, 'charx');
  if (!variables) {
    console.log('     (defaultVariables 없음)');
    return 0;
  }

  // Write as canonical .risuvar file using target-name-based naming
  const charxName = charx.data?.name || 'character';
  const sanitizedName = sanitizeFilename(charxName, 'character');
  const fileName = path.join(variablesDir, `${sanitizedName}.risuvar`);
  writeText(fileName, serializeVariableContent(variables));

  const count = Object.keys(variables).length;
  console.log(
    `     ✅ variables/${sanitizedName}.risuvar (${count}개 변수) → ${path.relative('.', variablesDir)}/`,
  );
  return count;
}

export function phase8_extractCharacterFields(
  charx: any,
  outputDir: string,
  assetManifest: ExtractedAssetManifest | null = null,
): number {
  console.log('\n  🧾 Phase 8: Character Card 추출 (canonical)');

  const data = charx.data || {};
  const risuai = data.extensions?.risuai || {};
  const characterDir = path.join(outputDir, 'character');
  const alternateGreetingsDir = path.join(characterDir, 'alternate_greetings');
  ensureDir(characterDir);

  let fileCount = 0;

  writeJson(path.join(outputDir, '.risuchar'), buildCharacterManifest(data, risuai, assetManifest));
  fileCount += 1;

  const extensionSidecar = buildCharacterExtensionsSidecar(data.extensions);
  if (extensionSidecar) {
    writeJson(path.join(characterDir, 'extensions.json'), extensionSidecar);
    fileCount += 1;
  }

  for (const [fieldName, getContent] of CHARACTER_PROSE_FIELDS) {
    writeText(path.join(characterDir, `${fieldName}.risutext`), getContent(data, risuai));
    fileCount += 1;
  }

  const greetings = Array.isArray(data.alternate_greetings) ? data.alternate_greetings : [];
  const greetingOrder: string[] = [];
  for (let i = 0; i < greetings.length; i += 1) {
    const filename = `greeting-${String(i + 1).padStart(3, '0')}.risutext`;
    greetingOrder.push(filename);
    writeText(path.join(alternateGreetingsDir, filename), String(greetings[i] ?? ''));
    fileCount += 1;
  }

  writeJson(path.join(alternateGreetingsDir, '_order.json'), greetingOrder);
  fileCount += 1;

  // Note: .risutoggle is NOT emitted for charx per spec
  // .risutoggle is module/preset only

  console.log(
    `     risutext: ${CHARACTER_PROSE_FIELDS.length}개, greetings: ${greetings.length}개, manifest: .risuchar`,
  );
  console.log(`     ✅ ${fileCount}개 파일 → ${path.relative('.', characterDir)}/`);
  return fileCount;
}
