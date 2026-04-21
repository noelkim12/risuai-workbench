/**
 * Layer 1 ElementRegistry read model for workspace artifacts.
 * @file packages/cbs-lsp/src/indexer/element-registry.ts
 */

import path from 'node:path';
import {
  CUSTOM_EXTENSION_ARTIFACTS,
  analyzeLuaSource,
  extractCBSVarOps,
  type CbsFragment,
  type CustomExtensionArtifact,
  type ElementCBSData,
  type LuaAnalysisArtifact,
} from 'risu-workbench-core';

import type {
  WorkspaceFileArtifactClass,
  WorkspaceScanFile,
  WorkspaceScanResult,
} from './file-scanner';

export type ElementRegistryFileAnalysisKind =
  | 'cbs-fragments'
  | 'lua-file'
  | 'cbs-without-fragments'
  | 'non-cbs-artifact';

export type ElementRegistryElementAnalysisKind = 'cbs-fragment' | 'lua-file';

export interface ElementRegistryVariableAccess {
  reads: readonly string[];
  writes: readonly string[];
}

export interface ElementRegistryGraphSeed {
  elementId: string;
  uri: string;
  relativePath: string;
  artifact: CustomExtensionArtifact;
  artifactClass: WorkspaceFileArtifactClass;
  elementName: string;
  fragmentSection: string | null;
  fragmentIndex: number;
  analysisKind: ElementRegistryElementAnalysisKind;
  cbs: ElementRegistryVariableAccess;
  /**
   * Host document range for this element.
   * For fragments: the absolute position in the host document.
   * For Lua files: null (entire file is the element).
   */
  hostRange: { start: number; end: number } | null;
}

export interface ElementRegistryFragmentDescriptor {
  section: string;
  fragmentIndex: number;
  start: number;
  end: number;
  content: string;
  contentLength: number;
  /**
   * Host document range for rebasing.
   * Same as start/end but explicitly named for graph consumers.
   */
  hostRange: { start: number; end: number };
}

interface ElementRegistryElementBase {
  id: string;
  uri: string;
  absolutePath: string;
  relativePath: string;
  artifact: CustomExtensionArtifact;
  artifactClass: WorkspaceFileArtifactClass;
  elementName: string;
  displayName: string;
  analysisKind: ElementRegistryElementAnalysisKind;
  cbs: ElementRegistryVariableAccess;
  graphSeed: ElementRegistryGraphSeed;
}

export interface ElementRegistryFragmentElement extends ElementRegistryElementBase {
  analysisKind: 'cbs-fragment';
  fragment: ElementRegistryFragmentDescriptor;
  /**
   * Fragment index within the file for deterministic disambiguation.
   * Stable ordering based on host document position.
   */
  fragmentIndex: number;
}

export interface ElementRegistryLuaElement extends ElementRegistryElementBase {
  analysisKind: 'lua-file';
  fragment: null;
  lua: {
    baseName: string;
    totalLines: number;
    functionNames: readonly string[];
    stateVariableNames: readonly string[];
  };
}

export type ElementRegistryElement = ElementRegistryFragmentElement | ElementRegistryLuaElement;

export interface ElementRegistryFileRecord {
  uri: string;
  absolutePath: string;
  relativePath: string;
  text: string;
  artifact: CustomExtensionArtifact;
  artifactClass: WorkspaceFileArtifactClass;
  cbsBearingArtifact: boolean;
  hasCbsFragments: boolean;
  fragmentCount: number;
  fragmentSections: readonly string[];
  analysisKind: ElementRegistryFileAnalysisKind;
  elementIds: readonly string[];
  graphSeedCount: number;
  analysisError: string | null;
}

export interface ElementRegistryArtifactSummary {
  files: number;
  elements: number;
  graphSeeds: number;
}

export interface ElementRegistrySummary {
  totalFiles: number;
  totalElements: number;
  totalGraphSeeds: number;
  byArtifact: Readonly<Record<CustomExtensionArtifact, ElementRegistryArtifactSummary>>;
}

export interface ElementRegistrySnapshot {
  rootPath: string;
  files: readonly ElementRegistryFileRecord[];
  elements: readonly ElementRegistryElement[];
  graphSeeds: readonly ElementRegistryGraphSeed[];
  summary: ElementRegistrySummary;
}

interface BuiltRegistryFileRecord {
  record: ElementRegistryFileRecord;
  elements: readonly ElementRegistryElement[];
  graphSeeds: readonly ElementRegistryGraphSeed[];
  elementCbsData: readonly ElementCBSData[];
  luaArtifact: LuaAnalysisArtifact | null;
}

/**
 * createArtifactSummaryRecord 함수.
 * snapshot summary에 들어갈 artifact별 집계 레코드를 0으로 초기화함.
 *
 * @returns artifact별 빈 summary 레코드
 */
function createArtifactSummaryRecord(): Record<CustomExtensionArtifact, ElementRegistryArtifactSummary> {
  return {
    lorebook: { files: 0, elements: 0, graphSeeds: 0 },
    regex: { files: 0, elements: 0, graphSeeds: 0 },
    lua: { files: 0, elements: 0, graphSeeds: 0 },
    prompt: { files: 0, elements: 0, graphSeeds: 0 },
    toggle: { files: 0, elements: 0, graphSeeds: 0 },
    variable: { files: 0, elements: 0, graphSeeds: 0 },
    html: { files: 0, elements: 0, graphSeeds: 0 },
  } satisfies Record<CustomExtensionArtifact, ElementRegistryArtifactSummary>;
}

/**
 * createArtifactBuckets 함수.
 * artifact kind 기반 조회를 위한 deterministic bucket map을 만듦.
 *
 * @returns 모든 artifact를 포함하는 빈 bucket map
 */
function createArtifactBuckets<T>(): Map<CustomExtensionArtifact, T[]> {
  return new Map(CUSTOM_EXTENSION_ARTIFACTS.map((artifact) => [artifact, [] as T[]]));
}

/**
 * toSortedValues 함수.
 * Set 기반 값을 stable array로 정렬해 machine-readable contract로 바꾼다.
 *
 * @param values - 정렬할 문자열 집합
 * @returns 사전순 정렬된 문자열 배열
 */
function toSortedValues(values: Iterable<string>): readonly string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

/**
 * createDisplayName 함수.
 * registry element가 사용자에게 보여줄 짧은 표시 이름을 계산함.
 *
 * @param relativePath - workspace 상대 경로
 * @param section - optional fragment section 이름
 * @returns 파일명 기반 표시 이름
 */
function createDisplayName(relativePath: string, section?: string): string {
  const fileName = path.basename(relativePath);
  return section ? `${fileName}#${section}` : fileName;
}

/**
 * createElementName 함수.
 * future UnifiedVariableGraph seed에서 충돌이 없도록 workspace-relative 이름을 고정함.
 *
 * @param relativePath - workspace 상대 경로
 * @param section - optional fragment section 이름
 * @returns stable element 이름
 */
function createElementName(relativePath: string, section?: string): string {
  return section ? `${relativePath}#${section}` : relativePath;
}

/**
 * createFragmentDescriptor 함수.
 * core fragment를 registry snapshot에 바로 넣을 수 있는 descriptor로 변환함.
 *
 * @param fragment - core fragment metadata
 * @param fragmentIndex - stable ordering index for disambiguation
 * @returns registry용 fragment descriptor
 */
function createFragmentDescriptor(
  fragment: CbsFragment,
  fragmentIndex: number,
): ElementRegistryFragmentDescriptor {
  return {
    section: fragment.section,
    fragmentIndex,
    start: fragment.start,
    end: fragment.end,
    content: fragment.content,
    contentLength: fragment.content.length,
    hostRange: { start: fragment.start, end: fragment.end },
  };
}

/**
 * createVariableAccess 함수.
 * CBS read/write 결과를 sorted array 기반 contract로 정규화함.
 *
 * @param reads - read 변수 집합
 * @param writes - write 변수 집합
 * @returns stable variable access snapshot
 */
function createVariableAccess(
  reads: Iterable<string>,
  writes: Iterable<string>,
): ElementRegistryVariableAccess {
  return {
    reads: toSortedValues(reads),
    writes: toSortedValues(writes),
  };
}

/**
 * buildFragmentElement 함수.
 * lorebook/regex/prompt/html fragment 한 건을 registry element와 graph seed로 변환함.
 *
 * @param file - 원본 scan file
 * @param fragment - 변환할 CBS fragment
 * @param fragmentIndex - stable ordering index for disambiguation
 * @returns fragment element, graph seed, core seed tuple
 */
function buildFragmentElement(
  file: WorkspaceScanFile,
  fragment: CbsFragment,
  fragmentIndex: number,
): BuiltRegistryFileRecord['elements'][number] & {
  elementCbsData: ElementCBSData;
} {
  const ops = extractCBSVarOps(fragment.content);
  const elementName = createElementName(file.relativePath, fragment.section);
  /**
   * Deterministic element ID with fragment index disambiguation.
   * Format: {uri}#fragment:{section}:{index}
   * This ensures duplicate section names never collide.
   */
  const elementId = `${file.uri}#fragment:${fragment.section}:${fragmentIndex}`;
  const graphSeed: ElementRegistryGraphSeed = {
    elementId,
    uri: file.uri,
    relativePath: file.relativePath,
    artifact: file.artifact,
    artifactClass: file.artifactClass,
    elementName,
    fragmentSection: fragment.section,
    fragmentIndex,
    analysisKind: 'cbs-fragment',
    cbs: createVariableAccess(ops.reads, ops.writes),
    hostRange: { start: fragment.start, end: fragment.end },
  };

  const elementCbsData: ElementCBSData = {
    elementType: file.artifact,
    elementName,
    reads: new Set(graphSeed.cbs.reads),
    writes: new Set(graphSeed.cbs.writes),
  };

  return {
    id: elementId,
    uri: file.uri,
    absolutePath: file.absolutePath,
    relativePath: file.relativePath,
    artifact: file.artifact,
    artifactClass: file.artifactClass,
    elementName,
    displayName: createDisplayName(file.relativePath, fragment.section),
    analysisKind: 'cbs-fragment',
    fragment: createFragmentDescriptor(fragment, fragmentIndex),
    fragmentIndex,
    cbs: graphSeed.cbs,
    graphSeed,
    elementCbsData,
  };
}

/**
 * buildLuaFileRecord 함수.
 * `.risulua` 파일 전체를 Lua 분석 기반 registry element로 변환함.
 *
 * @param file - 원본 scan file
 * @returns lua registry record, or graceful failure metadata when analysis throws
 */
function buildLuaFileRecord(file: WorkspaceScanFile): BuiltRegistryFileRecord {
  try {
    const source = file.fragmentMap.fragments[0]?.content ?? '';
    const luaArtifact = analyzeLuaSource({
      filePath: file.absolutePath,
      source,
    });
    const cbsSeed = luaArtifact.elementCbs[0] ?? {
      elementType: 'lua',
      elementName: file.relativePath,
      reads: new Set<string>(),
      writes: new Set<string>(),
    };
    const elementName = createElementName(file.relativePath);
    const graphSeed: ElementRegistryGraphSeed = {
      elementId: `${file.uri}#lua`,
      uri: file.uri,
      relativePath: file.relativePath,
      artifact: file.artifact,
      artifactClass: file.artifactClass,
      elementName,
      fragmentSection: null,
      fragmentIndex: -1,
      analysisKind: 'lua-file',
      cbs: createVariableAccess(cbsSeed.reads, cbsSeed.writes),
      hostRange: null,
    };
    const elementCbsData: ElementCBSData = {
      elementType: 'lua',
      elementName,
      reads: new Set(graphSeed.cbs.reads),
      writes: new Set(graphSeed.cbs.writes),
    };
    const element: ElementRegistryLuaElement = {
      id: graphSeed.elementId,
      uri: file.uri,
      absolutePath: file.absolutePath,
      relativePath: file.relativePath,
      artifact: file.artifact,
      artifactClass: file.artifactClass,
      elementName,
      displayName: createDisplayName(file.relativePath),
      analysisKind: 'lua-file',
      fragment: null,
      cbs: graphSeed.cbs,
      graphSeed,
      lua: {
        baseName: luaArtifact.baseName,
        totalLines: luaArtifact.totalLines,
        functionNames: luaArtifact.serialized.functions
          .map((entry) => String(entry.displayName ?? entry.name ?? ''))
          .filter((name) => name.length > 0)
          .sort((left, right) => left.localeCompare(right)),
        stateVariableNames: Object.keys(luaArtifact.serialized.stateVars).sort((left, right) =>
          left.localeCompare(right),
        ),
      },
    };

    return {
      record: {
        uri: file.uri,
        absolutePath: file.absolutePath,
        relativePath: file.relativePath,
        text: file.text,
        artifact: file.artifact,
        artifactClass: file.artifactClass,
        cbsBearingArtifact: file.cbsBearingArtifact,
        hasCbsFragments: file.hasCbsFragments,
        fragmentCount: file.fragmentCount,
        fragmentSections: file.fragmentSections,
        analysisKind: 'lua-file',
        elementIds: [element.id],
        graphSeedCount: 1,
        analysisError: null,
      },
      elements: [element],
      graphSeeds: [graphSeed],
      elementCbsData: [elementCbsData],
      luaArtifact,
    };
  } catch (error) {
    return {
      record: {
        uri: file.uri,
        absolutePath: file.absolutePath,
        relativePath: file.relativePath,
        text: file.text,
        artifact: file.artifact,
        artifactClass: file.artifactClass,
        cbsBearingArtifact: file.cbsBearingArtifact,
        hasCbsFragments: file.hasCbsFragments,
        fragmentCount: file.fragmentCount,
        fragmentSections: file.fragmentSections,
        analysisKind: 'lua-file',
        elementIds: [],
        graphSeedCount: 0,
        analysisError: error instanceof Error ? error.message : String(error),
      },
      elements: [],
      graphSeeds: [],
      elementCbsData: [],
      luaArtifact: null,
    };
  }
}

/**
 * buildRegistryFileRecord 함수.
 * scan file 한 건을 ElementRegistry 내부 저장 형태로 변환함.
 *
 * @param file - scan result file entry
 * @returns registry file record와 파생 element/seed 묶음
 */
function buildRegistryFileRecord(file: WorkspaceScanFile): BuiltRegistryFileRecord {
  if (!file.cbsBearingArtifact) {
    return {
      record: {
        uri: file.uri,
        absolutePath: file.absolutePath,
        relativePath: file.relativePath,
        text: file.text,
        artifact: file.artifact,
        artifactClass: file.artifactClass,
        cbsBearingArtifact: file.cbsBearingArtifact,
        hasCbsFragments: file.hasCbsFragments,
        fragmentCount: file.fragmentCount,
        fragmentSections: file.fragmentSections,
        analysisKind: 'non-cbs-artifact',
        elementIds: [],
        graphSeedCount: 0,
        analysisError: null,
      },
      elements: [],
      graphSeeds: [],
      elementCbsData: [],
      luaArtifact: null,
    };
  }

  if (file.artifact === 'lua') {
    return buildLuaFileRecord(file);
  }

  if (!file.hasCbsFragments) {
    return {
      record: {
        uri: file.uri,
        absolutePath: file.absolutePath,
        relativePath: file.relativePath,
        text: file.text,
        artifact: file.artifact,
        artifactClass: file.artifactClass,
        cbsBearingArtifact: file.cbsBearingArtifact,
        hasCbsFragments: file.hasCbsFragments,
        fragmentCount: file.fragmentCount,
        fragmentSections: file.fragmentSections,
        analysisKind: 'cbs-without-fragments',
        elementIds: [],
        graphSeedCount: 0,
        analysisError: null,
      },
      elements: [],
      graphSeeds: [],
      elementCbsData: [],
      luaArtifact: null,
    };
  }

  /**
   * Sort fragments by host position for deterministic ordering.
   * This ensures fragmentIndex is stable across rebuilds.
   */
  const sortedFragments = [...file.fragmentMap.fragments].sort((left, right) => {
    return (
      left.start - right.start ||
      left.end - right.end ||
      left.section.localeCompare(right.section) ||
      left.content.localeCompare(right.content)
    );
  });

  const fragmentElements = sortedFragments.map((fragment, index) =>
    buildFragmentElement(file, fragment, index),
  );

  return {
    record: {
      uri: file.uri,
      absolutePath: file.absolutePath,
      relativePath: file.relativePath,
      text: file.text,
      artifact: file.artifact,
      artifactClass: file.artifactClass,
      cbsBearingArtifact: file.cbsBearingArtifact,
      hasCbsFragments: file.hasCbsFragments,
      fragmentCount: file.fragmentCount,
      fragmentSections: file.fragmentSections,
      analysisKind: 'cbs-fragments',
      elementIds: fragmentElements.map((element) => element.id),
      graphSeedCount: fragmentElements.length,
      analysisError: null,
    },
    elements: fragmentElements,
    graphSeeds: fragmentElements.map((element) => element.graphSeed),
    elementCbsData: fragmentElements.map((element) => element.elementCbsData),
    luaArtifact: null,
  };
}

/**
 * ElementRegistry 클래스.
 * FileScanner scan result를 Layer 3가 재사용할 URI/artifact 중심 read model로 정규화해 보관함.
 */
export class ElementRegistry {
  private rootPath = '';
  private snapshot: ElementRegistrySnapshot = {
    rootPath: '',
    files: [],
    elements: [],
    graphSeeds: [],
    summary: {
      totalFiles: 0,
      totalElements: 0,
      totalGraphSeeds: 0,
      byArtifact: createArtifactSummaryRecord(),
    },
  };
  private readonly filesByUri = new Map<string, ElementRegistryFileRecord>();
  private readonly filesByArtifact = createArtifactBuckets<ElementRegistryFileRecord>();
  private readonly elementsByUri = new Map<string, readonly ElementRegistryElement[]>();
  private readonly elementsByArtifact = createArtifactBuckets<ElementRegistryElement>();
  private readonly graphSeedsByUri = new Map<string, readonly ElementRegistryGraphSeed[]>();
  private readonly elementCbsDataByUri = new Map<string, readonly ElementCBSData[]>();
  private readonly luaArtifactsByUri = new Map<string, LuaAnalysisArtifact>();

  constructor(scanResult: WorkspaceScanResult) {
    this.rebuild(scanResult);
  }

  /**
   * fromScanResult 함수.
   * FileScanner 결과에서 registry를 즉시 생성하는 convenience helper.
   *
   * @param scanResult - FileScanner가 만든 workspace scan result
   * @returns 새 ElementRegistry 인스턴스
   */
  static fromScanResult(scanResult: WorkspaceScanResult): ElementRegistry {
    return new ElementRegistry(scanResult);
  }

  /**
   * rebuild 함수.
   * 최신 scan result 전체를 다시 읽어 registry snapshot과 query index를 재구성함.
   *
   * @param scanResult - FileScanner가 만든 workspace scan result
   * @returns 갱신된 registry snapshot
   */
  rebuild(scanResult: WorkspaceScanResult): ElementRegistrySnapshot {
    this.rootPath = scanResult.rootPath;
    this.filesByUri.clear();
    this.elementsByUri.clear();
    this.graphSeedsByUri.clear();
    this.elementCbsDataByUri.clear();
    this.luaArtifactsByUri.clear();

    for (const artifact of CUSTOM_EXTENSION_ARTIFACTS) {
      this.filesByArtifact.set(artifact, []);
      this.elementsByArtifact.set(artifact, []);
    }

    for (const file of scanResult.files) {
      this.upsertFile(file);
    }

    return this.rebuildSnapshot();
  }

  /**
   * upsertFile 함수.
   * 단일 scan file 변경만 registry에 부분 반영하고 snapshot을 다시 고정함.
   *
   * @param file - 최신 workspace scan file entry
   * @returns 갱신된 file record
   */
  upsertFile(file: WorkspaceScanFile): ElementRegistryFileRecord {
    const built = buildRegistryFileRecord(file);
    this.removeFileFromIndexes(built.record.uri);

    this.filesByUri.set(built.record.uri, built.record);
    this.filesByArtifact.get(file.artifact)?.push(built.record);
    this.elementsByUri.set(built.record.uri, built.elements);
    this.elementsByArtifact.get(file.artifact)?.push(...built.elements);
    this.graphSeedsByUri.set(built.record.uri, built.graphSeeds);
    this.elementCbsDataByUri.set(built.record.uri, built.elementCbsData);

    if (built.luaArtifact) {
      this.luaArtifactsByUri.set(built.record.uri, built.luaArtifact);
    }

    this.rebuildSnapshot();
    return built.record;
  }

  /**
   * removeFile 함수.
   * URI 하나를 registry에서 제거하고 snapshot을 다시 고정함.
   *
   * @param uri - 제거할 file URI
   * @returns 실제로 제거된 파일이 있었는지 여부
   */
  removeFile(uri: string): boolean {
    const didExist = this.filesByUri.has(uri);
    if (!didExist) {
      return false;
    }

    this.removeFileFromIndexes(uri);
    this.rebuildSnapshot();
    return true;
  }

  /**
   * getSnapshot 함수.
   * 현재 registry 전체 상태를 stable read model shape로 돌려줌.
   *
   * @returns registry snapshot
   */
  getSnapshot(): ElementRegistrySnapshot {
    return this.snapshot;
  }

  /**
   * getFileByUri 함수.
   * 특정 URI의 file-level registry record를 조회함.
   *
   * @param uri - 조회할 file URI
   * @returns 해당 file record 또는 null
   */
  getFileByUri(uri: string): ElementRegistryFileRecord | null {
    return this.filesByUri.get(uri) ?? null;
  }

  /**
   * getElementsByUri 함수.
   * 특정 URI 아래에 등록된 fragment/lua element 목록을 조회함.
   *
   * @param uri - 조회할 file URI
   * @returns 해당 URI의 registry element 목록
   */
  getElementsByUri(uri: string): readonly ElementRegistryElement[] {
    return this.elementsByUri.get(uri) ?? [];
  }

  /**
   * getFilesByArtifact 함수.
   * artifact kind 기준으로 file-level registry record를 모아 조회함.
   *
   * @param artifact - 조회할 artifact 종류
   * @returns 해당 artifact의 file record 목록
   */
  getFilesByArtifact(artifact: CustomExtensionArtifact): readonly ElementRegistryFileRecord[] {
    return this.filesByArtifact.get(artifact) ?? [];
  }

  /**
   * getElementsByArtifact 함수.
   * artifact kind 기준으로 element-level registry record를 모아 조회함.
   *
   * @param artifact - 조회할 artifact 종류
   * @returns 해당 artifact의 element 목록
   */
  getElementsByArtifact(artifact: CustomExtensionArtifact): readonly ElementRegistryElement[] {
    return this.elementsByArtifact.get(artifact) ?? [];
  }

  /**
   * getGraphSeeds 함수.
   * future UnifiedVariableGraph가 재사용할 normalized graph seed 목록을 돌려줌.
   *
   * @returns registry 전체 graph seed 목록
   */
  getGraphSeeds(): readonly ElementRegistryGraphSeed[] {
    return this.snapshot.graphSeeds;
  }

  /**
   * getGraphSeedsByUri 함수.
   * 특정 URI에서 나온 graph seed만 조회함.
   *
   * @param uri - 조회할 file URI
   * @returns 해당 URI의 graph seed 목록
   */
  getGraphSeedsByUri(uri: string): readonly ElementRegistryGraphSeed[] {
    return this.graphSeedsByUri.get(uri) ?? [];
  }

  /**
   * getElementCbsDataByUri 함수.
   * core `buildUnifiedCBSGraph()`에 바로 넘길 수 있는 seed를 URI 기준으로 조회함.
   *
   * @param uri - 조회할 file URI
   * @returns 해당 URI의 ElementCBSData 목록
   */
  getElementCbsDataByUri(uri: string): readonly ElementCBSData[] {
    return this.elementCbsDataByUri.get(uri) ?? [];
  }

  /**
   * getAllElementCbsData 함수.
   * registry 전역의 core graph seed를 합쳐 돌려줌.
   *
   * @returns registry 전체 ElementCBSData 목록
   */
  getAllElementCbsData(): readonly ElementCBSData[] {
    return this.snapshot.files.flatMap((file) => this.getElementCbsDataByUri(file.uri));
  }

  /**
   * getLuaArtifactByUri 함수.
   * Lua artifact의 상세 분석 결과가 필요할 때 raw core artifact를 조회함.
   *
   * @param uri - 조회할 Lua file URI
   * @returns Lua analysis artifact 또는 null
   */
  getLuaArtifactByUri(uri: string): LuaAnalysisArtifact | null {
    return this.luaArtifactsByUri.get(uri) ?? null;
  }

  /**
   * getRootPath 함수.
   * 현재 registry가 보유한 workspace root를 반환함.
   *
   * @returns registry root path
   */
  getRootPath(): string {
    return this.rootPath;
  }

  /**
   * removeFileFromIndexes 함수.
   * 특정 URI의 기존 file/element/graph index를 모두 제거함.
   *
   * @param uri - 제거할 file URI
   */
  private removeFileFromIndexes(uri: string): void {
    const previousRecord = this.filesByUri.get(uri);
    if (!previousRecord) {
      return;
    }

    this.filesByUri.delete(uri);
    this.elementsByUri.delete(uri);
    this.graphSeedsByUri.delete(uri);
    this.elementCbsDataByUri.delete(uri);
    this.luaArtifactsByUri.delete(uri);

    const artifactFiles = this.filesByArtifact.get(previousRecord.artifact);
    if (artifactFiles) {
      this.filesByArtifact.set(
        previousRecord.artifact,
        artifactFiles.filter((record) => record.uri !== uri),
      );
    }

    const artifactElements = this.elementsByArtifact.get(previousRecord.artifact);
    if (artifactElements) {
      this.elementsByArtifact.set(
        previousRecord.artifact,
        artifactElements.filter((element) => element.uri !== uri),
      );
    }
  }

  /**
   * rebuildSnapshot 함수.
   * 현재 index map들을 기반으로 stable snapshot/summary를 다시 계산함.
   *
   * @returns 최신 registry snapshot
   */
  private rebuildSnapshot(): ElementRegistrySnapshot {
    const files = [...this.filesByUri.values()].sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath) || left.absolutePath.localeCompare(right.absolutePath),
    );
    const elements = files.flatMap((file) => this.getElementsByUri(file.uri));
    const graphSeeds = files.flatMap((file) => this.getGraphSeedsByUri(file.uri));
    const byArtifact = createArtifactSummaryRecord();

    for (const file of files) {
      const elementList = this.getElementsByUri(file.uri);
      const seedList = this.getGraphSeedsByUri(file.uri);
      byArtifact[file.artifact].files += 1;
      byArtifact[file.artifact].elements += elementList.length;
      byArtifact[file.artifact].graphSeeds += seedList.length;
    }

    this.snapshot = {
      rootPath: this.rootPath,
      files,
      elements,
      graphSeeds,
      summary: {
        totalFiles: files.length,
        totalElements: elements.length,
        totalGraphSeeds: graphSeeds.length,
        byArtifact,
      },
    };

    return this.snapshot;
  }
}

/**
 * createElementRegistry 함수.
 * FileScanner scan result에서 registry를 바로 구성하는 helper.
 *
 * @param scanResult - FileScanner가 만든 workspace scan result
 * @returns 새 ElementRegistry 인스턴스
 */
export function createElementRegistry(scanResult: WorkspaceScanResult): ElementRegistry {
  return ElementRegistry.fromScanResult(scanResult);
}
