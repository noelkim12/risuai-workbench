/**
 * Pure selection helpers for the artifact card list.
 * @file packages/vscode/src/artifact-browser/cardSelection.ts
 */
import type { BrowserArtifactCard } from './artifactBrowserTypes';

/**
 * selectPreferredCard 함수.
 * Discovery snapshot에서 지정한 rootUri와 일치하는 card를 찾아 새 선택 대상으로 돌려줌.
 * rootUri는 양쪽 모두 vscode.Uri.file(absPath).toString()으로 생성되므로 문자열 동등 비교로 충분함.
 *
 * @param cards - 새 discovery snapshot cards
 * @param preferredRootUri - 선택하고 싶은 artifact root uri (없으면 undefined)
 * @returns 일치하는 card 또는 undefined
 */
export function selectPreferredCard(
  cards: BrowserArtifactCard[],
  preferredRootUri: string | undefined,
): BrowserArtifactCard | undefined {
  if (!preferredRootUri) return undefined;
  return cards.find((card) => card.rootUri === preferredRootUri);
}
