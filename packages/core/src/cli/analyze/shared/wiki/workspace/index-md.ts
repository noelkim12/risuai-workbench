import type { ArtifactKey, ArtifactType, WorkspaceConfig } from '../types';

export interface ArtifactListing {
  key: ArtifactKey;
  type: ArtifactType;
}

/**
 * Build the markdown content that lives between the
 * `<!-- BEGIN:artifacts -->` and `<!-- END:artifacts -->` markers in _index.md.
 */
export function buildArtifactsSection(
  artifacts: ArtifactListing[],
  workspace: WorkspaceConfig,
): string {
  const characters = artifacts.filter((a) => a.type === 'character');
  const modules = artifacts.filter((a) => a.type === 'module');
  const presets = artifacts.filter((a) => a.type === 'preset');

  const sections = [
    renderCategory('Characters', characters, workspace),
    renderCategory('Modules', modules, workspace),
    renderCategory('Presets', presets, workspace),
  ];
  return sections.join('\n\n');
}

function renderCategory(
  title: string,
  artifacts: ArtifactListing[],
  workspace: WorkspaceConfig,
): string {
  if (artifacts.length === 0) {
    return `### ${title}\n- (none)`;
  }
  const lines = artifacts.map((a) => {
    const link = `[${a.key}](artifacts/${a.key}/_generated/overview.md)`;
    const label = workspace.labels[a.key];
    return label ? `- ${link} — _"${label}"_` : `- ${link}`;
  });
  return `### ${title}\n${lines.join('\n')}`;
}
