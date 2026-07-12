import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import Module from 'node:module';
import path from 'node:path';
import test from 'node:test';

const localRequire = createRequire(__filename);
const vscodeDistRoot = path.resolve(__dirname, '../../../dist');
const sidecarName = 'risu-analysis.showcase.json';

type ProfileKind = 'none' | 'legacy' | 'invalid' | 'available';
type Card = {
  readonly artifactKind: 'character' | 'module' | 'plugin';
  readonly stableId: string;
  readonly rootUri: string;
  readonly analysisProfile: { readonly kind: ProfileKind };
};

type DiscoveryModule = {
  readonly attachAnalysisProfiles: (cards: readonly Card[]) => Promise<readonly Card[]>;
};

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
  readonly entries = new Map<string, { readonly type: number; readonly mtime: number; readonly content?: string }>();

  file(filePath: string, mtime: number, content = ''): void {
    this.ensureParents(path.posix.dirname(filePath));
    this.entries.set(path.posix.normalize(filePath), { type: 1, mtime, content });
  }

  private ensureParents(directoryPath: string): void {
    if (directoryPath === '/' || this.entries.has(directoryPath)) return;
    this.ensureParents(path.posix.dirname(directoryPath));
    this.entries.set(path.posix.normalize(directoryPath), { type: 2, mtime: 0 });
  }

  stub(): unknown {
    return {
      FileType: { File: 1, Directory: 2 },
      Uri: {
        file: (fsPath: string) => new TestUri(fsPath),
        parse: (uriString: string) => {
          const decoded = decodeURIComponent(uriString.replace(/^file:\/\//, '').replace(/%23/g, '#'));
          return new TestUri(decoded);
        },
        joinPath: (base: TestUri, ...segments: readonly string[]) =>
          new TestUri(path.posix.join(base.path, ...segments)),
      },
      workspace: {
        fs: {
          readDirectory: async (uri: TestUri) => this.readDirectory(uri),
          readFile: async (uri: TestUri) => this.readFile(uri),
          stat: async (uri: TestUri) => this.stat(uri),
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

function loadDiscoveryModule(vscodeStub: unknown): DiscoveryModule {
  const originalLoad = Reflect.get(Module, '_load');
  assert.equal(typeof originalLoad, 'function');
  Reflect.set(Module, '_load', (request: string, parent: NodeJS.Module | null, isMain: boolean): unknown => {
    if (request === 'vscode') return vscodeStub;
    return originalLoad(request, parent, isMain);
  });
  try {
    const modulesToClear = [
      'artifact-browser/WorkspaceArtifactDiscoveryService.js',
      'analysis-showcase/AnalysisProfileService.js',
      'analysis-showcase/AnalysisReportService.js',
      'analysis-showcase/analysisFreshness.js',
    ];
    for (const mod of modulesToClear) {
      const modPath = path.join(vscodeDistRoot, mod);
      try {
        delete localRequire.cache[localRequire.resolve(modPath)];
      } catch {
        // Module might not be cached yet
      }
    }
    const discoveryPath = path.join(vscodeDistRoot, 'artifact-browser', 'WorkspaceArtifactDiscoveryService.js');
    return localRequire(discoveryPath);
  } finally {
    Reflect.set(Module, '_load', originalLoad);
  }
}

function validSidecar(kind: 'character' | 'module', generatedAt: string, report = 'report.html'): string {
  return JSON.stringify({
    version: 1,
    artifact: { stableId: `${kind}:test`, name: `${kind} name`, type: kind },
    generatedAt,
    metrics: { variables: 5 },
    distributions: { elements: [], variableConnectivity: [] },
    findings: { error: 0, warning: 0, information: 0 },
    traits: [],
    report: { html: report },
  });
}

function makeCard(
  artifactKind: 'character' | 'module' | 'plugin',
  rootUri: string,
  stableId?: string,
): Card {
  return {
    artifactKind,
    stableId: stableId ?? `${artifactKind}:${rootUri}`,
    rootUri,
    analysisProfile: { kind: 'none' },
  };
}

test('plugin cards are never enriched — always keep none profile', async () => {
  const fixture = new WorkspaceFixture();
  const { attachAnalysisProfiles } = loadDiscoveryModule(fixture.stub());
  const cards = [makeCard('plugin', 'file:///workspace/plugin-a')];
  const result = await attachAnalysisProfiles(cards);
  assert.equal(result.length, 1);
  assert.equal(result[0].artifactKind, 'plugin');
  assert.equal(result[0].analysisProfile.kind, 'none');
});

test('character cards with no sidecar get none profile', async () => {
  const fixture = new WorkspaceFixture();
  const { attachAnalysisProfiles } = loadDiscoveryModule(fixture.stub());
  const cards = [makeCard('character', 'file:///workspace/char-none')];
  const result = await attachAnalysisProfiles(cards);
  assert.equal(result[0].analysisProfile.kind, 'none');
});

test('character cards with legacy report get legacy profile', async () => {
  const fixture = new WorkspaceFixture();
  fixture.file('/workspace/char-legacy/analysis/charx-analysis.html', 5, '<html></html>');
  const { attachAnalysisProfiles } = loadDiscoveryModule(fixture.stub());
  const cards = [makeCard('character', 'file:///workspace/char-legacy')];
  const result = await attachAnalysisProfiles(cards);
  assert.equal(result[0].analysisProfile.kind, 'legacy');
});

test('character cards with valid sidecar get available profile', async () => {
  const fixture = new WorkspaceFixture();
  fixture.file(
    '/workspace/char-available/analysis/' + sidecarName,
    10,
    validSidecar('character', '2026-07-10T00:00:00.000Z'),
  );
  fixture.file('/workspace/char-available/analysis/report.html', 10, '<html></html>');
  const { attachAnalysisProfiles } = loadDiscoveryModule(fixture.stub());
  const cards = [makeCard('character', 'file:///workspace/char-available')];
  const result = await attachAnalysisProfiles(cards);
  assert.equal(result[0].analysisProfile.kind, 'available');
});

test('module cards with valid sidecar get available profile', async () => {
  const fixture = new WorkspaceFixture();
  fixture.file(
    '/workspace/mod-available/analysis/' + sidecarName,
    10,
    validSidecar('module', '2026-07-10T00:00:00.000Z'),
  );
  fixture.file('/workspace/mod-available/analysis/report.html', 10, '<html></html>');
  const { attachAnalysisProfiles } = loadDiscoveryModule(fixture.stub());
  const cards = [makeCard('module', 'file:///workspace/mod-available')];
  const result = await attachAnalysisProfiles(cards);
  assert.equal(result[0].analysisProfile.kind, 'available');
});

test('malformed sidecar isolates to invalid profile without affecting other cards', async () => {
  const fixture = new WorkspaceFixture();

  // Good character with valid sidecar
  fixture.file(
    '/workspace/char-good/analysis/' + sidecarName,
    10,
    validSidecar('character', '2026-07-10T00:00:00.000Z'),
  );
  fixture.file('/workspace/char-good/analysis/report.html', 10, '<html></html>');

  // Bad character with malformed sidecar
  fixture.file('/workspace/char-bad/analysis/' + sidecarName, 10, '{not json');

  // Good module with valid sidecar
  fixture.file(
    '/workspace/mod-good/analysis/' + sidecarName,
    10,
    validSidecar('module', '2026-07-10T00:00:00.000Z'),
  );
  fixture.file('/workspace/mod-good/analysis/report.html', 10, '<html></html>');

  // Plugin — never gets analysis
  const pluginCard = makeCard('plugin', 'file:///workspace/plugin-a');

  const { attachAnalysisProfiles } = loadDiscoveryModule(fixture.stub());
  const inputCards = [
    makeCard('character', 'file:///workspace/char-good'),
    makeCard('character', 'file:///workspace/char-bad'),
    makeCard('module', 'file:///workspace/mod-good'),
    pluginCard,
  ];

  const result = await attachAnalysisProfiles(inputCards);

  assert.equal(result.length, 4, 'all four cards preserved');

  const good = result.find((c) => c.rootUri.includes('char-good'));
  assert.ok(good, 'good character card should exist');
  assert.equal(good.analysisProfile.kind, 'available');

  const bad = result.find((c) => c.rootUri.includes('char-bad'));
  assert.ok(bad, 'bad character card should exist');
  assert.equal(bad.analysisProfile.kind, 'invalid');

  const mod = result.find((c) => c.artifactKind === 'module');
  assert.ok(mod, 'module card should exist');
  assert.equal(mod.analysisProfile.kind, 'available');

  const plugin = result.find((c) => c.artifactKind === 'plugin');
  assert.ok(plugin, 'plugin card should exist');
  assert.equal(plugin.analysisProfile.kind, 'none');
});
