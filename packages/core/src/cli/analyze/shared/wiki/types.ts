/** A single file the wiki renderer will write. */
export interface WikiFile {
  /** Path relative to the artifact's _generated/ root. */
  relativePath: string;
  /** Full markdown content including frontmatter. */
  content: string;
}

/** Identifies one wiki page class for traversal rules and frontmatter. */
export type WikiPageClass =
  | 'manual'
  | 'overview'
  | 'index'
  | 'consolidated'
  | 'chain'
  | 'entity'
  | 'narrative';

/** Artifact type declared in workspace.yaml. */
export type ArtifactType = 'character' | 'module' | 'preset';

/** Stable key used in frontmatter and cross-links. */
export type ArtifactKey = string;

/** Parsed wiki/workspace.yaml. */
export interface WorkspaceConfig {
  /** Explicit artifact registry. Empty list if no --all support needed. */
  artifacts: Array<{ path: string; type: ArtifactType }>;
  /** Companion relationships, keyed by parent artifact key. */
  companions: Record<ArtifactKey, ArtifactKey[]>;
  /** Literal labels rendered verbatim. Never paraphrased. */
  labels: Record<ArtifactKey, string>;
}

/** Runtime context passed to every renderer. */
export interface RenderContext {
  artifactKey: ArtifactKey;
  artifactType: ArtifactType;
  /** Absolute path to the workspace wiki/ directory. */
  wikiRoot: string;
  /** Absolute path to the target artifact's extract directory (for source links). */
  extractDir: string;
  /** Parsed workspace config; empty config if workspace.yaml is missing. */
  workspace: WorkspaceConfig;
  /** ISO-8601 timestamp for per-artifact frontmatter. */
  generatedAt: string;
  /** Version string used by the generator field. Bumped on template changes. */
  generatorVersion: string;
}

/** Empty workspace config, used when workspace.yaml is absent. */
export const EMPTY_WORKSPACE_CONFIG: WorkspaceConfig = {
  artifacts: [],
  companions: {},
  labels: {},
};
