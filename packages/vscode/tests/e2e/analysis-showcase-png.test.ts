import assert from 'node:assert/strict';
import { createRequire, Module } from 'node:module';
import path from 'node:path';
import test from 'node:test';

const localRequire = createRequire(__filename);
const vscodeDistRoot = path.resolve(__dirname, '../../../dist');
const serviceModulePath = path.join(vscodeDistRoot, 'analysis-showcase', 'AnalysisPngExportService.js');
const onePixelPngBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l0z9WQAAAABJRU5ErkJggg==',
  'base64',
);
const onePixelPngDataUrl = `data:image/png;base64,${onePixelPngBytes.toString('base64')}`;

type PngDataUrlParseResult =
  | { readonly kind: 'valid'; readonly bytes: Uint8Array }
  | { readonly kind: 'invalid-mime' | 'invalid-base64' | 'too-large' };

type PngSaveResult = { readonly kind: 'saved'; readonly uri: TestUri } | { readonly kind: 'cancelled' };

type AnalysisPngExportService = {
  save: (artifactName: string, dataUrl: string) => Promise<PngSaveResult>;
};

type AnalysisPngExportModule = {
  readonly MAX_SHOWCASE_PNG_BYTES: number;
  readonly AnalysisPngExportError: new (result: Exclude<PngDataUrlParseResult, { readonly kind: 'valid' }>) => Error;
  readonly AnalysisPngExportService: new () => AnalysisPngExportService;
  readonly parseShowcasePngDataUrl: (value: string) => PngDataUrlParseResult;
};

type SaveDialogOptions = {
  readonly defaultUri?: TestUri;
  readonly filters?: Record<string, readonly string[]>;
  readonly saveLabel?: string;
};

class TestUri {
  readonly scheme = 'file';

  constructor(readonly fsPath: string) {}

  toString(): string {
    return `file://${this.fsPath}`;
  }
}

function isAnalysisPngExportModule(value: unknown): value is AnalysisPngExportModule {
  return (
    typeof value === 'object' &&
    value !== null &&
    'MAX_SHOWCASE_PNG_BYTES' in value &&
    'AnalysisPngExportError' in value &&
    'AnalysisPngExportService' in value &&
    'parseShowcasePngDataUrl' in value &&
    typeof value.MAX_SHOWCASE_PNG_BYTES === 'number' &&
    typeof value.AnalysisPngExportError === 'function' &&
    typeof value.AnalysisPngExportService === 'function' &&
    typeof value.parseShowcasePngDataUrl === 'function'
  );
}

function getModuleLoader(): (request: string, parent: NodeJS.Module | null, isMain: boolean) => unknown {
  const loader = Reflect.get(Module, '_load');
  if (typeof loader !== 'function') throw new Error('Node module loader is unavailable');
  return loader;
}

function importServiceModule(stub: unknown): AnalysisPngExportModule {
  const originalLoad = getModuleLoader();
  Reflect.set(Module, '_load', (request: string, parent: NodeJS.Module | null, isMain: boolean) => {
    if (request === 'vscode') return stub;
    return originalLoad(request, parent, isMain);
  });
  try {
    try {
      delete localRequire.cache[localRequire.resolve(serviceModulePath)];
    } catch (error) {
      if (!(error instanceof Error)) throw error;
    }
    const loaded: unknown = localRequire(serviceModulePath);
    if (!isAnalysisPngExportModule(loaded)) throw new Error('AnalysisPngExportService module shape mismatch');
    return loaded;
  } finally {
    Reflect.set(Module, '_load', originalLoad);
  }
}

function createVscodeStub(selection: TestUri | undefined): {
  readonly dialogOptions: SaveDialogOptions[];
  readonly writes: ReadonlyMap<string, Uint8Array>;
  readonly stub: unknown;
} {
  const dialogOptions: SaveDialogOptions[] = [];
  const writes = new Map<string, Uint8Array>();
  return {
    dialogOptions,
    writes,
    stub: {
      Uri: {
        file: (fsPath: string) => new TestUri(fsPath),
      },
      window: {
        showSaveDialog: async (options: SaveDialogOptions) => {
          dialogOptions.push(options);
          return selection;
        },
      },
      workspace: {
        fs: {
          writeFile: async (uri: TestUri, bytes: Uint8Array) => {
            writes.set(path.normalize(uri.fsPath), Buffer.from(bytes));
          },
        },
      },
    },
  };
}

test('parseShowcasePngDataUrl returns exact bytes for a valid PNG data URL', () => {
  const module = importServiceModule(createVscodeStub(undefined).stub);

  const result = module.parseShowcasePngDataUrl(onePixelPngDataUrl);

  assert.equal(result.kind, 'valid');
  if (result.kind === 'valid') assert.deepEqual(Buffer.from(result.bytes), onePixelPngBytes);
});

test('parseShowcasePngDataUrl rejects wrong MIME malformed alphabet padding and whitespace', () => {
  const module = importServiceModule(createVscodeStub(undefined).stub);

  assert.deepEqual(module.parseShowcasePngDataUrl('data:text/html;base64,PGgxPk5vPC9oMT4='), { kind: 'invalid-mime' });
  assert.deepEqual(module.parseShowcasePngDataUrl('data:image/png;base64,abc$'), { kind: 'invalid-base64' });
  assert.deepEqual(module.parseShowcasePngDataUrl('data:image/png;base64,abcd='), { kind: 'invalid-base64' });
  assert.deepEqual(module.parseShowcasePngDataUrl('data:image/png;base64,abcd\n'), { kind: 'invalid-base64' });
  assert.deepEqual(module.parseShowcasePngDataUrl('data:image/png;base64,'), { kind: 'invalid-base64' });
});

test('parseShowcasePngDataUrl accepts 10 MiB and rejects 10 MiB plus one byte', () => {
  const module = importServiceModule(createVscodeStub(undefined).stub);
  const boundaryPayload = Buffer.alloc(module.MAX_SHOWCASE_PNG_BYTES).toString('base64');
  const oversizedPayload = Buffer.alloc(module.MAX_SHOWCASE_PNG_BYTES + 1).toString('base64');

  const boundaryResult = module.parseShowcasePngDataUrl(`data:image/png;base64,${boundaryPayload}`);
  const oversizedResult = module.parseShowcasePngDataUrl(`data:image/png;base64,${oversizedPayload}`);

  assert.equal(boundaryResult.kind, 'valid');
  if (boundaryResult.kind === 'valid') assert.equal(boundaryResult.bytes.byteLength, module.MAX_SHOWCASE_PNG_BYTES);
  assert.deepEqual(oversizedResult, { kind: 'too-large' });
});

test('AnalysisPngExportService.save owns Save Dialog options and writes exact decoded bytes', async () => {
  const saveUri = new TestUri('/tmp/Merry Sisters.png');
  const harness = createVscodeStub(saveUri);
  const module = importServiceModule(harness.stub);
  const service = new module.AnalysisPngExportService();

  const result = await service.save('Merry Sisters! #1/../../evil', onePixelPngDataUrl);

  assert.deepEqual(result, { kind: 'saved', uri: saveUri });
  assert.equal(harness.dialogOptions.length, 1);
  assert.equal(path.basename(harness.dialogOptions[0]?.defaultUri?.fsPath ?? ''), 'Merry-Sisters-1-evil-analysis-showcase.png');
  assert.deepEqual(harness.dialogOptions[0]?.filters, { PNG: ['png'] });
  assert.deepEqual(Buffer.from(harness.writes.get(path.normalize(saveUri.fsPath)) ?? []), onePixelPngBytes);
});

test('AnalysisPngExportService.save returns cancelled and never writes when dialog is cancelled', async () => {
  const harness = createVscodeStub(undefined);
  const module = importServiceModule(harness.stub);
  const service = new module.AnalysisPngExportService();

  const result = await service.save('Cancelled Card', onePixelPngDataUrl);

  assert.deepEqual(result, { kind: 'cancelled' });
  assert.equal(harness.dialogOptions.length, 1);
  assert.equal(harness.writes.size, 0);
});

test('AnalysisPngExportService.save rejects invalid data before opening Save Dialog', async () => {
  const harness = createVscodeStub(new TestUri('/tmp/should-not-write.png'));
  const module = importServiceModule(harness.stub);
  const service = new module.AnalysisPngExportService();

  await assert.rejects(() => service.save('Unsafe Card', 'data:text/html;base64,PGgxPk5vPC9oMT4='), {
    name: 'AnalysisPngExportError',
  });
  assert.equal(harness.dialogOptions.length, 0);
  assert.equal(harness.writes.size, 0);
});
