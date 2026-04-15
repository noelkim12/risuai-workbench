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
 *   lorebook/<slug>.md                    (entity)
 *   chains/_index.md
 *   chains/<category>/_index.md
 *   chains/<category>/<slug>.md           (chain)
 *
 * Notes sibling tree at wiki/artifacts/<artifact>/notes/ (not written by analyzer).
 */

export function entityToSiblingEntity(targetSlug: string): string {
  return `${targetSlug}.md`;
}

export function entityToConsolidated(filename: string): string {
  const normalized = filename.endsWith('.md') ? filename : `${filename}.md`;
  return `../${normalized}`;
}

export function entityToChain(category: string, slug: string): string {
  return `../chains/${category}/${slug}.md`;
}

export function entityToNotes(pathUnderNotes: string): string {
  return `../../notes/${pathUnderNotes}`;
}

export function chainToEntity(slug: string): string {
  return `../../lorebook/${slug}.md`;
}

export function chainToConsolidated(filename: string): string {
  const normalized = filename.endsWith('.md') ? filename : `${filename}.md`;
  return `../../${normalized}`;
}

export function chainToSiblingChain(category: string, slug: string): string {
  return `../${category}/${slug}.md`;
}

export function chainToNotes(pathUnderNotes: string): string {
  return `../../../notes/${pathUnderNotes}`;
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
  return `../../notes/${pathUnderNotes}`;
}

/**
 * From an entity page at wiki/artifacts/<artifact>/_generated/lorebook/<slug>.md,
 * the extract directory is 5 levels up (out to the workspace root) then into the
 * extract subdirectory.
 */
export function entityToExtractSource(
  extractDirName: string,
  pathInsideExtract: string,
): string {
  return `../../../../../${extractDirName}/${pathInsideExtract}`;
}
