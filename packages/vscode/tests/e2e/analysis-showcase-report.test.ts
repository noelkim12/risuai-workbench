/**
 * Analysis Showcase full-report host boundary tests.
 * @file packages/vscode/tests/e2e/analysis-showcase-report.test.ts
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import Module from 'node:module';
import path from 'node:path';
import test from 'node:test';

const localRequire = createRequire(__filename);
const vscodeDistRoot = path.resolve(__dirname, '../../../dist');

type AnalysisReportOpenResult =
  | { readonly kind: 'opened'; readonly uri: TestUri }
  | { readonly kind: 'missing'; readonly uri: TestUri }
  | { readonly kind: 'unsafe' }
  | { readonly kind: 'not-opened'; readonly uri: TestUri };

type BuiltAnalysisReportServiceModule = {
  readonly AnalysisReportService: new () => {
    open(rootUri: TestUri, reportFileName: string): Promise<AnalysisReportOpenResult>;
    exists(rootUri: TestUri, reportFileName: string): Promise<boolean>;
    reveal(uri: TestUri): Promise<void>;
  };
};

type StatCall = {
  readonly uri: TestUri;
};

type OpenExternalCall = {
  readonly uri: TestUri;
};

type ExecuteCommandCall = {
  readonly command: string;
  readonly uri: TestUri;
};

type VscodeStubState = {
  readonly existingPaths: ReadonlySet<string>;
  readonly asExternalUriCalls: TestUri[];
  readonly statCalls: StatCall[];
  readonly openExternalCalls: OpenExternalCall[];
  readonly executeCommandCalls: ExecuteCommandCall[];
  readonly openExternalResult: boolean;
  readonly remoteName?: string;
};

type VscodeStubOptions = {
  readonly existingPaths?: readonly string[];
  readonly openExternalResult?: boolean;
  readonly remoteName?: string;
};

class TestUri {
  readonly authority: string;
  readonly fsPath: string;
  readonly path: string;
  readonly scheme: string;

  constructor(input: { readonly path: string; readonly scheme?: string; readonly authority?: string }) {
    this.authority = input.authority ?? '';
    this.path = input.path;
    this.scheme = input.scheme ?? 'file';
    this.fsPath = this.scheme === 'file' ? input.path : `/${this.authority}${input.path}`;
  }

  toString(): string {
    const authority = this.authority.length > 0 ? `//${this.authority}` : '';
    return `${this.scheme}:${authority}${encodeURI(this.path).replace(/#/g, '%23')}`;
  }
}

function createVscodeStub(options: VscodeStubOptions): { readonly state: VscodeStubState; readonly vscode: unknown } {
  const state: VscodeStubState = {
    existingPaths: new Set(options.existingPaths ?? []),
    asExternalUriCalls: [],
    statCalls: [],
    openExternalCalls: [],
    executeCommandCalls: [],
    openExternalResult: options.openExternalResult ?? true,
    ...(options.remoteName !== undefined ? { remoteName: options.remoteName } : {}),
  };

  const vscode = {
    commands: {
      executeCommand: async (command: string, uri: TestUri): Promise<void> => {
        state.executeCommandCalls.push({ command, uri });
      },
    },
    env: {
      ...(state.remoteName !== undefined ? { remoteName: state.remoteName } : {}),
      asExternalUri: async (uri: TestUri): Promise<TestUri> => {
        state.asExternalUriCalls.push(uri);
        return uri;
      },
      openExternal: async (uri: TestUri): Promise<boolean> => {
        state.openExternalCalls.push({ uri });
        return state.openExternalResult;
      },
    },
    FileType: { File: 1, Directory: 2 },
    Uri: {
      file: (fsPath: string): TestUri => new TestUri({ path: fsPath }),
      joinPath: (base: TestUri, ...segments: readonly string[]): TestUri =>
        new TestUri({
          authority: base.authority,
          path: path.posix.join(base.path, ...segments),
          scheme: base.scheme,
        }),
      parse: (value: string): TestUri => {
        const parsed = new URL(value);
        return new TestUri({ authority: parsed.hostname, path: decodeURI(parsed.pathname), scheme: parsed.protocol.replace(':', '') });
      },
    },
    workspace: {
      fs: {
        stat: async (uri: TestUri): Promise<{ readonly type: 1 }> => {
          state.statCalls.push({ uri });
          if (!state.existingPaths.has(uri.path)) {
            throw new Error(`missing: ${uri.path}`);
          }
          return { type: 1 };
        },
      },
    },
  } satisfies Record<string, unknown>;

  return { state, vscode };
}

function loadBuiltAnalysisReportServiceModule(vscodeStub: unknown): BuiltAnalysisReportServiceModule {
  const modulePath = path.join(vscodeDistRoot, 'analysis-showcase', 'AnalysisReportService.js');
  const remoteServerModulePath = path.join(vscodeDistRoot, 'analysis-showcase', 'RemoteAnalysisReportServer.js');
  delete localRequire.cache[localRequire.resolve(modulePath)];
  delete localRequire.cache[localRequire.resolve(remoteServerModulePath)];

  const originalLoad = Reflect.get(Module, '_load');
  assert.equal(typeof originalLoad, 'function');

  Reflect.set(Module, '_load', (request: string, parent: NodeJS.Module | null, isMain: boolean): unknown => {
    if (request === 'vscode') return vscodeStub;
    return originalLoad(request, parent, isMain);
  });

  try {
    const candidate: unknown = localRequire(modulePath);
    assertBuiltAnalysisReportServiceModule(candidate);
    return candidate;
  } finally {
    Reflect.set(Module, '_load', originalLoad);
  }
}

function assertBuiltAnalysisReportServiceModule(value: unknown): asserts value is BuiltAnalysisReportServiceModule {
  if (typeof value !== 'object' || value === null) {
    assert.fail('Expected built AnalysisReportService module object.');
  }
  if (!('AnalysisReportService' in value)) {
    assert.fail('Expected built AnalysisReportService export.');
  }
  assert.equal(typeof value.AnalysisReportService, 'function');
}

function assertResultHasUri(result: AnalysisReportOpenResult): asserts result is Exclude<AnalysisReportOpenResult, { readonly kind: 'unsafe' }> {
  assert.notEqual(result.kind, 'unsafe');
}

test('open joins sidecar-selected report filenames under analysis and opens externally', async () => {
  const rootUri = new TestUri({ path: '/workspace/캐릭터 Root' });
  const reportFileName = 'Merry Sisters! #1 100%25 complete.html';
  const reportPath = '/workspace/캐릭터 Root/analysis/Merry Sisters! #1 100%25 complete.html';
  const { state, vscode } = createVscodeStub({ existingPaths: [reportPath] });
  const { AnalysisReportService } = loadBuiltAnalysisReportServiceModule(vscode);

  const result = await new AnalysisReportService().open(rootUri, reportFileName);

  assert.equal(result.kind, 'opened');
  assertResultHasUri(result);
  assert.equal(result.uri.path, reportPath);
  assert.equal(state.statCalls.length, 1);
  assert.equal(state.openExternalCalls.length, 1);
  assert.equal(state.openExternalCalls[0]?.uri.path, reportPath);
});

test('open serves remote WSL reports over a forwarded HTTP URI', async () => {
  const rootUri = new TestUri({ authority: 'wsl+Ubuntu', path: '/home/noel/워크', scheme: 'vscode-remote' });
  const reportPath = '/home/noel/워크/analysis/리포트 #1.html';
  const { state, vscode } = createVscodeStub({ existingPaths: [reportPath], remoteName: 'wsl' });
  const { AnalysisReportService } = loadBuiltAnalysisReportServiceModule(vscode);

  const result = await new AnalysisReportService().open(rootUri, '리포트 #1.html');

  assert.equal(result.kind, 'opened');
  assertResultHasUri(result);
  assert.equal(result.uri.scheme, 'vscode-remote');
  assert.equal(result.uri.authority, 'wsl+Ubuntu');
  assert.equal(state.asExternalUriCalls.length, 0);
  assert.equal(state.openExternalCalls[0]?.uri.scheme, 'http');
  assert.notEqual(state.openExternalCalls[0]?.uri.path, reportPath);
});

test('open returns missing and never calls openExternal when stat fails', async () => {
  const rootUri = new TestUri({ path: '/workspace/card' });
  const { state, vscode } = createVscodeStub({});
  const { AnalysisReportService } = loadBuiltAnalysisReportServiceModule(vscode);

  const result = await new AnalysisReportService().open(rootUri, 'missing report.html');

  assert.equal(result.kind, 'missing');
  assertResultHasUri(result);
  assert.equal(result.uri.path, '/workspace/card/analysis/missing report.html');
  assert.equal(state.statCalls.length, 1);
  assert.equal(state.openExternalCalls.length, 0);
});

test('open returns unsafe and never stats or opens malformed filenames', async () => {
  const unsafeNames = ['', 'report.txt', '../report.html', 'sub/report.html', '%2e%2e%2freport.html', '%zz.html'];

  for (const reportFileName of unsafeNames) {
    const { state, vscode } = createVscodeStub({});
    const { AnalysisReportService } = loadBuiltAnalysisReportServiceModule(vscode);

    const result = await new AnalysisReportService().open(new TestUri({ path: '/workspace/card' }), reportFileName);

    assert.equal(result.kind, 'unsafe');
    assert.equal(state.statCalls.length, 0);
    assert.equal(state.openExternalCalls.length, 0);
  }
});

test('open returns not-opened and reveal uses revealFileInOS for explicit fallback', async () => {
  const reportPath = '/workspace/card/analysis/report.html';
  const { state, vscode } = createVscodeStub({ existingPaths: [reportPath], openExternalResult: false });
  const { AnalysisReportService } = loadBuiltAnalysisReportServiceModule(vscode);
  const service = new AnalysisReportService();

  const result = await service.open(new TestUri({ path: '/workspace/card' }), 'report.html');

  assert.equal(result.kind, 'not-opened');
  assertResultHasUri(result);
  assert.equal(state.openExternalCalls.length, 1);

  await service.reveal(result.uri);

  assert.deepEqual(state.executeCommandCalls.map((call) => call.command), ['revealFileInOS']);
  assert.equal(state.executeCommandCalls[0]?.uri.path, reportPath);
});

test('exists mirrors safe stat result without opening externally', async () => {
  const rootUri = new TestUri({ path: '/workspace/card' });
  const reportPath = '/workspace/card/analysis/report.html';
  const { state, vscode } = createVscodeStub({ existingPaths: [reportPath] });
  const { AnalysisReportService } = loadBuiltAnalysisReportServiceModule(vscode);
  const service = new AnalysisReportService();

  assert.equal(await service.exists(rootUri, 'report.html'), true);
  assert.equal(await service.exists(rootUri, '../report.html'), false);
  assert.equal(await service.exists(rootUri, 'missing.html'), false);
  assert.equal(state.openExternalCalls.length, 0);
});

test('manual qa boundary prints joined URI and zero external calls on failure', async () => {
  const rootUri = new TestUri({ path: '/manual/root with spaces' });
  const reportPath = '/manual/root with spaces/analysis/Merry Sisters! #1.html';
  const happyStub = createVscodeStub({ existingPaths: [reportPath] });
  const happyModule = loadBuiltAnalysisReportServiceModule(happyStub.vscode);
  const happyResult = await new happyModule.AnalysisReportService().open(rootUri, 'Merry Sisters! #1.html');

  const failureStub = createVscodeStub({});
  const failureModule = loadBuiltAnalysisReportServiceModule(failureStub.vscode);
  const traversalResult = await new failureModule.AnalysisReportService().open(rootUri, '../evil.html');
  const missingResult = await new failureModule.AnalysisReportService().open(rootUri, 'missing.html');

  assertResultHasUri(happyResult);
  assertResultHasUri(missingResult);
  assert.equal(happyResult.uri.path, reportPath);
  assert.equal(traversalResult.kind, 'unsafe');
  assert.equal(missingResult.kind, 'missing');
  assert.equal(failureStub.state.openExternalCalls.length, 0);

  console.log(
    JSON.stringify({
      happyKind: happyResult.kind,
      joinedPath: happyResult.uri.path,
      missingKind: missingResult.kind,
      failureOpenExternalCalls: failureStub.state.openExternalCalls.length,
      traversalKind: traversalResult.kind,
    }),
  );
});
