import type { CustomExtensionArtifact } from './contracts';

/**
 * CBS fragment with range metadata for diagnostics routing.
 * Represents a single CBS-bearing span within a custom-extension file.
 */
export interface CbsFragment {
  /** Section identifier (e.g., 'CONTENT', 'IN', 'OUT', 'TEXT', 'full') */
  section: string;
  /** Start offset in the original file (0-indexed, inclusive) */
  start: number;
  /** End offset in the original file (0-indexed, exclusive) */
  end: number;
  /** The CBS-bearing text content */
  content: string;
}

/**
 * Result of mapping a custom-extension file to CBS fragments.
 */
export interface CbsFragmentMap {
  /** The artifact type that was mapped */
  artifact: CustomExtensionArtifact;
  /** Array of CBS-bearing fragments with range metadata */
  fragments: CbsFragment[];
  /** Total file length in characters */
  fileLength: number;
}

/**
 * Error thrown when CBS fragment mapping fails.
 */
export class CbsFragmentMappingError extends Error {
  constructor(
    message: string,
    public readonly artifact: CustomExtensionArtifact,
    public readonly cause?: Error
  ) {
    super(`[cbs-fragments:${artifact}] ${message}`);
    this.name = 'CbsFragmentMappingError';
  }
}

/** CBS-bearing artifact type union. */
export type CbsBearingArtifact = 'lorebook' | 'regex' | 'prompt' | 'html' | 'lua';

/** Non-CBS artifact type union. */
export type NonCbsArtifact = 'toggle' | 'variable';

/**
 * CBS-bearing artifact types.
 * These formats contain CBS expressions that need diagnostics routing.
 */
export const CBS_BEARING_ARTIFACTS: readonly CbsBearingArtifact[] = [
  'lorebook',
  'regex',
  'prompt',
  'html',
  'lua',
];

/**
 * Non-CBS artifact types.
 * These formats do NOT contain CBS expressions and are explicitly excluded.
 */
export const NON_CBS_ARTIFACTS: readonly NonCbsArtifact[] = [
  'toggle',
  'variable',
];

/**
 * Check if an artifact type is CBS-bearing.
 * @param artifact - The artifact type to check
 * @returns true if the artifact contains CBS expressions
 */
export function isCbsBearingArtifact(artifact: CustomExtensionArtifact): boolean {
  return (CBS_BEARING_ARTIFACTS as readonly CustomExtensionArtifact[]).includes(artifact);
}

/**
 * Check if an artifact type is explicitly non-CBS.
 * @param artifact - The artifact type to check
 * @returns true if the artifact is explicitly classified as non-CBS-bearing
 */
export function isNonCbsArtifact(artifact: CustomExtensionArtifact): boolean {
  return (NON_CBS_ARTIFACTS as readonly CustomExtensionArtifact[]).includes(artifact);
}

/**
 * Map a .risulorebook file to CBS fragments.
 * Only the @@@ CONTENT section is CBS-bearing.
 * Frontmatter, @@@ KEYS, and @@@ SECONDARY_KEYS are excluded.
 *
 * @param rawContent - The raw file content
 * @returns CbsFragmentMap with CONTENT section fragment
 */
export function mapLorebookToCbsFragments(rawContent: string): CbsFragmentMap {
  const fragments: CbsFragment[] = [];

  // Find frontmatter boundaries
  const frontmatterMatch = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(rawContent);
  const bodyStart = frontmatterMatch ? frontmatterMatch[0].length : 0;

  // Find @@@ CONTENT section
  const contentMarker = '@@@ CONTENT';
  const contentIdx = rawContent.indexOf(contentMarker, bodyStart);

  if (contentIdx !== -1) {
    const contentStart = contentIdx + contentMarker.length;
    // Content extends to end of file (no following section)
    let contentEnd = rawContent.length;

    // Strip structural trailing newline for content extraction
    let content = rawContent.slice(contentStart, contentEnd);
    if (content.startsWith('\r\n')) {
      content = content.slice(2);
    } else if (content.startsWith('\n')) {
      content = content.slice(1);
    }

    // Trim trailing newlines for accurate end position
    const originalLength = content.length;
    content = content.replace(/\r?\n$/, '');
    const trimmedLength = content.length;
    const trailingOffset = originalLength - trimmedLength;

    if (content.length > 0) {
      fragments.push({
        section: 'CONTENT',
        start: contentStart + (contentIdx === contentStart - contentMarker.length ? 0 : 0) + (rawContent.slice(contentStart).startsWith('\r\n') ? 2 : rawContent.slice(contentStart).startsWith('\n') ? 1 : 0),
        end: contentEnd - trailingOffset,
        content,
      });
    }
  }

  return {
    artifact: 'lorebook',
    fragments,
    fileLength: rawContent.length,
  };
}

/**
 * Map a .risuregex file to CBS fragments.
 * Both @@@ IN and @@@ OUT sections are CBS-bearing.
 * Frontmatter is excluded.
 *
 * @param rawContent - The raw file content
 * @returns CbsFragmentMap with IN and OUT section fragments
 */
export function mapRegexToCbsFragments(rawContent: string): CbsFragmentMap {
  const fragments: CbsFragment[] = [];

  // Find frontmatter boundaries
  const frontmatterMatch = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(rawContent);
  const bodyStart = frontmatterMatch ? frontmatterMatch[0].length : 0;

  // Find @@@ IN section
  const inMarker = '@@@ IN';
  const outMarker = '@@@ OUT';
  const inIdx = rawContent.indexOf(inMarker, bodyStart);
  const outIdx = rawContent.indexOf(outMarker, bodyStart);

  // Extract IN section if present
  if (inIdx !== -1) {
    const inStart = inIdx + inMarker.length;
    // IN content ends at OUT marker or end of file
    const inContentRaw = outIdx !== -1 && outIdx > inIdx
      ? rawContent.slice(inStart, outIdx)
      : rawContent.slice(inStart);
    let inContent = inContentRaw;

    // Strip leading newline
    if (inContent.startsWith('\r\n')) {
      inContent = inContent.slice(2);
    } else if (inContent.startsWith('\n')) {
      inContent = inContent.slice(1);
    }

    // Calculate accurate positions
    const inContentStart = inStart + (inContentRaw.length - inContent.length);

    // Strip trailing newline from content
    let inContentStripped = inContent;
    if (inContentStripped.endsWith('\r\n')) {
      inContentStripped = inContentStripped.slice(0, -2);
    } else if (inContentStripped.endsWith('\n')) {
      inContentStripped = inContentStripped.slice(0, -1);
    }

    if (inContentStripped.length > 0) {
      fragments.push({
        section: 'IN',
        start: inContentStart,
        end: inContentStart + inContentStripped.length,
        content: inContentStripped,
      });
    }
  }

  // Extract OUT section if present
  if (outIdx !== -1 && inIdx !== -1 && outIdx > inIdx) {
    const outStart = outIdx + outMarker.length;
    let outContent = rawContent.slice(outStart);

    // Strip leading newline
    if (outContent.startsWith('\r\n')) {
      outContent = outContent.slice(2);
    } else if (outContent.startsWith('\n')) {
      outContent = outContent.slice(1);
    }

    // Strip trailing newline
    let outContentStripped = outContent;
    if (outContentStripped.endsWith('\r\n')) {
      outContentStripped = outContentStripped.slice(0, -2);
    } else if (outContentStripped.endsWith('\n')) {
      outContentStripped = outContentStripped.slice(0, -1);
    }

    if (outContentStripped.length > 0) {
      fragments.push({
        section: 'OUT',
        start: outStart + (outContent.length - outContentStripped.length),
        end: outStart + (outContent.length - outContentStripped.length) + outContentStripped.length,
        content: outContentStripped,
      });
    }
  }

  return {
    artifact: 'regex',
    fragments,
    fileLength: rawContent.length,
  };
}

/**
 * Map a .risuprompt file to CBS fragments.
 * @@@ TEXT, @@@ INNER_FORMAT, and @@@ DEFAULT_TEXT sections are CBS-bearing.
 * Frontmatter and chat/cache variants (no body sections) produce no fragments.
 *
 * @param rawContent - The raw file content
 * @returns CbsFragmentMap with applicable section fragments
 */
export function mapPromptToCbsFragments(rawContent: string): CbsFragmentMap {
  const fragments: CbsFragment[] = [];

  // Find frontmatter boundaries
  const frontmatterMatch = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(rawContent);
  const bodyStart = frontmatterMatch ? frontmatterMatch[0].length : 0;

  // Parse body sections
  const sectionRegex = /^@@@ ([A-Z_]+)(?:\r?\n|$)/gm;
  const sections: Array<{ name: string; start: number; end: number }> = [];

  let match: RegExpExecArray | null = sectionRegex.exec(rawContent);
  while (match !== null) {
    if (match.index >= bodyStart) {
      sections.push({
        name: match[1],
        start: match.index,
        end: match.index + match[0].length,
      });
    }
    match = sectionRegex.exec(rawContent);
  }

  // CBS-bearing section names
  const cbsSectionNames = ['TEXT', 'INNER_FORMAT', 'DEFAULT_TEXT'];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (!cbsSectionNames.includes(section.name)) {
      continue;
    }

    const contentStart = section.end;
    const contentEnd = i + 1 < sections.length ? sections[i + 1].start : rawContent.length;
    let content = rawContent.slice(contentStart, contentEnd);

    // Strip structural trailing newline
    if (content.endsWith('\r\n')) {
      content = content.slice(0, -2);
    } else if (content.endsWith('\n')) {
      content = content.slice(0, -1);
    }

    if (content.length > 0) {
      fragments.push({
        section: section.name,
        start: contentStart,
        end: contentStart + content.length,
        content,
      });
    }
  }

  return {
    artifact: 'prompt',
    fragments,
    fileLength: rawContent.length,
  };
}

/**
 * Map a .risuhtml file to CBS fragments.
 * The entire file is CBS-bearing (full HTML with embedded CBS).
 *
 * @param rawContent - The raw file content
 * @returns CbsFragmentMap with single full-file fragment
 */
export function mapHtmlToCbsFragments(rawContent: string): CbsFragmentMap {
  return {
    artifact: 'html',
    fragments: [
      {
        section: 'full',
        start: 0,
        end: rawContent.length,
        content: rawContent,
      },
    ],
    fileLength: rawContent.length,
  };
}

/**
 * Map a .risulua file to CBS fragments.
 * Per spec: only string literals inside Lua code are CBS-bearing.
 * For now, we treat the entire file as a single fragment (LSP will parse Lua to find string literals).
 * This is a simplified approach - T15 may enhance with proper Lua AST parsing.
 *
 * @param rawContent - The raw file content
 * @returns CbsFragmentMap with single full-file fragment
 */
export function mapLuaToCbsFragments(rawContent: string): CbsFragmentMap {
  return {
    artifact: 'lua',
    fragments: [
      {
        section: 'full',
        start: 0,
        end: rawContent.length,
        content: rawContent,
      },
    ],
    fileLength: rawContent.length,
  };
}

/**
 * Map a non-CBS artifact to fragments (returns empty fragments array).
 * This explicitly documents that .risutoggle and .risuvar are non-CBS-bearing.
 *
 * @param artifact - The non-CBS artifact type
 * @param rawContent - The raw file content (unused but kept for API consistency)
 * @returns CbsFragmentMap with empty fragments array
 */
export function mapNonCbsToFragments(
  artifact: 'toggle' | 'variable',
  rawContent: string
): CbsFragmentMap {
  return {
    artifact,
    fragments: [],
    fileLength: rawContent.length,
  };
}

/**
 * Map any custom-extension file to CBS fragments.
 * This is the main entry point for the fragment mapping API.
 * Automatically routes to the appropriate mapper based on artifact type.
 *
 * @param artifact - The artifact type
 * @param rawContent - The raw file content
 * @returns CbsFragmentMap with CBS-bearing fragments
 * @throws CbsFragmentMappingError if artifact is unknown or mapping fails
 */
export function mapToCbsFragments(
  artifact: CustomExtensionArtifact,
  rawContent: string
): CbsFragmentMap {
  switch (artifact) {
    case 'lorebook':
      return mapLorebookToCbsFragments(rawContent);
    case 'regex':
      return mapRegexToCbsFragments(rawContent);
    case 'prompt':
      return mapPromptToCbsFragments(rawContent);
    case 'html':
      return mapHtmlToCbsFragments(rawContent);
    case 'lua':
      return mapLuaToCbsFragments(rawContent);
    case 'toggle':
    case 'variable':
      return mapNonCbsToFragments(artifact, rawContent);
    default:
      throw new CbsFragmentMappingError(
        `Unknown artifact type: ${artifact}`,
        artifact as CustomExtensionArtifact
      );
  }
}

/** Mapping of CBS-bearing artifacts to their file extensions. */
const CBS_ARTIFACT_EXTENSIONS: Record<CbsBearingArtifact, string> = {
  lorebook: '.risulorebook',
  regex: '.risuregex',
  prompt: '.risuprompt',
  html: '.risuhtml',
  lua: '.risulua',
};

/**
 * Get the file extension for a CBS-bearing artifact.
 * Useful for file discovery and filtering.
 *
 * @param artifact - The CBS-bearing artifact type
 * @returns The file extension (e.g., '.risulorebook')
 */
export function getCbsArtifactExtension(artifact: CbsBearingArtifact): string {
  return CBS_ARTIFACT_EXTENSIONS[artifact];
}

/**
 * Check if a file path corresponds to a CBS-bearing artifact.
 *
 * @param filePath - The file path to check
 * @returns true if the file extension indicates a CBS-bearing format
 */
export function isCbsBearingFile(filePath: string): boolean {
  const lowerPath = filePath.toLowerCase();
  return Object.values(CBS_ARTIFACT_EXTENSIONS).some((ext) =>
    lowerPath.endsWith(ext)
  );
}
