/**
 * VS Code webview dev server HTML helpers.
 * @file packages/vscode/src/views/webviewDevServer.ts
 */

import * as vscode from 'vscode';

export const RISU_WEBVIEW_DEV_SERVER_ENV = 'RISU_WORKBENCH_WEBVIEW_DEV_SERVER';

interface DevServerHtmlOptions {
  editorMode?: boolean;
  title: string;
  viewName?: string;
  webview: vscode.Webview;
}

/**
 * getConfiguredWebviewDevServerUrl 함수.
 * 환경 변수로 켜진 Vite dev server URL을 안전하게 파싱함.
 *
 * @returns 설정된 dev server URL, 없거나 잘못된 값이면 null
 */
export function getConfiguredWebviewDevServerUrl(): URL | null {
  const rawUrl = process.env[RISU_WEBVIEW_DEV_SERVER_ENV]?.trim();
  if (!rawUrl) return null;

  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * createWebviewDevServerHtml 함수.
 * Vite dev server의 module script를 직접 로드하는 HMR용 webview HTML을 만듦.
 *
 * @param devServerUrl - Vite dev server URL
 * @param options - webview CSP와 화면 mode 설정
 * @returns VS Code webview에 주입할 development HTML
 */
export function createWebviewDevServerHtml(devServerUrl: URL, options: DevServerHtmlOptions): string {
  const origin = devServerUrl.origin;
  const websocketOrigin = `${devServerUrl.protocol === 'https:' ? 'wss:' : 'ws:'}//${devServerUrl.host}`;
  const editorModeAttribute = options.editorMode ? ' data-editor-mode="true"' : '';
  const viewNameAttribute = options.viewName
    ? ` data-risu-workbench-view="${escapeHtmlAttribute(options.viewName)}"`
    : '';
  const viewMeta = options.viewName
    ? `    <meta name="risu-workbench-view" content="${escapeHtmlAttribute(options.viewName)}" />\n`
    : '';

  return `<!doctype html>
<html lang="en"${editorModeAttribute}${viewNameAttribute}>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
${viewMeta}    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${options.webview.cspSource} ${origin} data: http: https:; style-src ${options.webview.cspSource} ${origin} 'unsafe-inline'; script-src ${origin} 'unsafe-eval'; connect-src ${origin} ${websocketOrigin}; worker-src ${options.webview.cspSource} ${origin} blob:; child-src ${options.webview.cspSource} ${origin} blob:; font-src ${options.webview.cspSource} ${origin};" />
    <title>${escapeHtmlText(options.title)}</title>
    <script type="module" src="${origin}/@vite/client"></script>
    <script type="module" src="${origin}/src/main.ts"></script>
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>`;
}

/**
 * getWebviewDevServerPortMapping 함수.
 * VS Code webview가 extension host localhost dev server에 접근하도록 port mapping을 계산함.
 *
 * @returns dev server port mapping 목록
 */
export function getWebviewDevServerPortMapping(): vscode.WebviewPortMapping[] {
  const devServerUrl = getConfiguredWebviewDevServerUrl();
  if (!devServerUrl) return [];

  const port = Number.parseInt(devServerUrl.port || (devServerUrl.protocol === 'https:' ? '443' : '80'), 10);
  if (!Number.isInteger(port) || port <= 0) return [];

  return [{ extensionHostPort: port, webviewPort: port }];
}

/**
 * escapeHtmlAttribute 함수.
 * HTML attribute에 들어갈 개발용 문자열을 escape함.
 *
 * @param value - escape할 문자열
 * @returns attribute-safe 문자열
 */
function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * escapeHtmlText 함수.
 * HTML text node에 들어갈 개발용 문자열을 escape함.
 *
 * @param value - escape할 문자열
 * @returns text-safe 문자열
 */
function escapeHtmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}
