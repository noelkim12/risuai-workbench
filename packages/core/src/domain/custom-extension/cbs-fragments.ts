import type { LuaWasmStringLiteral } from '../analyze/lua-wasm-types';
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
export type CbsBearingArtifact = 'lorebook' | 'regex' | 'prompt' | 'html' | 'lua' | 'text';

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
  'text',
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

interface SectionHeaderMatch {
  name: string;
  markerStart: number;
  contentStart: number;
}

interface SectionExtractionOptions {
  stripLeadingNewline?: boolean;
  stripTrailingNewline?: boolean;
}

/**
 * getCustomExtensionBodyStart 함수.
 * custom-extension frontmatter 뒤에서 실제 section 탐색을 시작할 offset을 계산함.
 * frontmatter가 malformed여도 body 전체에서 recovery를 계속 시도함.
 *
 * @param rawContent - 원본 custom-extension 문서 문자열
 * @returns section 탐색을 시작할 body offset
 */
function getCustomExtensionBodyStart(rawContent: string): number {
  const frontmatterMatch = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(rawContent);
  return frontmatterMatch ? frontmatterMatch[0].length : 0;
}

/**
 * collectSectionHeaders 함수.
 * body 영역에서 strict한 `@@@ SECTION` 헤더만 수집하고 순서를 유지함.
 * malformed 헤더는 건너뛰고 뒤의 유효한 헤더 recovery를 돕는다.
 *
 * @param rawContent - 원본 custom-extension 문서 문자열
 * @param bodyStart - frontmatter 이후 body 시작 offset
 * @returns 발견된 section 헤더 목록
 */
function collectSectionHeaders(rawContent: string, bodyStart: number): SectionHeaderMatch[] {
  const sectionRegex = /^@@@ ([A-Z_]+)(?:\r?\n|$)/gm;
  const headers: SectionHeaderMatch[] = [];

  let match: RegExpExecArray | null = sectionRegex.exec(rawContent);
  while (match !== null) {
    if (match.index >= bodyStart) {
      headers.push({
        name: match[1],
        markerStart: match.index,
        contentStart: match.index + match[0].length,
      });
    }
    match = sectionRegex.exec(rawContent);
  }

  return headers;
}

/**
 * normalizeFragmentSlice 함수.
 * structural newline만 걷어내고 fragment range와 content를 함께 정규화함.
 *
 * @param rawContent - 원본 custom-extension 문서 문자열
 * @param start - 후보 content 시작 offset
 * @param end - 후보 content 종료 offset
 * @param options - leading/trailing structural newline 제거 옵션
 * @returns 정규화된 fragment range/content, 비어 있으면 null
 */
function normalizeFragmentSlice(
  rawContent: string,
  start: number,
  end: number,
  options: SectionExtractionOptions = {},
): Pick<CbsFragment, 'start' | 'end' | 'content'> | null {
  let normalizedStart = start;
  let normalizedEnd = end;
  const {
    stripLeadingNewline = false,
    stripTrailingNewline = true,
  } = options;

  if (stripLeadingNewline) {
    if (rawContent.startsWith('\r\n', normalizedStart)) {
      normalizedStart += 2;
    } else if (rawContent.startsWith('\n', normalizedStart)) {
      normalizedStart += 1;
    }
  }

  if (stripTrailingNewline) {
    if (
      normalizedEnd - normalizedStart >= 2 &&
      rawContent.slice(normalizedEnd - 2, normalizedEnd) === '\r\n'
    ) {
      normalizedEnd -= 2;
    } else if (
      normalizedEnd - normalizedStart >= 1 &&
      rawContent[normalizedEnd - 1] === '\n'
    ) {
      normalizedEnd -= 1;
    }
  }

  if (normalizedEnd <= normalizedStart) {
    return null;
  }

  return {
    start: normalizedStart,
    end: normalizedEnd,
    content: rawContent.slice(normalizedStart, normalizedEnd),
  };
}

/**
 * mapStructuredSectionsToFragments 함수.
 * line-based section 헤더를 기준으로 target CBS section만 best-effort로 fragment로 추출함.
 * malformed section이 끼어 있어도 뒤의 유효 section recovery를 계속 유지한다.
 *
 * @param artifact - 현재 매핑 중인 custom-extension artifact 종류
 * @param rawContent - 원본 custom-extension 문서 문자열
 * @param targetSections - CBS-bearing section 이름 집합
 * @param options - section별 structural newline 정규화 옵션
 * @returns 추출된 fragment map
 */
function mapStructuredSectionsToFragments(
  artifact: 'lorebook' | 'regex' | 'prompt',
  rawContent: string,
  targetSections: readonly string[],
  options: Partial<Record<string, SectionExtractionOptions>> = {},
): CbsFragmentMap {
  const bodyStart = getCustomExtensionBodyStart(rawContent);
  const headers = collectSectionHeaders(rawContent, bodyStart);
  const targetSectionSet = new Set(targetSections);
  const fragments: CbsFragment[] = [];

  for (let index = 0; index < headers.length; index += 1) {
    const header = headers[index];
    if (!targetSectionSet.has(header.name)) {
      continue;
    }

    const nextHeaderStart = headers[index + 1]?.markerStart ?? rawContent.length;
    const normalized = normalizeFragmentSlice(
      rawContent,
      header.contentStart,
      nextHeaderStart,
      options[header.name],
    );

    if (!normalized) {
      continue;
    }

    fragments.push({
      section: header.name,
      start: normalized.start,
      end: normalized.end,
      content: normalized.content,
    });
  }

  return {
    artifact,
    fragments,
    fileLength: rawContent.length,
  };
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
  return mapStructuredSectionsToFragments('lorebook', rawContent, ['CONTENT'], {
    CONTENT: {
      stripLeadingNewline: true,
      stripTrailingNewline: true,
    },
  });
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
  return mapStructuredSectionsToFragments('regex', rawContent, ['IN', 'OUT'], {
    IN: {
      stripLeadingNewline: true,
      stripTrailingNewline: true,
    },
    OUT: {
      stripLeadingNewline: true,
      stripTrailingNewline: true,
    },
  });
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
  return mapStructuredSectionsToFragments(
    'prompt',
    rawContent,
    ['TEXT', 'INNER_FORMAT', 'DEFAULT_TEXT'],
    {
      TEXT: {
        stripLeadingNewline: false,
        stripTrailingNewline: true,
      },
      INNER_FORMAT: {
        stripLeadingNewline: false,
        stripTrailingNewline: true,
      },
      DEFAULT_TEXT: {
        stripLeadingNewline: false,
        stripTrailingNewline: true,
      },
    },
  );
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
 * mapTextToCbsFragments 함수.
 * `.risutext` 전체 본문을 frontmatter-free CBS TEXT fragment 하나로 매핑함.
 *
 * @param rawContent - 원본 `.risutext` 문서 문자열
 * @returns 전체 파일 하나를 TEXT section으로 담은 fragment map
 */
export function mapTextToCbsFragments(rawContent: string): CbsFragmentMap {
  return {
    artifact: 'text',
    fragments: [
      {
        section: 'TEXT',
        start: 0,
        end: rawContent.length,
        content: rawContent,
      },
    ],
    fileLength: rawContent.length,
  };
}

/**
 * Map WASM-scanned Lua string literal content ranges to CBS fragments.
 * Only literals with CBS markers are exposed; this keeps .risulua CBS parsing
 * scoped to string literal contents instead of the whole Lua source.
 *
 * @param rawContent - The raw .risulua source text
 * @param stringLiterals - Compact string literal records from the Rust/WASM scanner
 * @returns CbsFragmentMap with one fragment per CBS-bearing string literal content range
 */
export function mapLuaWasmStringLiteralsToCbsFragments(
  rawContent: string,
  stringLiterals: readonly LuaWasmStringLiteral[],
): CbsFragmentMap {
  const fragments = stringLiterals
    .filter((literal) => literal.hasCbsMarker)
    .map((literal, index) => ({
      section: `lua-string:${index + 1}`,
      start: literal.contentStartUtf16,
      end: literal.contentEndUtf16,
      content: rawContent.slice(literal.contentStartUtf16, literal.contentEndUtf16),
    }));

  return {
    artifact: 'lua',
    fragments,
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
    case 'text':
      return mapTextToCbsFragments(rawContent);
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
export const CBS_ARTIFACT_EXTENSIONS: Record<CbsBearingArtifact, string> = {
  lorebook: '.risulorebook',
  regex: '.risuregex',
  prompt: '.risuprompt',
  html: '.risuhtml',
  lua: '.risulua',
  text: '.risutext',
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
