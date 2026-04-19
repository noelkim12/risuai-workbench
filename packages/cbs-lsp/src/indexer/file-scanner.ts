/**
 * Workspace canonical artifact scanner for Layer 1 indexing.
 * @file packages/cbs-lsp/src/indexer/file-scanner.ts
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  CUSTOM_EXTENSION_ARTIFACTS,
  isCbsBearingArtifact,
  mapToCbsFragments,
  parseCustomExtensionArtifactFromPath,
  type CbsFragmentMap,
  type CustomExtensionArtifact,
} from 'risu-workbench-core';

export type WorkspaceFileArtifactClass = 'cbs-bearing' | 'non-cbs';

export interface WorkspaceScanFile {
  uri: string;
  absolutePath: string;
  relativePath: string;
  artifact: CustomExtensionArtifact;
  artifactClass: WorkspaceFileArtifactClass;
  cbsBearingArtifact: boolean;
  hasCbsFragments: boolean;
  fragmentCount: number;
  fragmentSections: readonly string[];
  fragmentMap: CbsFragmentMap;
}

export interface WorkspaceScanSummary {
  totalFiles: number;
  cbsBearingFiles: number;
  nonCbsFiles: number;
  filesWithCbsFragments: number;
  byArtifact: Readonly<Record<CustomExtensionArtifact, number>>;
}

export interface WorkspaceScanResult {
  rootPath: string;
  files: readonly WorkspaceScanFile[];
  filesByArtifact: ReadonlyMap<CustomExtensionArtifact, readonly WorkspaceScanFile[]>;
  cbsBearingFiles: readonly WorkspaceScanFile[];
  nonCbsFiles: readonly WorkspaceScanFile[];
  filesWithCbsFragments: readonly WorkspaceScanFile[];
  summary: WorkspaceScanSummary;
}

interface DiscoveredWorkspaceFile {
  absolutePath: string;
  relativePath: string;
  artifact: CustomExtensionArtifact;
}

/**
 * compareWorkspaceScanFiles 함수.
 * 스캔 결과를 relative path 기준으로 deterministic ordering으로 고정함.
 *
 * @param left - 비교할 왼쪽 파일
 * @param right - 비교할 오른쪽 파일
 * @returns 정렬 우선순위 차이값
 */
function compareWorkspaceScanFiles(left: WorkspaceScanFile, right: WorkspaceScanFile): number {
  return (
    left.relativePath.localeCompare(right.relativePath) ||
    left.absolutePath.localeCompare(right.absolutePath)
  );
}

/**
 * createArtifactCounters 함수.
 * 요약 통계에서 쓸 artifact별 카운터 레코드를 0으로 초기화함.
 *
 * @returns artifact별 0 카운터 레코드
 */
function createArtifactCounters(): Record<CustomExtensionArtifact, number> {
  return {
    lorebook: 0,
    regex: 0,
    lua: 0,
    prompt: 0,
    toggle: 0,
    variable: 0,
    html: 0,
  } satisfies Record<CustomExtensionArtifact, number>;
}

/**
 * createFilesByArtifact 함수.
 * downstream layer가 바로 재사용할 수 있게 artifact별 파일 목록 맵을 구성함.
 *
 * @param files - 전체 스캔 파일 목록
 * @returns artifact별 deterministic file list map
 */
function createFilesByArtifact(
  files: readonly WorkspaceScanFile[],
): ReadonlyMap<CustomExtensionArtifact, readonly WorkspaceScanFile[]> {
  const filesByArtifact = new Map<CustomExtensionArtifact, WorkspaceScanFile[]>();

  for (const artifact of CUSTOM_EXTENSION_ARTIFACTS) {
    filesByArtifact.set(artifact, []);
  }

  for (const file of files) {
    filesByArtifact.get(file.artifact)?.push(file);
  }

  return filesByArtifact;
}

/**
 * createWorkspaceScanSummary 함수.
 * Layer 1 후속 단계가 빠르게 판단할 수 있도록 aggregate summary를 생성함.
 *
 * @param files - 전체 스캔 파일 목록
 * @returns artifact별/분류별 집계 요약
 */
function createWorkspaceScanSummary(files: readonly WorkspaceScanFile[]): WorkspaceScanSummary {
  const byArtifact = createArtifactCounters();

  for (const file of files) {
    byArtifact[file.artifact] += 1;
  }

  const cbsBearingFiles = files.filter((file) => file.cbsBearingArtifact);
  const nonCbsFiles = files.filter((file) => !file.cbsBearingArtifact);
  const filesWithCbsFragments = files.filter((file) => file.hasCbsFragments);

  return {
    totalFiles: files.length,
    cbsBearingFiles: cbsBearingFiles.length,
    nonCbsFiles: nonCbsFiles.length,
    filesWithCbsFragments: filesWithCbsFragments.length,
    byArtifact,
  };
}

/**
 * toPosixRelativePath 함수.
 * workspace 상대 경로를 platform-independent posix 형태로 정규화함.
 *
 * @param value - 정규화할 상대 경로
 * @returns `/` 구분자로 정규화된 상대 경로
 */
function toPosixRelativePath(value: string): string {
  return value.split(path.sep).join('/');
}

/**
 * compareDirectoryEntries 함수.
 * recursive scan에서 디렉토리/파일 순서를 deterministic하게 고정함.
 *
 * @param left - 비교할 왼쪽 엔트리 이름
 * @param right - 비교할 오른쪽 엔트리 이름
 * @returns 이름 기준 정렬 우선순위 차이값
 */
function compareDirectoryEntries(left: string, right: string): number {
  return left.localeCompare(right);
}

/**
 * FileScanner 클래스.
 * workspace canonical `.risu*` 파일을 수집하고 artifact/fragment 상태를 Layer 1 공용 계약으로 정리함.
 */
export class FileScanner {
  constructor(private readonly workspaceRoot: string) {}

  /**
   * scan 함수.
   * workspace의 canonical `.risu*` 파일을 읽어 artifact 종류와 fragment 존재 여부를 고정된 shape로 반환함.
   *
   * @returns Layer 1 후속 단계가 재사용할 수 있는 deterministic scan result
   */
  async scan(): Promise<WorkspaceScanResult> {
    const discoveredFiles = await this.collectWorkspaceFiles(this.workspaceRoot);
    const files = await Promise.all(discoveredFiles.map((file) => this.scanDiscoveredFile(file)));
    files.sort(compareWorkspaceScanFiles);

    const filesByArtifact = createFilesByArtifact(files);
    const cbsBearingFiles = files.filter((file) => file.cbsBearingArtifact);
    const nonCbsFiles = files.filter((file) => !file.cbsBearingArtifact);
    const filesWithCbsFragments = files.filter((file) => file.hasCbsFragments);

    return {
      rootPath: this.workspaceRoot,
      files,
      filesByArtifact,
      cbsBearingFiles,
      nonCbsFiles,
      filesWithCbsFragments,
      summary: createWorkspaceScanSummary(files),
    };
  }

  /**
   * collectWorkspaceFiles 함수.
   * workspace 아래의 canonical `.risu*` 파일만 재귀적으로 수집함.
   *
   * @param currentPath - 현재 탐색 중인 디렉토리 절대 경로
   * @returns artifact가 판별된 canonical file 목록
   */
  private async collectWorkspaceFiles(currentPath: string): Promise<DiscoveredWorkspaceFile[]> {
    const entries = await readdir(currentPath, { withFileTypes: true });
    entries.sort((left, right) => compareDirectoryEntries(left.name, right.name));

    const discoveredFiles: DiscoveredWorkspaceFile[] = [];

    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        discoveredFiles.push(...(await this.collectWorkspaceFiles(absolutePath)));
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const artifact = this.tryParseArtifact(absolutePath);
      if (!artifact) {
        continue;
      }

      discoveredFiles.push({
        absolutePath,
        relativePath: toPosixRelativePath(path.relative(this.workspaceRoot, absolutePath)),
        artifact,
      });
    }

    return discoveredFiles;
  }

  /**
   * tryParseArtifact 함수.
   * canonical custom-extension artifact가 아닌 파일은 null로 걸러냄.
   *
   * @param absolutePath - 판별할 파일 절대 경로
   * @returns 판별된 canonical artifact 또는 null
   */
  private tryParseArtifact(absolutePath: string): CustomExtensionArtifact | null {
    try {
      return parseCustomExtensionArtifactFromPath(absolutePath);
    } catch {
      return null;
    }
  }

  /**
   * scanDiscoveredFile 함수.
   * scanner가 수집한 canonical file 한 건을 Layer 1 scan entry로 변환함.
   *
   * @param file - scanner가 수집한 canonical file 한 건
   * @returns fragment map까지 포함한 workspace scan entry
   */
  private async scanDiscoveredFile(file: DiscoveredWorkspaceFile): Promise<WorkspaceScanFile> {
    const text = await readFile(file.absolutePath, 'utf8');
    const fragmentMap = mapToCbsFragments(file.artifact, text);
    const cbsBearingArtifact = isCbsBearingArtifact(file.artifact);

    return {
      uri: pathToFileURL(file.absolutePath).href,
      absolutePath: file.absolutePath,
      relativePath: file.relativePath,
      artifact: file.artifact,
      artifactClass: cbsBearingArtifact ? 'cbs-bearing' : 'non-cbs',
      cbsBearingArtifact,
      hasCbsFragments: fragmentMap.fragments.length > 0,
      fragmentCount: fragmentMap.fragments.length,
      fragmentSections: fragmentMap.fragments.map((fragment) => fragment.section),
      fragmentMap,
    };
  }
}

/**
 * scanWorkspaceFiles 함수.
 * class를 직접 만들지 않아도 Layer 1 scan을 바로 실행할 수 있는 convenience helper.
 *
 * @param workspaceRoot - 스캔할 workspace root 절대 경로
 * @returns deterministic workspace scan result
 */
export async function scanWorkspaceFiles(workspaceRoot: string): Promise<WorkspaceScanResult> {
  return new FileScanner(workspaceRoot).scan();
}
