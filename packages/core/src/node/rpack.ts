import fs from 'node:fs';
import path from 'node:path';

let rpackEncodeMap: Buffer | null = null;

/** RisuAI 모듈 객체를 .risum 바이너리 포맷으로 인코딩합니다.
 * @param moduleObj - 인코딩할 모듈 데이터 객체
 * @returns 인코딩된 .risum 바이너리 버퍼
 */
export function encodeModuleRisum(moduleObj: Record<string, unknown>): Buffer {
  const payload = Buffer.from(
    JSON.stringify({ module: moduleObj, type: 'risuModule' }, null, 2),
    'utf-8',
  );
  const encodedMain = encodeRPack(payload);

  const out: Buffer[] = [];
  out.push(Buffer.from([111, 0]));
  const len = Buffer.alloc(4);
  len.writeUInt32LE(encodedMain.length, 0);
  out.push(len);
  out.push(encodedMain);
  out.push(Buffer.from([0]));
  return Buffer.concat(out);
}

/** 데이터를 RPack 포맷으로 인코딩합니다. rpack_map.bin을 사용하여 바이트 치환을 수행합니다.
 * @param data - 인코딩할 데이터 (Buffer 또는 문자열)
 * @returns RPack 인코딩된 바이너리 버퍼
 */
export function encodeRPack(data: Buffer | string): Buffer {
  const map = loadRPackEncodeMap();
  const src = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const out = Buffer.alloc(src.length);
  for (let i = 0; i < src.length; i += 1) {
    out[i] = map[src[i]];
  }
  return out;
}

/** RPack 인코딩에 필요한 변환 맵(rpack_map.bin)을 로드합니다.
 * @returns 256바이트 크기의 인코딩 맵 버퍼
 */
export function loadRPackEncodeMap(): Buffer {
  if (rpackEncodeMap) return rpackEncodeMap;

  const candidates = [
    path.join(__dirname, 'rpack_map.bin'),
    path.resolve(__dirname, '..', '..', '..', 'assets', 'rpack_map.bin'),
    path.join(process.cwd(), 'assets', 'rpack_map.bin'),
  ];

  const mapPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!mapPath) {
    throw new Error(`rpack_map.bin을 찾을 수 없습니다: ${candidates.join(', ')}`);
  }

  const data = fs.readFileSync(mapPath);
  if (data.length < 512) {
    throw new Error(`rpack_map.bin이 손상되었습니다: ${mapPath}`);
  }

  rpackEncodeMap = data.subarray(0, 256);
  return rpackEncodeMap;
}
