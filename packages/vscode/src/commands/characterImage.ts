/** VS Code command helpers for selecting a character thumbnail image.
 * @file packages/vscode/src/commands/characterImage.ts
 */

import * as path from 'node:path';
import type { Uri } from 'vscode';

type VsCodeApi = typeof import('vscode');

export const RISU_CHARACTER_SELECT_IMAGE_COMMAND = 'risuWorkbench.character.selectImage';

const SUPPORTED_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

/** loadVsCodeApi 함수.
 * boundary tests가 pure helper를 불러올 때 VS Code runtime import를 지연시킴.
 *
 * @returns VS Code extension API module
 */
async function loadVsCodeApi(): Promise<VsCodeApi> {
  return import('vscode');
}

/** getCharacterImageAssetPath 함수.
 * 선택된 이미지 파일명을 canonical assets/icons 경로로 변환함.
 *
 * @param fileName - 사용자가 선택한 이미지 파일명
 * @returns `.risuchar.image`에 기록할 워크스페이스 상대 경로
 */
export function getCharacterImageAssetPath(fileName: string): string {
  const parsed = path.parse(fileName);
  const ext = parsed.ext.toLowerCase();
  const baseName = parsed.name.replace(/[^a-zA-Z0-9._-]+/g, '_') || 'main';
  return `assets/icons/${baseName}${ext}`;
}

/** updateRisucharImageMetadata 함수.
 * `.risuchar` JSON에 선택된 thumbnail path를 반영함.
 *
 * @param manifest - 기존 `.risuchar` JSON object
 * @param imagePath - 선택된 thumbnail의 워크스페이스 상대 경로
 * @returns image가 갱신된 새 manifest object
 */
export function updateRisucharImageMetadata(
  manifest: Record<string, unknown>,
  imagePath: string,
): Record<string, unknown> {
  return { ...manifest, image: imagePath };
}

/** isRecord 함수.
 * unknown 값을 object record로 안전하게 좁힘.
 *
 * @param value - 검사할 값
 * @returns 배열이 아닌 object이면 true
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** upsertCharacterImageManifestEntry 함수.
 * assets/manifest.json에 선택 이미지 asset metadata를 추가하거나 갱신함.
 *
 * @param manifest - 기존 assets/manifest.json object
 * @param entry - 선택 이미지의 manifest entry 입력
 * @returns 갱신된 asset manifest object
 */
export function upsertCharacterImageManifestEntry(
  manifest: Record<string, unknown>,
  entry: { ext: string; extractedPath: string; originalUri: string; sizeBytes: number },
): Record<string, unknown> {
  const assets = Array.isArray(manifest.assets) ? [...manifest.assets] : [];
  const existingIndex = assets.findIndex(
    (asset) => isRecord(asset) && asset.extracted_path === entry.extractedPath,
  );
  const manifestEntry = {
    index: existingIndex >= 0 ? existingIndex : assets.length,
    original_uri: entry.originalUri,
    extracted_path: entry.extractedPath,
    status: 'extracted',
    type: 'icon',
    name: 'main',
    ext: entry.ext,
    subdir: 'icons',
    size_bytes: entry.sizeBytes,
  };

  if (existingIndex >= 0) {
    assets[existingIndex] = manifestEntry;
  } else {
    assets.push(manifestEntry);
  }

  return {
    ...manifest,
    version: typeof manifest.version === 'number' ? manifest.version : 1,
    source_format: typeof manifest.source_format === 'string' ? manifest.source_format : 'scaffold',
    total: assets.length,
    extracted: assets.filter((asset) => isRecord(asset) && asset.status === 'extracted').length,
    skipped: typeof manifest.skipped === 'number' ? manifest.skipped : 0,
    assets,
  };
}

/** readJsonRecord 함수.
 * UTF-8 JSON bytes를 object record로 읽음.
 *
 * @param bytes - JSON으로 파싱할 파일 bytes
 * @returns object record JSON 값
 */
function readJsonRecord(bytes: Uint8Array): Record<string, unknown> {
  const parsed = JSON.parse(Buffer.from(bytes).toString('utf-8'));
  return isRecord(parsed) ? parsed : {};
}

/** writeJsonRecord 함수.
 * JSON object를 보기 좋은 UTF-8 파일로 기록함.
 *
 * @param vscodeApi - 지연 로드한 VS Code extension API
 * @param uri - 기록할 VS Code file URI
 * @param value - 기록할 JSON object
 */
async function writeJsonRecord(
  vscodeApi: VsCodeApi,
  uri: Uri,
  value: Record<string, unknown>,
): Promise<void> {
  await vscodeApi.workspace.fs.writeFile(
    uri,
    Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf-8'),
  );
}

/** resolveCharacterRoot 함수.
 * 명령 입력 URI 또는 picker 결과에서 character workspace root를 결정함.
 *
 * @param vscodeApi - 지연 로드한 VS Code extension API
 * @param uri - 명령 호출 위치 또는 character workspace 내부 URI
 * @param workspaceRoot - 현재 VS Code workspace root URI
 * @returns 선택된 character workspace root URI 또는 null
 */
async function resolveCharacterRoot(
  vscodeApi: VsCodeApi,
  uri: Uri | undefined,
  workspaceRoot: Uri,
): Promise<Uri | null> {
  if (uri && path.basename(uri.fsPath) === '.risuchar') {
    return vscodeApi.Uri.file(path.dirname(uri.fsPath));
  }

  const pickedRoot = await vscodeApi.window.showOpenDialog({
    title: 'Select character workspace containing .risuchar',
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    defaultUri: workspaceRoot,
  });
  return pickedRoot?.[0] ?? null;
}

/** selectCharacterImage 함수.
 * 사용자가 선택한 이미지를 character workspace의 assets/icons로 복사하고 `.risuchar.image`를 갱신함.
 *
 * @param uri - 명령 호출 위치 또는 character workspace 내부 URI
 */
export async function selectCharacterImage(uri?: Uri): Promise<void> {
  const vscodeApi = await loadVsCodeApi();
  const workspaceRoot = vscodeApi.workspace.workspaceFolders?.[0]?.uri;
  if (!workspaceRoot) {
    void vscodeApi.window.showWarningMessage('Open a workspace before selecting a character image.');
    return;
  }

  const rootUri = await resolveCharacterRoot(vscodeApi, uri, workspaceRoot);
  if (!rootUri) return;

  const risucharUri = vscodeApi.Uri.joinPath(rootUri, '.risuchar');
  let risucharBytes: Uint8Array;
  try {
    risucharBytes = await vscodeApi.workspace.fs.readFile(risucharUri);
  } catch {
    void vscodeApi.window.showWarningMessage('Select a character workspace containing .risuchar first.');
    return;
  }

  const selected = await vscodeApi.window.showOpenDialog({
    title: 'Select character thumbnail image',
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: { Images: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
  });
  const imageUri = selected?.[0];
  if (!imageUri) return;

  const ext = path.extname(imageUri.fsPath).toLowerCase();
  if (!SUPPORTED_IMAGE_EXTENSIONS.has(ext)) {
    void vscodeApi.window.showWarningMessage(`Unsupported image extension: ${ext}`);
    return;
  }

  try {
    const imageBytes = await vscodeApi.workspace.fs.readFile(imageUri);
    const imagePath = getCharacterImageAssetPath(path.basename(imageUri.fsPath));
    const targetImageUri = vscodeApi.Uri.joinPath(rootUri, ...imagePath.split('/'));
    await vscodeApi.workspace.fs.createDirectory(vscodeApi.Uri.joinPath(rootUri, 'assets', 'icons'));
    await vscodeApi.workspace.fs.writeFile(targetImageUri, imageBytes);

    const manifest = readJsonRecord(risucharBytes);
    await writeJsonRecord(vscodeApi, risucharUri, updateRisucharImageMetadata(manifest, imagePath));

    const assetManifestUri = vscodeApi.Uri.joinPath(rootUri, 'assets', 'manifest.json');
    let assetManifest: Record<string, unknown> = {
      version: 1,
      source_format: 'scaffold',
      total: 0,
      extracted: 0,
      skipped: 0,
      assets: [],
    };
    try {
      assetManifest = readJsonRecord(await vscodeApi.workspace.fs.readFile(assetManifestUri));
    } catch {
      await vscodeApi.workspace.fs.createDirectory(vscodeApi.Uri.joinPath(rootUri, 'assets'));
    }

    await writeJsonRecord(
      vscodeApi,
      assetManifestUri,
      upsertCharacterImageManifestEntry(assetManifest, {
        ext: ext.replace(/^\./, ''),
        extractedPath: imagePath.replace(/^assets\//, ''),
        originalUri: `embeded://${imagePath}`,
        sizeBytes: imageBytes.byteLength,
      }),
    );

    void vscodeApi.window.showInformationMessage(`Character thumbnail set to ${imagePath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void vscodeApi.window.showErrorMessage(`Failed to select character image: ${message}`);
  }
}
