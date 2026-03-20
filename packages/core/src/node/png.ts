/** PNG 파일의 시그니처 바이트 배열입니다. */
export const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
/** 1x1 크기의 투명한 PNG 이미지 바이너리입니다. */
export const PNG_1X1_TRANSPARENT = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+3xQAAAAASUVORK5CYII=',
  'base64',
);
/** 1x1 크기의 JPEG 이미지 바이너리입니다. */
export const JPEG_1X1 = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBAQEA8PDw8PDw8PDw8PDw8PDw8PFREWFhURFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMsNygtLisBCgoKDQ0NDg0NDisZFRkrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrK//AABEIAAEAAQMBIgACEQEDEQH/xAAXAAEBAQEAAAAAAAAAAAAAAAAAAQID/8QAFhEBAQEAAAAAAAAAAAAAAAAAABEh/8QAFQEBAQAAAAAAAAAAAAAAAAAAAQL/xAAVEQEBAAAAAAAAAAAAAAAAAAABAP/aAAwDAQACEQMRAD8A0QAAAP/Z',
  'base64',
);

let crcTable: Uint32Array | null = null;

/** 디코딩된 캐릭터 JSON 데이터 정보입니다. */
export interface DecodedCharacterJson {
  /** JSON 문자열 내용 */
  jsonStr: string;
  /** 데이터 출처 (ccv3 또는 chara) */
  source: string;
}

/** PNG 파일의 tEXt 청크를 파싱하여 키-값 쌍의 레코드를 반환합니다.
 * @param buf - PNG 파일 바이너리 버퍼
 * @returns 파싱된 텍스트 청크 레코드
 */
export function parsePngTextChunks(buf: Buffer): Record<string, string> {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('유효한 PNG 파일이 아닙니다.');
  }

  const chunks: Record<string, string> = {};
  let pos = 8;

  while (pos + 12 <= buf.length) {
    const length = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);

    if (pos + 12 + length > buf.length) break;

    const data = buf.subarray(pos + 8, pos + 8 + length);
    pos += 12 + length;

    if (type === 'tEXt') {
      const nullIndex = data.indexOf(0);
      if (nullIndex >= 0) {
        const key = data.toString('ascii', 0, nullIndex);
        const value = data.toString('latin1', nullIndex + 1);
        chunks[key] = value;
      }
    }

    if (type === 'IEND') break;
  }

  return chunks;
}

/** PNG 텍스트 청크에서 캐릭터 JSON 데이터를 추출하여 디코딩합니다.
 * @param chunks - 파싱된 PNG 텍스트 청크 레코드
 * @returns 디코딩된 캐릭터 데이터 또는 null
 */
export function decodeCharacterJsonFromChunks(
  chunks: Record<string, string>,
): DecodedCharacterJson | null {
  if (chunks.ccv3) {
    return {
      jsonStr: Buffer.from(chunks.ccv3, 'base64').toString('utf-8'),
      source: 'ccv3',
    };
  }
  if (chunks.chara) {
    return {
      jsonStr: Buffer.from(chunks.chara, 'base64').toString('utf-8'),
      source: 'chara',
    };
  }
  return null;
}

/** PNG 파일에서 텍스트 관련 청크(tEXt, iTXt, zTXt)를 모두 제거합니다.
 * @param buf - 원본 PNG 파일 바이너리 버퍼
 * @returns 텍스트 청크가 제거된 PNG 바이너리 버퍼
 */
export function stripPngTextChunks(buf: Buffer): Buffer {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return buf;
  }

  const kept: Buffer[] = [PNG_SIGNATURE];
  let pos = 8;

  while (pos + 12 <= buf.length) {
    const length = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const chunkSize = 12 + length;

    if (pos + chunkSize > buf.length) break;

    if (type !== 'tEXt' && type !== 'iTXt' && type !== 'zTXt') {
      kept.push(buf.subarray(pos, pos + chunkSize));
    }

    pos += chunkSize;
    if (type === 'IEND') break;
  }

  return Buffer.concat(kept);
}

/** PNG 파일에 새로운 텍스트 청크를 작성하여 반환합니다. 기존 텍스트 청크는 제거됩니다.
 * @param pngBuf - 원본 PNG 이미지 바이너리
 * @param records - 삽입할 키-값 쌍 배열
 * @returns 새로운 텍스트 청크가 포함된 PNG 바이너리 버퍼
 */
export function writePngTextChunks(pngBuf: Uint8Array, records: Array<{ key: string; value: string }>): Buffer {
  const chunks = parseRawPngChunks(pngBuf);
  if (!chunks) {
    throw new Error('유효한 PNG 커버를 읽지 못했습니다.');
  }

  const kept = chunks.filter((chunk) => chunk.type !== 'tEXt' && chunk.type !== 'iTXt' && chunk.type !== 'zTXt' && chunk.type !== 'IEND');
  const iend = chunks.find((chunk) => chunk.type === 'IEND');
  if (!iend) {
    throw new Error('PNG IEND chunk가 없습니다.');
  }

  const out: Uint8Array[] = [PNG_SIGNATURE];
  for (const chunk of kept) out.push(encodeChunk(chunk.type, chunk.data));
  for (const record of records) out.push(encodeTextChunk(record.key, record.value));
  out.push(encodeChunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(out);
}

/**
 * Parse raw PNG chunks (type + data). Internal helper for writePngTextChunks.
 * Different from parsePngTextChunks which decodes tEXt chunks to key-value pairs.
 */
function parseRawPngChunks(buf: Uint8Array): Array<{ type: string; data: Uint8Array }> | null {
  if (!Buffer.isBuffer(buf) || buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) return null;

  let pos = 8;
  const out: Array<{ type: string; data: Uint8Array }> = [];
  while (pos + 12 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const dataStart = pos + 8;
    const dataEnd = dataStart + len;
    const crcEnd = dataEnd + 4;
    if (crcEnd > buf.length) break;
    out.push({ type, data: buf.subarray(dataStart, dataEnd) });
    pos = crcEnd;
    if (type === 'IEND') break;
  }
  return out;
}

/** tEXt 타입의 PNG 청크 바이너리를 생성합니다.
 * @param key - 청크 키
 * @param value - 청크 값
 * @returns 생성된 청크 바이너리 버퍼
 */
export function encodeTextChunk(key: string, value: string): Buffer {
  const payload = Buffer.concat([
    Buffer.from(String(key), 'latin1'),
    Buffer.from([0]),
    Buffer.from(String(value), 'latin1'),
  ]);
  return encodeChunk('tEXt', payload);
}

/** 일반적인 PNG 청크 바이너리를 생성합니다 (길이 + 타입 + 데이터 + CRC).
 * @param type - 청크 타입 (4글자)
 * @param data - 청크 데이터 바이너리
 * @returns 생성된 청크 바이너리 버퍼
 */
export function encodeChunk(type: string, data: Uint8Array): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  const crcVal = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crcVal >>> 0, 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/** 데이터에 대한 CRC32 체크섬을 계산합니다.
 * @param buf - 체크섬을 계산할 데이터 바이너리
 * @returns 계산된 CRC32 값
 */
export function crc32(buf: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let j = 0; j < 8; j += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crcTable[i] = c >>> 0;
    }
  }

  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** 입력받은 버퍼가 유효한 PNG 시그니처를 포함하고 있는지 확인합니다.
 * @param buf - 확인할 바이너리 버퍼
 * @returns PNG 파일 여부
 */
export function isPng(buf: Buffer): boolean {
  return Buffer.isBuffer(buf) && buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE);
}

/** 입력받은 버퍼가 유효한 JPEG 시그니처를 포함하고 있는지 확인합니다.
 * @param buf - 확인할 바이너리 버퍼
 * @returns JPEG 파일 여부
 */
export function isJpeg(buf: Buffer): boolean {
  return Buffer.isBuffer(buf) && buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8;
}
