import * as vscode from 'vscode';

const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';

export const MAX_SHOWCASE_PNG_BYTES = 10 * 1024 * 1024;

export type PngDataUrlParseResult =
  | { readonly kind: 'valid'; readonly bytes: Uint8Array }
  | { readonly kind: 'invalid-mime' | 'invalid-base64' | 'too-large' };

export type PngSaveResult = { readonly kind: 'saved'; readonly uri: vscode.Uri } | { readonly kind: 'cancelled' };

export class AnalysisPngExportError extends Error {
  readonly name = 'AnalysisPngExportError';

  constructor(readonly result: Exclude<PngDataUrlParseResult, { readonly kind: 'valid' }>) {
    super(`Invalid analysis showcase PNG data URL: ${result.kind}`);
  }
}

export function parseShowcasePngDataUrl(value: string): PngDataUrlParseResult {
  if (!value.startsWith(PNG_DATA_URL_PREFIX)) return { kind: 'invalid-mime' };

  const payload = value.slice(PNG_DATA_URL_PREFIX.length);
  if (!isStrictBase64Payload(payload)) return { kind: 'invalid-base64' };

  const decodedSize = estimateBase64DecodedSize(payload);
  if (decodedSize > MAX_SHOWCASE_PNG_BYTES) return { kind: 'too-large' };

  return { kind: 'valid', bytes: Buffer.from(payload, 'base64') };
}

export class AnalysisPngExportService {
  async save(artifactName: string, dataUrl: string): Promise<PngSaveResult> {
    const parsed = parseShowcasePngDataUrl(dataUrl);
    if (parsed.kind !== 'valid') throw new AnalysisPngExportError(parsed);

    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(`${sanitizeArtifactName(artifactName)}-analysis-showcase.png`),
      filters: { PNG: ['png'] },
      saveLabel: 'Save Showcase PNG',
    });
    if (uri === undefined) return { kind: 'cancelled' };

    await vscode.workspace.fs.writeFile(uri, parsed.bytes);
    return { kind: 'saved', uri };
  }
}

function estimateBase64DecodedSize(payload: string): number {
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return (payload.length / 4) * 3 - padding;
}

function isStrictBase64Payload(payload: string): boolean {
  if (payload.length === 0 || payload.length % 4 !== 0) return false;

  const firstPaddingIndex = payload.indexOf('=');
  const contentEnd = firstPaddingIndex === -1 ? payload.length : firstPaddingIndex;
  const paddingLength = payload.length - contentEnd;
  if (paddingLength > 2) return false;

  for (let index = 0; index < contentEnd; index++) {
    if (!isBase64Alphabet(payload.charCodeAt(index))) return false;
  }
  for (let index = contentEnd; index < payload.length; index++) {
    if (payload.charCodeAt(index) !== 61) return false;
  }
  if (paddingLength === 1) return contentEnd % 4 === 3;
  if (paddingLength === 2) return contentEnd % 4 === 2;
  return true;
}

function isBase64Alphabet(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 48 && code <= 57) || code === 43 || code === 47;
}

function sanitizeArtifactName(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (sanitized.length > 0) return sanitized;
  return 'artifact';
}
