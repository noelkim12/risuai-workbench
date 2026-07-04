/**
 * Character detail view를 위한 read-only related file scanner.
 * Generic detail scanner를 Character artifact 전용 section/classifier로 구성한 thin wrapper.
 * @file packages/vscode/src/artifact-browser/CharacterDetailScanner.ts
 */

import path from 'node:path';
import * as vscode from 'vscode';
import type {
  BrowserItemType,
  BrowserSectionKind,
  CharacterBrowserCard,
  CharacterSection,
} from './artifactBrowserTypes';
import { GenericDetailScanner, type SectionDraft, createSection } from './shared/detailScanner';

const SECTION_ORDER = [
  'manifest',
  'character',
  'lorebooks',
  'regexRules',
  'html',
  'lua',
  'toggle',
  'variables',
  'assets',
  'diagnostics',
] as const satisfies readonly BrowserSectionKind[];

type CharacterDetailSectionKind = (typeof SECTION_ORDER)[number];

const SCAN_DIRECTORIES = ['character', 'lorebooks', 'lorebook', 'regex', 'html', 'lua', 'toggle', 'variables'] as const;

function createCharacterSectionDrafts(): Record<CharacterDetailSectionKind, SectionDraft> {
  return {
    manifest: createSection('manifest', 'Manifest', 'manifest'),
    character: createSection('character', 'Character', 'character'),
    lorebooks: createSection('lorebooks', 'Lorebooks', 'lorebooks'),
    regexRules: createSection('regexRules', 'Regex Rules', 'regexRules'),
    html: createSection('html', 'HTML', 'html'),
    lua: createSection('lua', 'Lua', 'lua'),
    toggle: createSection('toggle', 'Toggle', 'toggle'),
    variables: createSection('variables', 'Variables', 'variables'),
    assets: createSection('assets', 'Assets', 'assets'),
    diagnostics: createSection('diagnostics', 'Diagnostics', 'diagnostics'),
  };
}

function classifyFile(relativePath: string): CharacterDetailSectionKind | undefined {
  const lowerPath = relativePath.toLowerCase();
  if (isUnderDirectory(lowerPath, 'character')) return 'character';
  if (isUnderDirectory(lowerPath, 'lorebooks') || isUnderDirectory(lowerPath, 'lorebook')) return 'lorebooks';
  if (isUnderDirectory(lowerPath, 'regex')) return 'regexRules';
  if (isUnderDirectory(lowerPath, 'html')) return 'html';
  if (isUnderDirectory(lowerPath, 'lua')) return 'lua';
  if (isUnderDirectory(lowerPath, 'toggle')) return 'toggle';
  if (isUnderDirectory(lowerPath, 'variables')) return 'variables';

  return undefined;
}

function classifyItemType(
  relativePath: string,
  sectionId: CharacterDetailSectionKind,
): BrowserItemType {
  if (sectionId === 'manifest') return 'manifest';

  const extension = path.extname(relativePath).replace('.', '').toLowerCase();
  if (isImageExtension(extension)) return extension === 'png' ? 'png' : 'image';
  if (extension === 'json') return 'json';
  if (extension === 'charx') return 'charx';
  if (extension === 'risutext') return 'risutext';
  if (extension === 'risulorebook') return 'risulorebook';
  if (extension === 'risuregex') return 'risuregex';
  if (extension === 'risulua') return 'risulua';
  if (extension === 'risuhtml') return 'risuhtml';
  if (extension === 'risutoggle' || sectionId === 'toggle') return 'risutoggle';
  if (extension === 'risuvar' || sectionId === 'variables') return 'risuvar';
  if (extension === 'md' || extension === 'markdown') return 'markdown';
  if (sectionId === 'regexRules') return 'regex';

  return 'unknown';
}

function isImageExtension(extension: string): boolean {
  return ['png', 'jpg', 'jpeg', 'webp'].includes(extension);
}

function isUnderDirectory(relativePath: string, directoryName: string): boolean {
  return relativePath === directoryName || relativePath.startsWith(`${directoryName}/`);
}

const scanner = new GenericDetailScanner<CharacterDetailSectionKind, BrowserItemType>({
  sectionOrder: [...SECTION_ORDER],
  createSectionDrafts: createCharacterSectionDrafts,
  classifyFile,
  classifyItemType,
  manifestMarkerName: '.risuchar',
  manifestSectionKind: 'manifest',
  scanDirectories: SCAN_DIRECTORIES,
});

/**
 * CharacterDetailScanner 클래스.
 * 선택된 character root 내부만 보수적으로 스캔해 detail accordion section을 구성함.
 */
export class CharacterDetailScanner {
  /**
   * scan 함수.
   * 선택 card의 root URI와 manifest warning을 section/item model로 변환함.
   *
   * @param card - detail을 열 selected character card
   * @returns detail view에 표시할 stable section 목록
   */
  async scan(card: CharacterBrowserCard): Promise<CharacterSection[]> {
    const sections = (await scanner.scan(card)) as CharacterSection[];
    return withAssetCount(card.markerUri, sections);
  }
}

async function withAssetCount(markerUri: string, sections: CharacterSection[]): Promise<CharacterSection[]> {
  const assetsSection = sections.find((section) => section.kind === 'assets');
  if (!assetsSection) return sections;

  const rootUri = vscode.Uri.file(path.dirname(vscode.Uri.parse(markerUri).fsPath));
  const count = await countAssetFiles(vscode.Uri.joinPath(rootUri, 'assets'));
  return sections.map((section) =>
    section.kind === 'assets'
      ? { ...assetsSection, count, items: [] }
      : section,
  );
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
