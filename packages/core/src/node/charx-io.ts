import fs from 'node:fs';
import path from 'node:path';

import { decodeCharacterJsonFromChunks, parsePngTextChunks } from './png';

/** 캐릭터 카드 파일(.json 또는 .png)을 파싱하여 캐릭터 데이터 객체를 반환합니다.
 * @param charxPath - 캐릭터 카드 파일 경로
 * @returns 파싱된 캐릭터 데이터 객체 또는 null (실패 시)
 */
export function parseCharxFile(charxPath: string): unknown {
  const ext = path.extname(charxPath).toLowerCase();
  const buf = fs.readFileSync(charxPath);

  if (ext === '.json') {
    return JSON.parse(buf.toString('utf-8'));
  }

  if (ext === '.png') {
    let chunks: Record<string, string>;
    try {
      chunks = parsePngTextChunks(buf);
    } catch {
      console.error('  ⚠️  --charx: 유효한 PNG 파일이 아닙니다.');
      return null;
    }
    const decoded = decodeCharacterJsonFromChunks(chunks);
    if (!decoded) {
      console.error('  ⚠️  --charx: PNG에서 캐릭터 데이터를 찾을 수 없습니다.');
      return null;
    }
    try {
      return JSON.parse(decoded.jsonStr);
    } catch {
      console.error('  ⚠️  --charx: 캐릭터 데이터 JSON 파싱 실패');
      return null;
    }
  }

  console.error(`  ⚠️  --charx: 지원하지 않는 형식 (${ext}). .json 또는 .png만 지원합니다.`);
  return null;
}

export { parseCharxFile as parseCardFile };
