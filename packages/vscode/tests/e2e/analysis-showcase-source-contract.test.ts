import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const packageRoot = path.resolve(__dirname, '..', '..', '..');
const workspaceRoot = path.resolve(packageRoot, '..', '..');

type SourceFile = {
  readonly label: string;
  readonly relativePath: string;
};

type ManifestTree =
  | null
  | boolean
  | number
  | string
  | readonly ManifestTree[]
  | { readonly [key: string]: ManifestTree };

const showcaseFeatureFiles: readonly SourceFile[] = [
  { label: 'AnalysisProfileService', relativePath: 'packages/vscode/src/analysis-showcase/AnalysisProfileService.ts' },
  { label: 'AnalysisReportService', relativePath: 'packages/vscode/src/analysis-showcase/AnalysisReportService.ts' },
  { label: 'AnalysisPngExportService', relativePath: 'packages/vscode/src/analysis-showcase/AnalysisPngExportService.ts' },
  { label: 'AnalysisShowcasePanel', relativePath: 'packages/vscode/src/analysis-showcase/AnalysisShowcasePanel.ts' },
  { label: 'analysisShowcaseProtocol host', relativePath: 'packages/vscode/src/analysis-showcase/analysisShowcaseProtocol.ts' },
  { label: 'analysisFreshness', relativePath: 'packages/vscode/src/analysis-showcase/analysisFreshness.ts' },
  { label: 'AnalysisShowcaseApp', relativePath: 'packages/webview/src/lib/analysis-showcase/AnalysisShowcaseApp.svelte' },
  { label: 'ShowcaseExportCard', relativePath: 'packages/webview/src/lib/analysis-showcase/ShowcaseExportCard.svelte' },
  { label: 'AnalysisProfileCard', relativePath: 'packages/webview/src/lib/components/analysis-showcase/AnalysisProfileCard.svelte' },
  { label: 'analysisShowcaseViewModel', relativePath: 'packages/webview/src/lib/analysis-showcase/analysisShowcaseViewModel.ts' },
  { label: 'analysisProfileViewModel', relativePath: 'packages/webview/src/lib/analysis-showcase/analysisProfileViewModel.ts' },
  { label: 'exportShowcasePng', relativePath: 'packages/webview/src/lib/analysis-showcase/exportShowcasePng.ts' },
  { label: 'analysisShowcaseProtocol webview', relativePath: 'packages/webview/src/lib/analysis-showcase/protocol.ts' },
] as const;

const browserActionFactoryFiles: readonly SourceFile[] = [
  { label: 'webview action factories', relativePath: 'packages/webview/src/lib/vscode.ts' },
  { label: 'webview action types', relativePath: 'packages/webview/src/lib/types.ts' },
  { label: 'host action guards', relativePath: 'packages/vscode/src/artifact-browser/artifactBrowserMessages.ts' },
  { label: 'host action types', relativePath: 'packages/vscode/src/artifact-browser/artifactBrowserTypes.ts' },
] as const;

function readSource(file: SourceFile): string {
  return fs.readFileSync(path.join(workspaceRoot, file.relativePath), 'utf8');
}

function analysisActionBlock(source: string, marker: string): string {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${marker} should exist`);
  const next = source.indexOf('\nexport function ', start + marker.length);
  return source.slice(start, next === -1 ? source.length : next);
}

function collectManifestReferences(value: ManifestTree): readonly string[] {
  const references: string[] = [];
  function visit(node: ManifestTree): void {
    if (typeof node === 'string') {
      if (/^packages\/.*\.test\.ts::/.test(node)) references.push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (node !== null && typeof node === 'object') {
      for (const item of Object.values(node)) visit(item);
    }
  }
  visit(value);
  return references;
}

function collectNamedTests(source: string): ReadonlySet<string> {
  const names = new Set<string>();
  const pattern = /\b(?:test|it)\s*\(\s*(['"`])([^'"`]+)\1/g;
  for (const match of source.matchAll(pattern)) {
    const name = match[2];
    if (name !== undefined) names.add(name);
  }
  return names;
}

test('Showcase feature sources never evaluate report data JS or scrape rendered reports', () => {
  const forbidden = [/charx-analysis\.data\.js/, /module-analysis\.data\.js/, /eval\s*\(/, /new Function\s*\(/, /querySelector\s*\(/, /innerHTML/];

  for (const file of showcaseFeatureFiles) {
    const source = readSource(file);
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${file.label} must not contain ${pattern}`);
    }
  }
});

test('Showcase feature sources keep Option A boundaries: no embedded report panel iframe CDN or OS process launch', () => {
  const forbidden = [/AnalysisReportPanel/, /<iframe\b/i, /iframe\s*[:=]/i, /https?:\/\//, /cdn/i, /child_process/, /xdg-open/, /cmd\.exe/, /openExternal\s*\(/];

  for (const file of showcaseFeatureFiles) {
    const source = readSource(file);
    const patterns = file.label === 'AnalysisReportService' ? forbidden.filter((pattern) => pattern.source !== 'openExternal\\s*\\(') : forbidden;
    for (const pattern of patterns) {
      assert.doesNotMatch(source, pattern, `${file.label} must not contain ${pattern}`);
    }
  }
});

test('Analysis webview action payload contracts expose stableId or in-memory PNG data only, never local paths', () => {
  const source = browserActionFactoryFiles.map((file) => readSource(file)).join('\n');
  const localPathNames = /\b(rootUri|rootPath|rootPathLabel|markerUri|reportUri|reportPath|fsPath|filePath|absolutePath)\b/;

  for (const marker of [
    'createArtifactBrowserOpenAnalysisShowcaseMessage',
    'createArtifactBrowserShareAnalysisShowcaseMessage',
    'createArtifactBrowserOpenAnalysisReportMessage',
    'ArtifactBrowserOpenAnalysisShowcasePayload',
    'ArtifactBrowserShareAnalysisShowcasePayload',
    'ArtifactBrowserOpenAnalysisReportPayload',
    'isArtifactBrowserAnalysisActionPayload',
  ]) {
    const block = analysisActionBlock(source, marker);
    assert.doesNotMatch(block, localPathNames, `${marker} must not expose local path fields`);
  }

  const showcaseProtocols = [
    readSource({ label: 'host protocol', relativePath: 'packages/vscode/src/analysis-showcase/analysisShowcaseProtocol.ts' }),
    readSource({ label: 'webview protocol', relativePath: 'packages/webview/src/lib/analysis-showcase/protocol.ts' }),
  ].join('\n');
  assert.doesNotMatch(showcaseProtocols, /\b(reportUri|reportPath|rootUri|fsPath|filePath|absolutePath)\b/);
  assert.match(showcaseProtocols, /dataUrl/);
});

test('Analysis Showcase panel tests use deterministic flushing with no wall-clock sleeps', () => {
  const source = readSource({ label: 'panel tests', relativePath: 'packages/vscode/tests/e2e/analysis-showcase-panel.test.ts' });

  assert.doesNotMatch(source, /\bsetTimeout\s*\(/);
  assert.doesNotMatch(source, /\bsleep\s*\(/i);
  assert.match(source, /flushAsyncHandlers/);
});

test('task 11 matrix manifest references exact named tests that exist', () => {
  const manifestPath = path.join(packageRoot, 'tests/fixtures/task-11-analysis-showcase.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as ManifestTree;
  const references = collectManifestReferences(manifest);
  assert.ok(references.length > 0, 'expected matrix test references in manifest');

  const namesByPath = new Map<string, ReadonlySet<string>>();
  const missing: string[] = [];
  for (const reference of references) {
    const [relativePath, testName] = reference.split('::');
    if (!relativePath || !testName) {
      missing.push(reference);
      continue;
    }
    let names = namesByPath.get(relativePath);
    if (!names) {
      names = collectNamedTests(readSource({ label: relativePath, relativePath }));
      namesByPath.set(relativePath, names);
    }
    if (!names.has(testName)) missing.push(reference);
  }

  assert.deepEqual(missing, []);
});
