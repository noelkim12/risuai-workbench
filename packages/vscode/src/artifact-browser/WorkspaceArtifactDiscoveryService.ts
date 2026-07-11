/**
 * Unified workspace discovery for Artifact Browser artifact cards.
 * @file packages/vscode/src/artifact-browser/WorkspaceArtifactDiscoveryService.ts
 */

import * as vscode from 'vscode';
import { CharacterManifestDiscoveryService } from './CharacterManifestDiscoveryService';
import { ModuleManifestDiscoveryService } from './ModuleManifestDiscoveryService';
import { PluginManifestDiscoveryService } from './PluginManifestDiscoveryService';
import { AnalysisProfileService } from '../analysis-showcase/AnalysisProfileService';
import type { BrowserAnalysisProfile, BrowserArtifactCard, ManifestParseWarning } from './artifactBrowserTypes';

const ARTIFACT_KIND_RANK = { character: 0, module: 1, plugin: 2 } as const;
const MARKER_FILENAME_BY_KIND = { character: '.risuchar', module: '.risumodule', plugin: '.risuplugin' } as const;

/**
 * WorkspaceArtifactDiscoveryService 클래스.
 * `.risuchar`와 `.risumodule` marker discovery 결과를 하나의 card 목록으로 병합함.
 */
export class WorkspaceArtifactDiscoveryService {
  constructor(private readonly webview: vscode.Webview) {}

  /**
   * discoverCards 함수.
   * character/module discovery를 독립적으로 실행하고 root 충돌 경고와 정렬 규칙을 적용함.
   *
   * @returns mixed artifact card 목록
   */
  async discoverCards(): Promise<BrowserArtifactCard[]> {
    const [characters, modules, plugins] = await Promise.all([
      new CharacterManifestDiscoveryService(this.webview).discoverCards(),
      new ModuleManifestDiscoveryService(this.webview).discoverCards(),
      new PluginManifestDiscoveryService(this.webview).discoverCards(),
    ]);
    const withProfiles = await attachAnalysisProfiles([...characters, ...modules, ...plugins]);
    const withConflicts = applyRootMarkerConflictWarnings(withProfiles);
    return sortArtifactCards(withConflicts);
  }
}

export async function attachAnalysisProfiles(cards: BrowserArtifactCard[]): Promise<BrowserArtifactCard[]> {
  const profileService = new AnalysisProfileService();
  return Promise.all(cards.map(async (card): Promise<BrowserArtifactCard> => {
    if (card.artifactKind === 'plugin') {
      return card;
    }
    const profile = await readProfileSafely(profileService, card.rootUri, card.artifactKind);
    return { ...card, analysisProfile: profile };
  }));
}

async function readProfileSafely(
  service: AnalysisProfileService,
  rootUri: string,
  artifactKind: 'character' | 'module',
): Promise<BrowserAnalysisProfile> {
  try {
    return await service.read(vscode.Uri.parse(rootUri), artifactKind);
  } catch {
    return { kind: 'invalid', reason: 'malformed' };
  }
}

/**
 * applyRootMarkerConflictWarnings 함수.
 * 같은 root에 `.risuchar`와 `.risumodule`이 함께 있으면 두 card 모두에 구조화 warning을 추가함.
 *
 * @param cards - discovery service들이 만든 artifact cards
 * @returns conflict warning이 반영된 cards
 */
export function applyRootMarkerConflictWarnings(cards: BrowserArtifactCard[]): BrowserArtifactCard[] {
  const cardsByRootUri = new Map<string, BrowserArtifactCard[]>();
  for (const card of cards) {
    const sameRoot = cardsByRootUri.get(card.rootUri) ?? [];
    sameRoot.push(card);
    cardsByRootUri.set(card.rootUri, sameRoot);
  }

  return cards.map((card) => {
    const sameRoot = cardsByRootUri.get(card.rootUri) ?? [];
    const kinds = new Set(sameRoot.map((candidate) => candidate.artifactKind));
    if (kinds.size < 2) return card;

    const warning = createConflictingRootMarkersWarning(card.rootPathLabel, sameRoot);
    return {
      ...card,
      status: card.status === 'ready' ? 'warning' : card.status,
      warnings: [...card.warnings, warning],
    };
  });
}

/**
 * sortArtifactCards 함수.
 * display name, artifact kind, root path label 순서로 mixed cards를 정렬함.
 *
 * @param cards - 정렬할 artifact cards
 * @returns 결정적으로 정렬된 artifact cards
 */
export function sortArtifactCards(cards: BrowserArtifactCard[]): BrowserArtifactCard[] {
  return [...cards].sort((a, b) => {
    const nameCompare = a.name.localeCompare(b.name);
    if (nameCompare !== 0) return nameCompare;

    if (a.artifactKind !== b.artifactKind) {
      return ARTIFACT_KIND_RANK[a.artifactKind] - ARTIFACT_KIND_RANK[b.artifactKind];
    }

    return a.rootPathLabel.localeCompare(b.rootPathLabel);
  });
}

function createConflictingRootMarkersWarning(rootPathLabel: string, sameRoot: BrowserArtifactCard[]): ManifestParseWarning {
  const markerFilenames = sameRoot.map((card) => MARKER_FILENAME_BY_KIND[card.artifactKind]);
  return {
    code: 'conflictingRootMarkers',
    field: 'marker',
    message: `Root "${rootPathLabel}" has multiple root markers: ${markerFilenames.join(', ')}. Both artifacts are shown separately.`,
  };
}
