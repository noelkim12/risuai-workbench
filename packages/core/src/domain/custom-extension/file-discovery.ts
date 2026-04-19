import type { CustomExtensionArtifact, CustomExtensionMarkerKind } from './contracts';

/**
 * Canonical artifact file discovered in a workspace.
 * Pure domain type - no Node.js dependencies.
 */
export interface DiscoveredCanonicalFile {
  artifact: CustomExtensionArtifact;
  absolutePath: string;
  relativePath: string;
}

/**
 * Marker file discovered in a workspace.
 * Pure domain type - no Node.js dependencies.
 */
export interface DiscoveredMarkerFile {
  kind: CustomExtensionMarkerKind;
  absolutePath: string;
  relativePath: string;
}

/**
 * Structured json file discovered alongside canonical artifacts.
 * Pure domain type - no Node.js dependencies.
 */
export interface DiscoveredStructuredJsonFile {
  absolutePath: string;
  relativePath: string;
}

/**
 * Deterministic discovery result for a custom-extension workspace.
 * Pure domain type - no Node.js dependencies.
 */
export interface CustomExtensionWorkspaceDiscovery {
  canonicalFiles: readonly DiscoveredCanonicalFile[];
  markerFiles: readonly DiscoveredMarkerFile[];
  structuredJsonFiles: readonly DiscoveredStructuredJsonFile[];
}

/**
 * Filter discovery output to one artifact kind.
 * Pure domain function - no Node.js dependencies.
 *
 * @param discovery - The discovery result
 * @param artifact - The artifact kind to filter by
 * @returns Filtered canonical files
 */
export function filterCanonicalFilesByArtifact(
  discovery: CustomExtensionWorkspaceDiscovery,
  artifact: CustomExtensionArtifact,
): readonly DiscoveredCanonicalFile[] {
  return discovery.canonicalFiles.filter((file) => file.artifact === artifact);
}
