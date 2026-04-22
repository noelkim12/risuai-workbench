/**
 * LuaLS document routing helpers and shadow-workspace mirror.
 * @file packages/cbs-lsp/src/providers/lua/lualsDocuments.ts
 */

import { TextDocument } from 'vscode-languageserver-textdocument';

import { createSyntheticDocumentVersion } from '../../core';
import { CbsLspPathHelper } from '../../helpers/path-helper';
import type { WorkspaceScanFile } from '../../indexer';
import { getArtifactTypeFromPath } from '../../utils/document-router';
import type { LuaLsProcessManager } from './lualsProcess';
import {
  createLuaLsShadowDocumentUri,
  isLuaLsShadowDocumentUri,
} from './lualsShadowWorkspace';

export interface LuaLsRoutedDocument {
  sourceUri: string;
  sourceFilePath: string;
  transportUri: string;
  languageId: 'lua';
  rootPath: string | null;
  version: number | string;
  text: string;
}

interface LuaLsDocumentRouterProcessManager {
  closeDocument(sourceUri: string): void;
  syncDocument(document: LuaLsRoutedDocument): void;
}

/**
 * shouldRouteDocumentToLuaLs 함수.
 * `.risulua` 문서를 LuaLS companion session으로 보낼지 판별함.
 *
 * @param filePath - 판별할 파일 절대 경로
 * @returns Lua artifact면 true
 */
export function shouldRouteDocumentToLuaLs(filePath: string): boolean {
  return getArtifactTypeFromPath(filePath) === 'lua';
}

/**
 * isLuaLsVirtualDocumentUri 함수.
 * LuaLS shadow workspace URI인지 확인함.
 *
 * @param uri - 검사할 transport URI
 * @returns shadow file:// URI 사용 여부
 */
export function isLuaLsVirtualDocumentUri(uri: string): boolean {
  return isLuaLsShadowDocumentUri(uri);
}

/**
 * createLuaLsTransportUri 함수.
 * `.risulua` source URI를 LuaLS가 실제 file:// 문서로 읽는 shadow `.lua` URI로 바꾼다.
 *
 * @param sourceFilePath - 원본 `.risulua` 절대 경로
 * @returns temp shadow root 아래 canonical `.lua` file:// URI
 */
export function createLuaLsTransportUri(sourceFilePath: string): string {
  return createLuaLsShadowDocumentUri(sourceFilePath);
}

/**
 * createLuaLsRoutedDocumentFromTextDocument 함수.
 * 열린 TextDocument를 LuaLS mirror payload로 정규화함.
 *
 * @param document - 현재 에디터에 열린 문서
 * @param rootPath - 속한 workspace root, 없으면 null
 * @returns LuaLS transport에 보낼 canonical routed document
 */
export function createLuaLsRoutedDocumentFromTextDocument(
  document: TextDocument,
  rootPath: string | null,
): LuaLsRoutedDocument {
  const sourceFilePath = CbsLspPathHelper.getFilePathFromUri(document.uri);
  return {
    sourceUri: document.uri,
    sourceFilePath,
    transportUri: createLuaLsTransportUri(sourceFilePath),
    languageId: 'lua',
    rootPath,
    version: document.version,
    text: document.getText(),
  };
}

/**
 * createLuaLsRoutedDocumentFromWorkspaceFile 함수.
 * Layer 1 scan result의 Lua file record를 LuaLS mirror payload로 바꾼다.
 *
 * @param file - workspace scan에서 얻은 Lua file record
 * @param rootPath - 속한 workspace root
 * @returns synthetic version을 포함한 routed document
 */
export function createLuaLsRoutedDocumentFromWorkspaceFile(
  file: WorkspaceScanFile,
  rootPath: string,
): LuaLsRoutedDocument {
  return {
    sourceUri: file.uri,
    sourceFilePath: file.absolutePath,
    transportUri: createLuaLsTransportUri(file.absolutePath),
    languageId: 'lua',
    rootPath,
    version: createSyntheticDocumentVersion(file.text),
    text: file.text,
  };
}

/**
 * compareLuaLsDocuments 함수.
 * routed document payload가 실제로 바뀌었는지 판단함.
 *
 * @param left - 이전 routed document
 * @param right - 다음 routed document
 * @returns 동기화가 필요하면 false
 */
function compareLuaLsDocuments(left: LuaLsRoutedDocument, right: LuaLsRoutedDocument): boolean {
  return (
    left.transportUri === right.transportUri &&
    left.version === right.version &&
    left.text === right.text &&
    left.languageId === right.languageId &&
    left.rootPath === right.rootPath
  );
}

/**
 * LuaLsDocumentRouter 클래스.
 * workspace scan/open document 상태를 LuaLS session mirror로 정렬함.
 */
export class LuaLsDocumentRouter {
  private readonly standaloneDocuments = new Map<string, LuaLsRoutedDocument>();

  private readonly workspaceDocumentsByRoot = new Map<string, Map<string, LuaLsRoutedDocument>>();

  constructor(
    private readonly processManager: LuaLsDocumentRouterProcessManager,
  ) {}

  /**
   * syncStandaloneDocument 함수.
   * workspace root 밖에서 열린 `.risulua` 문서를 LuaLS session에 반영함.
   *
   * @param document - 현재 열린 standalone 문서
   */
  syncStandaloneDocument(document: TextDocument): void {
    const sourceFilePath = CbsLspPathHelper.getFilePathFromUri(document.uri);
    if (!shouldRouteDocumentToLuaLs(sourceFilePath)) {
      return;
    }

    const routedDocument = createLuaLsRoutedDocumentFromTextDocument(document, null);
    const previousDocument = this.standaloneDocuments.get(document.uri);
    this.standaloneDocuments.set(document.uri, routedDocument);

    if (previousDocument && compareLuaLsDocuments(previousDocument, routedDocument)) {
      return;
    }

    this.processManager.syncDocument(routedDocument);
  }

  /**
   * closeStandaloneDocument 함수.
   * standalone `.risulua` 문서가 닫히면 LuaLS mirror에서도 제거함.
   *
   * @param sourceUri - 닫힌 원본 문서 URI
   */
  closeStandaloneDocument(sourceUri: string): void {
    if (!this.standaloneDocuments.has(sourceUri)) {
      return;
    }

    this.standaloneDocuments.delete(sourceUri);
    this.processManager.closeDocument(sourceUri);
  }

  /**
   * syncWorkspaceDocuments 함수.
   * workspace scan 결과의 Lua file 집합을 LuaLS session과 같은 집합으로 맞춤.
   *
   * @param rootPath - 동기화할 workspace root
   * @param files - 현재 workspace scan file 목록
   */
  syncWorkspaceDocuments(rootPath: string, files: readonly WorkspaceScanFile[]): void {
    const nextDocuments = new Map<string, LuaLsRoutedDocument>();
    for (const file of files) {
      if (!shouldRouteDocumentToLuaLs(file.absolutePath)) {
        continue;
      }

      nextDocuments.set(
        file.uri,
        createLuaLsRoutedDocumentFromWorkspaceFile(file, rootPath),
      );
    }

    const previousDocuments = this.workspaceDocumentsByRoot.get(rootPath) ?? new Map();
    for (const sourceUri of previousDocuments.keys()) {
      if (!nextDocuments.has(sourceUri)) {
        this.processManager.closeDocument(sourceUri);
      }
    }

    for (const [sourceUri, routedDocument] of nextDocuments) {
      const previousDocument = previousDocuments.get(sourceUri);
      if (previousDocument && compareLuaLsDocuments(previousDocument, routedDocument)) {
        continue;
      }

      this.processManager.syncDocument(routedDocument);
    }

    if (nextDocuments.size === 0) {
      this.workspaceDocumentsByRoot.delete(rootPath);
      return;
    }

    this.workspaceDocumentsByRoot.set(rootPath, nextDocuments);
  }

  /**
   * clearWorkspaceDocuments 함수.
   * workspace state가 사라졌을 때 기존 LuaLS mirror 문서를 정리함.
   *
   * @param rootPath - 제거할 workspace root
   */
  clearWorkspaceDocuments(rootPath: string): void {
    const previousDocuments = this.workspaceDocumentsByRoot.get(rootPath);
    if (!previousDocuments) {
      return;
    }

    for (const sourceUri of previousDocuments.keys()) {
      this.processManager.closeDocument(sourceUri);
    }

    this.workspaceDocumentsByRoot.delete(rootPath);
  }
}

/**
 * createLuaLsDocumentRouter 함수.
 * server wiring이 쓸 기본 LuaLS document router를 생성함.
 *
 * @param processManager - LuaLS transport에 routed document를 반영할 manager
 * @returns workspace/session mirror router
 */
export function createLuaLsDocumentRouter(
  processManager: Pick<LuaLsProcessManager, 'closeDocument' | 'syncDocument'>,
): LuaLsDocumentRouter {
  return new LuaLsDocumentRouter(processManager);
}
