/**
 * HMR wire 프로토콜 상수·타입.
 * 워크벤치 HMR 서버와 RisuAI 수신 플러그인이 공유하는 계약.
 * 플러그인은 이 파일을 import할 수 없으므로 동일 정의를 복제한다.
 */

export const HMR_PROTOCOL_VERSION = 2;

export const HMR_ASSET_PLACEHOLDER_PREFIX = 'hmr-asset://';

export const HMR_PORT_RANGE = { start: 41520, end: 41529 } as const;

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
  /** 방송 중인 프로젝트의 stableId. 수신측은 매 응답마다 매핑과 대조해 대상 전환을 감지한다. */
  readonly stableId: string;
}

export interface HmrPayloadResponse {
  readonly kind: 'character' | 'module';
  readonly data: Record<string, unknown>;
  readonly assets: readonly HmrAssetEntry[];
}

/**
 * hmrAssetPlaceholder 함수.
 * 페이로드 JSON 내 에셋 참조 자리에 들어갈 플레이스홀더 문자열을 만든다.
 */
export function hmrAssetPlaceholder(hash: string): string {
  return `${HMR_ASSET_PLACEHOLDER_PREFIX}${hash}`;
}

/**
 * buildHmrConnectionString 함수.
 * 워크벤치가 표시/복사에 쓰는 연결 문자열을 만든다.
 */
export function buildHmrConnectionString(port: number, token: string): string {
  return `risu-hmr://127.0.0.1:${port}#k=${token}`;
}
