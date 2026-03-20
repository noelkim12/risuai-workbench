export const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
export const PNG_1X1_TRANSPARENT = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+3xQAAAAASUVORK5CYII=',
  'base64',
);
export const JPEG_1X1 = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBAQEA8PDw8PDw8PDw8PDw8PDw8PFREWFhURFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMsNygtLisBCgoKDQ0NDg0NDisZFRkrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrK//AABEIAAEAAQMBIgACEQEDEQH/xAAXAAEBAQEAAAAAAAAAAAAAAAAAAQID/8QAFhEBAQEAAAAAAAAAAAAAAAAAABEh/8QAFQEBAQAAAAAAAAAAAAAAAAAAAQL/xAAVEQEBAAAAAAAAAAAAAAAAAAABAP/aAAwDAQACEQMRAD8A0QAAAP/Z',
  'base64',
);

let crcTable: Uint32Array | null = null;

export interface DecodedCharacterJson {
  jsonStr: string;
  source: string;
}

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

export function encodeTextChunk(key: string, value: string): Buffer {
  const payload = Buffer.concat([
    Buffer.from(String(key), 'latin1'),
    Buffer.from([0]),
    Buffer.from(String(value), 'latin1'),
  ]);
  return encodeChunk('tEXt', payload);
}

export function encodeChunk(type: string, data: Uint8Array): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  const crcVal = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crcVal >>> 0, 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

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

export function isPng(buf: Buffer): boolean {
  return Buffer.isBuffer(buf) && buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE);
}

export function isJpeg(buf: Buffer): boolean {
  return Buffer.isBuffer(buf) && buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8;
}
