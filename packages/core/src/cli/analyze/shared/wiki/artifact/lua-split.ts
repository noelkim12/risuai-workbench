import fs from 'node:fs';
import path from 'node:path';
import type { CharxReportData } from '../../../charx/types';
import type { RenderContext, WikiFile } from '../types';
import { serializeFrontmatter } from '../markdown';

interface SplitPlanSummary {
  mode: string;
  sourceProfile: string;
  entryPath: string;
  distPath: string;
  packable: boolean | null;
  plannedFiles: number;
}

interface SidecarSummary {
  domainCandidatesTotal: number;
  domainCandidatesGenerated: number;
  domainCandidatesBlocked: number;
  refactorMapModules: number;
  hostExports: number;
  duplicateGroups: number;
  buttonActions: number;
}

export function renderLuaSplit(data: CharxReportData, ctx: RenderContext): WikiFile | null {
  const plan = readSplitPlan(ctx.extractDir);
  const sidecars = readSidecarSummary(ctx.extractDir);
  const roleCounts = countSplitRoles(data);
  const hasRoleData = roleCounts.size > 0;
  if (!plan && !hasSidecarData(sidecars) && !hasRoleData) return null;

  const frontmatter = serializeFrontmatter({
    source: 'generated',
    'page-class': 'consolidated',
    artifact: ctx.artifactKey,
    'artifact-type': ctx.artifactType,
    'content-type': 'lua-split',
    'generated-at': ctx.generatedAt,
    generator: `risu-workbench/analyze/wiki@${ctx.generatorVersion}`,
  });

  const lines: string[] = [frontmatter.trimEnd(), '', '# Lua Split Workspace', ''];

  if (plan) {
    lines.push('## Split plan', '');
    lines.push(`- **mode:** \`${plan.mode}\``);
    lines.push(`- **source profile:** \`${plan.sourceProfile}\``);
    lines.push(`- **entry:** \`${plan.entryPath}\``);
    lines.push(`- **dist:** \`${plan.distPath}\``);
    lines.push(`- **packable:** ${plan.packable === null ? '`unknown`' : `\`${String(plan.packable)}\``}`);
    lines.push(`- **planned files:** ${plan.plannedFiles}`);
    lines.push('');
  }

  if (hasRoleData) {
    lines.push('## Source roles', '');
    for (const [role, count] of [...roleCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      lines.push(`- \`${role}\`: ${count} file${count === 1 ? '' : 's'}`);
    }
    lines.push('');
  }

  if (hasSidecarData(sidecars)) {
    lines.push('## Sidecars', '');
    lines.push(`- **domain candidates:** ${sidecars.domainCandidatesTotal} total · ${sidecars.domainCandidatesGenerated} generated · ${sidecars.domainCandidatesBlocked} blocked`);
    lines.push(`- **refactor map modules:** ${sidecars.refactorMapModules}`);
    lines.push(`- **host exports:** ${sidecars.hostExports}`);
    lines.push(`- **duplicate groups:** ${sidecars.duplicateGroups}`);
    lines.push(`- **button actions:** ${sidecars.buttonActions}`);
    lines.push('');
  }

  lines.push('## Source-first boundary', '');
  lines.push('- `lua/**/*.risulua` is the editable source surface.');
  lines.push('- `dist/*.risulua` is generated runtime/package output and should not drive source ownership.');
  lines.push('- `legacy/original.risulua` is audit/recovery input, not the split development surface.');
  lines.push('');

  return { relativePath: 'lua-split.md', content: lines.join('\n') };
}

function readSplitPlan(extractDir: string): SplitPlanSummary | null {
  const raw = readJson(path.join(extractDir, 'docs', 'risulua-split-plan.json'));
  if (!isRecord(raw)) return null;
  return {
    mode: readString(raw.mode),
    sourceProfile: readString(raw.sourceProfile),
    entryPath: readString(raw.entryPath),
    distPath: readString(raw.distPath),
    packable: typeof raw.packable === 'boolean' ? raw.packable : null,
    plannedFiles: Array.isArray(raw.files) ? raw.files.length : 0,
  };
}

function readSidecarSummary(extractDir: string): SidecarSummary {
  const domainCandidates = readJson(path.join(extractDir, 'docs', 'domain-candidates.json'));
  const candidates = isRecord(domainCandidates) && Array.isArray(domainCandidates.candidates)
    ? domainCandidates.candidates.filter(isRecord)
    : [];

  const refactorMap = readJson(path.join(extractDir, 'docs', 'refactor-map.json'));
  const refactorMapModules = isRecord(refactorMap) && Array.isArray(refactorMap.modules)
    ? refactorMap.modules.length
    : 0;

  const exportManifest = readJson(path.join(extractDir, 'docs', 'risulua-export-manifest.json'));
  const hostExports = isRecord(exportManifest) && Array.isArray(exportManifest.exports)
    ? exportManifest.exports.length
    : 0;
  const duplicateGroups = isRecord(exportManifest) && Array.isArray(exportManifest.duplicateGroups)
    ? exportManifest.duplicateGroups.length
    : 0;

  const buttonIndex = readJson(path.join(extractDir, 'docs', 'risulua-button-action-index.json'));
  const buttonActions = isRecord(buttonIndex) && Array.isArray(buttonIndex.actions)
    ? buttonIndex.actions.length
    : 0;

  return {
    domainCandidatesTotal: candidates.length,
    domainCandidatesGenerated: candidates.filter((candidate) => readString(candidate.status) === 'generated').length,
    domainCandidatesBlocked: candidates.filter((candidate) => readString(candidate.status) === 'blocked').length,
    refactorMapModules,
    hostExports,
    duplicateGroups,
    buttonActions,
  };
}

function countSplitRoles(data: CharxReportData): Map<string, number> {
  const counts = new Map<string, number>();
  for (const artifact of data.luaArtifacts) {
    if (!artifact.splitRole) continue;
    counts.set(artifact.splitRole, (counts.get(artifact.splitRole) ?? 0) + 1);
  }
  return counts;
}

function hasSidecarData(summary: SidecarSummary): boolean {
  return summary.domainCandidatesTotal > 0
    || summary.refactorMapModules > 0
    || summary.hostExports > 0
    || summary.duplicateGroups > 0
    || summary.buttonActions > 0;
}

function readJson(filePath: string): unknown {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? value : 'unknown';
}
