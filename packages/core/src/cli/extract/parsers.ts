import fs from 'node:fs';
import path from 'node:path';
import { Unzip, UnzipInflate } from 'fflate';

let decodeMap: Buffer | null = null;

export function initRPack(): boolean {
  if (decodeMap) return true;

  const candidates = [
    path.resolve(__dirname, '..', '..', '..', 'assets', 'rpack_map.bin'),
    path.join(process.cwd(), 'assets', 'rpack_map.bin'),
  ];

  const mapPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!mapPath) {
    console.error(`  ⚠️  rpack_map.bin 없음 — module.risum 디코딩 불가 (${candidates.join(', ')})`);
    return false;
  }

  const mapData = fs.readFileSync(mapPath);
  if (mapData.length < 512) {
    console.error('  ⚠️  rpack_map.bin 손상 — module.risum 디코딩 불가');
    return false;
  }

  decodeMap = mapData.subarray(256, 512);
  return true;
}

export function decodeRPackData(data: Uint8Array): Buffer {
  if (!decodeMap) return Buffer.from(data);

  const result = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 1) {
    result[i] = decodeMap[data[i]];
  }
  return result;
}

export function parseCharx(buf: Buffer): {
  card: any;
  moduleData: Buffer | null;
  assets: Record<string, Uint8Array>;
} {
  const result = {
    card: null as any,
    moduleData: null as Buffer | null,
    assets: {} as Record<string, Uint8Array>,
  };

  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  let pendingError: Error | null = null;

  unzip.onfile = (file) => {
    const chunks: Buffer[] = [];

    file.ondata = (err, data, final) => {
      if (err) {
        pendingError = new Error(`CharX 엔트리 디코딩 실패 (${file.name}): ${err.message}`);
        return;
      }

      if (data?.length) {
        chunks.push(Buffer.from(data));
      }

      if (!final) return;

      const content = Buffer.concat(chunks);
      assignCharxEntry(result, file.name, content);
    };

    file.start();
  };

  unzip.push(new Uint8Array(buf), true);

  if (pendingError) {
    throw pendingError;
  }

  return result;
}

function assignCharxEntry(
  result: { card: any; moduleData: Buffer | null; assets: Record<string, Uint8Array> },
  filename: string,
  content: Buffer,
): void {
  if (filename === 'charx.json' || filename === 'card.json') {
    result.card = JSON.parse(content.toString('utf-8'));
    return;
  }

  if (filename === 'module.risum') {
    result.moduleData = content;
    return;
  }

  if (!filename.endsWith('.json')) {
    result.assets[filename] = content;
  }
}

export function parseModuleRisum(buf: Buffer): any | null {
  const result = parseModuleRisumFull(buf);
  return result ? result.module : null;
}

export interface ParsedModuleFull {
  module: any;
  assetBuffers: Buffer[];
}

export function parseModuleRisumFull(buf: Buffer): ParsedModuleFull | null {
  if (!initRPack()) return null;

  let pos = 0;

  const readByte = () => {
    const byte = buf[pos];
    pos += 1;
    return byte;
  };
  const readLength = () => {
    const len = buf.readUInt32LE(pos);
    pos += 4;
    return len;
  };
  const readData = (len: number) => {
    const data = buf.subarray(pos, pos + len);
    pos += len;
    return data;
  };

  const magic = readByte();
  if (magic !== 111) {
    console.error(`  ⚠️  module.risum: 잘못된 매직 넘버 (${magic}, 기대: 111)`);
    return null;
  }

  const version = readByte();
  if (version !== 0) {
    console.error(`  ⚠️  module.risum: 지원하지 않는 버전 (${version})`);
    return null;
  }

  const mainLen = readLength();
  if (pos + mainLen > buf.length) {
    console.error('  ⚠️  module.risum: 데이터 크기 불일치');
    return null;
  }

  const mainData = readData(mainLen);
  const decoded = decodeRPackData(mainData);

  let parsed: any;
  try {
    parsed = JSON.parse(decoded.toString('utf-8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  ⚠️  module.risum: JSON 파싱 실패 — ${message}`);
    return null;
  }

  if (parsed.type !== 'risuModule') {
    console.error(`  ⚠️  module.risum: 잘못된 타입 (${parsed.type})`);
    return null;
  }

  const assetBuffers: Buffer[] = [];
  while (pos < buf.length) {
    const mark = readByte();
    if (mark === 0) break;
    if (mark !== 1) {
      console.error(`  ⚠️  module.risum: 잘못된 에셋 마커 (${mark})`);
      break;
    }
    const len = readLength();
    const data = readData(len);
    assetBuffers.push(Buffer.from(decodeRPackData(data)));
  }

  return { module: parsed.module, assetBuffers };
}

export function parseModuleJson(buf: Buffer): any | null {
  let data: any;
  try {
    data = JSON.parse(buf.toString('utf-8'));
  } catch {
    return null;
  }

  if (data.type === 'risuModule' && data.module) {
    return data.module;
  }
  if (data.type === 'risuModule' && data.name && data.id) {
    return data;
  }
  if (data.name && data.id && !data.spec && !data.data?.name) {
    return data;
  }
  return null;
}

export function isModuleJson(filePath: string): boolean {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    return data.type === 'risuModule' || (data.name && data.id && !data.spec && !data.data?.name);
  } catch {
    return false;
  }
}
