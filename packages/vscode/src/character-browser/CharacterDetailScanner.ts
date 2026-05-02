/**
 * Character detail view를 위한 read-only related file scanner.
 * @file packages/vscode/src/character-browser/CharacterDetailScanner.ts
 */

import path from 'node:path';
import * as vscode from 'vscode';
import type {
  CharacterBrowserCard,
  CharacterItem,
  CharacterItemType,
  CharacterSection,
  CharacterSectionKind,
  ManifestParseWarning,
} from './characterBrowserTypes';

const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', '.vscode', 'dist', 'build', 'out', 'coverage', 'assets']);
const SECTION_ORDER: CharacterSectionKind[] = ['manifest', 'lorebooks', 'regexRules', 'html', 'lua', 'diagnostics'];
const MAX_SCANNED_FILES = 500;
const MAX_SCAN_DEPTH = 8;

type SectionDraft = Omit<CharacterSection, 'count'>;

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
    const markerUri = vscode.Uri.parse(card.markerUri);
    const scanRootUri = vscode.Uri.file(path.dirname(markerUri.fsPath));
    const sections = createSectionDrafts();
    const usedRelativePaths = new Set<string>();

    addItem(sections.manifest, createFileItem(card, 'manifest', '.risuchar', markerUri, 'manifest'));
    usedRelativePaths.add('.risuchar');

    const files = await this.collectFiles(scanRootUri);
    for (const file of files) {
      if (file.relativePath === '.risuchar') continue;
      const sectionKind = classifyFile(file.relativePath);
      if (!sectionKind || usedRelativePaths.has(file.relativePath)) continue;

      addItem(
        sections[sectionKind],
        createFileItem(card, sectionKind, file.relativePath, file.uri, 'scanner'),
      );
      usedRelativePaths.add(file.relativePath);
    }

    for (const warning of card.warnings) {
      addItem(sections.diagnostics, createDiagnosticItem(card, warning));
    }

    return SECTION_ORDER.map((kind) => ({ ...sections[kind], count: sections[kind].items.length }));
  }

  private async collectFiles(rootUri: vscode.Uri): Promise<Array<{ uri: vscode.Uri; relativePath: string }>> {
    const files: Array<{ uri: vscode.Uri; relativePath: string }> = [];
    await this.collectFilesFromDirectory(rootUri, '', 0, files);
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
        files.push({ uri: childUri, relativePath: normalizeRelativePath(childRelativePath) ?? childRelativePath });
      }
    }
  }
}

function createSectionDrafts(): Record<CharacterSectionKind, SectionDraft> {
  return {
    manifest: createSection('manifest', 'Manifest', 'manifest'),
    lorebooks: createSection('lorebooks', 'Lorebooks', 'lorebooks'),
    regexRules: createSection('regexRules', 'Regex Rules', 'regexRules'),
    html: createSection('html', 'HTML', 'html'),
    lua: createSection('lua', 'Lua', 'lua'),
    diagnostics: createSection('diagnostics', 'Diagnostics', 'diagnostics'),
  };
}

function createSection(id: string, label: string, kind: CharacterSectionKind): SectionDraft {
  return { id, label, kind, items: [] };
}

function addItem(section: SectionDraft, item: CharacterItem): void {
  section.items.push(item);
}

function createFileItem(
  card: CharacterBrowserCard,
  sectionId: CharacterSectionKind,
  relativePath: string,
  uri: vscode.Uri,
  source: 'manifest' | 'scanner',
): CharacterItem {
  const extension = path.extname(relativePath).replace('.', '').toLowerCase();
  return {
    id: createItemId(card.stableId, sectionId, relativePath),
    label: path.posix.basename(relativePath),
    type: classifyItemType(relativePath, sectionId),
    fileUri: uri.toString(),
    relativePath,
    extension: extension || undefined,
    source,
  };
}

function createDiagnosticItem(card: CharacterBrowserCard, warning: ManifestParseWarning): CharacterItem {
  const relativePath = warning.field ? `${warning.code}:${warning.field}` : warning.code;
  return {
    id: createItemId(card.stableId, 'diagnostics', relativePath),
    label: warning.field ? `${warning.code} · ${warning.field}` : warning.code,
    type: 'diagnostic',
    relativePath,
    description: warning.message,
    source: 'diagnostics',
  };
}

function classifyFile(relativePath: string): CharacterSectionKind | undefined {
  const lowerPath = relativePath.toLowerCase();
  const extension = path.extname(lowerPath).replace('.', '');

  if (extension === 'risulorebook') return 'lorebooks';
  if (extension === 'risuregex') return 'regexRules';
  if (extension === 'risuhtml') return 'html';
  if (extension === 'risulua') return 'lua';
  if (/(^|\/)(lore|lorebook|book)(\/|[-_.])/.test(lowerPath) || /(^|[-_.])(lore|lorebook|book)([-_.]|$)/.test(lowerPath)) {
    return 'lorebooks';
  }
  if (/(^|\/)(regex|regexp|rule)(\/|[-_.])/.test(lowerPath) || /(^|[-_.])(regex|regexp|rule)([-_.]|$)/.test(lowerPath)) {
    return 'regexRules';
  }

  return undefined;
}

function classifyItemType(relativePath: string, sectionId: CharacterSectionKind): CharacterItemType {
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
  if (extension === 'md' || extension === 'markdown') return 'markdown';
  if (sectionId === 'regexRules') return 'regex';

  return 'unknown';
}

function isImageExtension(extension: string): boolean {
  return ['png', 'jpg', 'jpeg', 'webp'].includes(extension);
}

function normalizeRelativePath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/\\/g, '/').split('/').filter(Boolean).join('/');
  if (!normalized || normalized.startsWith('../') || normalized.includes('/../')) return undefined;
  return normalized;
}

function createItemId(stableId: string, sectionId: string, discriminator: string): string {
  return `${stableId}::${sectionId}::${normalizeItemDiscriminator(discriminator)}`;
}

function normalizeItemDiscriminator(value: string): string {
  return value.replace(/\\/g, '/').replace(/\s+/g, '-').toLowerCase();
}
