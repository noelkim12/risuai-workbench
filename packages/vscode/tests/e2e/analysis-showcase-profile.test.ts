import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import Module from 'node:module';
import path from 'node:path';
import test from 'node:test';

const localRequire = createRequire(__filename);
const vscodeDistRoot = path.resolve(__dirname, '../../../dist');
const sidecarName = 'risu-analysis.showcase.json';

type ArtifactKind = 'character' | 'module';
type Freshness = 'fresh' | 'outdated';
type BrowserAnalysisProfile =
  | { readonly kind: 'none' }
  | { readonly kind: 'legacy'; readonly reportAvailable: true }
  | { readonly kind: 'invalid'; readonly reason: 'malformed' | 'unsupported-version' | 'artifact-mismatch' }
  | {
      readonly kind: 'available';
      readonly freshness: Freshness;
      readonly reportAvailable: boolean;
      readonly showcase: { readonly artifact: { readonly type: ArtifactKind }; readonly generatedAt: string };
    };
type AnalysisProfileModule = {
  readonly AnalysisProfileService: new (reportService?: ReportService) => {
    read(rootUri: TestUri, artifactKind: ArtifactKind): Promise<BrowserAnalysisProfile>;
  };
};
type AnalysisFreshnessModule = {
  readonly getLatestCanonicalSourceMtime: (rootUri: TestUri) => Promise<number | null>;
};
type ReportService = { readonly exists: (rootUri: TestUri, reportFileName: string) => Promise<boolean> };
type Entry = { readonly type: number; readonly mtime: number; readonly content?: string };

class TestUri {
  readonly authority = '';
  readonly fsPath: string;
  readonly path: string;
  readonly scheme = 'file';

  constructor(inputPath: string) {
    this.path = path.posix.normalize(inputPath);
    this.fsPath = this.path;
  }

  toString(): string {
    return `file://${encodeURI(this.path).replace(/#/g, '%23')}`;
  }
}

class WorkspaceFixture {
  readonly entries = new Map<string, Entry>();

  file(filePath: string, mtime: number, content = ''): void {
    this.ensureParents(path.posix.dirname(filePath));
    this.entries.set(path.posix.normalize(filePath), { type: 1, mtime, content });
  }

  directory(directoryPath: string, mtime: number): void {
    this.ensureParents(path.posix.dirname(directoryPath));
    this.entries.set(path.posix.normalize(directoryPath), { type: 2, mtime });
  }

  private ensureParents(directoryPath: string): void {
    if (directoryPath === '/' || this.entries.has(directoryPath)) return;
    this.ensureParents(path.posix.dirname(directoryPath));
    this.entries.set(directoryPath, { type: 2, mtime: 0 });
  }

  stub(): unknown {
    return {
      FileType: { File: 1, Directory: 2 },
      Uri: {
        file: (fsPath: string) => new TestUri(fsPath),
        joinPath: (base: TestUri, ...segments: readonly string[]) => new TestUri(path.posix.join(base.path, ...segments)),
      },
      workspace: {
        fs: {
          readDirectory: async (uri: TestUri): Promise<readonly [string, number][]> => this.readDirectory(uri),
          readFile: async (uri: TestUri): Promise<Uint8Array> => this.readFile(uri),
          stat: async (uri: TestUri): Promise<{ readonly type: number; readonly mtime: number }> => this.stat(uri),
        },
      },
    };
  }

  private readDirectory(uri: TestUri): readonly [string, number][] {
    const prefix = `${uri.path}/`;
    const children = new Map<string, number>();
    for (const [entryPath, entry] of this.entries) {
      if (!entryPath.startsWith(prefix)) continue;
      const rest = entryPath.slice(prefix.length);
      if (rest.length === 0 || rest.includes('/')) continue;
      children.set(rest, entry.type);
    }
    if (children.size === 0 && !this.entries.has(uri.path)) throw new Error(`missing directory ${uri.path}`);
    return [...children.entries()];
  }

  private readFile(uri: TestUri): Uint8Array {
    const entry = this.entries.get(uri.path);
    if (entry?.type !== 1 || entry.content === undefined) throw new Error(`missing file ${uri.path}`);
    return Buffer.from(entry.content, 'utf8');
  }

  private stat(uri: TestUri): { readonly type: number; readonly mtime: number } {
    const entry = this.entries.get(uri.path);
    if (!entry) throw new Error(`missing stat ${uri.path}`);
    return { type: entry.type, mtime: entry.mtime };
  }
}

function loadModules(vscodeStub: unknown): { readonly profile: AnalysisProfileModule; readonly freshness: AnalysisFreshnessModule } {
  const originalLoad = Reflect.get(Module, '_load');
  assert.equal(typeof originalLoad, 'function');
  Reflect.set(Module, '_load', (request: string, parent: NodeJS.Module | null, isMain: boolean): unknown => {
    if (request === 'vscode') return vscodeStub;
    return originalLoad(request, parent, isMain);
  });
  try {
    const profilePath = path.join(vscodeDistRoot, 'analysis-showcase', 'AnalysisProfileService.js');
    const freshnessPath = path.join(vscodeDistRoot, 'analysis-showcase', 'analysisFreshness.js');
    delete localRequire.cache[localRequire.resolve(profilePath)];
    delete localRequire.cache[localRequire.resolve(freshnessPath)];
    return { profile: localRequire(profilePath), freshness: localRequire(freshnessPath) };
  } finally {
    Reflect.set(Module, '_load', originalLoad);
  }
}

function validSidecar(kind: ArtifactKind, generatedAt: string, report = 'report #1.html'): string {
  return JSON.stringify({
    version: 1,
    artifact: { stableId: `${kind}:sidecar`, name: `${kind} name`, type: kind },
    generatedAt,
    metrics: { variables: 0 },
    distributions: { elements: [], variableConnectivity: [] },
    findings: { error: 0, warning: 0, information: 0 },
    traits: [],
    report: { html: report },
  });
}

function putSidecar(fixture: WorkspaceFixture, root: TestUri, content: string): void {
  fixture.file(path.posix.join(root.path, 'analysis', sidecarName), 10, content);
}

function serviceWithReportAvailability(value: boolean): ReportService {
  return { exists: async () => value };
}

function serviceWithAvailableReports(paths: ReadonlySet<string>): ReportService {
  return { exists: async (rootUri, reportFileName) => paths.has(path.posix.join(rootUri.path, 'analysis', reportFileName)) };
}

test('read returns none or artifact-specific legacy only when no sidecar exists', async () => {
  const fixture = new WorkspaceFixture();
  const root = new TestUri('/workspace/legacy');
  fixture.file('/workspace/legacy/analysis/charx-analysis.html', 1);
  const { profile } = loadModules(fixture.stub());
  const service = new profile.AnalysisProfileService(serviceWithAvailableReports(new Set(['/workspace/legacy/analysis/charx-analysis.html'])));

  assert.deepEqual(await service.read(new TestUri('/workspace/none'), 'character'), { kind: 'none' });
  assert.deepEqual(await service.read(root, 'character'), { kind: 'legacy', reportAvailable: true });
  assert.deepEqual(await service.read(root, 'module'), { kind: 'none' });
});

test('read returns available fresh, tolerance, outdated, and missing-report states', async () => {
  const fixture = new WorkspaceFixture();
  const root = new TestUri('/workspace/special #한글');
  const generatedAt = '2026-07-10T00:00:00.000Z';
  putSidecar(fixture, root, validSidecar('character', generatedAt));
  fixture.file('/workspace/special #한글/.risuchar', Date.parse(generatedAt) + 1000);
  const { profile } = loadModules(fixture.stub());
  const service = new profile.AnalysisProfileService(serviceWithReportAvailability(false));

  const fresh = await service.read(root, 'character');
  assert.equal(fresh.kind, 'available');
  if (fresh.kind === 'available') assert.equal(fresh.freshness, 'fresh');
  if (fresh.kind === 'available') assert.equal(fresh.reportAvailable, false);

  fixture.file('/workspace/special #한글/assets/avatar.png', Date.parse(generatedAt) + 1001);
  const outdated = await service.read(root, 'character');
  assert.equal(outdated.kind, 'available');
  if (outdated.kind === 'available') assert.equal(outdated.freshness, 'outdated');
});

test('freshness includes every canonical source class and excludes generated outputs', async () => {
  const fixture = new WorkspaceFixture();
  const root = new TestUri('/workspace/canonical');
  const canonical = ['.risuchar', '.risumodule', 'character/main.risutext', 'lorebooks/a.risulorebook', 'regex/a.risuregex', 'lua/a.risulua', 'variables/a.risuvar', 'toggle/a.risutoggle', 'html/a.risuhtml', 'prompt_template/a.risuprompt', 'assets/a.png'];
  for (const relativePath of canonical) fixture.file(path.posix.join(root.path, relativePath), 100 + relativePath.length);
  for (const relativePath of ['wiki/page.md', 'analysis/report.html', 'docs/note.md', 'dist/out.js']) fixture.file(path.posix.join(root.path, relativePath), 10_000);
  const { freshness } = loadModules(fixture.stub());

  const latest = await freshness.getLatestCanonicalSourceMtime(root);

  assert.equal(latest, Math.max(...canonical.map((relativePath) => 100 + relativePath.length)));
});

test('read returns invalid for malformed unsupported version and artifact mismatch', async () => {
  const fixture = new WorkspaceFixture();
  const malformedRoot = new TestUri('/workspace/malformed');
  const versionRoot = new TestUri('/workspace/version2');
  const mismatchRoot = new TestUri('/workspace/mismatch');
  putSidecar(fixture, malformedRoot, '{not json');
  putSidecar(fixture, versionRoot, JSON.stringify({ version: 2 }));
  putSidecar(fixture, mismatchRoot, validSidecar('module', '2026-07-10T00:00:00.000Z'));
  const { profile } = loadModules(fixture.stub());
  const service = new profile.AnalysisProfileService(serviceWithReportAvailability(true));

  assert.deepEqual(await service.read(malformedRoot, 'character'), { kind: 'invalid', reason: 'malformed' });
  assert.deepEqual(await service.read(versionRoot, 'character'), { kind: 'invalid', reason: 'unsupported-version' });
  assert.deepEqual(await service.read(mismatchRoot, 'character'), { kind: 'invalid', reason: 'artifact-mismatch' });
});
