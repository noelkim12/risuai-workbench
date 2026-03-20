import fs from 'node:fs';
import path from 'node:path';
import { toPosix } from '../../domain/lorebook/folders';
import { sanitizeFilename } from '../../domain/card/filenames';
import {
  listJsonFilesRecursive,
  listJsonFilesFlat,
  resolveOrderedFiles,
  readJson,
  isDir,
} from '../../node/json-listing';

export const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
export const PNG_1X1_TRANSPARENT = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+3xQAAAAASUVORK5CYII=',
  'base64',
);
export const JPEG_1X1 = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBAQEA8PDw8PDw8PDw8PDw8PDw8PFREWFhURFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMsNygtLisBCgoKDQ0NDg0NDisZFRkrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrK//AABEIAAEAAQMBIgACEQEDEQH/xAAXAAEBAQEAAAAAAAAAAAAAAAAAAQID/8QAFhEBAQEAAAAAAAAAAAAAAAAAABEh/8QAFQEBAQAAAAAAAAAAAAAAAAAAAQL/xAAVEQEBAAAAAAAAAAAAAAAAAAABAP/aAAwDAQACEQMRAD8A0QAAAP/Z',
  'base64',
);

let rpackEncodeMap: Buffer | null = null;
let crcTable: Uint32Array | null = null;

export function argValue(argv: readonly string[], name: string): string | null {
  const idx = argv.indexOf(name);
  if (idx < 0) return null;
  return argv[idx + 1] || null;
}

export function encodeModuleRisum(moduleObj: Record<string, unknown>): Buffer {
  const payload = Buffer.from(JSON.stringify({ module: moduleObj, type: 'risuModule' }, null, 2), 'utf-8');
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

export function encodeRPack(data: Buffer | string): Buffer {
  const map = loadRPackEncodeMap();
  const src = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const out = Buffer.alloc(src.length);
  for (let i = 0; i < src.length; i += 1) {
    out[i] = map[src[i]];
  }
  return out;
}

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

export function writePngTextChunks(pngBuf: Uint8Array, records: Array<{ key: string; value: string }>): Buffer {
  const chunks = parsePngChunks(pngBuf);
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

export function parsePngChunks(buf: Uint8Array): Array<{ type: string; data: Uint8Array }> | null {
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

export { listJsonFilesRecursive, listJsonFilesFlat, resolveOrderedFiles, readJson, isDir };

export function setNestedValue(root: any, keys: string[], value: unknown): void {
  let cur = root;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i];
    if (!cur[key] || typeof cur[key] !== 'object' || Array.isArray(cur[key])) {
      cur[key] = {};
    }
    cur = cur[key];
  }
  cur[keys[keys.length - 1]] = value;
}

export function classifyAssetExt(extValue: string): string {
  const ext = normalizeExt(extValue);
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg'].includes(ext)) return 'image';
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext)) return 'audio';
  if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) return 'video';
  if (['otf', 'ttf', 'woff', 'woff2'].includes(ext)) return 'fonts';
  if (['mmd', 'obj', 'fbx', 'glb', 'gltf'].includes(ext)) return 'model';
  if (['js', 'ts', 'lua', 'json', 'py'].includes(ext)) return 'code';
  if (['safetensors', 'ckpt', 'onnx'].includes(ext)) return 'ai';
  return 'other';
}

export function normalizeExt(extValue: string): string {
  return String(extValue || 'bin').toLowerCase().replace(/^\./, '') || 'bin';
}

export { toPosix, sanitizeFilename };

export function fromPosix(value: string): string {
  return value.split('/').join(path.sep);
}

export function isPng(buf: Buffer): boolean {
  return Buffer.isBuffer(buf) && buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE);
}

export function isJpeg(buf: Buffer): boolean {
  return Buffer.isBuffer(buf) && buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8;
}
