const MAX_DATA_URI_BYTES = 50 * 1024 * 1024;

/** 애셋 데이터 딕셔너리 타입이에요. */
export type AssetDict = Record<string, unknown>;

/**
 * 해석된 애셋 정보를 담는 인터페이스에요.
 */
export interface ResolvedAsset {
  /** 애셋 실제 데이터 */
  data: unknown;
  /** 애셋 타입 (인덱스 참조, 임베디드, 기본값, 데이터 URI, 원격 URL 등) */
  type: 'asset-index' | 'embedded' | 'ccdefault' | 'data-uri' | 'remote';
  /** 애셋 관련 메타데이터 */
  metadata: Record<string, string>;
}

/**
 * 다양한 형식의 애셋 URI(ccdefault:, embedded://, data:, http:// 등)를 해석해요.
 *
 * @param uri - 해석할 애셋 URI
 * @param assetDict - 임베디드 애셋이나 인덱스 참조 시 사용할 데이터 사전
 * @returns 해석된 애셋 정보 (해석 실패 시 null)
 */
export function resolveAssetUri(
  uri: string,
  assetDict?: AssetDict | null,
): ResolvedAsset | null {
  if (typeof uri !== 'string') return null;

  const dict: AssetDict =
    assetDict && typeof assetDict === 'object' ? assetDict : {};

  if (uri.startsWith('__asset:')) {
    const index = uri.slice('__asset:'.length);
    return {
      data: dict[index] || null,
      type: 'asset-index',
      metadata: { index },
    };
  }

  if (uri.startsWith('embeded://')) {
    const assetPath = uri.slice('embeded://'.length);
    return {
      data: dict[assetPath] || null,
      type: 'embedded',
      metadata: { path: assetPath },
    };
  }

  if (uri.startsWith('embedded://')) {
    const assetPath = uri.slice('embedded://'.length);
    return {
      data: dict[assetPath] || null,
      type: 'embedded',
      metadata: { path: assetPath },
    };
  }

  if (uri === 'ccdefault:') {
    return {
      data: null,
      type: 'ccdefault',
      metadata: {},
    };
  }

  if (uri.startsWith('data:')) {
    const match = /^data:([^;,]+);base64,(.+)$/.exec(uri);
    if (!match) return null;

    const mime = match[1];
    const payload = match[2];
    if (payload.length * 0.75 > MAX_DATA_URI_BYTES) {
      console.warn('[uri-resolver] data URI payload exceeds 50MB limit');
      return null;
    }

    return {
      data: Buffer.from(payload, 'base64'),
      type: 'data-uri',
      metadata: { mime },
    };
  }

  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return {
      data: null,
      type: 'remote',
      metadata: { url: uri },
    };
  }

  return null;
}

/**
 * MIME 타입을 기반으로 적절한 파일 확장자를 추측해요.
 *
 * @param mime - MIME 타입 (image/png 등)
 * @returns 확장자 (예: .png, .jpg 등. 알 수 없으면 .bin)
 */
export function guessMimeExt(mime: string): string {
  const table: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/ogg': '.ogg',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
  };

  return table[mime] || '.bin';
}
