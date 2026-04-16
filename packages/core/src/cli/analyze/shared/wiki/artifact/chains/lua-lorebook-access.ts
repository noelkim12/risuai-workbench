import type { CharxReportData } from '../../../../charx/types';
import type { RenderContext, WikiFile } from '../../types';
import { serializeFrontmatter } from '../../markdown';
import { chainToConsolidated, chainToEntity, chainToNotes, resolveLorebookEntityPath } from '../../paths';
import { toWikiSlug } from '../../slug';

interface Call {
  caller: string;
  apiName: string;
  keyword: string | null;
}

/**
 * Produce one chain file per Lua function that touches lorebook APIs.
 * Each file lists every lorebook entry accessed by that function.
 */
export function renderLuaLorebookAccessChains(
  data: CharxReportData,
  ctx: RenderContext,
): WikiFile[] {
  const files: WikiFile[] = [];
  const calls = collectCalls(data);
  const byCaller = groupBy(calls, (c) => c.caller);

  for (const [caller, callerCalls] of byCaller.entries()) {
    files.push(renderOneCaller(caller, callerCalls, data, ctx));
  }
  return files;
}

function collectCalls(data: CharxReportData): Call[] {
  const out: Call[] = [];
  for (const artifact of data.luaArtifacts) {
    // Use lorebookCorrelation.loreApiCalls (actual field name from lua-analysis-types.ts)
    const apiCalls = artifact.lorebookCorrelation?.loreApiCalls ?? [];
    for (const call of apiCalls) {
      // H1 drift: actual type uses containingFunction as caller, keyword can be null
      out.push({
        caller: call.containingFunction,
        apiName: call.apiName,
        keyword: call.keyword,
      });
    }
  }
  return out;
}

function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    if (!out.has(key)) out.set(key, []);
    out.get(key)!.push(item);
  }
  return out;
}

function renderOneCaller(
  caller: string,
  calls: Call[],
  data: CharxReportData,
  ctx: RenderContext,
): WikiFile {
  const slug = toWikiSlug(caller);

  const frontmatter = serializeFrontmatter({
    source: 'generated',
    'page-class': 'chain',
    artifact: ctx.artifactKey,
    'artifact-type': ctx.artifactType,
    'chain-type': 'lua-lorebook-access',
    'entry-point': caller,
    hops: calls.length,
    'max-depth': 1,
    'has-cycles': false,
    'cycle-count': 0,
    'touches-lua': true,
    'touches-variables': [],
    'generated-at': ctx.generatedAt,
    generator: `risu-workbench/analyze/wiki@${ctx.generatorVersion}`,
  });

  const lines: string[] = [
    frontmatter.trimEnd(),
    '',
    `# Chain: Lua \`${caller}\` → lorebook`,
    '',
    `**Caller:** [\`${caller}\`](${chainToConsolidated('lua.md')}#${caller.toLowerCase()})`,
    `**Accesses:** ${calls.length} lorebook entries`,
    '',
    '## Accessed entries',
    '',
  ];

  for (const call of calls) {
    // H1 drift: no resolvedEntry field, use keyword directly (or 'unknown' if null)
    const target = call.keyword ?? '(unknown)';
    const keywordDisplay = call.keyword ? `\`${call.keyword}\`` : '(unknown)';
    lines.push(
      `- [${target}](${chainToEntity(resolveLorebookEntityPath(data.lorebookStructure.entries, target))}) — via \`${call.apiName}\` with keyword ${keywordDisplay}`,
    );
  }

  lines.push('', '## Notes', '');
  lines.push(
    `See [\`${chainToNotes(`chains/${slug}-lorebook.md`)}\`](${chainToNotes(`chains/${slug}-lorebook.md`)}) _(optional)_.`,
  );
  lines.push('');

  return { relativePath: `chains/lua-lorebook-access/${slug}.md`, content: lines.join('\n') };
}
