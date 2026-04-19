/**
 * Unified Variable Graph Layer 1 - Canonical Contract
 *
 * This module defines the canonical Layer 1 contract for the UnifiedVariableGraph,
 * which provides a unified view of variable occurrences across CBS macros and
 * Lua state API calls. The contract is occurrence-first with exact host-document
 * coordinates, enabling cross-file navigation and analysis.
 *
 * Key design principles:
 * - Occurrence-first: Every variable access is recorded as a distinct occurrence
 * - Host-document coordinates: All positions are in host document (not fragment-local)
 * - Deterministic ordering: By variable name → URI → host offsets → occurrenceId
 * - Serialization-friendly: No Maps/Sets in public snapshot shape
 * - Source-agnostic: Unified view of CBS macros and Lua state API
 *
 * @file packages/cbs-lsp/src/indexer/unified-variable-graph.ts
 */

import fs from 'node:fs';
import type {
  Range,
  CustomExtensionArtifact,
  CBSVariableOccurrence,
  StateAccessOccurrence,
  ElementCBSData,
  VarFlowResult,
} from 'risu-workbench-core';
import { extractCBSVariableOccurrences, analyzeVariableFlow } from 'risu-workbench-core';
import type { WorkspaceFileArtifactClass } from './file-scanner';
import type {
  ElementRegistry,
  ElementRegistryElementAnalysisKind,
  ElementRegistryGraphSeed,
  ElementRegistryFragmentElement,
  ElementRegistryLuaElement,
} from './element-registry';
import { createFragmentOffsetMapper } from '../core/fragment-position';

/**
 * Source kind for variable occurrences.
 * Constrained to the two supported variable access mechanisms.
 */
export type UnifiedVariableSourceKind = 'cbs-macro' | 'lua-state-api';

/**
 * Unique identifier for a variable occurrence.
 * Format: `{elementId}:{direction}:{hostStartOffset}-{hostEndOffset}:{variableName}`
 */
export type UnifiedVariableOccurrenceId = string;

/**
 * A single variable occurrence in the unified graph.
 *
 * This is the canonical occurrence-first shape with exact host-document coordinates.
 * All positions are absolute positions in the host document, not fragment-local.
 */
export interface UnifiedVariableOccurrence {
  /**
   * Unique identifier for this occurrence.
   * Format: `{elementId}:{direction}:{hostStartOffset}-{hostEndOffset}:{variableName}`
   */
  occurrenceId: UnifiedVariableOccurrenceId;

  /**
   * The variable name being accessed.
   * Trimmed and normalized (no leading/trailing whitespace).
   */
  variableName: string;

  /**
   * Access direction: 'read' for reads, 'write' for writes.
   */
  direction: 'read' | 'write';

  /**
   * The source kind indicating whether this is a CBS macro or Lua state API.
   * Constrained to 'cbs-macro' | 'lua-state-api'.
   */
  sourceKind: UnifiedVariableSourceKind;

  /**
   * The specific source name/operation.
   * - CBS: 'getvar', 'setvar', 'addvar', 'setdefaultvar'
   * - Lua: 'getState', 'setState', 'getChatVar', 'setChatVar'
   */
  sourceName: string;

  /**
   * The URI of the document containing this occurrence.
   */
  uri: string;

  /**
   * The workspace-relative path of the document.
   */
  relativePath: string;

  /**
   * The artifact kind (e.g., 'lorebook', 'regex', 'lua', 'prompt', 'html').
   */
  artifact: CustomExtensionArtifact;

  /**
   * The artifact class ('cbs-bearing' | 'non-cbs').
   */
  artifactClass: WorkspaceFileArtifactClass;

  /**
   * The element ID containing this occurrence.
   * For CBS fragments: `{uri}#fragment:{section}:{index}`
   * For Lua files: `{uri}#lua`
   */
  elementId: string;

  /**
   * The element name (human-readable identifier).
   * For fragments: `{relativePath}#{section}`
   * For Lua: `{relativePath}`
   */
  elementName: string;

  /**
   * The fragment section name for CBS fragments, or null for Lua files.
   * Examples: 'CONTENT', 'IN', 'OUT', 'TEXT', 'full'
   */
  fragmentSection: string | null;

  /**
   * The analysis kind indicating the element type.
   * 'cbs-fragment' for CBS-bearing fragments, 'lua-file' for Lua files.
   */
  analysisKind: ElementRegistryElementAnalysisKind;

  /**
   * The range of the variable key in the host document.
   * This is the exact range of the trimmed variable name.
   */
  hostRange: Range;

  /**
   * Byte offset (inclusive) for the variable key in the host document.
   */
  hostStartOffset: number;

  /**
   * Byte offset (exclusive) for the variable key in the host document.
   */
  hostEndOffset: number;

  /**
   * The range of the full argument (may include whitespace padding).
   * This is the range of the first argument to the CBS macro or Lua API call.
   */
  argumentRange: Range;

  /**
   * Optional metadata for debugging and additional context.
   * This is not part of the canonical identity but may be useful for tooling.
   */
  metadata?: {
    /** Fragment index for CBS fragments */
    fragmentIndex?: number;
    /** Containing function name for Lua occurrences */
    containingFunction?: string;
    /** Line number for Lua occurrences */
    line?: number;
  };
}

/**
 * A node in the unified variable graph representing all occurrences of a single variable.
 *
 * Occurrences are sorted deterministically by:
 * 1. URI (lexicographic)
 * 2. Host start offset (ascending)
 * 3. Host end offset (ascending)
 * 4. occurrenceId (lexicographic, as tiebreaker)
 */
export interface UnifiedVariableNode {
  /**
   * The variable name.
   */
  name: string;

  /**
   * All read occurrences of this variable across the workspace.
   * Sorted deterministically for stable iteration.
   */
  readers: readonly UnifiedVariableOccurrence[];

  /**
   * All write occurrences of this variable across the workspace.
   * Sorted deterministically for stable iteration.
   */
  writers: readonly UnifiedVariableOccurrence[];

  /**
   * Total number of occurrences (readers + writers).
   */
  occurrenceCount: number;

  /**
   * Set of artifact kinds that contain at least one occurrence of this variable.
   * Derived from occurrences, sorted deterministically.
   */
  artifacts: readonly CustomExtensionArtifact[];

  /**
   * Set of URIs that contain at least one occurrence of this variable.
   * Derived from occurrences, sorted deterministically.
   */
  uris: readonly string[];
}

/**
 * A serializable snapshot of the unified variable graph.
 *
 * This is the public read-only shape exposed to consumers.
 * No Maps or Sets are used - only plain objects and arrays for easy serialization.
 */
export interface UnifiedVariableGraphSnapshot {
  /**
   * The workspace root path used to build this graph.
   */
  rootPath: string;

  /**
   * All variable nodes in the graph.
   * Sorted by variable name for deterministic iteration.
   */
  variables: readonly UnifiedVariableNode[];

  /**
   * Total number of variables in the graph.
   */
  totalVariables: number;

  /**
   * Total number of occurrences across all variables.
   */
  totalOccurrences: number;

  /**
   * Index: variable name → node (as a record for serialization).
   */
  variableIndex: Readonly<Record<string, UnifiedVariableNode>>;

  /**
   * Index: URI → occurrence IDs in that document.
   * Useful for incremental updates and document-scoped queries.
   */
  occurrencesByUri: Readonly<Record<string, readonly UnifiedVariableOccurrenceId[]>>;

  /**
   * Index: element ID → occurrence IDs in that element.
   * Useful for element-scoped queries.
   */
  occurrencesByElementId: Readonly<Record<string, readonly UnifiedVariableOccurrenceId[]>>;

  /**
   * Build timestamp for cache invalidation.
   */
  buildTimestamp: number;

  /**
   * Version identifier for the graph schema.
   */
  schemaVersion: string;
}

/**
 * Options for building the unified variable graph.
 */
export interface UnifiedVariableGraphBuildOptions {
  /**
   * The workspace root path.
   */
  rootPath: string;

  /**
   * CBS variable occurrences from ElementRegistry.
   */
  cbsOccurrences: readonly UnifiedVariableOccurrence[];

  /**
   * Lua state access occurrences from ElementRegistry.
   */
  luaOccurrences: readonly UnifiedVariableOccurrence[];
}

/**
 * Result of a findOccurrenceAt query.
 */
export interface FindOccurrenceResult {
  /**
   * The found occurrence, or null if none found.
   */
  occurrence: UnifiedVariableOccurrence | null;

  /**
   * The variable node containing the occurrence, or null if none found.
   */
  variableNode: UnifiedVariableNode | null;

  /**
   * Whether the position is exactly at an occurrence (vs. just containing it).
   */
  isExactMatch: boolean;
}

/**
 * The Unified Variable Graph provides a unified view of variable occurrences
 * across CBS macros and Lua state API calls.
 *
 * This is the Layer 1 API class that consumers interact with.
 * It provides query methods and maintains the graph snapshot.
 *
 * Note: This class only defines the contract and query surface.
 * The actual builder implementation (converting ElementRegistry data to
 * UnifiedVariableOccurrence) belongs to Task 5.
 */
export class UnifiedVariableGraph {
  private readonly snapshot: UnifiedVariableGraphSnapshot;

  /**
   * Private constructor. Use fromSnapshot() or build() factory methods.
   */
  private constructor(snapshot: UnifiedVariableGraphSnapshot) {
    this.snapshot = snapshot;
  }

  /**
   * Create a UnifiedVariableGraph from an existing snapshot.
   * Useful for deserialization and caching scenarios.
   *
   * @param snapshot - The snapshot to restore from
   * @returns A new UnifiedVariableGraph instance
   */
  static fromSnapshot(snapshot: UnifiedVariableGraphSnapshot): UnifiedVariableGraph {
    return new UnifiedVariableGraph(snapshot);
  }

  /**
   * Create a UnifiedVariableGraph from an ElementRegistry.
   *
   * This is the primary factory method for building the graph from Layer 1 data.
   * It consumes the ElementRegistry (the source of truth) and produces a complete
   * UnifiedVariableGraph with all variable occurrences properly rebased to host
   * document coordinates.
   *
   * Inclusion policy:
   * - Included: lorebook, regex, prompt, html, lua
   * - Excluded: toggle, variable, files with zero CBS fragments
   *
   * @param registry - The ElementRegistry containing workspace scan results
   * @returns A new UnifiedVariableGraph instance
   */
  static fromRegistry(registry: ElementRegistry): UnifiedVariableGraph {
    return buildUnifiedVariableGraphFromRegistry(registry);
  }

  /**
   * Build a new UnifiedVariableGraph from occurrence data.
   *
   * This is the low-level builder that consumes pre-built occurrence arrays.
   * For building from ElementRegistry, use fromRegistry() instead.
   *
   * @param options - Build options containing root path and occurrence arrays
   * @returns A new UnifiedVariableGraph instance
   */
  static build(options: UnifiedVariableGraphBuildOptions): UnifiedVariableGraph {
    const allOccurrences = [...options.cbsOccurrences, ...options.luaOccurrences];

    // Sort occurrences deterministically
    const sortedOccurrences = sortOccurrencesDeterministically(allOccurrences);

    // Group by variable name
    const occurrencesByVariable = groupOccurrencesByVariable(sortedOccurrences);

    // Build variable nodes
    const variableNodes: UnifiedVariableNode[] = [];
    const variableIndex: Record<string, UnifiedVariableNode> = {};

    for (const [variableName, occurrences] of occurrencesByVariable) {
      const readers = occurrences.filter((o) => o.direction === 'read');
      const writers = occurrences.filter((o) => o.direction === 'write');
      const uris = [...new Set(occurrences.map((o) => o.uri))].sort();
      const artifacts = [...new Set(occurrences.map((o) => o.artifact))].sort();

      const node: UnifiedVariableNode = {
        name: variableName,
        readers,
        writers,
        occurrenceCount: occurrences.length,
        artifacts,
        uris,
      };

      variableNodes.push(node);
      variableIndex[variableName] = node;
    }

    // Build URI and element ID indexes
    const occurrencesByUri: Record<string, UnifiedVariableOccurrenceId[]> = {};
    const occurrencesByElementId: Record<string, UnifiedVariableOccurrenceId[]> = {};

    for (const occurrence of sortedOccurrences) {
      if (!occurrencesByUri[occurrence.uri]) {
        occurrencesByUri[occurrence.uri] = [];
      }
      occurrencesByUri[occurrence.uri].push(occurrence.occurrenceId);

      if (!occurrencesByElementId[occurrence.elementId]) {
        occurrencesByElementId[occurrence.elementId] = [];
      }
      occurrencesByElementId[occurrence.elementId].push(occurrence.occurrenceId);
    }

    // Sort index entries for determinism
    for (const uri of Object.keys(occurrencesByUri)) {
      occurrencesByUri[uri].sort();
    }
    for (const elementId of Object.keys(occurrencesByElementId)) {
      occurrencesByElementId[elementId].sort();
    }

    const snapshot: UnifiedVariableGraphSnapshot = {
      rootPath: options.rootPath,
      variables: variableNodes,
      totalVariables: variableNodes.length,
      totalOccurrences: sortedOccurrences.length,
      variableIndex,
      occurrencesByUri,
      occurrencesByElementId,
      buildTimestamp: Date.now(),
      schemaVersion: '1.0.0',
    };

    return new UnifiedVariableGraph(snapshot);
  }

  /**
   * Get the current snapshot of the graph.
   *
   * @returns The immutable snapshot
   */
  getSnapshot(): UnifiedVariableGraphSnapshot {
    return this.snapshot;
  }

  /**
   * Get a variable node by name.
   *
   * @param name - The variable name to look up
   * @returns The variable node, or null if not found
   */
  getVariable(name: string): UnifiedVariableNode | null {
    return this.snapshot.variableIndex[name] ?? null;
  }

  /**
   * Get all occurrences for a specific variable.
   *
   * @param name - The variable name
   * @returns Array of occurrences (readers + writers), or empty array if variable not found
   */
  getOccurrencesForVariable(name: string): readonly UnifiedVariableOccurrence[] {
    const node = this.snapshot.variableIndex[name];
    if (!node) return [];
    // Return combined readers and writers, sorted by occurrenceId
    return [...node.readers, ...node.writers].sort((a, b) =>
      a.occurrenceId.localeCompare(b.occurrenceId),
    );
  }

  /**
   * Get all occurrence IDs in a specific document by URI.
   *
   * @param uri - The document URI
   * @returns Array of occurrence IDs in that document
   */
  getOccurrenceIdsByUri(uri: string): readonly UnifiedVariableOccurrenceId[] {
    return this.snapshot.occurrencesByUri[uri] ?? [];
  }

  /**
   * Get all occurrences in a specific document by URI.
   * This is the primary query method for Layer 3 consumers to get
   * usable occurrence data without requiring additional lookups.
   *
   * @param uri - The document URI
   * @returns Array of UnifiedVariableOccurrence objects in that document
   */
  getOccurrencesByUri(uri: string): readonly UnifiedVariableOccurrence[] {
    const occurrenceIds = this.snapshot.occurrencesByUri[uri];
    if (!occurrenceIds || occurrenceIds.length === 0) {
      return [];
    }

    // Collect all occurrences from variable nodes
    const occurrences: UnifiedVariableOccurrence[] = [];
    const idSet = new Set(occurrenceIds);

    for (const variable of this.snapshot.variables) {
      for (const occ of variable.readers) {
        if (occ.uri === uri && idSet.has(occ.occurrenceId)) {
          occurrences.push(occ);
        }
      }
      for (const occ of variable.writers) {
        if (occ.uri === uri && idSet.has(occ.occurrenceId)) {
          occurrences.push(occ);
        }
      }
    }

    // Sort deterministically by occurrenceId for stable results
    return occurrences.sort((a, b) => a.occurrenceId.localeCompare(b.occurrenceId));
  }

  /**
   * Find the occurrence at a specific position in a document.
   *
   * Returns the narrowest containing occurrence, with ties broken by:
   * 1. Smallest range (end - start)
   * 2. Lexicographically smallest occurrenceId
   *
   * @param uri - The document URI
   * @param hostOffset - The byte offset in the host document
   * @returns The found occurrence result
   */
  findOccurrenceAt(uri: string, hostOffset: number): FindOccurrenceResult {
    const occurrenceIds = this.snapshot.occurrencesByUri[uri];
    if (!occurrenceIds || occurrenceIds.length === 0) {
      return { occurrence: null, variableNode: null, isExactMatch: false };
    }

    // Collect all occurrences that contain the offset
    const containingOccurrences: Array<{
      occurrence: UnifiedVariableOccurrence;
      variableNode: UnifiedVariableNode;
      rangeSize: number;
    }> = [];

    for (const variable of this.snapshot.variables) {
      // Check both readers and writers
      const allOccurrences = [...variable.readers, ...variable.writers];
      for (const occurrence of allOccurrences) {
        if (occurrence.uri !== uri) continue;

        const { hostStartOffset, hostEndOffset } = occurrence;
        if (hostOffset >= hostStartOffset && hostOffset < hostEndOffset) {
          containingOccurrences.push({
            occurrence,
            variableNode: variable,
            rangeSize: hostEndOffset - hostStartOffset,
          });
        }
      }
    }

    if (containingOccurrences.length === 0) {
      return { occurrence: null, variableNode: null, isExactMatch: false };
    }

    // Sort by: smallest range first, then smallest occurrenceId
    containingOccurrences.sort((a, b) => {
      if (a.rangeSize !== b.rangeSize) {
        return a.rangeSize - b.rangeSize;
      }
      return a.occurrence.occurrenceId.localeCompare(b.occurrence.occurrenceId);
    });

    const bestMatch = containingOccurrences[0];
    const secondRangeSize = containingOccurrences[1]?.rangeSize;
    const isExactMatch =
      containingOccurrences.length === 1 ||
      (secondRangeSize !== undefined && bestMatch.rangeSize < secondRangeSize);

    return {
      occurrence: bestMatch.occurrence,
      variableNode: bestMatch.variableNode,
      isExactMatch,
    };
  }

  /**
   * Get all variable names in the graph.
   *
   * @returns Sorted array of variable names
   */
  getAllVariableNames(): readonly string[] {
    return this.snapshot.variables.map((v) => v.name);
  }

  /**
   * Check if a variable exists in the graph.
   *
   * @param name - The variable name
   * @returns True if the variable exists
   */
  hasVariable(name: string): boolean {
    return name in this.snapshot.variableIndex;
  }

  /**
   * Get the total number of variables.
   *
   * @returns Variable count
   */
  getVariableCount(): number {
    return this.snapshot.totalVariables;
  }

  /**
   * Get the total number of occurrences.
   *
   * @returns Occurrence count
   */
  getOccurrenceCount(): number {
    return this.snapshot.totalOccurrences;
  }
}

/**
 * Sort occurrences deterministically for stable iteration and serialization.
 *
 * Ordering: variable name → URI → hostStartOffset → hostEndOffset → occurrenceId
 */
function sortOccurrencesDeterministically(
  occurrences: readonly UnifiedVariableOccurrence[],
): UnifiedVariableOccurrence[] {
  return [...occurrences].sort((a, b) => {
    // 1. Variable name
    const nameCompare = a.variableName.localeCompare(b.variableName);
    if (nameCompare !== 0) return nameCompare;

    // 2. URI
    const uriCompare = a.uri.localeCompare(b.uri);
    if (uriCompare !== 0) return uriCompare;

    // 3. Host start offset
    if (a.hostStartOffset !== b.hostStartOffset) {
      return a.hostStartOffset - b.hostStartOffset;
    }

    // 4. Host end offset
    if (a.hostEndOffset !== b.hostEndOffset) {
      return a.hostEndOffset - b.hostEndOffset;
    }

    // 5. Occurrence ID (tiebreaker)
    return a.occurrenceId.localeCompare(b.occurrenceId);
  });
}

/**
 * Group occurrences by variable name.
 */
function groupOccurrencesByVariable(
  occurrences: readonly UnifiedVariableOccurrence[],
): Map<string, UnifiedVariableOccurrence[]> {
  const groups = new Map<string, UnifiedVariableOccurrence[]>();

  for (const occurrence of occurrences) {
    const { variableName } = occurrence;
    if (!groups.has(variableName)) {
      groups.set(variableName, []);
    }
    groups.get(variableName)!.push(occurrence);
  }

  return groups;
}

/**
 * Inclusion policy: artifact kinds that should be included in the graph.
 */
const INCLUDED_ARTIFACTS: ReadonlySet<CustomExtensionArtifact> = new Set([
  'lorebook',
  'regex',
  'prompt',
  'html',
  'lua',
]);

/**
 * Exclusion policy: artifact kinds that should NOT be included in the graph.
 * toggle and variable files are excluded as they don't contain CBS fragments
 * or Lua state API calls that participate in the variable graph.
 */
const EXCLUDED_ARTIFACTS: ReadonlySet<CustomExtensionArtifact> = new Set([
  'toggle',
  'variable',
]);

/**
 * Check if an artifact kind should be included in the variable graph.
 *
 * @param artifact - The artifact kind to check
 * @returns true if the artifact should be included
 */
function shouldIncludeArtifact(artifact: CustomExtensionArtifact): boolean {
  return INCLUDED_ARTIFACTS.has(artifact);
}

/**
 * Check if an artifact kind should be excluded from the variable graph.
 *
 * @param artifact - The artifact kind to check
 * @returns true if the artifact should be excluded
 */
function shouldExcludeArtifact(artifact: CustomExtensionArtifact): boolean {
  return EXCLUDED_ARTIFACTS.has(artifact);
}

/**
 * Build occurrence ID in the canonical format.
 * Format: `{elementId}:{direction}:{hostStartOffset}-{hostEndOffset}:{variableName}`
 *
 * @param elementId - The element ID
 * @param direction - 'read' or 'write'
 * @param hostStartOffset - Byte offset (inclusive)
 * @param hostEndOffset - Byte offset (exclusive)
 * @param variableName - The variable name
 * @returns The formatted occurrence ID
 */
function buildOccurrenceId(
  elementId: string,
  direction: 'read' | 'write',
  hostStartOffset: number,
  hostEndOffset: number,
  variableName: string,
): UnifiedVariableOccurrenceId {
  return `${elementId}:${direction}:${hostStartOffset}-${hostEndOffset}:${variableName}`;
}

/**
 * Convert a Position to an offset within a text content.
 * The position is interpreted relative to the provided content.
 *
 * @param content - The text content (can be fragment or full document)
 * @param position - The position to convert
 * @returns The byte offset within the content
 */
function positionToOffset(content: string, position: Range['start']): number {
  const lines = content.split('\n');
  let offset = 0;

  for (let i = 0; i < position.line && i < lines.length; i++) {
    offset += lines[i].length + 1; // +1 for newline
  }

  offset += position.character;
  return Math.min(offset, content.length);
}

/**
 * Convert an offset to a Position within a text content.
 *
 * @param content - The text content (can be fragment or full document)
 * @param offset - The byte offset
 * @returns The Position
 */
function offsetToPosition(content: string, offset: number): Range['start'] {
  const lines = content.split('\n');
  let currentOffset = 0;

  for (let line = 0; line < lines.length; line++) {
    const lineLength = lines[line].length + 1; // +1 for newline
    if (currentOffset + lineLength > offset) {
      return {
        line,
        character: offset - currentOffset,
      };
    }
    currentOffset += lineLength;
  }

  // If offset is at or beyond the end, return end position
  const lastLine = Math.max(0, lines.length - 1);
  return {
    line: lastLine,
    character: lines[lastLine]?.length ?? 0,
  };
}

/**
 * Rebase a range from fragment-local coordinates to host-document coordinates.
 *
 * This function properly converts fragment-local positions to host-document positions:
 * 1. Convert local positions to offsets within the fragment
 * 2. Add fragment's host start offset to get host offsets
 * 3. Convert host offsets to positions in the host document
 *
 * @param localRange - The local range within the fragment (relative to fragment content)
 * @param fragmentStart - The fragment's start offset in the host document
 * @param fragmentContent - The fragment content (for local offset calculation)
 * @param hostDocumentContent - The full host document content (for host position calculation)
 * @returns The host-document Range
 */
function rebaseRangeToHost(
  localRange: Range,
  fragmentStart: number,
  fragmentContent: string,
  hostDocumentContent: string,
): Range {
  // Step 1: Convert local positions to offsets within the fragment
  const localStartOffset = positionToOffset(fragmentContent, localRange.start);
  const localEndOffset = positionToOffset(fragmentContent, localRange.end);

  // Step 2: Rebase to host offsets by adding fragment's host start
  const hostStartOffset = fragmentStart + localStartOffset;
  const hostEndOffset = fragmentStart + localEndOffset;

  // Step 3: Convert host offsets to positions in the host document
  return {
    start: offsetToPosition(hostDocumentContent, hostStartOffset),
    end: offsetToPosition(hostDocumentContent, hostEndOffset),
  };
}

/**
 * Build UnifiedVariableOccurrence from CBSVariableOccurrence with host-range rebasing.
 *
 * This function properly rebases fragment-local CBS occurrences to host-document coordinates:
 * 1. Parse fragment content to get local positions
 * 2. Convert local positions to host offsets using fragment's hostRange
 * 3. Build host-document Range from host offsets
 *
 * @param cbsOccurrence - The CBS occurrence from core (with fragment-local positions)
 * @param seed - The element registry graph seed
 * @param element - The fragment element
 * @param fragmentContent - The fragment content (for local position interpretation)
 * @param hostDocumentContent - The full host document content
 * @returns The unified occurrence with proper host-document coordinates
 */
function buildCbsUnifiedOccurrence(
  cbsOccurrence: CBSVariableOccurrence,
  seed: ElementRegistryGraphSeed,
  element: ElementRegistryFragmentElement,
  fragmentContent: string,
  hostDocumentContent: string,
): UnifiedVariableOccurrence {
  const fragmentStart = element.fragment.hostRange.start;

  // Rebase the key range from fragment-local to host-document coordinates
  const hostRange = rebaseRangeToHost(
    { start: cbsOccurrence.keyStart, end: cbsOccurrence.keyEnd },
    fragmentStart,
    fragmentContent,
    hostDocumentContent,
  );

  // Calculate host offsets from the host range positions
  const hostStartOffset = positionToOffset(hostDocumentContent, hostRange.start);
  const hostEndOffset = positionToOffset(hostDocumentContent, hostRange.end);

  // Rebase the argument range as well
  const argumentRange = rebaseRangeToHost(
    cbsOccurrence.range,
    fragmentStart,
    fragmentContent,
    hostDocumentContent,
  );

  return {
    occurrenceId: buildOccurrenceId(
      seed.elementId,
      cbsOccurrence.direction,
      hostStartOffset,
      hostEndOffset,
      cbsOccurrence.variableName,
    ),
    variableName: cbsOccurrence.variableName,
    direction: cbsOccurrence.direction,
    sourceKind: 'cbs-macro',
    sourceName: cbsOccurrence.operation,
    uri: seed.uri,
    relativePath: seed.relativePath,
    artifact: seed.artifact,
    artifactClass: seed.artifactClass,
    elementId: seed.elementId,
    elementName: seed.elementName,
    fragmentSection: seed.fragmentSection,
    analysisKind: seed.analysisKind,
    hostRange,
    hostStartOffset,
    hostEndOffset,
    argumentRange,
    metadata: {
      fragmentIndex: seed.fragmentIndex,
    },
  };
}

/**
 * Build UnifiedVariableOccurrence from StateAccessOccurrence for Lua files.
 * Lua files don't have fragments, so host offsets are direct file offsets.
 *
 * @param luaOccurrence - The Lua state access occurrence from core
 * @param seed - The element registry graph seed
 * @param documentContent - The full document content
 * @returns The unified occurrence
 */
function buildLuaUnifiedOccurrence(
  luaOccurrence: StateAccessOccurrence,
  seed: ElementRegistryGraphSeed,
  documentContent: string,
): UnifiedVariableOccurrence {
  // Lua occurrences already have byte offsets (argStart/argEnd)
  const hostStartOffset = luaOccurrence.argStart;
  const hostEndOffset = luaOccurrence.argEnd;

  // Convert byte offsets to Range positions
  const hostRange: Range = {
    start: offsetToPosition(documentContent, hostStartOffset),
    end: offsetToPosition(documentContent, hostEndOffset),
  };

  return {
    occurrenceId: buildOccurrenceId(
      seed.elementId,
      luaOccurrence.direction,
      hostStartOffset,
      hostEndOffset,
      luaOccurrence.key,
    ),
    variableName: luaOccurrence.key,
    direction: luaOccurrence.direction,
    sourceKind: 'lua-state-api',
    sourceName: luaOccurrence.apiName,
    uri: seed.uri,
    relativePath: seed.relativePath,
    artifact: seed.artifact,
    artifactClass: seed.artifactClass,
    elementId: seed.elementId,
    elementName: seed.elementName,
    fragmentSection: null,
    analysisKind: seed.analysisKind,
    hostRange,
    hostStartOffset,
    hostEndOffset,
    argumentRange: hostRange, // For Lua, the key range is the argument range
    metadata: {
      containingFunction: luaOccurrence.containingFunction,
      line: luaOccurrence.line,
    },
  };
}

/**
 * Extract CBS occurrences from a fragment element with host-range rebasing.
 *
 * This function reads the host document content to properly rebase fragment-local
 * positions to host-document coordinates.
 *
 * @param element - The fragment element
 * @param hostDocumentContent - The full host document content
 * @returns Array of unified occurrences with proper host-document coordinates
 */
function extractCbsOccurrencesFromFragment(
  element: ElementRegistryFragmentElement,
  hostDocumentContent: string,
): UnifiedVariableOccurrence[] {
  const fragmentContent = element.fragment.content;
  const cbsOccurrences = extractCBSVariableOccurrences(fragmentContent);

  return cbsOccurrences.map((cbsOcc) =>
    buildCbsUnifiedOccurrence(cbsOcc, element.graphSeed, element, fragmentContent, hostDocumentContent),
  );
}

/**
 * Extract Lua occurrences from a Lua element with direct host offsets.
 *
 * @param element - The Lua element
 * @param documentContent - The full document content
 * @returns Array of unified occurrences
 */
function extractLuaOccurrencesFromElement(
  element: ElementRegistryLuaElement,
  documentContent: string,
): UnifiedVariableOccurrence[] {
  // We need to get the Lua artifact to access stateAccessOccurrences
  // This is passed in via the registry parameter in the main builder
  return [];
}

/**
 * Read host document content from file system.
 * Uses the absolute path from the registry file record.
 *
 * @param absolutePath - The absolute file path
 * @returns The file content as string, or null if read fails
 */
function readHostDocumentContent(absolutePath: string): string | null {
  try {
    return fs.readFileSync(absolutePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Build unified variable occurrences from ElementRegistry.
 *
 * This is the main builder function that:
 * 1. Iterates through all elements in the registry
 * 2. Reads host document content for each file
 * 3. Extracts CBS occurrences from fragment elements with proper host-range rebasing
 * 4. Extracts Lua occurrences from Lua elements with direct host offsets
 * 5. Applies inclusion/exclusion policy
 *
 * @param registry - The ElementRegistry to build from
 * @returns Object containing CBS and Lua occurrence arrays
 */
function buildOccurrencesFromRegistry(registry: ElementRegistry): {
  cbsOccurrences: UnifiedVariableOccurrence[];
  luaOccurrences: UnifiedVariableOccurrence[];
} {
  const cbsOccurrences: UnifiedVariableOccurrence[] = [];
  const luaOccurrences: UnifiedVariableOccurrence[] = [];

  const snapshot = registry.getSnapshot();

  for (const file of snapshot.files) {
    // Skip excluded artifacts
    if (shouldExcludeArtifact(file.artifact)) {
      continue;
    }

    // Skip files without CBS fragments for non-Lua artifacts
    if (file.artifact !== 'lua' && !file.hasCbsFragments) {
      continue;
    }

    // Skip non-CBS artifacts
    if (!file.cbsBearingArtifact) {
      continue;
    }

    // Read the host document content for proper range rebasing
    const hostDocumentContent = readHostDocumentContent(file.absolutePath);
    if (!hostDocumentContent) {
      // Skip files that can't be read
      continue;
    }

    const elements = registry.getElementsByUri(file.uri);

    for (const element of elements) {
      if (element.analysisKind === 'cbs-fragment') {
        const fragmentElement = element as ElementRegistryFragmentElement;

        // Extract CBS occurrences with proper host-document range rebasing
        const fragmentOccurrences = extractCbsOccurrencesFromFragment(
          fragmentElement,
          hostDocumentContent,
        );

        cbsOccurrences.push(...fragmentOccurrences);
      } else if (element.analysisKind === 'lua-file') {
        const luaElement = element as ElementRegistryLuaElement;
        const luaArtifact = registry.getLuaArtifactByUri(file.uri);

        if (luaArtifact) {
          for (const stateOcc of luaArtifact.serialized.stateAccessOccurrences) {
            const unifiedOcc = buildLuaUnifiedOccurrence(
              stateOcc,
              luaElement.graphSeed,
              luaArtifact.sourceText ?? hostDocumentContent,
            );
            luaOccurrences.push(unifiedOcc);
          }
        }
      }
    }
  }

  return { cbsOccurrences, luaOccurrences };
}

/**
 * Build a UnifiedVariableGraph directly from an ElementRegistry.
 *
 * This is the primary factory method for creating the graph from Layer 1 data.
 * It consumes the ElementRegistry (the source of truth) and produces a complete
 * UnifiedVariableGraph with all variable occurrences properly rebased to host
 * document coordinates.
 *
 * Inclusion policy:
 * - Included: lorebook, regex, prompt, html, lua
 * - Excluded: toggle, variable, files with zero CBS fragments
 *
 * @param registry - The ElementRegistry containing workspace scan results
 * @returns A new UnifiedVariableGraph instance
 */
export function buildUnifiedVariableGraphFromRegistry(
  registry: ElementRegistry,
): UnifiedVariableGraph {
  const { cbsOccurrences, luaOccurrences } = buildOccurrencesFromRegistry(registry);

  return UnifiedVariableGraph.build({
    rootPath: registry.getRootPath(),
    cbsOccurrences,
    luaOccurrences,
  });
}

/**
 * Build a derived flow result from the graph and optional default variables.
 *
 * This is an ADJACENT helper that delegates to core's analyzeVariableFlow()
 * without embedding flow issues into the canonical graph snapshot.
 *
 * The flow result is computed on-demand from the graph's occurrence data
 * combined with ElementCBSData from the registry. This keeps the canonical
 * graph snapshot clean of derived analysis issues while still providing
 * access to flow analysis when needed.
 *
 * @param graph - The UnifiedVariableGraph to analyze
 * @param registry - The ElementRegistry containing ElementCBSData
 * @param defaultVariables - Optional default variable values
 * @returns The variable flow analysis result
 */
export function buildDerivedFlowResult(
  graph: UnifiedVariableGraph,
  registry: ElementRegistry,
  defaultVariables: Record<string, string> = {},
): VarFlowResult {
  // Collect ElementCBSData from the registry for flow analysis
  const elementCbsData: ElementCBSData[] = [];

  for (const variableName of graph.getAllVariableNames()) {
    const variableNode = graph.getVariable(variableName);
    if (!variableNode) continue;

    // Group occurrences by element
    const occurrencesByElement = new Map<string, typeof variableNode.readers[number]>();

    for (const occ of variableNode.readers) {
      if (!occurrencesByElement.has(occ.elementId)) {
        occurrencesByElement.set(occ.elementId, occ);
      }
    }

    for (const occ of variableNode.writers) {
      if (!occurrencesByElement.has(occ.elementId)) {
        occurrencesByElement.set(occ.elementId, occ);
      }
    }

    // Build ElementCBSData for each element
    for (const [elementId, occ] of occurrencesByElement) {
      const elementData = registry.getElementCbsDataByUri(occ.uri);
      const matchingElement = elementData.find((e) =>
        occ.fragmentSection
          ? e.elementName === `${occ.relativePath}#${occ.fragmentSection}`
          : e.elementName === occ.relativePath,
      );

      if (matchingElement) {
        elementCbsData.push(matchingElement);
      }
    }
  }

  // Deduplicate ElementCBSData by elementName
  const seenElements = new Set<string>();
  const uniqueElementCbsData = elementCbsData.filter((e) => {
    if (seenElements.has(e.elementName)) {
      return false;
    }
    seenElements.add(e.elementName);
    return true;
  });

  // Delegate to core's analyzeVariableFlow
  return analyzeVariableFlow(uniqueElementCbsData, defaultVariables);
}
