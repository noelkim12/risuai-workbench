/**
 * Asset 상세 모달용 이미지 메타데이터 파서.
 * 파일정보(해상도/형식) + AI 생성정보(NAI/SD/ComfyUI)를 외부 의존성 없이 best-effort로 추출함.
 * @file packages/core/src/node/image-meta.ts
 */

import { readFileSync } from 'node:fs';

import { PNG_SIGNATURE, parsePngTextChunks } from './png';

export type ImageFormat = 'png' | 'webp' | 'jpeg' | 'unknown';
export type ImageGenerationSource = 'novelai' | 'stable-diffusion' | 'comfyui' | 'unknown';

export interface ImageFileInfo {
  readonly width: number | null;
  readonly height: number | null;
  readonly format: ImageFormat;
  readonly sizeBytes: number;
}

export interface ImageGenerationInfo {
  readonly source: ImageGenerationSource;
  readonly fields: Record<string, string>;
}

export interface ImageMeta {
  readonly info: ImageFileInfo;
  readonly generation: ImageGenerationInfo | null;
}

function stringifyJsonFields(value: Record<string, unknown>): Record<string, string> {
  const fields: Record<string, string> = {};

  for (const [key, entry] of Object.entries(value)) {
    fields[key] = typeof entry === 'string' ? entry : (JSON.stringify(entry) ?? '');
  }

  return fields;
}

function isJsonObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function tryParseJsonRecord(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return isJsonObjectRecord(parsed) ? parsed : null;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

function generationFromPngTexts(texts: Record<string, string>): ImageGenerationInfo | null {
  if (texts.parameters !== undefined && texts.parameters.length > 0) {
    return { source: 'stable-diffusion', fields: { parameters: texts.parameters } };
  }

  if (texts.Comment !== undefined) {
    const record = tryParseJsonRecord(texts.Comment);
    if (record !== null) return { source: 'novelai', fields: stringifyJsonFields(record) };
  }

  if (texts.prompt !== undefined) {
    const record = tryParseJsonRecord(texts.prompt);
    if (record !== null) return { source: 'comfyui', fields: stringifyJsonFields(record) };
  }

  return null;
}

function readPngMeta(buffer: Buffer, sizeBytes: number): ImageMeta {
  const width = buffer.length >= 24 ? buffer.readUInt32BE(16) : null;
  const height = buffer.length >= 24 ? buffer.readUInt32BE(20) : null;
  const generation = generationFromPngTexts(parsePngTextChunks(buffer));

  return { info: { width, height, format: 'png', sizeBytes }, generation };
}

function readUInt24LE(buffer: Buffer, offset: number): number | null {
  return offset + 3 <= buffer.length ? buffer.readUIntLE(offset, 3) : null;
}

function extractBalancedJson(text: string): string | null {
  const start = text.indexOf('{"');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (char === undefined) return null;

    if (inString) {
      if (char === '\\') index += 1;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }

  return null;
}

function generationFromExifChunk(buffer: Buffer, dataStart: number, chunkSize: number): ImageGenerationInfo | null {
  const json = extractBalancedJson(buffer.toString('utf-8', dataStart, dataStart + chunkSize));
  if (json === null) return null;

  const record = tryParseJsonRecord(json);
  return record === null ? null : { source: 'novelai', fields: stringifyJsonFields(record) };
}

function readWebpMeta(buffer: Buffer, sizeBytes: number): ImageMeta {
  let width: number | null = null;
  let height: number | null = null;
  let generation: ImageGenerationInfo | null = null;
  let position = 12;

  while (position + 8 <= buffer.length) {
    const fourcc = buffer.toString('ascii', position, position + 4);
    const chunkSize = buffer.readUInt32LE(position + 4);
    const dataStart = position + 8;
    const dataEnd = dataStart + chunkSize;
    if (dataEnd > buffer.length) break;

    if (fourcc === 'VP8X' && chunkSize >= 10) {
      const parsedWidth = readUInt24LE(buffer, dataStart + 4);
      const parsedHeight = readUInt24LE(buffer, dataStart + 7);
      width = parsedWidth === null ? null : parsedWidth + 1;
      height = parsedHeight === null ? null : parsedHeight + 1;
    } else if (fourcc === 'VP8 ' && chunkSize >= 10 && width === null) {
      width = buffer.readUInt16LE(dataStart + 6) & 0x3fff;
      height = buffer.readUInt16LE(dataStart + 8) & 0x3fff;
    } else if (fourcc === 'VP8L' && chunkSize >= 5 && width === null) {
      const bits = buffer.readUInt32LE(dataStart + 1);
      width = (bits & 0x3fff) + 1;
      height = ((bits >> 14) & 0x3fff) + 1;
    } else if (fourcc === 'EXIF') {
      generation = generationFromExifChunk(buffer, dataStart, chunkSize) ?? generation;
    }

    position = dataEnd + (chunkSize % 2);
  }

  return { info: { width, height, format: 'webp', sizeBytes }, generation };
}

export function readImageMetaFromBuffer(buffer: Buffer, sizeBytes: number): ImageMeta {
  if (buffer.length >= PNG_SIGNATURE.length && buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return readPngMeta(buffer, sizeBytes);
  }

  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return readWebpMeta(buffer, sizeBytes);
  }

  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    return { info: { width: null, height: null, format: 'jpeg', sizeBytes }, generation: null };
  }

  return { info: { width: null, height: null, format: 'unknown', sizeBytes }, generation: null };
}

export function readImageMeta(filePath: string): ImageMeta {
  const buffer = readFileSync(filePath);
  return readImageMetaFromBuffer(buffer, buffer.length);
}
