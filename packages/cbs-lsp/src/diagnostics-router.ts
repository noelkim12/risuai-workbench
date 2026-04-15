import type {
  CbsFragment,
  CbsFragmentMap,
  CustomExtensionArtifact,
} from 'risu-workbench-core'
import type { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver'

// Import the core functions at runtime
import {
  mapToCbsFragments as mapToCbsFragmentsCore,
  isNonCbsArtifact,
  parseCustomExtensionArtifactFromPath,
} from 'risu-workbench-core'

/** Severity mapping from string to LSP DiagnosticSeverity */
const SEVERITY_MAP: Record<'error' | 'warning' | 'info' | 'hint', DiagnosticSeverity> = {
  error: 1, // DiagnosticSeverity.Error
  warning: 2, // DiagnosticSeverity.Warning
  info: 3, // DiagnosticSeverity.Information
  hint: 4, // DiagnosticSeverity.Hint
}

/**
 * Map a document to CBS fragments using core fragment mapping.
 * Returns null for non-CBS files (toggle, variable) and unknown extensions.
 *
 * @param filePath - The document file path
 * @param content - The document content
 * @returns CbsFragmentMap with fragments and metadata, or null if not applicable
 */
export function mapDocumentToCbsFragments(
  filePath: string,
  content: string
): CbsFragmentMap | null {
  try {
    const artifact = parseCustomExtensionArtifactFromPath(filePath)

    // Return null for non-CBS artifacts
    if (isNonCbsArtifact(artifact)) {
      return null
    }

    return mapToCbsFragmentsCore(artifact, content)
  } catch {
    return null
  }
}

/**
 * Convert offset in text to line/character position.
 *
 * @param content - The text content
 * @param offset - The character offset (0-indexed)
 * @returns Line and character position
 */
function offsetToPosition(
  content: string,
  offset: number
): { line: number; character: number } {
  const lines = content.slice(0, offset).split('\n')
  const line = lines.length - 1
  const character = lines[lines.length - 1].length
  return { line, character }
}

/**
 * Create a diagnostic for a specific range within a CBS fragment.
 * Note: This requires the original document content to compute correct positions.
 *
 * @param documentContent - The full document content (needed for correct line/char calculation)
 * @param fragment - The CBS fragment containing the range
 * @param message - The diagnostic message
 * @param severity - The severity level ('error', 'warning', 'info', 'hint')
 * @param code - The diagnostic code (e.g., 'CBS001')
 * @param startOffset - Start offset within the fragment content (0-indexed)
 * @param endOffset - End offset within the fragment content (0-indexed, exclusive)
 * @returns Diagnostic object for LSP
 */
export function createDiagnosticForFragment(
  documentContent: string,
  fragment: CbsFragment,
  message: string,
  severity: 'error' | 'warning' | 'info' | 'hint' = 'error',
  code?: string,
  startOffset: number = 0,
  endOffset: number = fragment.content.length
): Diagnostic {
  // Calculate absolute positions in the document
  const absoluteStart = fragment.start + startOffset
  const absoluteEnd = fragment.start + endOffset

  return {
    message,
    severity: SEVERITY_MAP[severity],
    code,
    range: {
      start: offsetToPosition(documentContent, absoluteStart),
      end: offsetToPosition(documentContent, absoluteEnd),
    },
    source: 'risu-cbs',
  }
}

/**
 * Minimal CBS validation: check for unclosed braces.
 * Returns diagnostics for basic syntax errors.
 */
function validateCbsSyntax(
  documentContent: string,
  fragment: CbsFragment
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const content = fragment.content
  let openBraceCount = 0
  let lastOpenBracePos = -1

  for (let i = 0; i < content.length; i++) {
    if (content[i] === '{' && content[i + 1] === '{') {
      openBraceCount++
      lastOpenBracePos = i
      i++ // Skip next char
    } else if (content[i] === '}' && content[i + 1] === '}') {
      openBraceCount--
      i++ // Skip next char
      if (openBraceCount < 0) {
        // Unmatched closing brace
        diagnostics.push(
          createDiagnosticForFragment(
            documentContent,
            fragment,
            'Unmatched closing braces }}',
            'error',
            'CBS002',
            i - 1,
            i + 1
          )
        )
        openBraceCount = 0 // Reset to continue checking
      }
    }
  }

  if (openBraceCount > 0 && lastOpenBracePos >= 0) {
    // Unclosed opening brace
    diagnostics.push(
      createDiagnosticForFragment(
        documentContent,
        fragment,
        'Unclosed CBS expression - missing }}',
        'error',
        'CBS001',
        lastOpenBracePos,
        content.length
      )
    )
  }

  return diagnostics
}

/**
 * Route diagnostics for a document.
 * Maps the document to CBS fragments and returns diagnostics array.
 * Returns empty array for non-CBS files.
 *
 * @param filePath - The document file path
 * @param content - The document content
 * @param options - Diagnostic options (e.g., checkUnknownFunctions)
 * @returns Array of diagnostics for the document
 */
export function routeDiagnosticsForDocument(
  filePath: string,
  content: string,
  _options: Record<string, boolean> = {}
): Diagnostic[] {
  const fragmentMap = mapDocumentToCbsFragments(filePath, content)

  // Return empty array for non-CBS files or empty fragments
  if (!fragmentMap || fragmentMap.fragments.length === 0) {
    return []
  }

  // Run minimal CBS validation on each fragment
  const diagnostics: Diagnostic[] = []
  for (const fragment of fragmentMap.fragments) {
    diagnostics.push(...validateCbsSyntax(content, fragment))
  }

  return diagnostics
}
