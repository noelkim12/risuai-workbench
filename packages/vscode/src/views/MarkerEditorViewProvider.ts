/**
 * Root marker editor WebviewPanel provider for `.risuchar` and `.risumodule` manifests.
 * @file packages/vscode/src/views/MarkerEditorViewProvider.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import * as vscode from 'vscode';
import { getCharacterImageAssetPath, upsertCharacterImageManifestEntry } from '../commands/characterImage';
import { getWorkspaceRelativePath, splitRelativePath } from '../artifact-browser/CharacterManifestDiscoveryService';
import {
  MARKER_EDITOR_PROTOCOL,
  MARKER_EDITOR_PROTOCOL_VERSION,
  type CharacterEditFields,
  type MarkerEditFields,
  type MarkerEditorErrorMessage,
  type MarkerEditorExtensionMessage,
  type MarkerEditorImageSelectedMessage,
  type MarkerEditorInitMessage,
  type MarkerEditorInitPayload,
  type MarkerEditorMode,
  type MarkerEditorReadyMessage,
  type MarkerEditorResetRequestMessage,
  type MarkerEditorResetResponseMessage,
  type MarkerEditorSaveMessage,
  type MarkerEditorSavedMessage,
  type MarkerEditorSelectImageMessage,
  type ModuleEditFields,
} from '../artifact-browser/artifactBrowserTypes';
import { ArtifactBrowserViewProvider } from './ArtifactBrowserViewProvider';
import {
  createWebviewDevServerHtml,
  getConfiguredWebviewDevServerUrl,
  getWebviewDevServerPortMapping,
} from './webviewDevServer';

const PANEL_VIEW_TYPE = 'risuWorkbench.markerEditor';
const CHARACTER_MARKER_FILENAME = '.risuchar';
const MODULE_MARKER_FILENAME = '.risumodule';
const ASSETS_DIRECTORY = 'assets';
const SUPPORTED_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.svg']);

type JsonObject = Record<string, unknown>;

/**
 * MarkerEditorViewProvider 클래스.
 * Root marker JSON을 WebviewPanel editor로 열고 저장/reset/image 선택 메시지를 처리함.
 */
export class MarkerEditorViewProvider {
  private static readonly panels = new Map<string, MarkerEditorViewProvider>();

  private readonly disposables: vscode.Disposable[] = [];
  private readonly rootUri: vscode.Uri;
  private readonly mode: MarkerEditorMode;

  /**
   * openEditor 함수.
   * marker URI별 panel을 새로 열거나 이미 열린 panel을 재사용함.
   *
   * @param context - VS Code extension context
   * @param markerUri - 열 `.risuchar` 또는 `.risumodule` marker URI
   */
  static openEditor(context: vscode.ExtensionContext, markerUri: vscode.Uri): void {
    const mode = detectMarkerMode(markerUri);
    if (!mode) {
      void vscode.window.showErrorMessage('Marker editor only supports .risuchar and .risumodule files.');
      return;
    }

    const panelKey = markerUri.toString();
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
    const existing = MarkerEditorViewProvider.panels.get(panelKey);
    if (existing) {
      existing.panel.reveal(column);
      void existing.sendInitMessage();
      return;
    }

    const rootUri = vscode.Uri.file(path.dirname(markerUri.fsPath));
    const panel = vscode.window.createWebviewPanel(
      PANEL_VIEW_TYPE,
      createPanelTitle(mode, markerUri),
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview'), vscode.Uri.joinPath(rootUri, ASSETS_DIRECTORY)],
        portMapping: getWebviewDevServerPortMapping(),
      },
    );

    MarkerEditorViewProvider.panels.set(panelKey, new MarkerEditorViewProvider(context, panel, markerUri, rootUri, mode));
  }

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly panel: vscode.WebviewPanel,
    private readonly markerUri: vscode.Uri,
    rootUri: vscode.Uri,
    mode: MarkerEditorMode,
  ) {
    this.rootUri = rootUri;
    this.mode = mode;
    this.panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview'), vscode.Uri.joinPath(rootUri, ASSETS_DIRECTORY)],
      portMapping: getWebviewDevServerPortMapping(),
    };
    this.disposables.push(
      this.panel.onDidDispose(() => {
        MarkerEditorViewProvider.panels.delete(this.markerUri.toString());
        this.disposables.splice(0).forEach((disposable) => disposable.dispose());
      }),
      this.panel.webview.onDidReceiveMessage((message: unknown) => {
        void this.handleMessage(message);
      }),
    );

    this.panel.webview.html = this.getHtml(this.panel.webview);
  }

  /**
   * handleMessage 함수.
   * Webview에서 들어온 marker editor message를 타입별 handler로 분기함.
   *
   * @param message - Webview에서 수신한 unknown message envelope
   */
  private async handleMessage(message: unknown): Promise<void> {
    if (isMarkerEditorReadyMessage(message)) {
      await this.handleReady(message);
      return;
    }

    if (isMarkerEditorSaveMessage(message)) {
      await this.handleSave(message);
      return;
    }

    if (isMarkerEditorResetMessage(message)) {
      await this.handleReset(message);
      return;
    }

    if (isMarkerEditorSelectImageMessage(message)) {
      await this.handleSelectImage(message);
    }
  }

  /**
   * handleReady 함수.
   * Webview listener 준비 완료 신호를 받은 뒤 marker init payload를 전송함.
   *
   * @param message - marker editor ready request
   */
  private async handleReady(message: MarkerEditorReadyMessage): Promise<void> {
    if (message.payload.markerUri && message.payload.markerUri !== this.markerUri.toString()) {
      this.postMessage(createErrorMessage('staleMessage', 'Ready message does not match the open marker editor panel.'));
      return;
    }

    await this.sendInitMessage();
  }

  /**
   * handleSave 함수.
   * editable field만 원본 manifest object에 반영하고 나머지 key는 그대로 보존함.
   *
   * @param message - marker editor save request
   */
  private async handleSave(message: MarkerEditorSaveMessage): Promise<void> {
    if (!this.isCurrentMarkerMessage(message.payload.markerUri, message.payload.mode)) return;

    try {
      const manifest = await this.readManifestJson();
      const fields = message.payload.fields;
      if (!isJsonObject(fields)) {
        this.postMessage(createErrorMessage('invalidFields', 'Save payload fields must be a JSON object.'));
        return;
      }

      const normalizedImage = normalizeMarkerEditorImagePath(fields.image);
      if (fields.image && !normalizedImage) {
        this.postMessage(createErrorMessage('invalidImage', 'Image path must be a supported file under assets/.', 'image'));
        return;
      }
      fields.image = normalizedImage;

      if (this.mode === 'character' && isCharacterEditFields(fields)) {
        applyCharacterEditFields(manifest, fields);
      } else if (this.mode === 'module' && isModuleEditFields(fields)) {
        applyModuleEditFields(manifest, fields);
      } else {
        this.postMessage(createErrorMessage('invalidFields', 'Save payload fields do not match the marker editor mode.'));
        return;
      }

      await vscode.workspace.fs.writeFile(this.markerUri, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf-8'));
      const payload = await this.createInitPayload();
      this.postMessage(createSavedMessage({
        success: true,
        message: 'Marker saved.',
        fields: payload.fields,
        imageUri: payload.imageUri,
      }));
      ArtifactBrowserViewProvider.refreshOpenViews();
    } catch (error) {
      this.postMessage(createErrorMessage('saveFailed', getErrorMessage(error)));
    }
  }

  /**
   * handleReset 함수.
   * Disk 상태를 다시 읽어 reset response payload로 webview에 돌려줌.
   *
   * @param message - marker editor reset request
   */
  private async handleReset(message: MarkerEditorResetRequestMessage): Promise<void> {
    if (!this.isCurrentMarkerMessage(message.payload.markerUri, message.payload.mode)) return;

    try {
      const payload = await this.createInitPayload();
      this.postMessage(createResetResponseMessage({
        fields: payload.fields,
        imageUri: payload.imageUri,
        createdAt: payload.createdAt,
        modifiedAt: payload.modifiedAt,
      }));
    } catch (error) {
      this.postMessage(createErrorMessage('resetFailed', getErrorMessage(error)));
    }
  }

  /**
   * handleSelectImage 함수.
   * 선택한 이미지를 marker root `assets/icons/`로 복사하고 relative path를 반환함.
   *
   * @param message - marker editor image selection request
   */
  private async handleSelectImage(message: MarkerEditorSelectImageMessage): Promise<void> {
    if (!this.isCurrentMarkerMessage(message.payload.markerUri, message.payload.mode)) return;
    if (message.payload.rootUri !== this.rootUri.toString()) {
      this.postMessage(createErrorMessage('invalidRoot', 'Image selection root does not match the open marker root.', 'image'));
      return;
    }

    const selected = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      defaultUri: vscode.Uri.joinPath(this.rootUri, ASSETS_DIRECTORY),
      filters: {
        Images: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'svg'],
      },
      title: 'Select marker image',
    });
    const imageUri = selected?.[0];
    if (!imageUri) return;

    const copied = await copyMarkerEditorImageToAssets(this.rootUri, imageUri);
    if (!copied) {
      this.postMessage(createErrorMessage('unsupportedImage', 'Choose a supported image file.', 'image'));
      return;
    }

    this.postMessage(createImageSelectedMessage({
      imagePath: copied.relativePath,
      imageUri: this.panel.webview.asWebviewUri(copied.uri).toString(),
    }));
  }

  /**
   * sendInitMessage 함수.
   * 현재 marker manifest를 읽어 marker-editor/init message로 전송함.
   */
  private async sendInitMessage(): Promise<void> {
    try {
      this.postMessage(createInitMessage(await this.createInitPayload()));
    } catch (error) {
      this.postMessage(createErrorMessage('initFailed', getErrorMessage(error)));
    }
  }

  private async createInitPayload(): Promise<MarkerEditorInitPayload> {
    const manifest = await this.readManifestJson();
    const base = {
      markerUri: this.markerUri.toString(),
      rootUri: this.rootUri.toString(),
      rootPathLabel: getWorkspaceRelativePath(this.rootUri),
      markerPathLabel: getWorkspaceRelativePath(this.markerUri),
      imageUri: await this.resolveImageUri(readMarkerEditorImagePath(manifest.image)),
      createdAt: readTimestamp(manifest.createdAt),
      modifiedAt: readTimestamp(manifest.modifiedAt),
    };

    if (this.mode === 'character') {
      return {
        mode: 'character',
        ...base,
        fields: toCharacterEditFields(manifest),
      };
    }

    return {
      mode: 'module',
      ...base,
      fields: toModuleEditFields(manifest),
    };
  }

  private async readManifestJson(): Promise<JsonObject> {
    const manifestText = Buffer.from(await vscode.workspace.fs.readFile(this.markerUri)).toString('utf-8');
    const parsed: unknown = JSON.parse(manifestText);
    if (!isJsonObject(parsed)) throw new Error('Marker manifest must contain a JSON object.');
    return parsed;
  }

  private async resolveImageUri(imagePath: string | null | undefined): Promise<string | undefined> {
    if (!imagePath) return undefined;
    const normalized = normalizeRelativeImagePath(imagePath);
    if (!normalized) return undefined;

    const imageUri = vscode.Uri.joinPath(this.rootUri, ...splitRelativePath(normalized));
    try {
      const stat = await vscode.workspace.fs.stat(imageUri);
      if (stat.type !== vscode.FileType.File) return undefined;
      return this.panel.webview.asWebviewUri(imageUri).toString();
    } catch {
      return undefined;
    }
  }

  private isCurrentMarkerMessage(markerUri: string, mode: MarkerEditorMode): boolean {
    if (markerUri === this.markerUri.toString() && mode === this.mode) return true;
    this.postMessage(createErrorMessage('staleMessage', 'Message does not match the open marker editor panel.'));
    return false;
  }

  private postMessage(message: MarkerEditorExtensionMessage): void {
    void this.panel.webview.postMessage(message);
  }

  private getHtml(webview: vscode.Webview): string {
    const devServerUrl = getConfiguredWebviewDevServerUrl();
    if (devServerUrl) {
      return createWebviewDevServerHtml(devServerUrl, {
        editorMode: true,
        title: 'Risu Marker Editor',
        viewName: 'marker-editor',
        webview,
      });
    }

    const webviewRoot = vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview');
    const htmlPath = path.join(webviewRoot.fsPath, 'index.html');

    if (!fs.existsSync(htmlPath)) {
      return this.getFallbackHtml(webview);
    }

    const nonce = createNonce();
    const html = fs.readFileSync(htmlPath, 'utf8');
    const assetHtml = html.replace(/(src|href)="(\.\/assets\/[^\"]+)"/g, (_match, attr, assetPath) => {
      const assetUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, assetPath.replace('./', '')));
      return `${attr}="${assetUri.toString()}"`;
    });
    const withNonce = assetHtml.replace(/<script type="module"/g, `<script nonce="${nonce}" type="module"`);
    const withEditorSignal = withNonce.replace(
      /<html(\s[^>]*)?>/i,
      (match, attrs: string | undefined) => (attrs?.includes('data-editor-mode=')
        ? match
        : `<html${attrs ?? ''} data-editor-mode="true">`),
    ).replace(
      '</head>',
      `    <meta name="risu-workbench-view" content="marker-editor" />\n  </head>`,
    );

    return withEditorSignal.replace(
      '</head>',
      `    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};" />\n  </head>`,
    );
  }

  private getFallbackHtml(webview: vscode.Webview): string {
    return `<!doctype html>
<html lang="en" data-editor-mode="true">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="risu-workbench-view" content="marker-editor" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource};" />
    <title>Risu Marker Editor</title>
  </head>
  <body>
    <h1>Risu Marker Editor</h1>
    <p>Webview bundle is missing. Run the vscode package build to generate Vite assets.</p>
  </body>
</html>`;
  }
}

/**
 * createNonce 함수.
 * VS Code webview CSP에서 module script를 허용할 일회성 nonce를 생성함.
 *
 * @returns CSP script nonce
 */
function createNonce(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

function detectMarkerMode(markerUri: vscode.Uri): MarkerEditorMode | null {
  const basename = path.basename(markerUri.fsPath);
  if (basename === CHARACTER_MARKER_FILENAME) return 'character';
  if (basename === MODULE_MARKER_FILENAME) return 'module';
  return null;
}

function createPanelTitle(mode: MarkerEditorMode, markerUri: vscode.Uri): string {
  return mode === 'character'
    ? `Edit Character Marker: ${path.dirname(markerUri.fsPath).split(path.sep).pop() ?? CHARACTER_MARKER_FILENAME}`
    : `Edit Module Marker: ${path.dirname(markerUri.fsPath).split(path.sep).pop() ?? MODULE_MARKER_FILENAME}`;
}

function toCharacterEditFields(manifest: JsonObject): CharacterEditFields {
  const flags = isJsonObject(manifest.flags) ? manifest.flags : {};
  return {
    name: readString(manifest.name),
    creator: readString(manifest.creator),
    characterVersion: readString(manifest.characterVersion),
    image: readMarkerEditorImagePath(manifest.image),
    tags: Array.isArray(manifest.tags) ? manifest.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    utilityBot: flags.utilityBot === true,
    lowLevelAccess: flags.lowLevelAccess === true,
  };
}

function toModuleEditFields(manifest: JsonObject): ModuleEditFields {
  return {
    name: readString(manifest.name),
    description: readString(manifest.description),
    namespace: readString(manifest.namespace),
    image: readMarkerEditorImagePath(manifest.image),
    lowLevelAccess: manifest.lowLevelAccess === true,
    hideIcon: manifest.hideIcon === true,
  };
}

function applyCharacterEditFields(manifest: JsonObject, fields: CharacterEditFields): void {
  manifest.name = fields.name;
  manifest.creator = fields.creator;
  manifest.characterVersion = fields.characterVersion;
  manifest.image = fields.image;
  manifest.tags = fields.tags;
  const flags = isJsonObject(manifest.flags) ? manifest.flags : {};
  flags.utilityBot = fields.utilityBot;
  flags.lowLevelAccess = fields.lowLevelAccess;
  manifest.flags = flags;
}

function applyModuleEditFields(manifest: JsonObject, fields: ModuleEditFields): void {
  manifest.name = fields.name;
  manifest.description = fields.description;
  manifest.namespace = fields.namespace;
  manifest.image = fields.image;
  manifest.lowLevelAccess = fields.lowLevelAccess;
  manifest.hideIcon = fields.hideIcon;
}

function isMarkerEditorSaveMessage(message: unknown): message is MarkerEditorSaveMessage {
  return isMarkerEditorMessage(message, 'marker-editor/save') && isJsonObject(message.payload);
}

function isMarkerEditorReadyMessage(message: unknown): message is MarkerEditorReadyMessage {
  return isMarkerEditorMessage(message, 'marker-editor/ready');
}

function isMarkerEditorResetMessage(message: unknown): message is MarkerEditorResetRequestMessage {
  return isMarkerEditorMessage(message, 'marker-editor/reset') && isJsonObject(message.payload);
}

function isMarkerEditorSelectImageMessage(message: unknown): message is MarkerEditorSelectImageMessage {
  return isMarkerEditorMessage(message, 'marker-editor/selectImage') && isJsonObject(message.payload);
}

function isMarkerEditorMessage(
  message: unknown,
  type: MarkerEditorReadyMessage['type'] | MarkerEditorSaveMessage['type'] | MarkerEditorResetRequestMessage['type'] | MarkerEditorSelectImageMessage['type'],
): message is MarkerEditorReadyMessage | MarkerEditorSaveMessage | MarkerEditorResetRequestMessage | MarkerEditorSelectImageMessage {
  if (!isJsonObject(message)) return false;
  const payload = message.payload;
  if (!isJsonObject(payload)) return false;
  if (type === 'marker-editor/ready') {
    return (
      message.protocol === MARKER_EDITOR_PROTOCOL &&
      message.version === MARKER_EDITOR_PROTOCOL_VERSION &&
      message.type === type &&
      typeof payload.markerUri === 'string'
    );
  }

  return (
    message.protocol === MARKER_EDITOR_PROTOCOL &&
    message.version === MARKER_EDITOR_PROTOCOL_VERSION &&
    message.type === type &&
    typeof payload.markerUri === 'string' &&
    (payload.mode === 'character' || payload.mode === 'module')
  );
}

function isCharacterEditFields(fields: MarkerEditFields): fields is CharacterEditFields {
  return (
    'creator' in fields &&
    'characterVersion' in fields &&
    'utilityBot' in fields &&
    typeof fields.name === 'string' &&
    typeof fields.creator === 'string' &&
    typeof fields.characterVersion === 'string' &&
    Array.isArray(fields.tags) &&
    typeof fields.utilityBot === 'boolean' &&
    typeof fields.lowLevelAccess === 'boolean'
  );
}

function isModuleEditFields(fields: MarkerEditFields): fields is ModuleEditFields {
  return (
    'description' in fields &&
    'namespace' in fields &&
    'hideIcon' in fields &&
    typeof fields.name === 'string' &&
    typeof fields.description === 'string' &&
    typeof fields.namespace === 'string' &&
    typeof fields.lowLevelAccess === 'boolean' &&
    typeof fields.hideIcon === 'boolean'
  );
}

function createInitMessage(payload: MarkerEditorInitPayload): MarkerEditorInitMessage {
  return createMarkerEditorMessage('marker-editor/init', payload);
}

function createSavedMessage(payload: MarkerEditorSavedMessage['payload']): MarkerEditorSavedMessage {
  return createMarkerEditorMessage('marker-editor/saved', payload);
}

function createResetResponseMessage(payload: MarkerEditorResetResponseMessage['payload']): MarkerEditorResetResponseMessage {
  return createMarkerEditorMessage('marker-editor/reset', payload);
}

function createImageSelectedMessage(payload: MarkerEditorImageSelectedMessage['payload']): MarkerEditorImageSelectedMessage {
  return createMarkerEditorMessage('marker-editor/imageSelected', payload);
}

function createErrorMessage(code: string, message: string, field?: MarkerEditorErrorMessage['payload']['field']): MarkerEditorErrorMessage {
  return createMarkerEditorMessage('marker-editor/error', { code, message, ...(field && { field }) });
}

function createMarkerEditorMessage<TMessage extends MarkerEditorExtensionMessage>(
  type: TMessage['type'],
  payload: TMessage['payload'],
): TMessage {
  return {
    protocol: MARKER_EDITOR_PROTOCOL,
    version: MARKER_EDITOR_PROTOCOL_VERSION,
    type,
    payload,
  } as TMessage;
}

/**
 * toRootRelativeImagePath 함수.
 * File URI를 marker root 기준 relative image path로 변환함.
 *
 * @param rootUri - marker root URI
 * @param imageUri - 선택된 image URI
 * @returns assets 경계 검증 전 root relative path 또는 null
 */
export function toRootRelativeImagePath(rootUri: vscode.Uri, imageUri: vscode.Uri): string | null {
  const relative = path.relative(rootUri.fsPath, imageUri.fsPath).replace(/\\/g, '/');
  return normalizeRelativeImagePath(relative);
}

/**
 * normalizeMarkerEditorImagePath 함수.
 * Manifest/save payload image 값을 assets 아래 supported image relative path로 정규화함.
 *
 * @param value - manifest 또는 save payload의 image 값
 * @returns 저장 가능한 assets relative path 또는 null
 */
export function normalizeMarkerEditorImagePath(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return null;
  const normalized = normalizeRelativeImagePath(value);
  if (!normalized?.startsWith(`${ASSETS_DIRECTORY}/`)) return null;
  return normalized;
}

/**
 * getMarkerEditorImageAssetPath 함수.
 * 선택 이미지 파일명을 marker editor용 assets/icons relative path로 변환함.
 *
 * @param fileName - 선택된 이미지 파일명
 * @returns `.risuchar/.risumodule.image`에 기록할 assets/icons 경로
 */
export function getMarkerEditorImageAssetPath(fileName: string): string {
  return getCharacterImageAssetPath(fileName);
}

/**
 * copyMarkerEditorImageToAssets 함수.
 * 외부 또는 내부 image 파일을 assets/icons canonical 위치에 복사하고 manifest metadata를 갱신함.
 *
 * @param rootUri - marker root URI
 * @param imageUri - 선택된 image URI
 * @returns 복사된 image URI와 저장할 relative path, unsupported 파일이면 null
 */
export async function copyMarkerEditorImageToAssets(
  rootUri: vscode.Uri,
  imageUri: vscode.Uri,
): Promise<{ relativePath: string; uri: vscode.Uri } | null> {
  const ext = path.extname(imageUri.fsPath).toLowerCase();
  if (!SUPPORTED_IMAGE_EXTENSIONS.has(ext)) return null;

  const bytes = await vscode.workspace.fs.readFile(imageUri);
  const relativePath = getMarkerEditorImageAssetPath(path.basename(imageUri.fsPath));
  const targetUri = vscode.Uri.joinPath(rootUri, ...splitRelativePath(relativePath));
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(rootUri, ASSETS_DIRECTORY, 'icons'));
  await vscode.workspace.fs.writeFile(targetUri, bytes);
  await upsertMarkerEditorAssetManifest(rootUri, {
    ext: ext.replace(/^\./, ''),
    extractedPath: relativePath.replace(/^assets\//, ''),
    originalUri: `embeded://${relativePath}`,
    sizeBytes: bytes.byteLength,
  });

  return { relativePath, uri: targetUri };
}

async function upsertMarkerEditorAssetManifest(
  rootUri: vscode.Uri,
  entry: { ext: string; extractedPath: string; originalUri: string; sizeBytes: number },
): Promise<void> {
  const manifestUri = vscode.Uri.joinPath(rootUri, ASSETS_DIRECTORY, 'manifest.json');
  let manifest: JsonObject = { version: 1, source_format: 'scaffold', total: 0, extracted: 0, skipped: 0, assets: [] };
  try {
    const parsed = JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(manifestUri)).toString('utf-8'));
    if (isJsonObject(parsed)) manifest = parsed;
  } catch {
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(rootUri, ASSETS_DIRECTORY));
  }

  const nextManifest = upsertCharacterImageManifestEntry(manifest, entry);
  await vscode.workspace.fs.writeFile(manifestUri, Buffer.from(`${JSON.stringify(nextManifest, null, 2)}\n`, 'utf-8'));
}

function readMarkerEditorImagePath(value: unknown): string | null {
  return normalizeMarkerEditorImagePath(value);
}

function normalizeRelativeImagePath(value: string): string | null {
  const normalized = value.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized || path.isAbsolute(normalized)) return null;
  if (normalized.split('/').includes('..')) return null;
  if (!SUPPORTED_IMAGE_EXTENSIONS.has(path.extname(normalized).toLowerCase())) return null;
  return normalized;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readTimestamp(value: unknown): string | null {
  return typeof value === 'string' || value === null ? value : null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
