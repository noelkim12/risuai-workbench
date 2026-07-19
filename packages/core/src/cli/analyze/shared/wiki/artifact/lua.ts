import path from 'node:path';
import { toPosix } from '@/domain';
import type { LuaAnalysisArtifact } from '@/domain/analyze/lua-core';
import type { CharxReportData } from '../../../charx/types';
import type { RenderContext, WikiFile } from '../types';
import { serializeFrontmatter } from '../markdown';
import { consolidatedToNotes } from '../paths';

function formatLoreAccessCall(apiName: string, keyword: string | null): string {
  return keyword ? `\`${apiName}("${keyword}")\`` : `\`${apiName}\``;
}

function luaArtifactLabel(artifact: LuaAnalysisArtifact, ctx: RenderContext): string {
  if (artifact.relativePath && artifact.relativePath.length > 0) return artifact.relativePath;

  const relativeToExtract = toPosix(path.relative(ctx.extractDir, artifact.filePath));
  if (!relativeToExtract.startsWith('..') && relativeToExtract.length > 0) {
    return relativeToExtract;
  }

  return artifact.baseName;
}

function countRoles(artifacts: LuaAnalysisArtifact[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const artifact of artifacts) {
    const role = artifact.splitRole;
    if (!role) continue;
    counts.set(role, (counts.get(role) ?? 0) + 1);
  }
  return counts;
}

function collectRequireModules(artifact: LuaAnalysisArtifact): string[] {
  return [...new Set(artifact.collected.requireBindings.map((binding) => binding.moduleName))]
    .sort((a, b) => a.localeCompare(b));
}

function collectStaticTableMetadata(artifact: LuaAnalysisArtifact): string[] {
  const source = artifact.sourceText;
  if (!source) return [];

  const metadata = new Set<string>();
  for (const match of source.matchAll(/\bvarName\s*=\s*["']([^"']+)["']/g)) {
    const value = match[1];
    if (value) metadata.add(`state variable \`${value}\``);
  }
  const effectTypeBody = source.match(/\bconstEffectType\s*=\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
  for (const match of effectTypeBody.matchAll(/\b([A-Za-z][A-Za-z0-9_]*)\s*=\s*(-?\d+)\b/g)) {
    const name = match[1];
    const value = match[2];
    if (name && value) metadata.add(`effect type \`${name}\` = \`${value}\``);
  }

  return [...metadata].sort((a, b) => a.localeCompare(b));
}

/**
 * Render lua.md. Returns null when the artifact has no Lua files.
 *
 * One section per Lua file, one subsection per function. Lists:
 *   - function name and source location
  *   - split role, when available
  *   - state reads/writes (if any)
 *   - internal callees (from callGraph)
 *   - lorebook API calls (if any)
 */
export function renderLua(data: CharxReportData, ctx: RenderContext): WikiFile | null {
  if (data.luaArtifacts.length === 0) return null;

  const totalFunctions = data.luaArtifacts.reduce(
    (sum, artifact) => sum + artifact.collected.functions.filter((fn) => fn.name && fn.name !== '<top-level>').length,
    0,
  );
  const roleCounts = countRoles(data.luaArtifacts);

  const frontmatter = serializeFrontmatter({
    source: 'generated',
    'page-class': 'consolidated',
    artifact: ctx.artifactKey,
    'artifact-type': ctx.artifactType,
    'content-type': 'lua',
    'generated-at': ctx.generatedAt,
    generator: `risu-workbench/analyze/wiki@${ctx.generatorVersion}`,
    'lua-files': data.luaArtifacts.length,
    'lua-functions': totalFunctions,
  });

  const lines: string[] = [frontmatter.trimEnd(), '', '# Lua', '', `${data.luaArtifacts.length} files · ${totalFunctions} functions.`, ''];

  if (roleCounts.size > 0) {
    lines.push('## Split roles', '');
    for (const [role, count] of [...roleCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      lines.push(`- \`${role}\`: ${count} file${count === 1 ? '' : 's'}`);
    }
    lines.push('');
  }

  for (const artifact of data.luaArtifacts) {
    lines.push(`## \`${luaArtifactLabel(artifact, ctx)}\``, '');
    if (artifact.splitRole) {
      lines.push(`- **role:** \`${artifact.splitRole}\``, '');
    }
    const requireModules = collectRequireModules(artifact);
    if (requireModules.length > 0) {
      lines.push(`- **requires:** ${requireModules.map((moduleName) => `\`${moduleName}\``).join(', ')}`);
    }
    const staticTableMetadata = collectStaticTableMetadata(artifact);
    if (staticTableMetadata.length > 0) {
      lines.push(`- **static table metadata:** ${staticTableMetadata.join(', ')}`);
    }
    const fns = artifact.collected.functions.filter((fn) => fn.name && fn.name !== '<top-level>');
    if (requireModules.length > 0 || staticTableMetadata.length > 0) lines.push('');
    for (const fn of fns) {
      lines.push(`### \`${fn.name}\``, '');
      if (fn.stateReads && fn.stateReads.size > 0) {
        lines.push(`- **reads state:** ${Array.from(fn.stateReads).map((v) => `\`${v}\``).join(', ')}`);
      }
      if (fn.stateWrites && fn.stateWrites.size > 0) {
        lines.push(`- **writes state:** ${Array.from(fn.stateWrites).map((v) => `\`${v}\``).join(', ')}`);
      }
      const callees = artifact.analyzePhase.callGraph.get(fn.name);
      if (callees && callees.size > 0) {
        lines.push(`- **calls:** ${Array.from(callees).map((c) => `\`${c}\``).join(', ')}`);
      }
      const loreCalls = artifact.lorebookCorrelation?.loreApiCalls?.filter(
        (c) => c.containingFunction === fn.name,
      ) ?? [];
      if (loreCalls.length > 0) {
        lines.push(
          `- **lore access:** ${loreCalls.map((c) => formatLoreAccessCall(c.apiName, c.keyword)).join(', ')}`,
        );
      }
      lines.push('');
    }
  }

  lines.push('## Notes', '');
  lines.push(`See [\`${consolidatedToNotes('lua.md')}\`](${consolidatedToNotes('lua.md')}) _(optional)_.`);
  lines.push('');

  return { relativePath: 'lua.md', content: lines.join('\n') };
}
