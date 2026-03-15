import fs from 'node:fs';
import path from 'node:path';

import { decodeCharacterJsonFromChunks, parsePngTextChunks } from './png';

export function parseCardFile(cardPath: string): unknown {
  const ext = path.extname(cardPath).toLowerCase();
  const buf = fs.readFileSync(cardPath);

  if (ext === '.json') {
    return JSON.parse(buf.toString('utf-8'));
  }

  if (ext === '.png') {
    let chunks: Record<string, string>;
    try {
      chunks = parsePngTextChunks(buf);
    } catch {
      console.error('  ⚠️  --card: 유효한 PNG 파일이 아닙니다.');
      return null;
    }
    const decoded = decodeCharacterJsonFromChunks(chunks);
    if (!decoded) {
      console.error('  ⚠️  --card: PNG에서 캐릭터 데이터를 찾을 수 없습니다.');
      return null;
    }
    try {
      return JSON.parse(decoded.jsonStr);
    } catch {
      console.error('  ⚠️  --card: 캐릭터 데이터 JSON 파싱 실패');
      return null;
    }
  }

  console.error(
    `  ⚠️  --card: 지원하지 않는 형식 (${ext}). .json 또는 .png만 지원합니다.`,
  );
  return null;
}
