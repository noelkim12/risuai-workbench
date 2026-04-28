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

import type {
  Range,
  CustomExtensionArtifact,
} from 'risu-workbench-core';
import type { WorkspaceFileArtifactClass } from './file-scanner';
import type {
  ElementRegistry,
  ElementRegistryElementAnalysisKind,
  ElementRegistryLuaElement,
} from './element-registry';
import type { CbsAgentProtocolMarker } from '../contracts';
import { buildSnapshotFromOccurrences } from './unified-variable-snapshot';
import { buildUnifiedVariableGraphFromRegistry } from './unified-variable-registry-adapter';

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
export interface UnifiedVariableGraphSnapshot extends CbsAgentProtocolMarker {
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
  private snapshot: UnifiedVariableGraphSnapshot;

  private readonly occurrencesByUriIndex = new Map<string, UnifiedVariableOccurrence[]>();

  private readonly occurrencesById = new Map<UnifiedVariableOccurrenceId, UnifiedVariableOccurrence>();

  /**
   * Private constructor. Use fromSnapshot() or build() factory methods.
   */
  private constructor(snapshot: UnifiedVariableGraphSnapshot) {
    this.snapshot = snapshot;
    this.hydrateOccurrenceIndexes(snapshot);
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
    const snapshot = buildSnapshotFromOccurrences(options.rootPath, [
      ...options.cbsOccurrences,
      ...options.luaOccurrences,
    ]);

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
    return [...(this.occurrencesByUriIndex.get(uri) ?? [])];
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
    const uriOccurrences = this.occurrencesByUriIndex.get(uri);
    if (!uriOccurrences || uriOccurrences.length === 0) {
      return { occurrence: null, variableNode: null, isExactMatch: false };
    }

    // Collect all occurrences that contain the offset
    const containingOccurrences: Array<{
      occurrence: UnifiedVariableOccurrence;
      variableNode: UnifiedVariableNode;
      rangeSize: number;
    }> = [];

    for (const occurrence of uriOccurrences) {
      const { hostStartOffset, hostEndOffset } = occurrence;
      if (hostOffset < hostStartOffset || hostOffset >= hostEndOffset) {
        continue;
      }

      const variableNode = this.snapshot.variableIndex[occurrence.variableName];
      if (!variableNode) {
        continue;
      }

      containingOccurrences.push({
        occurrence,
        variableNode,
        rangeSize: hostEndOffset - hostStartOffset,
      });
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

  /**
   * replaceOccurrencesForUri 함수.
   * 특정 URI의 occurrence만 교체하고 graph snapshot을 다시 계산함.
   *
   * @param uri - 부분 갱신할 file URI
   * @param occurrences - 해당 URI의 최신 occurrence 목록
   */
  replaceOccurrencesForUri(uri: string, occurrences: readonly UnifiedVariableOccurrence[]): void {
    this.occurrencesByUriIndex.delete(uri);

    for (const [occurrenceId, occurrence] of this.occurrencesById.entries()) {
      if (occurrence.uri === uri) {
        this.occurrencesById.delete(occurrenceId);
      }
    }

    if (occurrences.length > 0) {
      const nextOccurrences = [...occurrences];
      this.occurrencesByUriIndex.set(uri, nextOccurrences);
      for (const occurrence of nextOccurrences) {
        this.occurrencesById.set(occurrence.occurrenceId, occurrence);
      }
    }

    this.snapshot = buildSnapshotFromOccurrences(this.snapshot.rootPath, this.occurrencesById.values());
    this.hydrateOccurrenceIndexes(this.snapshot);
  }

  /**
   * removeUri 함수.
   * 특정 URI의 occurrence를 graph에서 제거함.
   *
   * @param uri - 제거할 file URI
   */
  removeUri(uri: string): void {
    this.replaceOccurrencesForUri(uri, []);
  }

  /**
   * hydrateOccurrenceIndexes 함수.
   * snapshot에서 URI/id lookup cache를 다시 구성함.
   *
   * @param snapshot - 현재 graph snapshot
   */
  private hydrateOccurrenceIndexes(snapshot: UnifiedVariableGraphSnapshot): void {
    this.occurrencesByUriIndex.clear();
    this.occurrencesById.clear();

    for (const variable of snapshot.variables) {
      for (const occurrence of [...variable.readers, ...variable.writers]) {
        const existing = this.occurrencesByUriIndex.get(occurrence.uri);
        if (existing) {
          existing.push(occurrence);
        } else {
          this.occurrencesByUriIndex.set(occurrence.uri, [occurrence]);
        }

        this.occurrencesById.set(occurrence.occurrenceId, occurrence);
      }
    }

    for (const [uri, occurrences] of this.occurrencesByUriIndex.entries()) {
      occurrences.sort((left, right) => left.occurrenceId.localeCompare(right.occurrenceId));
      this.occurrencesByUriIndex.set(uri, occurrences);
    }
  }
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
