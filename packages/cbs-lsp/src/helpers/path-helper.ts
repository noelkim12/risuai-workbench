/**
 * cbs-lsp path/URI utility helper class.
 * @file packages/cbs-lsp/src/helpers/path-helper.ts
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getCustomExtensionArtifactContract,
  parseCustomExtensionArtifactFromPath,
} from 'risu-workbench-core';

const CHARACTER_WORKSPACE_ROOT_MARKER_FILE_NAME = '.risuchar';

/**
 * CbsLspPathHelper 클래스.
 * server/provider/indexer가 공통으로 쓰는 file URI 및 workspace root 해석 유틸을 모음.
 */
export class CbsLspPathHelper {
  /**
   * getFilePathFromUri 함수.
   * file URI를 로컬 경로 문자열로 정규화함.
   *
   * @param uri - file path로 바꿀 문서 URI
   * @returns 가능하면 디코딩된 로컬 경로, 아니면 원본 URI 기반 문자열
   */
  static getFilePathFromUri(uri: string): string {
    if (!uri.startsWith('file://')) {
      return uri;
    }

    try {
      return fileURLToPath(uri);
    } catch {
      return uri.replace(/^file:\/\//u, '');
    }
  }

  /**
   * resolveWorkspaceRootFromFilePath 함수.
   * custom-extension artifact 경로에서 논리 workspace root를 역으로 계산함.
   *
   * @param filePath - workspace root를 찾을 artifact 절대 경로
   * @returns 계산된 workspace root, 규칙을 해석할 수 없으면 null
   */
  static resolveWorkspaceRootFromFilePath(filePath: string): string | null {
    const normalizedPath = path.normalize(filePath);

    if (path.basename(normalizedPath) === CHARACTER_WORKSPACE_ROOT_MARKER_FILE_NAME) {
      return path.dirname(normalizedPath);
    }

    try {
      const artifact = parseCustomExtensionArtifactFromPath(filePath);
      const contract = getCustomExtensionArtifactContract(artifact);
      const segments = normalizedPath.split(path.sep);
      const directoryIndex = segments.lastIndexOf(contract.directory);

      if (directoryIndex <= 0) {
        return null;
      }

      const rootPath = segments.slice(0, directoryIndex).join(path.sep);
      return rootPath.length > 0 ? rootPath : path.sep;
    } catch {
      return null;
    }
  }
}
