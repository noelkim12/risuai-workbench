/**
 * LuaLS shadow-file workspace helpers.
 * @file packages/cbs-lsp/src/providers/lua/lualsShadowWorkspace.ts
 */

import { mkdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const DEFAULT_LUALS_SHADOW_ROOT = path.join(tmpdir(), `cbs-lsp-luals-shadow-${process.pid}`);

/**
 * sanitizePathSegment 함수.
 * shadow workspace 아래에 안전하게 쓸 path segment로 정규화함.
 *
 * @param segment - 원본 경로 segment
 * @returns 파일명으로 안전한 segment
 */
function sanitizePathSegment(segment: string): string {
  return segment.replaceAll(':', '__drive__');
}

/**
 * createLuaLsShadowRelativePath 함수.
 * source 절대 경로를 shadow root 아래의 deterministic `.lua` 경로로 변환함.
 *
 * @param sourceFilePath - 원본 `.risulua` 절대 경로
 * @returns shadow root 기준 상대 경로
 */
export function createLuaLsShadowRelativePath(sourceFilePath: string): string {
  const normalizedSourcePath = path.normalize(sourceFilePath);
  const parsedPath = path.parse(normalizedSourcePath);
  const sourceSegments = parsedPath.dir
    .split(path.sep)
    .filter((segment) => segment.length > 0)
    .map(sanitizePathSegment);
  const rootSegment = parsedPath.root.length > 0 ? sanitizePathSegment(parsedPath.root) : 'relative';

  return path.join(rootSegment, ...sourceSegments, `${parsedPath.base}.lua`);
}

/**
 * createLuaLsShadowFilePath 함수.
 * source 경로와 shadow root를 조합해 on-disk mirror 파일 경로를 계산함.
 *
 * @param sourceFilePath - 원본 `.risulua` 절대 경로
 * @param shadowRootPath - mirror를 보관할 shadow root
 * @returns 실제 shadow `.lua` 절대 경로
 */
export function createLuaLsShadowFilePath(
  sourceFilePath: string,
  shadowRootPath: string = DEFAULT_LUALS_SHADOW_ROOT,
): string {
  return path.join(shadowRootPath, createLuaLsShadowRelativePath(sourceFilePath));
}

/**
 * createLuaLsShadowDocumentUri 함수.
 * source 경로에 대응하는 shadow `.lua` file:// URI를 계산함.
 *
 * @param sourceFilePath - 원본 `.risulua` 절대 경로
 * @param shadowRootPath - mirror를 보관할 shadow root
 * @returns LuaLS transport에 사용할 file:// URI
 */
export function createLuaLsShadowDocumentUri(
  sourceFilePath: string,
  shadowRootPath: string = DEFAULT_LUALS_SHADOW_ROOT,
): string {
  return pathToFileURL(createLuaLsShadowFilePath(sourceFilePath, shadowRootPath)).href;
}

/**
 * isLuaLsShadowDocumentUri 함수.
 * 주어진 URI가 현재 shadow workspace 아래 문서를 가리키는지 판별함.
 *
 * @param uri - 검사할 transport URI
 * @param shadowRootPath - mirror를 보관하는 shadow root
 * @returns 현재 shadow workspace 문서면 true
 */
export function isLuaLsShadowDocumentUri(
  uri: string,
  shadowRootPath: string = DEFAULT_LUALS_SHADOW_ROOT,
): boolean {
  const shadowRootUri = pathToFileURL(shadowRootPath).href;
  return uri.startsWith(shadowRootUri);
}

/**
 * LuaLsShadowWorkspace 클래스.
 * `.risulua` source를 temp shadow `.lua` workspace로 미러링함.
 */
export class LuaLsShadowWorkspace {
  readonly rootPath: string;

  constructor(rootPath: string = DEFAULT_LUALS_SHADOW_ROOT) {
    this.rootPath = rootPath;
    mkdirSync(this.rootPath, { recursive: true });
  }

  /**
   * getTransportUri 함수.
   * source 경로에 대응하는 현재 shadow file:// URI를 돌려줌.
   *
   * @param sourceFilePath - 원본 `.risulua` 절대 경로
   * @returns shadow `.lua` file:// URI
   */
  getTransportUri(sourceFilePath: string): string {
    return createLuaLsShadowDocumentUri(sourceFilePath, this.rootPath);
  }

  /**
   * syncDocument 함수.
   * source 텍스트를 shadow `.lua` 파일로 동기화함.
   *
   * @param sourceFilePath - 원본 `.risulua` 절대 경로
   * @param text - mirror에 쓸 Lua 본문
   * @returns 현재 shadow `.lua` file:// URI
   */
  syncDocument(sourceFilePath: string, text: string): string {
    const shadowFilePath = createLuaLsShadowFilePath(sourceFilePath, this.rootPath);
    mkdirSync(path.dirname(shadowFilePath), { recursive: true });
    writeFileSync(shadowFilePath, text, 'utf8');
    return pathToFileURL(shadowFilePath).href;
  }

  /**
   * closeDocument 함수.
   * source에 대응하는 shadow `.lua` 파일을 제거함.
   *
   * @param sourceFilePath - 원본 `.risulua` 절대 경로
   */
  closeDocument(sourceFilePath: string): void {
    const shadowFilePath = createLuaLsShadowFilePath(sourceFilePath, this.rootPath);
    try {
      unlinkSync(shadowFilePath);
    } catch {
      return;
    }
  }

  /**
   * reset 함수.
   * 테스트나 종료 경로에서 shadow root 전체를 비움.
   */
  reset(): void {
    rmSync(this.rootPath, { recursive: true, force: true });
    mkdirSync(this.rootPath, { recursive: true });
  }
}

/**
 * createLuaLsShadowWorkspace 함수.
 * 기본 LuaLS shadow workspace 인스턴스를 생성함.
 *
 * @param rootPath - 테스트용 override shadow root
 * @returns shadow workspace helper
 */
export function createLuaLsShadowWorkspace(rootPath?: string): LuaLsShadowWorkspace {
  return new LuaLsShadowWorkspace(rootPath);
}

/**
 * getDefaultLuaLsShadowRootPath 함수.
 * process-scope 기본 shadow root 경로를 노출함.
 *
 * @returns 기본 shadow root 절대 경로
 */
export function getDefaultLuaLsShadowRootPath(): string {
  return DEFAULT_LUALS_SHADOW_ROOT;
}
