import path from 'node:path';
import { extractLorebookEntryName, toLorebookEntrySlug } from './slug';

/**
 * Relative path calculators for wiki cross-links.
 *
 * All functions return the path string relative to the SOURCE page's directory.
 * Source directory layout is fixed by the design; callers do not pass it.
 *
 * Reference layout inside wiki/artifacts/<artifact>/_generated/:
 *   overview.md
 *   variables.md, lua.md, regex.md        (consolidated)
 *   lorebook/_index.md
 *   lorebook/<folder...>/<slug>.md        (entity)
 *   chains/_index.md
 *   chains/<category>/_index.md
 *   chains/<category>/<slug>.md           (chain)
 *
 * Notes sibling tree at wiki/artifacts/<artifact>/notes/ (not written by analyzer).
 */

const GENERATED_ROOT = path.posix.join(
  '/workspace',
  'wiki',
  'artifacts',
  '__artifact__',
  '_generated',
);
const NOTES_ROOT = path.posix.join('/workspace', 'wiki', 'artifacts', '__artifact__', 'notes');
const CHAIN_SOURCE = 'chains/__category__/__chain__.md';
const LOREBOOK_ACTIVATION_CHAIN_INDEX = path.posix.join('chains', 'lorebook-activation', '_index.md');

export interface LorebookPathEntry {
  id: string;
  name: string;
  folder?: string | null;
}

export function buildLorebookEntityPath(
  folder: string | null | undefined,
  slug: string,
): string {
  return path.posix.join('lorebook', ...splitFolder(folder), `${slug}.md`);
}

export function buildLorebookNotesPath(
  folder: string | null | undefined,
  slug: string,
): string {
  return path.posix.join('lorebook', ...splitFolder(folder), `${slug}.md`);
}

export function buildLorebookExtractPath(
  folder: string | null | undefined,
  slug: string,
): string {
  return path.posix.join('lorebooks', ...splitFolder(folder), `${slug}.risulorebook`);
}

export function buildLorebookActivationChainPath(
  folder: string | null | undefined,
  slug: string,
): string {
  return path.posix.join('chains', 'lorebook-activation', ...splitFolder(folder), `${slug}.md`);
}

export function resolveLorebookEntityPath(
  entries: ReadonlyArray<LorebookPathEntry>,
  rawReference: string,
): string {
  const entry = resolveLorebookPathEntry(entries, rawReference);

  return buildLorebookEntityPath(
    entry?.folder,
    toLorebookEntrySlug(entry?.name ?? rawReference),
  );
}

export function resolveLorebookActivationChainPath(
  entries: ReadonlyArray<LorebookPathEntry>,
  rawReference: string,
): string {
  const entry = resolveLorebookPathEntry(entries, rawReference);

  return buildLorebookActivationChainPath(
    entry?.folder,
    toLorebookEntrySlug(entry?.name ?? rawReference),
  );
}

export function entityToSiblingEntity(
  sourceRelativePath: string,
  targetRelativePath: string,
): string {
  return relativeWithinGenerated(sourceRelativePath, targetRelativePath);
}

export function entityToConsolidated(
  sourceRelativePath: string,
  filename: string,
): string {
  const normalized = filename.endsWith('.md') ? filename : `${filename}.md`;
  return relativeWithinGenerated(sourceRelativePath, normalized);
}

export function entityToChain(
  sourceRelativePath: string,
  category: string,
  slugOrTargetRelativePath: string,
): string {
  const targetRelativePath = slugOrTargetRelativePath.includes('/')
    ? slugOrTargetRelativePath
    : path.posix.join('chains', category, `${slugOrTargetRelativePath}.md`);

  return relativeWithinGenerated(
    sourceRelativePath,
    targetRelativePath,
  );
}

export function entityToNotes(
  sourceRelativePath: string,
  pathUnderNotes: string,
): string {
  return relativeFromGeneratedTo(path.posix.dirname(sourceRelativePath), path.posix.join(NOTES_ROOT, pathUnderNotes));
}

export function chainToEntity(targetRelativePath: string): string {
  return relativeWithinGenerated(CHAIN_SOURCE, targetRelativePath);
}

export function lorebookActivationChainToEntity(
  sourceRelativePath: string,
  targetRelativePath: string,
): string {
  return relativeWithinGenerated(sourceRelativePath, targetRelativePath);
}

export function chainToConsolidated(filename: string): string {
  const normalized = filename.endsWith('.md') ? filename : `${filename}.md`;
  return relativeWithinGenerated(CHAIN_SOURCE, normalized);
}

export function chainToSiblingChain(category: string, slug: string): string {
  return `../${category}/${slug}.md`;
}

export function chainToNotes(pathUnderNotes: string): string {
  return relativeFromGeneratedTo(path.posix.dirname(CHAIN_SOURCE), path.posix.join(NOTES_ROOT, pathUnderNotes));
}

export function lorebookActivationChainToNotes(
  sourceRelativePath: string,
  pathUnderNotes: string,
): string {
  return relativeFromGeneratedTo(
    path.posix.dirname(sourceRelativePath),
    path.posix.join(NOTES_ROOT, pathUnderNotes),
  );
}

export function lorebookActivationIndexToChain(targetRelativePath: string): string {
  return relativeWithinGenerated(LOREBOOK_ACTIVATION_CHAIN_INDEX, targetRelativePath);
}

export function overviewToNotes(pathUnderNotes: string): string {
  return `../notes/${pathUnderNotes}`;
}

export function overviewToCompanion(companionArtifactKey: string): string {
  return `../../${companionArtifactKey}/_generated/overview.md`;
}

export function overviewToDomain(filename: string): string {
  const normalized = filename.endsWith('.md') ? filename : `${filename}.md`;
  return `../../../domain/${normalized}`;
}

export function consolidatedToNotes(pathUnderNotes: string): string {
  return `../notes/${pathUnderNotes}`;
}

export function lorebookIndexToNotes(pathUnderNotes: string): string {
  return relativeFromGeneratedTo('lorebook', path.posix.join(NOTES_ROOT, pathUnderNotes));
}

/**
 * From an entity page at wiki/artifacts/<artifact>/_generated/lorebook/<folder...>/<slug>.md,
 * walk back to the workspace root and then into the extract artifact directory.
 */
export function entityToExtractSource(
  sourceRelativePath: string,
  extractDirName: string,
  pathInsideExtract: string,
): string {
  return relativeFromGeneratedTo(
    path.posix.dirname(sourceRelativePath),
    path.posix.join('/workspace', extractDirName, pathInsideExtract),
  );
}

function splitFolder(folder: string | null | undefined): string[] {
  return (folder ?? '')
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function resolveLorebookPathEntry(
  entries: ReadonlyArray<LorebookPathEntry>,
  rawReference: string,
): LorebookPathEntry | undefined {
  const entryName = extractLorebookEntryName(rawReference);

  return entries.find(
    (candidate) =>
      candidate.id === rawReference ||
      candidate.name === rawReference ||
      candidate.name === entryName,
  );
}

function toGeneratedAbsolute(relativePath: string): string {
  return path.posix.join(GENERATED_ROOT, relativePath);
}

function relativeWithinGenerated(
  sourceRelativePath: string,
  targetRelativePath: string,
): string {
  return path.posix.relative(
    path.posix.dirname(toGeneratedAbsolute(sourceRelativePath)),
    toGeneratedAbsolute(targetRelativePath),
  );
}

function relativeFromGeneratedTo(
  sourceRelativeDir: string,
  targetAbsolutePath: string,
): string {
  return path.posix.relative(
    toGeneratedAbsolute(sourceRelativeDir),
    targetAbsolutePath,
  );
}
