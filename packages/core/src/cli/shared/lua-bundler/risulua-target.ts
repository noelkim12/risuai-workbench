import fs from 'node:fs';
import path from 'node:path';

import { sanitizeFilename } from '../../../utils/filenames';
import { RISUMODULE_FILENAME, RISUMODULE_KIND, readRisumoduleManifest } from '../risumodule';
import type { RisuLuaMode } from './risulua-mode';

/**
 * RisuLua 캐릭터 마커 파일 이름.
 * 캐릭터 번들 루트 디렉토리에 위치함.
 */
export const RISUCHAR_FILENAME = '.risuchar';

/**
 * RisuLua 캐릭터 마커 종류 상수.
 */
export const RISUCHAR_KIND = 'risu.character';

/**
 * 레거시 메타데이터 마커 종류 상수.
 * 하위 호환성 유지 목적.
 */
export const RISUCHAR_METADATA_KIND = 'risu.character.metadata';

/**
 * RisuLua 번들 마커 종류 유니온 타입.
 * 캐릭터, 캐릭터 메타데이터, 모듈 중 하나.
 */
export type RisuLuaBundleMarkerKind =
  | typeof RISUCHAR_KIND
  | typeof RISUCHAR_METADATA_KIND
  | typeof RISUMODULE_KIND;

/**
 * .risuchar 파일 메타데이터 구조.
 * 캐릭터 기본 정보 및 속성 포함.
 */
export interface RisucharManifest {
  kind: string;
  schemaVersion: number;
  id: string;
  name: string;
  creator?: string;
  characterVersion?: string;
  createdAt?: string | null;
  modifiedAt?: string | null;
  sourceFormat?: string;
  image?: string | null;
  tags?: string[];
  flags?: Record<string, unknown>;
}

/**
 * 발견된 RisuLua 번들 타겟 정보 인터페이스.
 * 빌드에 필요한 경로 및 설정 포함.
 */
export interface RisuLuaBundleTarget {
  rootDir: string;
  markerPath: string;
  markerKind: RisuLuaBundleMarkerKind;
  rawTargetName: string;
  targetName: string;
  mode: RisuLuaMode;
  entryPath: string;
  entryRelativePath: string;
  sourceRoot: string;
  distPath: string;
  distRelativePath: string;
}

/**
 * RisuLua 번들 타겟 검색 옵션.
 */
export interface DiscoverRisuLuaBundleTargetOptions {
  rootDir: string;
  mode?: RisuLuaMode | null;
}

interface TargetMetadata {
  markerPath: string;
  markerKind: RisuLuaBundleMarkerKind;
  rawTargetName: string;
  fallbackTargetName: string;
}

/**
 * 지정된 디렉토리에서 RisuLua 번들 타겟 검색.
 * .risuchar 또는 .risumodule 파일 기반으로 타겟 정보 생성.
 */
export function discoverRisuLuaBundleTarget(
  options: DiscoverRisuLuaBundleTargetOptions,
): RisuLuaBundleTarget {
  const rootDir = path.resolve(options.rootDir);
  const metadata = readTargetMetadata(rootDir);
  const targetName = sanitizeFilename(metadata.rawTargetName, metadata.fallbackTargetName);
  const sourceRoot = path.join(rootDir, 'lua');
  const mode = resolveRisuLuaBundleMode({
    explicitMode: options.mode ?? null,
    mainPath: path.join(sourceRoot, 'main.risulua'),
  });

  const entryRelativePath = mode === 'modular' ? 'lua/main.risulua' : `lua/${targetName}.risulua`;
  const distRelativePath = `dist/${targetName}.risulua`;

  return {
    rootDir,
    markerPath: metadata.markerPath,
    markerKind: metadata.markerKind,
    rawTargetName: metadata.rawTargetName,
    targetName,
    mode,
    entryPath: path.join(rootDir, ...entryRelativePath.split('/')),
    entryRelativePath,
    sourceRoot,
    distPath: path.join(rootDir, ...distRelativePath.split('/')),
    distRelativePath,
  };
}

/**
 * 지정된 디렉토리에서 .risuchar 파일 읽기 및 메타데이터 파싱.
 * 파일 미존재 시 에러 발생.
 */
export function readRisucharManifest(rootDir: string): RisucharManifest {
  const markerPath = path.join(rootDir, RISUCHAR_FILENAME);
  if (!fs.existsSync(markerPath)) {
    throw new Error(`Missing .risuchar: ${markerPath}`);
  }

  return parseRisucharManifest(fs.readFileSync(markerPath, 'utf-8'), markerPath);
}

/**
 * .risuchar 파일 텍스트 파싱하여 RisucharManifest 객체 변환.
 * JSON 형식 및 필수 필드 검증.
 */
export function parseRisucharManifest(text: string, markerPath: string): RisucharManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Invalid .risuchar JSON: ${markerPath}`);
  }

  if (!isPlainObject(parsed)) {
    throw new Error(`Invalid .risuchar: expected object at ${markerPath}`);
  }

  const obj = parsed as Record<string, unknown>;
  if (obj.kind !== RISUCHAR_KIND) {
    throw new Error(
      `.risuchar kind must be "${RISUCHAR_KIND}", got ${JSON.stringify(obj.kind)} at ${markerPath}`,
    );
  }
  if (typeof obj.schemaVersion !== 'number') {
    throw new Error(`.risuchar schemaVersion must be a number at ${markerPath}`);
  }
  if (typeof obj.id !== 'string') {
    throw new Error(
      `.risuchar id must be a string, got ${JSON.stringify(obj.id)} at ${markerPath}`,
    );
  }
  if (typeof obj.name !== 'string') {
    throw new Error(
      `.risuchar name must be a string, got ${JSON.stringify(obj.name)} at ${markerPath}`,
    );
  }

  const manifest: RisucharManifest = {
    kind: obj.kind,
    schemaVersion: obj.schemaVersion,
    id: obj.id,
    name: obj.name,
  };

  for (const field of ['creator', 'characterVersion', 'sourceFormat'] as const) {
    if (typeof obj[field] === 'string') {
      manifest[field] = obj[field];
    }
  }
  for (const field of ['createdAt', 'modifiedAt', 'image'] as const) {
    const value = obj[field];
    if (typeof value === 'string' || value === null) {
      manifest[field] = value;
    }
  }
  if (Array.isArray(obj.tags) && obj.tags.every((tag) => typeof tag === 'string')) {
    manifest.tags = obj.tags;
  }
  if (isPlainObject(obj.flags)) {
    manifest.flags = obj.flags;
  }

  return manifest;
}

function resolveRisuLuaBundleMode({
  explicitMode,
  mainPath,
}: {
  explicitMode: RisuLuaMode | null;
  mainPath: string;
}): RisuLuaMode {
  const hasMainEntry = fs.existsSync(mainPath) && fs.statSync(mainPath).isFile();

  if (explicitMode === null) {
    return hasMainEntry ? 'modular' : 'classic';
  }

  if (explicitMode === 'classic' && hasMainEntry) {
    throw new Error(
      `RisuLua classic mode cannot be used when lua/main.risulua exists: ${mainPath}`,
    );
  }

  if (explicitMode === 'modular' && !hasMainEntry) {
    throw new Error(`RisuLua modular mode requires lua/main.risulua: ${mainPath}`);
  }

  return explicitMode;
}

function readTargetMetadata(rootDir: string): TargetMetadata {
  const risucharPath = path.join(rootDir, RISUCHAR_FILENAME);
  const risumodulePath = path.join(rootDir, RISUMODULE_FILENAME);
  const hasRisuchar = fs.existsSync(risucharPath);
  const hasRisumodule = fs.existsSync(risumodulePath);

  if (hasRisuchar && hasRisumodule) {
    throw new Error(`Ambiguous RisuLua target: both .risuchar and .risumodule exist in ${rootDir}`);
  }

  if (hasRisuchar) {
    const manifest = readRisucharManifest(rootDir);
    return {
      markerPath: risucharPath,
      markerKind: RISUCHAR_KIND,
      rawTargetName: manifest.name,
      fallbackTargetName: 'character',
    };
  }

  if (hasRisumodule) {
    const manifest = readRisumoduleManifest(rootDir);
    return {
      markerPath: risumodulePath,
      markerKind: RISUMODULE_KIND,
      rawTargetName: manifest.name,
      fallbackTargetName: 'module',
    };
  }

  const legacyMetadataPath = path.join(rootDir, 'character', 'metadata.json');
  if (fs.existsSync(legacyMetadataPath)) {
    const metadata = readJsonObject(legacyMetadataPath, 'metadata.json');
    return {
      markerPath: legacyMetadataPath,
      markerKind: RISUCHAR_METADATA_KIND,
      rawTargetName: typeof metadata.name === 'string' ? metadata.name : 'character',
      fallbackTargetName: 'character',
    };
  }

  throw new Error(
    `Unable to discover RisuLua target marker in ${rootDir}: expected .risuchar or .risumodule`,
  );
}

function readJsonObject(filePath: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    throw new Error(`Invalid ${label} JSON: ${filePath}`);
  }

  if (!isPlainObject(parsed)) {
    throw new Error(`Invalid ${label}: expected object at ${filePath}`);
  }

  return parsed;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
