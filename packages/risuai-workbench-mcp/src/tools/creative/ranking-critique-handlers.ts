/**
 * Read-only handlers for creative ranking, critique, clustering, and supplied graph tools.
 * @file packages/risuai-workbench-mcp/src/tools/creative/ranking-critique-handlers.ts
 */

import {
  buildClusterIdeasResult,
  buildCritiqueSixHatsResult,
  buildDeduplicateIdeasResult,
  buildOpenIdeaNeighborhoodResult,
  buildRankIdeasResult,
  buildRedTeamConceptResult,
  buildSearchIdeaGraphResult,
  type ClusterIdeasResult,
  type CritiqueSixHatsResult,
  type DeduplicateIdeasResult,
  type OpenIdeaNeighborhoodResult,
  type RankIdeasResult,
  type RedTeamConceptResult,
  type SearchIdeaGraphResult,
} from '../../creative/ranking-critique-tools';

export async function handleRankIdeas(input: unknown): Promise<RankIdeasResult> {
  return buildRankIdeasResult(input);
}

export async function handleCritiqueSixHats(input: unknown): Promise<CritiqueSixHatsResult> {
  return buildCritiqueSixHatsResult(input);
}

export async function handleRedTeamConcept(input: unknown): Promise<RedTeamConceptResult> {
  return buildRedTeamConceptResult(input);
}

export async function handleClusterIdeas(input: unknown): Promise<ClusterIdeasResult> {
  return buildClusterIdeasResult(input);
}

export async function handleDeduplicateIdeas(input: unknown): Promise<DeduplicateIdeasResult> {
  return buildDeduplicateIdeasResult(input);
}

export async function handleSearchIdeaGraph(input: unknown): Promise<SearchIdeaGraphResult> {
  return buildSearchIdeaGraphResult(input);
}

export async function handleOpenIdeaNeighborhood(input: unknown): Promise<OpenIdeaNeighborhoodResult> {
  return buildOpenIdeaNeighborhoodResult(input);
}
