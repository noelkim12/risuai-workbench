const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

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
