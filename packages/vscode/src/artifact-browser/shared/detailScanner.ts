/**
 * Character/Module detail scanner에서 공유하는 generic file collection, path normalization, item ID 생성 helper.
 * @file packages/vscode/src/artifact-browser/shared/detailScanner.ts
 */

import path from 'node:path';
import * as vscode from 'vscode';
import type {
  BrowserItem,
  BrowserItemType,
  BrowserSection,
  BrowserSectionKind,
  BrowserTreeNode,
  ManifestParseWarning,
} from '../artifactBrowserTypes';

/**
 * 두 artifact 스캐너 모두에서 건너뛰는 directory 이름 집합.
 */
export const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.history',
  '.vscode',
  'dist',
  'build',
  'out',
  'coverage',
  'assets',
]);

/**
 * Detail accordion에 표시하지 않을 meta/manifest 파일 이름 집합.
 * 예: lorebooks/_order.json, lua/_order.json 등 내부 순서 정의 파일.
 */
export const SKIPPED_FILE_NAMES = new Set([
  '_order.json',
]);

/** 단일 스캔에서 수집하는 최대 파일 수. */
export const MAX_SCANNED_FILES = 500;

/** directory 재귀 최대 깊이. */
export const MAX_SCAN_DEPTH = 8;

/**
 * Section이 count로 finalise되기 전 draft shape.
 */
export type SectionDraft = Omit<BrowserSection, 'count'>;

/**
 * Artifact 종류별 scanner 설정을 제공하는 interface.
 * 각 scanner는 자신만의 section ordering, classifier, manifest marker를 정의함.
 */
export interface ScannerConfig<
  TSectionKind extends BrowserSectionKind,
  TItemType extends BrowserItemType,
> {
  /** 스캔 결과 section의 정렬 순서. */
  sectionOrder: TSectionKind[];
  /** 각 section draft를 kind별로 생성하는 factory. */
  createSectionDrafts: () => Record<TSectionKind, SectionDraft>;
  /** relative path를 section kind로 분류. Artifact별 고유 로직. */
  classifyFile: (relativePath: string) => TSectionKind | undefined;
  /** relative path + section kind를 item type으로 분류. Artifact별 고유 로직. */
  classifyItemType: (relativePath: string, sectionId: TSectionKind) => TItemType;
  /** Manifest marker 파일명 (예: '.risuchar', '.risumodule'). */
  manifestMarkerName: string;
  /** Manifest marker가 속할 section kind. 항상 'manifest'. */
  manifestSectionKind: TSectionKind;
  /** marker root 바로 아래에서만 스캔할 artifact content directory 이름 목록. */
  scanDirectories: readonly string[];
}

/**
 * ScannerConfig 기반으로 동작하는 generic detail scanner.
 * 파일 수집, deduplication, section finalisation 공통 로직을 캡슐화함.
 */
export class GenericDetailScanner<
  TSectionKind extends BrowserSectionKind,
  TItemType extends BrowserItemType,
> {
  constructor(private readonly config: ScannerConfig<TSectionKind, TItemType>) {}

  /**
   * scan 함수.
   * card의 root URI에서 파일을 수집하고 section/item model을 구성함.
   *
   * @param card - 스캔할 artifact card (stableId, markerUri, warnings 필요)
   * @returns section order 대로 정렬된 최종 section 목록
   */
  async scan(card: {
    stableId: string;
    markerUri: string;
    warnings: ManifestParseWarning[];
  }): Promise<BrowserSection[]> {
    const markerUri = vscode.Uri.parse(card.markerUri);
    const scanRootUri = vscode.Uri.file(path.dirname(markerUri.fsPath));
    const sections = this.config.createSectionDrafts();
    const usedRelativePaths = new Set<string>();

    addItem(
      sections[this.config.manifestSectionKind],
      createFileItem(
        card.stableId,
        this.config.manifestSectionKind,
        this.config.manifestMarkerName,
        markerUri,
        'manifest',
        this.config.classifyItemType,
      ),
    );
    usedRelativePaths.add(this.config.manifestMarkerName);

    const files = await this.collectFiles(scanRootUri, this.config.scanDirectories);
    for (const file of files) {
      if (file.relativePath === this.config.manifestMarkerName) continue;
      if (SKIPPED_FILE_NAMES.has(path.posix.basename(file.relativePath))) continue;
      const sectionKind = this.config.classifyFile(file.relativePath);
      if (!sectionKind || usedRelativePaths.has(file.relativePath)) continue;

      addItem(
        sections[sectionKind],
        createFileItem(
          card.stableId,
          sectionKind,
          file.relativePath,
          file.uri,
          'scanner',
          this.config.classifyItemType,
        ),
      );
      usedRelativePaths.add(file.relativePath);
    }

    for (const warning of card.warnings) {
      const diagnosticsSection = (sections as Record<string, SectionDraft>)['diagnostics'];
      if (diagnosticsSection) {
        addItem(diagnosticsSection, createDiagnosticItem(card.stableId, warning));
      }
    }

    await this.populateLorebookTree(scanRootUri, sections);
    await this.populateLuaTree(sections);
    await this.populateRegexOrder(scanRootUri, sections);

    return this.config.sectionOrder.map((kind) => ({
      ...sections[kind],
      count: sections[kind].items.length,
    }));
  }

  private async collectFiles(
    rootUri: vscode.Uri,
    scanDirectories: readonly string[],
  ): Promise<Array<{ uri: vscode.Uri; relativePath: string }>> {
    const files: Array<{ uri: vscode.Uri; relativePath: string }> = [];
    for (const directoryName of scanDirectories) {
      if (SKIPPED_DIRECTORIES.has(directoryName)) continue;
      await this.collectFilesFromDirectory(vscode.Uri.joinPath(rootUri, directoryName), directoryName, 0, files);
      if (files.length >= MAX_SCANNED_FILES) break;
    }
    return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }

  private async collectFilesFromDirectory(
    directoryUri: vscode.Uri,
    directoryRelativePath: string,
    depth: number,
    files: Array<{ uri: vscode.Uri; relativePath: string }>,
  ): Promise<void> {
    if (files.length >= MAX_SCANNED_FILES) return;
    if (depth > MAX_SCAN_DEPTH) return;

    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(directoryUri);
    } catch {
      return;
    }

    for (const [name, fileType] of entries) {
      if (files.length >= MAX_SCANNED_FILES) return;
      if (fileType === vscode.FileType.Directory && SKIPPED_DIRECTORIES.has(name)) continue;

      const childRelativePath = directoryRelativePath ? `${directoryRelativePath}/${name}` : name;
      const childUri = vscode.Uri.joinPath(directoryUri, name);

      if (fileType === vscode.FileType.Directory) {
        await this.collectFilesFromDirectory(childUri, childRelativePath, depth + 1, files);
        continue;
      }

      if (fileType === vscode.FileType.File) {
        files.push({
          uri: childUri,
          relativePath: normalizeRelativePath(childRelativePath) ?? childRelativePath,
        });
      }
    }
  }

  private async populateLorebookTree(
    scanRootUri: vscode.Uri,
    sections: Record<TSectionKind, SectionDraft>,
  ): Promise<void> {
    const lorebookSection = (sections as Record<string, SectionDraft>)['lorebooks'];
    if (!lorebookSection || lorebookSection.items.length === 0) return;

    const orderedItems = await orderLorebookItems(scanRootUri, lorebookSection.items);
    lorebookSection.tree = buildBrowserItemTree(orderedItems);
  }

  private async populateLuaTree(sections: Record<TSectionKind, SectionDraft>): Promise<void> {
    const luaSection = (sections as Record<string, SectionDraft>)['lua'];
    if (!luaSection || luaSection.items.length === 0) return;

    const orderedItems = luaSection.items
      .map((item) => ({ item, localPath: getLuaTreePath(item) }))
      .sort((left, right) => {
        const leftHasSlash = left.localPath.includes('/');
        const rightHasSlash = right.localPath.includes('/');
        if (leftHasSlash !== rightHasSlash) return leftHasSlash ? 1 : -1;
        return left.localPath.localeCompare(right.localPath);
      })
      .map((entry) => entry.item);

    luaSection.items = orderedItems;
    luaSection.tree = buildLuaItemTree(orderedItems);
  }

  private async populateRegexOrder(
    scanRootUri: vscode.Uri,
    sections: Record<TSectionKind, SectionDraft>,
  ): Promise<void> {
    const regexSection = (sections as Record<string, SectionDraft>)['regexRules'];
    if (!regexSection || regexSection.items.length === 0) return;

    regexSection.items = await orderDirectoryItems(scanRootUri, 'regex', regexSection.items);
  }
}

const LOREBOOK_DIRECTORY_NAMES = ['lorebooks', 'lorebook'] as const;

async function orderLorebookItems(rootUri: vscode.Uri, items: BrowserItem[]): Promise<BrowserItem[]> {
  const ordered: BrowserItem[] = [];
  const seen = new Set<string>();

  for (const directoryName of LOREBOOK_DIRECTORY_NAMES) {
    const directoryItems = items
      .map((item) => ({ item, localPath: stripDirectoryPrefix(item.relativePath, directoryName) }))
      .filter((entry): entry is { item: BrowserItem; localPath: string } => entry.localPath !== undefined)
      .sort((left, right) => left.localPath.localeCompare(right.localPath));
    if (directoryItems.length === 0) continue;

    const declaredOrder = await readLorebookOrder(rootUri, directoryName);
    const directoryItemsByLocalPath = new Map(directoryItems.map((entry) => [entry.localPath, entry.item]));
    for (const orderPath of declaredOrder) {
      const item = directoryItemsByLocalPath.get(orderPath);
      if (!item || seen.has(item.id)) continue;
      ordered.push(item);
      seen.add(item.id);
    }

    for (const entry of directoryItems) {
      if (seen.has(entry.item.id)) continue;
      ordered.push(entry.item);
      seen.add(entry.item.id);
    }
  }

  for (const item of items) {
    if (seen.has(item.id)) continue;
    ordered.push(item);
    seen.add(item.id);
  }

  return ordered;
}

async function readLorebookOrder(rootUri: vscode.Uri, directoryName: string): Promise<string[]> {
  try {
    const orderUri = vscode.Uri.joinPath(rootUri, directoryName, '_order.json');
    const content = Buffer.from(await vscode.workspace.fs.readFile(orderUri)).toString('utf8');
    const parsed: unknown = JSON.parse(content);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => (typeof entry === 'string' ? normalizeRelativePath(entry) : undefined))
      .filter((entry): entry is string => entry !== undefined);
  } catch {
    return [];
  }
}

async function orderDirectoryItems(
  rootUri: vscode.Uri,
  directoryName: string,
  items: BrowserItem[],
): Promise<BrowserItem[]> {
  const directoryItems = items
    .map((item) => ({ item, localPath: stripDirectoryPrefix(item.relativePath, directoryName) }))
    .filter((entry): entry is { item: BrowserItem; localPath: string } => entry.localPath !== undefined)
    .sort((left, right) => left.localPath.localeCompare(right.localPath));
  if (directoryItems.length === 0) return items;

  const declaredOrder = await readLorebookOrder(rootUri, directoryName);
  const byLocalPath = new Map(directoryItems.map((entry) => [entry.localPath, entry.item]));
  const ordered: BrowserItem[] = [];
  const seen = new Set<string>();

  for (const orderPath of declaredOrder) {
    const item = byLocalPath.get(orderPath);
    if (!item || seen.has(item.id)) continue;
    ordered.push(item);
    seen.add(item.id);
  }

  for (const entry of directoryItems) {
    if (seen.has(entry.item.id)) continue;
    ordered.push(entry.item);
    seen.add(entry.item.id);
  }

  for (const item of items) {
    if (seen.has(item.id)) continue;
    ordered.push(item);
    seen.add(item.id);
  }

  return ordered;
}

function buildBrowserItemTree(items: BrowserItem[]): BrowserTreeNode[] {
  const roots: BrowserTreeNode[] = [];
  const folders = new Map<string, BrowserTreeNode>();

  for (const item of items) {
    const treePath = getLorebookTreePath(item);
    const segments = treePath.split('/').filter(Boolean);
    if (segments.length === 0) {
      roots.push(createItemTreeNode(item));
      continue;
    }

    let siblings = roots;
    let folderPath = '';
    for (const segment of segments.slice(0, -1)) {
      folderPath = folderPath ? `${folderPath}/${segment}` : segment;
      let folderNode = folders.get(folderPath);
      if (!folderNode) {
        folderNode = {
          id: `folder:${folderPath}`,
          label: segment,
          kind: 'folder',
          relativePath: folderPath,
          lorebookPath: folderPath,
          children: [],
        };
        folders.set(folderPath, folderNode);
        siblings.push(folderNode);
      }
      siblings = folderNode.children ?? [];
    }

    siblings.push(createItemTreeNode(item));
  }

  return roots;
}

function createItemTreeNode(item: BrowserItem): BrowserTreeNode {
  return {
    id: `item:${item.id}`,
    label: item.label,
    kind: 'item',
    relativePath: item.relativePath,
    lorebookPath: getLorebookTreePath(item),
    item,
  };
}

function getLorebookTreePath(item: BrowserItem): string {
  for (const directoryName of LOREBOOK_DIRECTORY_NAMES) {
    const localPath = stripDirectoryPrefix(item.relativePath, directoryName);
    if (localPath) return localPath;
  }
  return item.relativePath ?? item.label;
}

interface LuaTreeMetadata {
  description: string;
  detailDescription: string;
}

const LUA_TREE_METADATA: Record<string, LuaTreeMetadata> = {
  'main.risulua': {
    description: '시스템의 초기화와 전체 흐름을 제어하는 최상위 관제 모듈',
    detailDescription: '분산된 하위 모듈들을 하나로 병합하고, RisuAI 호스트 환경과의 통신 규약(ABI)을 정의하는 중심 파일입니다.',
  },
  runtime: {
    description: '시스템의 실행 주기에 맞춘 이벤트 처리 계층',
    detailDescription: '`onStart`, `onInput`, `onOutput` 같은 런타임 경계에서 발생하는 트리거를 감지하고 지정된 동작이 정확한 타이밍에 실행되도록 제어합니다.',
  },
  handler_helpers: {
    description: '런타임 이벤트 처리를 위한 내부 유틸리티 계층',
    detailDescription: '메인 이벤트 루프의 복잡도를 낮추기 위해 핸들러 내부에서 호출되는 종속 로직을 캡슐화한 서브루틴 영역입니다.',
  },
  common: {
    description: '도메인에 종속되지 않은 순수 공용 함수 집합',
    detailDescription: '데이터 가공, 계산, 반복 호출되는 독립 헬퍼 로직을 모아 코드 재사용성과 유지보수성을 높입니다.',
  },
  host_globals: {
    description: '시스템 전역에서 접근 가능한 공용 API 계층',
    detailDescription: '어디서든 호출 가능한 글로벌 함수와 비동기 액션을 정의하며, 호스트 상태에 영향을 줄 수 있는 민감한 기능을 다룹니다.',
  },
  button_actions: {
    description: '사용자 UI 상호작용에 응답하는 이벤트 모듈',
    detailDescription: '사용자가 버튼을 클릭했을 때 발생하는 상태 변화나 실행 액션을 개별적으로 정의하고 매핑합니다.',
  },
  state: {
    description: '시스템의 휘발성 및 비휘발성 데이터를 보관하는 저장소',
    detailDescription: '세션 진행 상황, 전역 변수 등 런타임 동안 유지·추적해야 하는 주요 상태값을 구조화해 관리합니다.',
  },
  prompts: {
    description: 'AI 모델 제어를 위한 텍스트 및 상수 데이터베이스',
    detailDescription: 'AI의 행동 양식과 컨텍스트를 통제하는 instruction, prompt 상수를 코드와 분리해 관리합니다.',
  },
  domain: {
    description: '핵심 기능이 기능적/주제별로 응집된 주 개발 구역',
    detailDescription: '카드 연산, 텍스트 파싱 등 특정 주제에 속하는 핵심 로직이 모이는 실제 개발·유지보수 중심 영역입니다.',
  },
  schema: {
    description: '시스템의 기반이 되는 불변 데이터 명세서',
    detailDescription: '런타임 중 임의로 변경되지 않아야 하는 기본 설정값, 데이터 구조, 전역 상수를 정의합니다.',
  },
  features: {
    description: '특정 도메인으로 분류하기 어려운 포괄적 기능 집합',
    detailDescription: '아직 명확한 도메인 경계가 없거나 여러 환경에 걸쳐 동작하는 큰 기능을 임시 수용하는 공간입니다.',
  },
  sections: {
    description: '번들 마커 복구용 ordered chunk fragment',
    detailDescription: '`[BUNDLE]` marker recovery 전용 조각입니다. 독립 require module이 아니라 순서가 중요한 fragment로 취급합니다.',
  },
  preload: {
    description: 'package.preload 복구 wrapper 저장소',
    detailDescription: '`package.preload` recovery 전용 영역으로, preload wrapper body를 파일로 복구한 결과를 담습니다.',
  },
};

function buildLuaItemTree(items: BrowserItem[]): BrowserTreeNode[] {
  const roots: BrowserTreeNode[] = [];
  const folders = new Map<string, BrowserTreeNode>();

  for (const item of items) {
    const treePath = getLuaTreePath(item);
    const segments = treePath.split('/').filter(Boolean);
    if (segments.length === 0) {
      roots.push(createLuaItemTreeNode(item, item.label));
      continue;
    }

    let siblings = roots;
    let folderPath = '';
    for (const segment of segments.slice(0, -1)) {
      folderPath = folderPath ? `${folderPath}/${segment}` : segment;
      let folderNode = folders.get(folderPath);
      if (!folderNode) {
        folderNode = createLuaFolderTreeNode(segment, folderPath);
        folders.set(folderPath, folderNode);
        siblings.push(folderNode);
      }
      siblings = folderNode.children ?? [];
    }

    siblings.push(createLuaItemTreeNode(item, treePath));
  }

  return roots;
}

function createLuaFolderTreeNode(label: string, treePath: string): BrowserTreeNode {
  return {
    id: `lua-folder:${treePath}`,
    label,
    kind: 'folder',
    relativePath: `lua/${treePath}`,
    treePath,
    ...getLuaTreeMetadata(treePath),
    children: [],
  };
}

function createLuaItemTreeNode(item: BrowserItem, treePath: string): BrowserTreeNode {
  return {
    id: `lua-item:${item.relativePath ?? item.id}`,
    label: item.label,
    kind: 'item',
    relativePath: item.relativePath,
    treePath,
    ...getLuaTreeMetadata(treePath),
    item,
  };
}

function getLuaTreeMetadata(treePath: string): Partial<LuaTreeMetadata> {
  return LUA_TREE_METADATA[treePath] ?? {};
}

function getLuaTreePath(item: BrowserItem): string {
  const localPath = stripDirectoryPrefix(item.relativePath, 'lua');
  return localPath || item.relativePath || item.label;
}

function stripDirectoryPrefix(relativePath: string | undefined, directoryName: string): string | undefined {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized) return undefined;
  if (normalized === directoryName) return '';
  const prefix = `${directoryName}/`;
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : undefined;
}

/**
 * addItem 함수.
 * Section draft에 item을 추가함.
 *
 * @param section - item을 추가할 section draft
 * @param item - 추가할 browser item
 */
export function addItem(section: SectionDraft, item: BrowserItem): void {
  section.items.push(item);
}

/**
 * createFileItem 함수.
 * 파일 기반 browser item을 생성함.
 *
 * @param stableId - artifact의 stable identifier
 * @param sectionId - item이 속할 section kind
 * @param relativePath - marker root 기준 파일의 상대 경로
 * @param uri - 파일의 VS Code URI
 * @param source - item 출처 ('manifest' 또는 'scanner')
 * @param classifyItemType - item type 분류 함수
 * @returns 생성된 browser item
 */
export function createFileItem<
  TSectionKind extends BrowserSectionKind,
  TItemType extends BrowserItemType,
>(
  stableId: string,
  sectionId: TSectionKind,
  relativePath: string,
  uri: vscode.Uri,
  source: 'manifest' | 'scanner',
  classifyItemType: (relativePath: string, sectionId: TSectionKind) => TItemType,
): BrowserItem {
  const extension = path.extname(relativePath).replace('.', '').toLowerCase();
  return {
    id: createItemId(stableId, sectionId, relativePath),
    label: path.posix.basename(relativePath),
    type: classifyItemType(relativePath, sectionId),
    fileUri: uri.toString(),
    relativePath,
    extension: extension || undefined,
    source,
  };
}

/**
 * createDiagnosticItem 함수.
 * Manifest parse warning을 diagnostic browser item으로 변환함.
 *
 * @param stableId - artifact의 stable identifier
 * @param warning - 변환할 manifest parse warning
 * @returns 생성된 diagnostic browser item
 */
export function createDiagnosticItem(stableId: string, warning: ManifestParseWarning): BrowserItem {
  const relativePath = warning.field ? `${warning.code}:${warning.field}` : warning.code;
  return {
    id: createItemId(stableId, 'diagnostics', relativePath),
    label: warning.field ? `${warning.code} · ${warning.field}` : warning.code,
    type: 'diagnostic',
    relativePath,
    description: warning.message,
    source: 'diagnostics',
  };
}

/**
 * createSection 함수.
 * Section draft를 생성함.
 *
 * @param id - section 식별자
 * @param label - UI에 표시할 section 제목
 * @param kind - section kind
 * @returns count가 없는 section draft
 */
export function createSection<TSectionKind extends BrowserSectionKind>(
  id: string,
  label: string,
  kind: TSectionKind,
): SectionDraft {
  return { id, label, kind, items: [] };
}

/**
 * normalizeRelativePath 함수.
 * 역슬래시를 슬래시로 변환하고, 빈 segment를 제거하며, parent traversal을 거부함.
 *
 * @param value - 정규화할 경로
 * @returns 정규화된 경로 또는 거부 시 undefined
 */
export function normalizeRelativePath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/\\/g, '/').split('/').filter(Boolean).join('/');
  if (!normalized || normalized.startsWith('../') || normalized.includes('/../')) return undefined;
  return normalized;
}

/**
 * createItemId 함수.
 * Stable item 식별자를 생성함. Webview가 key로 사용함.
 *
 * @param stableId - artifact의 stable identifier
 * @param sectionId - item이 속한 section kind
 * @param discriminator - item을 구분하는 문자열 (relative path 등)
 * @returns 형식: `${stableId}::${sectionId}::${normalizeItemDiscriminator(discriminator)}`
 */
export function createItemId(stableId: string, sectionId: string, discriminator: string): string {
  return `${stableId}::${sectionId}::${normalizeItemDiscriminator(discriminator)}`;
}

/**
 * normalizeItemDiscriminator 함수.
 * 역슬래시를 슬래시로, 공백을 하이픈으로 변환하고 소문자로 정규화함.
 *
 * @param value - 정규화할 식별자 문자열
 * @returns 정규화된 식별자
 */
export function normalizeItemDiscriminator(value: string): string {
  return value.replace(/\\/g, '/').replace(/\s+/g, '-').toLowerCase();
}
