/**
 * Module detail view를 위한 read-only related file scanner.
 * Generic detail scanner를 Module artifact 전용 section/classifier로 구성한 thin wrapper.
 * @file packages/vscode/src/artifact-browser/ModuleDetailScanner.ts
 */

import path from 'node:path';
import * as vscode from 'vscode';
import type {
  BrowserItemType,
  BrowserSection,
  BrowserSectionKind,
  ModuleBrowserCard,
} from './artifactBrowserTypes';
import { GenericDetailScanner, type SectionDraft, createSection } from './shared/detailScanner';

const SECTION_ORDER = [
  'manifest',
  'lorebooks',
  'regexRules',
  'lua',
  'toggle',
  'variables',
  'html',
  'assets',
  'diagnostics',
] as const satisfies readonly BrowserSectionKind[];

type ModuleSectionKind = (typeof SECTION_ORDER)[number];

const SCAN_DIRECTORIES = ['lorebooks', 'lorebook', 'regex', 'lua', 'toggle', 'variables', 'html'] as const;

function createModuleSectionDrafts(): Record<ModuleSectionKind, SectionDraft> {
  return {
    manifest: createSection('manifest', 'Manifest', 'manifest'),
    lorebooks: createSection('lorebooks', 'Lorebooks', 'lorebooks'),
    regexRules: createSection('regexRules', 'Regex Rules', 'regexRules'),
    lua: createSection('lua', 'Lua', 'lua'),
    toggle: createSection('toggle', 'Toggle', 'toggle'),
    variables: createSection('variables', 'Variables', 'variables'),
    html: createSection('html', 'HTML', 'html'),
    assets: createSection('assets', 'Assets', 'assets'),
    diagnostics: createSection('diagnostics', 'Diagnostics', 'diagnostics'),
  };
}

function classifyFile(relativePath: string): ModuleSectionKind | undefined {
  const lowerPath = relativePath.toLowerCase();

  if (lowerPath === '.risumodule') return 'manifest';
  if (isUnderDirectory(lowerPath, 'lorebooks') || isUnderDirectory(lowerPath, 'lorebook')) return 'lorebooks';
  if (isUnderDirectory(lowerPath, 'regex')) return 'regexRules';
  if (isUnderDirectory(lowerPath, 'lua')) return 'lua';
  if (isUnderDirectory(lowerPath, 'toggle')) return 'toggle';
  if (isUnderDirectory(lowerPath, 'variables')) return 'variables';
  if (isUnderDirectory(lowerPath, 'html')) return 'html';

  return undefined;
}

function classifyItemType(relativePath: string, sectionId: ModuleSectionKind): BrowserItemType {
  if (sectionId === 'manifest') return 'manifest';

  const extension = path.extname(relativePath).replace('.', '').toLowerCase();
  if (extension === 'risulorebook' || sectionId === 'lorebooks') return 'risulorebook';
  if (extension === 'risuregex' || sectionId === 'regexRules') return 'risuregex';
  if (extension === 'risulua' || sectionId === 'lua') return 'risulua';
  if (extension === 'risutoggle' || sectionId === 'toggle') return 'risutoggle';
  if (extension === 'risuvar' || sectionId === 'variables') return 'risuvar';
  if (extension === 'risuhtml' || sectionId === 'html') return 'risuhtml';

  return 'unknown';
}

function isUnderDirectory(relativePath: string, directoryName: string): boolean {
  return relativePath === directoryName || relativePath.startsWith(`${directoryName}/`);
}

const scanner = new GenericDetailScanner<ModuleSectionKind, BrowserItemType>({
  sectionOrder: [...SECTION_ORDER],
  createSectionDrafts: createModuleSectionDrafts,
  classifyFile,
  classifyItemType,
  manifestMarkerName: '.risumodule',
  manifestSectionKind: 'manifest',
  scanDirectories: SCAN_DIRECTORIES,
});

/**
 * ModuleDetailScanner 클래스.
 * 선택된 module root 내부만 보수적으로 스캔해 detail accordion section을 구성함.
 */
export class ModuleDetailScanner {
  /**
   * scan 함수.
   * 선택 card의 root URI와 module warning을 section/item model로 변환함.
   *
   * @param card - detail을 열 selected module card
   * @returns detail view에 표시할 stable section 목록
   */
  async scan(card: ModuleBrowserCard): Promise<BrowserSection[]> {
    const sections = await scanner.scan(card);
    return withAssetCount(card.markerUri, sections);
  }
}

async function withAssetCount(markerUri: string, sections: BrowserSection[]): Promise<BrowserSection[]> {
  const assetsSection = sections.find((section) => section.kind === 'assets');
  if (!assetsSection) return sections;

  const rootUri = vscode.Uri.file(path.dirname(vscode.Uri.parse(markerUri).fsPath));
  const count = await countAssetFiles(vscode.Uri.joinPath(rootUri, 'assets'));
  return sections.map((section) => (section.kind === 'assets' ? { ...assetsSection, count, items: [] } : section));
}

async function countAssetFiles(directoryUri: vscode.Uri): Promise<number> {
  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(directoryUri);
  } catch {
    return 0;
  }

  let count = 0;
  for (const [name, fileType] of entries) {
    const childUri = vscode.Uri.joinPath(directoryUri, name);
    if (fileType === vscode.FileType.Directory) {
      count += await countAssetFiles(childUri);
      continue;
    }
    if (fileType === vscode.FileType.File && name !== 'manifest.json' && name !== 'asset-catalog.json') {
      count += 1;
    }
  }
  return count;
}
