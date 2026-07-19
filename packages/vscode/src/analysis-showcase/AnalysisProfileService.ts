import * as vscode from 'vscode';
import {
  type AnalysisShowcase,
  type AnalysisShowcaseParseResult,
  parseAnalysisShowcase,
} from 'risu-workbench-core';
import { AnalysisReportService } from './AnalysisReportService';
import { computeAnalysisFreshness, type AnalysisFreshness } from './analysisFreshness';

const SHOWCASE_SIDECAR_FILE = 'risu-analysis.showcase.json';
const LEGACY_REPORT_BY_KIND = {
  character: 'charx-analysis.html',
  module: 'module-analysis.html',
} as const;

export type BrowserAnalysisProfile =
  | { readonly kind: 'none' }
  | { readonly kind: 'legacy'; readonly reportAvailable: true }
  | {
      readonly kind: 'invalid';
      readonly reason: 'malformed' | 'unsupported-version' | 'artifact-mismatch';
    }
  | {
      readonly kind: 'available';
      readonly freshness: AnalysisFreshness;
      readonly reportAvailable: boolean;
      readonly showcase: AnalysisShowcase;
    };

export class AnalysisProfileService {
  constructor(
    private readonly reportService: AnalysisReportService = new AnalysisReportService(),
  ) {}

  async read(
    rootUri: vscode.Uri,
    artifactKind: 'character' | 'module',
  ): Promise<BrowserAnalysisProfile> {
    const rawSidecar = await this.readSidecar(rootUri);
    if (rawSidecar === null) {
      return this.readLegacyProfile(rootUri, artifactKind);
    }

    const parsed = parseAnalysisShowcase(rawSidecar);
    return this.toProfile(rootUri, artifactKind, parsed);
  }

  private async readSidecar(rootUri: vscode.Uri): Promise<unknown | null> {
    const sidecarUri = vscode.Uri.joinPath(rootUri, 'analysis', SHOWCASE_SIDECAR_FILE);
    let bytes: Uint8Array;
    try {
      bytes = await vscode.workspace.fs.readFile(sidecarUri);
    } catch (error) {
      if (error instanceof Error) return null;
      throw error;
    }

    try {
      const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
      return parsed;
    } catch (error) {
      if (error instanceof SyntaxError) return { version: 1, malformedSidecar: true };
      throw error;
    }
  }

  private async readLegacyProfile(
    rootUri: vscode.Uri,
    artifactKind: 'character' | 'module',
  ): Promise<BrowserAnalysisProfile> {
    const legacyAvailable = await this.reportService.exists(
      rootUri,
      LEGACY_REPORT_BY_KIND[artifactKind],
    );
    return legacyAvailable ? { kind: 'legacy', reportAvailable: true } : { kind: 'none' };
  }

  private async toProfile(
    rootUri: vscode.Uri,
    artifactKind: 'character' | 'module',
    parsed: AnalysisShowcaseParseResult,
  ): Promise<BrowserAnalysisProfile> {
    switch (parsed.kind) {
      case 'malformed':
        return { kind: 'invalid', reason: 'malformed' };
      case 'unsupported-version':
        return { kind: 'invalid', reason: 'unsupported-version' };
      case 'valid':
        return this.readAvailableProfile(rootUri, artifactKind, parsed.value);
    }
  }

  private async readAvailableProfile(
    rootUri: vscode.Uri,
    artifactKind: 'character' | 'module',
    showcase: AnalysisShowcase,
  ): Promise<BrowserAnalysisProfile> {
    if (showcase.artifact.type !== artifactKind) {
      return { kind: 'invalid', reason: 'artifact-mismatch' };
    }

    const freshness = await computeAnalysisFreshness(rootUri, showcase.generatedAt);
    const reportAvailable = await this.reportService.exists(rootUri, showcase.report.html);
    return { kind: 'available', freshness, reportAvailable, showcase };
  }
}
