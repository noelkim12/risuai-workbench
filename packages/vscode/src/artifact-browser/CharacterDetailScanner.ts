/**
 * Character detail view를 위한 read-only related file scanner.
 * Generic detail scanner를 Character artifact 전용 section/classifier로 구성한 thin wrapper.
 * @file packages/vscode/src/artifact-browser/CharacterDetailScanner.ts
 */

import path from 'node:path';
import type {
  CharacterBrowserCard,
  CharacterItemType,
  CharacterSection,
  CharacterSectionKind,
} from './artifactBrowserTypes';
import { GenericDetailScanner, type SectionDraft, createSection } from './shared/detailScanner';

const SECTION_ORDER: CharacterSectionKind[] = [
  'manifest',
  'lorebooks',
  'regexRules',
  'html',
  'lua',
  'diagnostics',
];

function createCharacterSectionDrafts(): Record<CharacterSectionKind, SectionDraft> {
  return {
    manifest: createSection('manifest', 'Manifest', 'manifest'),
    lorebooks: createSection('lorebooks', 'Lorebooks', 'lorebooks'),
    regexRules: createSection('regexRules', 'Regex Rules', 'regexRules'),
    html: createSection('html', 'HTML', 'html'),
    lua: createSection('lua', 'Lua', 'lua'),
    diagnostics: createSection('diagnostics', 'Diagnostics', 'diagnostics'),
  };
}

function classifyFile(relativePath: string): CharacterSectionKind | undefined {
  const lowerPath = relativePath.toLowerCase();
  const extension = path.extname(lowerPath).replace('.', '');

  if (extension === 'risulorebook') return 'lorebooks';
  if (extension === 'risuregex') return 'regexRules';
  if (extension === 'risuhtml') return 'html';
  if (extension === 'risulua') return 'lua';
  if (
    /(^|\/)(lore|lorebook|book)(\/|[-_.])/.test(lowerPath) ||
    /(^|[-_.])(lore|lorebook|book)([-_.]|$)/.test(lowerPath)
  ) {
    return 'lorebooks';
  }
  if (
    /(^|\/)(regex|regexp|rule)(\/|[-_.])/.test(lowerPath) ||
    /(^|[-_.])(regex|regexp|rule)([-_.]|$)/.test(lowerPath)
  ) {
    return 'regexRules';
  }

  return undefined;
}

function classifyItemType(
  relativePath: string,
  sectionId: CharacterSectionKind,
): CharacterItemType {
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

const scanner = new GenericDetailScanner<CharacterSectionKind, CharacterItemType>({
  sectionOrder: SECTION_ORDER,
  createSectionDrafts: createCharacterSectionDrafts,
  classifyFile,
  classifyItemType,
  manifestMarkerName: '.risuchar',
  manifestSectionKind: 'manifest',
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
    return scanner.scan(card) as Promise<CharacterSection[]>;
  }
}
