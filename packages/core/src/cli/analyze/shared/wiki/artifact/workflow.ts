import type { CharxReportData } from '../../../charx/types';
import type { RenderContext, WikiFile } from '../types';
import { renderOverview } from './overview';
import { renderVariables } from './variables';
import { renderLua } from './lua';
import { renderRegex } from './regex';
import { renderLorebookIndex } from './lorebook-index';
import { renderLorebookEntities } from './lorebook-entity';
import { renderLorebookActivationChains, renderLorebookActivationIndex } from './chains/lorebook-activation';
import { renderVariableFlowChains, renderVariableFlowIndex } from './chains/variable-flow';
import { renderLuaLorebookAccessChains } from './chains/lua-lorebook-access';
import { renderLuaCallgraphChains } from './chains/lua-callgraph';
import { renderTextMentionsIndex } from './chains/text-mentions';
import { renderChainsIndex } from './chains/chains-index';
import { renderRelationshipsAsset } from './relationships-asset';

/**
 * Orchestrator: given artifact report data + render context, collect
 * every WikiFile the wiki renderer produces for this one artifact.
 */
export function renderArtifactWiki(
  data: CharxReportData,
  ctx: RenderContext,
): WikiFile[] {
  const files: WikiFile[] = [];
  const push = (f: WikiFile | null) => {
    if (f) files.push(f);
  };

  push(renderOverview(data, ctx));
  push(renderVariables(data, ctx));
  push(renderLua(data, ctx));
  push(renderRegex(data, ctx));
  push(renderLorebookIndex(data, ctx));

  for (const file of renderLorebookEntities(data, ctx)) files.push(file);

  push(renderChainsIndex(data, ctx));
  push(renderLorebookActivationIndex(data, ctx));
  for (const file of renderLorebookActivationChains(data, ctx)) files.push(file);
  push(renderVariableFlowIndex(data, ctx));
  for (const file of renderVariableFlowChains(data, ctx)) files.push(file);
  for (const file of renderLuaLorebookAccessChains(data, ctx)) files.push(file);
  for (const file of renderLuaCallgraphChains(data, ctx)) files.push(file);
  push(renderTextMentionsIndex(data, ctx));

  push(renderRelationshipsAsset(data, ctx));

  return files;
}
