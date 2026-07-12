/**
 * HMR wire protocol — intentional duplicate of risu-workbench-core src/domain/hmr/protocol.ts.
 * The plugin is a sandboxed single bundle and must not import core; keep both sides in sync and
 * increment HMR_PROTOCOL_VERSION when changing this contract.
 */

export const HMR_PROTOCOL_VERSION = 2;

export const HMR_ASSET_PLACEHOLDER_PREFIX = 'hmr-asset://';

export interface HmrAssetEntry {
  readonly hash: string;
  readonly ext: string;
  readonly role: string;
  readonly size: number;
}

export interface HmrHealthResponse {
  readonly app: 'risu-workbench-hmr';
  readonly protocolVersion: number;
  readonly project: { readonly name: string; readonly kind: 'character' | 'module'; readonly stableId: string };
  readonly version: number;
}

export interface HmrWatchResponse {
  readonly version: number;
  readonly definitionChanged: boolean;
  readonly changedAssets: readonly string[];
  /** Broadcast 중인 프로젝트의 stableId. 수신측은 매 응답마다 매핑과 대조해 대상 전환을 감지한다. */
  readonly stableId: string;
}

export interface HmrPayloadResponse {
  readonly kind: 'character' | 'module';
  readonly data: Record<string, unknown>;
  readonly assets: readonly HmrAssetEntry[];
}

export interface HmrConnection {
  readonly baseUrl: string;
  readonly token: string;
  readonly raw: string;
}

const CONNECTION_PATTERN = /^risu-hmr:\/\/(127\.0\.0\.1|localhost):(\d{2,5})#k=([0-9A-Za-z_-]+)$/;

export function parseConnectionString(raw: string): HmrConnection | null {
  const trimmed = raw.trim();
  const match = CONNECTION_PATTERN.exec(trimmed);
  if (match === null) {
    return null;
  }

  const port = match[2];
  const token = match[3];
  if (port === undefined || token === undefined) {
    return null;
  }

  return { baseUrl: `http://127.0.0.1:${port}`, token, raw: trimmed };
}

export function buildRequestUrl(
  connection: HmrConnection,
  path: string,
  params?: Record<string, string>,
): string {
  const search = new URLSearchParams({ ...(params ?? {}), k: connection.token });
  return `${connection.baseUrl}${path}?${search.toString()}`;
}
