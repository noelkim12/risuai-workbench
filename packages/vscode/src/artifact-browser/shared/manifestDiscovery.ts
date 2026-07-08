/**
 * Manifest discovery pipeline에서 Character/Module이 공유하는 marker scan, manifest read, stable id, path label helper.
 * @file packages/vscode/src/artifact-browser/shared/manifestDiscovery.ts
 */

import { createHash } from 'node:crypto';
import path from 'node:path';
import * as vscode from 'vscode';

/**
 * `vscode.workspace.findFiles`에서 양쪽 marker scan 모두가 제외하는 directory glob.
 */
export const ARTIFACT_MARKER_EXCLUDE_GLOB =
  '{**/node_modules/**,**/.git/**,**/.vscode/**,**/dist/**,**/build/**,**/out/**,**/coverage/**}';

/**
 * findArtifactMarkers 함수.
 * Workspace에서 marker 파일을 검색함. Character/Module 모두 동일한 exclude glob을 사용.
 *
 * @param markerGlob - 찾을 marker 파일 glob 패턴
 * @returns 발견된 marker URI 목록
 */
export async function findArtifactMarkers(markerGlob: string): Promise<vscode.Uri[]> {
  return vscode.workspace.findFiles(markerGlob, ARTIFACT_MARKER_EXCLUDE_GLOB);
}

/**
 * getWorkspaceRelativePath 함수.
 * VS Code workspace folder 기준 표시 경로를 생성함.
 *
 * @param uri - 표시 경로를 만들 VS Code URI
 * @returns workspace 이름을 포함한 상대 경로 또는 절대 fsPath
 */
export function getWorkspaceRelativePath(uri: vscode.Uri): string {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
  if (!workspaceFolder) return uri.fsPath;
  const relative = path.relative(workspaceFolder.uri.fsPath, uri.fsPath).replace(/\\/g, '/');
  return relative ? `${workspaceFolder.name}/${relative}` : workspaceFolder.name;
}

/**
 * readManifestText 함수.
 * VS Code workspace fs를 통해 marker 파일을 UTF-8 text로 읽음.
 *
 * @param uri - 읽을 marker 파일 URI
 * @returns UTF-8로 디코딩된 manifest text
 * @throws 읽기 실패 시 원래 에러를 그대로 전파
 */
export async function readManifestText(uri: vscode.Uri): Promise<string> {
  return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf-8');
}

/**
 * withArtifactKindStableId 함수.
 * 같은 root에 서로 다른 marker가 있을 때도 충돌하지 않도록 card stable id에 kind를 붙임.
 *
 * @param kind - artifact 종류
 * @param stableId - parser가 만든 기존 stable id
 * @returns artifact kind discriminator가 포함된 stable id
 */
export function withArtifactKindStableId(kind: 'character' | 'module' | 'plugin', stableId: string): string {
  return stableId.startsWith(`${kind}:`) ? stableId : `${kind}:${stableId}`;
}

/**
 * slugify 함수.
 * Stable id나 display label에 안전한 slug를 만듦.
 * Non-alphanumeric을 하이픈으로 치환하고 앞뒤 하이픈을 제거하며 40자로 자름.
 *
 * @param value - slug로 변환할 문자열
 * @returns 소문자, 하이픈 구분 slug
 */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * createHashFallbackStableId 함수.
 * Manifest id가 비어있을 때 사용하는 hash 기반 fallback stable id.
 * `${slug}-${sha256(seed).slice(0, 10)}` 형식을 유지함.
 *
 * @param options.name - manifest name 또는 rootPathLabel (slug로 사용)
 * @param options.seed - hash seed 문자열
 * @param options.fallbackPrefix - 빈 slug일 때 사용할 prefix (예: 'character', 'module')
 * @returns hash 기반 fallback stable id
 */
export function createHashFallbackStableId(options: {
  name: string;
  seed: string;
  fallbackPrefix: string;
}): string {
  const slug = slugify(options.name) || options.fallbackPrefix;
  const hash = createHash('sha256').update(options.seed).digest('hex').slice(0, 10);
  return `${slug}-${hash}`;
}

/**
 * splitRelativePath 함수.
 * Manifest에 저장된 상대 경로를 안전한 URI path segment 배열로 분해함.
 *
 * @param value - slash 또는 backslash가 섞일 수 있는 상대 경로
 * @returns 상위 경로 이동 요소를 제거한 path segment 목록
 */
export function splitRelativePath(value: string): string[] {
  return value.split(/[\\/]+/).filter((segment) => segment && segment !== '.' && segment !== '..');
}

/**
 * sortArtifactCardsByRootLabel 함수.
 * Artifact card 목록을 rootPathLabel 기준 오름차순 정렬함.
 *
 * @param cards - 정렬할 card 목록
 * @returns rootPathLabel로 정렬된 새 배열
 */
export function sortArtifactCardsByRootLabel<T extends { rootPathLabel: string }>(cards: T[]): T[] {
  return cards.sort((a, b) => a.rootPathLabel.localeCompare(b.rootPathLabel));
}
