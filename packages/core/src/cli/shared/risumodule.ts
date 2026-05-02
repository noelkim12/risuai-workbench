/**
 * `.risumodule` 마커 파일 빌더, 파서, 검증기, 모듈 적용 유틸 모음.
 * metadata.json를 읽거나 병합하지 않음; `.risumodule`만이 유일한 마커 소스.
 * @file packages/core/src/cli/shared/risumodule.ts
 */

import fs from 'node:fs';
import path from 'node:path';

export const RISUMODULE_FILENAME = '.risumodule';
export const RISUMODULE_KIND = 'risu.module';
export const RISUMODULE_SCHEMA_URL = 'https://risuai-workbench.dev/schemas/risumodule.schema.json';
export const RISUMODULE_SCHEMA_VERSION = 1;

export type RisumoduleSourceFormat = 'risum' | 'json' | 'scaffold';

export interface RisumoduleManifest {
  $schema: string;
  kind: string;
  schemaVersion: number;
  id: string;
  name: string;
  description: string;
  createdAt: string | null;
  modifiedAt: string | null;
  sourceFormat: RisumoduleSourceFormat;
  namespace?: string;
  cjs?: string;
  lowLevelAccess?: boolean;
  hideIcon?: boolean;
  mcp?: Record<string, unknown>;
}

/**
 * buildExtractRisumoduleManifest.
 * 추출된 모듈 객체로부터 `.risumodule` 마커를 생성함.
 * createdAt과 modifiedAt은 항상 null이며, sourceFormat은 원본 포맷을 보존함.
 * 선택적 필드는 타입이 유효할 때만 복사함.
 *
 * @param module - 추출된 모듈 객체
 * @param sourceFormat - 원본 소스 포맷 ('risum' | 'json')
 * @returns `.risumodule` 마커 객체
 */
export function buildExtractRisumoduleManifest(
  module: Record<string, unknown>,
  sourceFormat: 'risum' | 'json',
): RisumoduleManifest {
  const manifest: RisumoduleManifest = {
    $schema: RISUMODULE_SCHEMA_URL,
    kind: RISUMODULE_KIND,
    schemaVersion: RISUMODULE_SCHEMA_VERSION,
    id: typeof module.id === 'string' ? module.id : '',
    name: typeof module.name === 'string' ? module.name : '',
    description: typeof module.description === 'string' ? module.description : '',
    createdAt: null,
    modifiedAt: null,
    sourceFormat,
  };

  if (typeof module.namespace === 'string') {
    manifest.namespace = module.namespace;
  }
  if (typeof module.cjs === 'string') {
    manifest.cjs = module.cjs;
  }
  if (typeof module.lowLevelAccess === 'boolean') {
    manifest.lowLevelAccess = module.lowLevelAccess;
  }
  if (typeof module.hideIcon === 'boolean') {
    manifest.hideIcon = module.hideIcon;
  }
  if (isPlainObject(module.mcp)) {
    manifest.mcp = module.mcp as Record<string, unknown>;
  }

  return manifest;
}

/**
 * buildScaffoldRisumoduleManifest.
 * 스캐폴드 시 생성할 `.risumodule` 마커를 빌드함.
 * description은 빈 문자열, boolean 필드는 false, 타임스탬프는 nowIso 사용.
 *
 * @param params - 스캐폴드 파라미터
 * @param params.id - 모듈 UUID
 * @param params.name - 모듈 이름
 * @param params.namespace - 선택적으로 초기화할 모듈 namespace
 * @param params.nowIso - 생성 시점 ISO 문자열
 * @returns `.risumodule` 마커 객체
 */
export function buildScaffoldRisumoduleManifest({
  id,
  name,
  namespace,
  nowIso,
}: {
  id: string;
  name: string;
  namespace?: string;
  nowIso: string;
}): RisumoduleManifest {
  const manifest: RisumoduleManifest = {
    $schema: RISUMODULE_SCHEMA_URL,
    kind: RISUMODULE_KIND,
    schemaVersion: RISUMODULE_SCHEMA_VERSION,
    id,
    name,
    description: '',
    createdAt: nowIso,
    modifiedAt: nowIso,
    sourceFormat: 'scaffold',
    lowLevelAccess: false,
    hideIcon: false,
  };

  if (typeof namespace === 'string') {
    manifest.namespace = namespace;
  }

  return manifest;
}

/**
 * readRisumoduleManifest.
 * 지정한 디렉토리의 `.risumodule` 파일을 읽어 파싱·검증한 뒤
 * RisumoduleManifest를 반환함. 파일이 없으면 결정적인 오류를 발생시킴.
 *
 * @param rootDir - 읽을 디렉토리 경로
 * @returns 검증된 RisumoduleManifest
 */
export function readRisumoduleManifest(rootDir: string): RisumoduleManifest {
  const markerPath = path.join(rootDir, RISUMODULE_FILENAME);
  if (!fs.existsSync(markerPath)) {
    throw new Error(`Missing .risumodule: ${markerPath}`);
  }
  const text = fs.readFileSync(markerPath, 'utf-8');
  return parseRisumoduleManifest(text, markerPath);
}

/**
 * parseRisumoduleManifest.
 * `.risumodule` 원문을 파싱하고 검증한 뒤 RisumoduleManifest를 반환함.
 * 잘못된 JSON, 비객체, 누락 필드, 잘못된 kind, 지원되지 않는 schemaVersion,
 * 잘못된 sourceFormat, 비문자열/null 타임스탬프, customModuleToggle 존재 시
 * 결정적인 오류를 발생시킴.
 *
 * @param text - `.risumodule` 파일 원문
 * @param markerPath - 오류 메시지에 포함할 파일 경로
 * @returns 검증된 RisumoduleManifest
 */
export function parseRisumoduleManifest(text: string, markerPath: string): RisumoduleManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Invalid .risumodule JSON: ${markerPath}`);
  }

  if (!isPlainObject(parsed)) {
    throw new Error(`Invalid .risumodule: expected object at ${markerPath}`);
  }

  const obj = parsed as Record<string, unknown>;

  const requiredFields = ['$schema', 'kind', 'schemaVersion', 'id', 'name', 'description', 'createdAt', 'modifiedAt', 'sourceFormat'];
  const missing = requiredFields.filter((field) => !(field in obj));
  if (missing.length > 0) {
    throw new Error(
      `Invalid .risumodule: missing required fields [${missing.join(', ')}] at ${markerPath}`,
    );
  }

  if (typeof obj.$schema !== 'string' || obj.$schema !== RISUMODULE_SCHEMA_URL) {
    throw new Error(
      `.risumodule $schema must be "${RISUMODULE_SCHEMA_URL}", got ${JSON.stringify(obj.$schema)} at ${markerPath}`,
    );
  }

  if (obj.kind !== RISUMODULE_KIND) {
    throw new Error(
      `.risumodule kind must be "${RISUMODULE_KIND}", got ${JSON.stringify(obj.kind)} at ${markerPath}`,
    );
  }

  if (typeof obj.schemaVersion !== 'number' || obj.schemaVersion !== RISUMODULE_SCHEMA_VERSION) {
    throw new Error(
      `.risumodule schemaVersion must be ${RISUMODULE_SCHEMA_VERSION}, got ${JSON.stringify(obj.schemaVersion)} at ${markerPath}`,
    );
  }

  if (typeof obj.id !== 'string') {
    throw new Error(
      `.risumodule id must be a string, got ${JSON.stringify(obj.id)} at ${markerPath}`,
    );
  }

  if (typeof obj.name !== 'string') {
    throw new Error(
      `.risumodule name must be a string, got ${JSON.stringify(obj.name)} at ${markerPath}`,
    );
  }

  if (typeof obj.description !== 'string') {
    throw new Error(
      `.risumodule description must be a string, got ${JSON.stringify(obj.description)} at ${markerPath}`,
    );
  }

  const sourceFormat = obj.sourceFormat;
  if (sourceFormat !== 'risum' && sourceFormat !== 'json' && sourceFormat !== 'scaffold') {
    throw new Error(
      `.risumodule sourceFormat must be one of: risum, json, scaffold, got ${JSON.stringify(sourceFormat)} at ${markerPath}`,
    );
  }

  if ('customModuleToggle' in obj) {
    throw new Error(
      `.risumodule must not contain customModuleToggle (use toggle/*.risutoggle instead) at ${markerPath}`,
    );
  }

  const createdAt = obj.createdAt;
  const modifiedAt = obj.modifiedAt;
  if ((createdAt !== null && typeof createdAt !== 'string') || (modifiedAt !== null && typeof modifiedAt !== 'string')) {
    throw new Error(
      `.risumodule createdAt/modifiedAt must be string or null at ${markerPath}`,
    );
  }

  const manifest: RisumoduleManifest = {
    $schema: obj.$schema,
    kind: obj.kind,
    schemaVersion: obj.schemaVersion,
    id: obj.id,
    name: obj.name,
    description: obj.description,
    createdAt: createdAt === null ? null : createdAt,
    modifiedAt: modifiedAt === null ? null : modifiedAt,
    sourceFormat,
  };

  if (typeof obj.namespace === 'string') {
    manifest.namespace = obj.namespace;
  }
  if (typeof obj.cjs === 'string') {
    manifest.cjs = obj.cjs;
  }
  if (typeof obj.lowLevelAccess === 'boolean') {
    manifest.lowLevelAccess = obj.lowLevelAccess;
  }
  if (typeof obj.hideIcon === 'boolean') {
    manifest.hideIcon = obj.hideIcon;
  }
  if (isPlainObject(obj.mcp)) {
    manifest.mcp = obj.mcp as Record<string, unknown>;
  }

  return manifest;
}

/**
 * applyRisumoduleToModule.
 * RisumoduleManifest의 packable 필드만 모듈 객체에 복사함.
 * 복사 대상: name, description, id, namespace, cjs, lowLevelAccess, hideIcon, mcp.
 * 복사하지 않는 필드: $schema, kind, schemaVersion, createdAt, modifiedAt, sourceFormat.
 *
 * @param moduleObj - 대상 모듈 객체 (변경됨)
 * @param manifest - `.risumodule` 마커 객체
 */
export function applyRisumoduleToModule(
  moduleObj: Record<string, unknown>,
  manifest: RisumoduleManifest,
): void {
  const stringFields = ['name', 'description', 'id', 'namespace', 'cjs'] as const;
  for (const field of stringFields) {
    const value = manifest[field];
    if (typeof value === 'string') {
      moduleObj[field] = value;
    }
  }

  if (typeof manifest.lowLevelAccess === 'boolean') {
    moduleObj.lowLevelAccess = manifest.lowLevelAccess;
  }

  if (typeof manifest.hideIcon === 'boolean') {
    moduleObj.hideIcon = manifest.hideIcon;
  }

  if (isPlainObject(manifest.mcp)) {
    moduleObj.mcp = manifest.mcp;
  }
}

/**
 * isPlainObject 함수.
 * 값이 평범한 객체(배열이 아닌 non-null object)인지 판정함.
 *
 * @param value - 검증할 임의 값
 * @returns 평범한 객체이면 true, 아니면 false
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
