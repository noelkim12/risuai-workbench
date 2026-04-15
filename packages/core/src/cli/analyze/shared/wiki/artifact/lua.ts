import type { CharxReportData } from '../../../charx/types';
import type { RenderContext, WikiFile } from '../types';
import { serializeFrontmatter } from '../markdown';
import { consolidatedToNotes } from '../paths';

/**
 * Render lua.md. Returns null when the artifact has no Lua files.
 *
 * One section per Lua file, one subsection per function. Lists:
 *   - function name and source location
 *   - state reads/writes (if any)
 *   - internal callees (from callGraph)
 *   - getLoreBooks calls (if any)
 */
export function renderLua(data: CharxReportData, ctx: RenderContext): WikiFile | null {
  if (data.luaArtifacts.length === 0) return null;

  const totalFunctions = data.luaArtifacts.reduce(
    (sum, artifact) => sum + artifact.collected.functions.filter((fn) => fn.name && fn.name !== '<top-level>').length,
    0,
  );

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

  for (const artifact of data.luaArtifacts) {
    lines.push(`## \`${artifact.baseName}\``, '');
    const fns = artifact.collected.functions.filter((fn) => fn.name && fn.name !== '<top-level>');
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
          `- **getLoreBooks:** ${loreCalls.map((c) => `\`"${c.keyword}"\``).join(', ')}`,
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
