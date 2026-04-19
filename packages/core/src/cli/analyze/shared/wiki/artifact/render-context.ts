import type { CharxReportData } from '../../../charx/types';
import type { RenderContext, WorkspaceConfig, ArtifactType, ArtifactKey } from '../types';
import { GENERATOR_VERSION } from '../schema/schema';

/**
 * Build a RenderContext from the inputs available at analyze time.
 *
 * The artifact key defaults to `<type-prefix>_<extract-dir-basename>` where
 * type-prefix is `char` | `module` | `preset`. Callers can override this
 * with an explicit key (e.g., from workspace.yaml).
 */
export function buildRenderContext(args: {
  artifactKey: ArtifactKey;
  artifactType: ArtifactType;
  wikiRoot: string;
  extractDir: string;
  workspace: WorkspaceConfig;
  now?: Date;
}): RenderContext {
  const now = args.now ?? new Date();
  return {
    artifactKey: args.artifactKey,
    artifactType: args.artifactType,
    wikiRoot: args.wikiRoot,
    extractDir: args.extractDir,
    workspace: args.workspace,
    generatedAt: now.toISOString(),
    generatorVersion: GENERATOR_VERSION,
  };
}

/**
 * Compute the default artifact key from an extract directory basename
 * and the artifact type. Strips trailing slashes, replaces spaces with
 * underscores, prefixes with the type abbreviation.
 */
export function defaultArtifactKey(extractDirBasename: string, type: ArtifactType): ArtifactKey {
  const prefix = type === 'character' ? 'char' : type;
  const clean = extractDirBasename.replace(/\/$/, '').replace(/\s+/g, '_');
  return `${prefix}_${clean}`;
}

/** Type helper: narrow CharxReportData for renderer consumption. */
export type ArtifactReportData = CharxReportData;
