import {
  isCbsBearingFile as isCbsBearingFileCore,
  isNonCbsArtifact,
  parseCustomExtensionArtifactFromPath,
  type CustomExtensionArtifact,
} from 'risu-workbench-core'

/**
 * Supported CBS-bearing file extensions for LSP routing.
 * These formats contain CBS expressions that need diagnostics.
 */
export const SUPPORTED_CBS_EXTENSIONS = [
  '.risulorebook',
  '.risuregex',
  '.risuprompt',
  '.risuhtml',
  '.risulua',
] as const

/**
 * Explicitly ignored file extensions that are non-CBS-bearing.
 * These formats do NOT contain CBS expressions and are skipped.
 */
export const EXPLICITLY_IGNORED_EXTENSIONS = [
  '.risutoggle',
  '.risuvar',
] as const

/**
 * Check if a file path corresponds to a CBS-bearing artifact.
 * Uses core fragment mapping for consistent classification.
 *
 * @param filePath - The file path to check
 * @returns true if the file extension indicates a CBS-bearing format
 */
export function isCbsBearingFile(filePath: string): boolean {
  return isCbsBearingFileCore(filePath)
}

/**
 * Get the artifact type from a file path.
 * Returns null for ignored or unknown extensions.
 *
 * @param filePath - The file path to resolve
 * @returns The artifact type ('lorebook', 'regex', 'prompt', 'html', 'lua') or null
 */
export function getArtifactTypeFromPath(filePath: string): CustomExtensionArtifact | null {
  try {
    const artifact = parseCustomExtensionArtifactFromPath(filePath)
    // Return null for non-CBS artifacts (toggle, variable)
    if (isNonCbsArtifact(artifact)) {
      return null
    }
    return artifact
  } catch {
    return null
  }
}

/**
 * Check if a file should be routed for diagnostics.
 * Returns true for CBS-bearing files, false for ignored/unknown.
 *
 * @param filePath - The file path to check
 * @returns true if diagnostics should be routed for this file
 */
export function shouldRouteForDiagnostics(filePath: string): boolean {
  return isCbsBearingFile(filePath)
}
