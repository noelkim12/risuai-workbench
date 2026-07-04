import { describe, expect, it } from 'vitest';

import { readImageMetaFromBuffer } from '../src/node/image-meta';

function buildPng(width: number, height: number, texts: Record<string, string>): Buffer {
  const chunks: Buffer[] = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])];

  const pushChunk = (type: string, data: Buffer): void => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const typeBuffer = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    chunks.push(length, typeBuffer, data, crc);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  pushChunk('IHDR', ihdr);

  for (const [key, value] of Object.entries(texts)) {
    pushChunk(
      'tEXt',
      Buffer.concat([Buffer.from(key, 'ascii'), Buffer.from([0]), Buffer.from(value, 'latin1')]),
    );
  }

  pushChunk('IEND', Buffer.alloc(0));
  return Buffer.concat(chunks);
}

function buildWebpChunk(fourcc: string, data: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.write(fourcc, 0, 'ascii');
  header.writeUInt32LE(data.length, 4);
  const padded = data.length % 2 === 1 ? Buffer.concat([data, Buffer.from([0])]) : data;
  return Buffer.concat([header, padded]);
}

function buildWebp(chunks: readonly Buffer[]): Buffer {
  const payload = Buffer.concat([Buffer.from('WEBP', 'ascii'), ...chunks]);
  const riff = Buffer.alloc(8);
  riff.write('RIFF', 0, 'ascii');
  riff.writeUInt32LE(payload.length, 4);
  return Buffer.concat([riff, payload]);
}

function buildWebpVp8x(width: number, height: number, exifJson?: string): Buffer {
  const vp8x = Buffer.alloc(10);
  vp8x.writeUIntLE(width - 1, 4, 3);
  vp8x.writeUIntLE(height - 1, 7, 3);
  const chunks: Buffer[] = [buildWebpChunk('VP8X', vp8x)];

  if (exifJson !== undefined) {
    chunks.push(
      buildWebpChunk('EXIF', Buffer.concat([Buffer.from('Exif\0\0II'), Buffer.from(exifJson, 'utf-8')])),
    );
  }

  return buildWebp(chunks);
}

function buildWebpVp8(width: number, height: number): Buffer {
  const vp8 = Buffer.alloc(10);
  vp8.writeUInt16LE(width & 0x3fff, 6);
  vp8.writeUInt16LE(height & 0x3fff, 8);
  return buildWebp([buildWebpChunk('VP8 ', vp8)]);
}

function buildWebpVp8l(width: number, height: number): Buffer {
  const vp8l = Buffer.alloc(5);
  vp8l[0] = 0x2f;
  vp8l.writeUInt32LE((width - 1) | ((height - 1) << 14), 1);
  return buildWebp([buildWebpChunk('VP8L', vp8l)]);
}

describe('readImageMetaFromBuffer', () => {
  it('reads PNG dimensions and stable-diffusion parameters', () => {
    const png = buildPng(1024, 1536, {
      parameters: '1girl, masterpiece\nNegative prompt: lowres\nSeed: 42',
    });

    const meta = readImageMetaFromBuffer(png, png.length);

    expect(meta.info).toMatchObject({ width: 1024, height: 1536, format: 'png' });
    expect(meta.info.sizeBytes).toBe(png.length);
    expect(meta.generation?.source).toBe('stable-diffusion');
    expect(meta.generation?.fields.parameters).toContain('Seed: 42');
  });

  it('parses NovelAI PNG Comment JSON into fields', () => {
    const comment = JSON.stringify({ prompt: '1girl', steps: 28, seed: 1234 });
    const png = buildPng(64, 64, { Comment: comment, Software: 'NovelAI' });

    const meta = readImageMetaFromBuffer(png, png.length);

    expect(meta.generation?.source).toBe('novelai');
    expect(meta.generation?.fields.prompt).toBe('1girl');
    expect(meta.generation?.fields.seed).toBe('1234');
  });

  it('parses ComfyUI PNG prompt JSON into fields', () => {
    const prompt = JSON.stringify({ node: { inputs: { text: 'sky' } } });
    const png = buildPng(320, 240, { prompt });

    const meta = readImageMetaFromBuffer(png, png.length);

    expect(meta.generation?.source).toBe('comfyui');
    expect(meta.generation?.fields.node).toBe(JSON.stringify({ inputs: { text: 'sky' } }));
  });

  it('reads WebP VP8X dimensions and embedded EXIF JSON', () => {
    const webp = buildWebpVp8x(1216, 832, JSON.stringify({ prompt: 'catgirl', sampler: 'k_euler' }));

    const meta = readImageMetaFromBuffer(webp, webp.length);

    expect(meta.info).toMatchObject({ width: 1216, height: 832, format: 'webp' });
    expect(meta.generation?.source).toBe('novelai');
    expect(meta.generation?.fields.prompt).toBe('catgirl');
  });

  it('reads WebP VP8 and VP8L dimensions', () => {
    expect(readImageMetaFromBuffer(buildWebpVp8(640, 480), 100).info).toMatchObject({
      width: 640,
      height: 480,
      format: 'webp',
    });
    expect(readImageMetaFromBuffer(buildWebpVp8l(512, 768), 200).info).toMatchObject({
      width: 512,
      height: 768,
      format: 'webp',
    });
  });

  it('returns null generation for plain images and unknown formats', () => {
    const png = buildPng(8, 8, {});
    const junk = Buffer.from('not an image');

    const meta = readImageMetaFromBuffer(junk, junk.length);

    expect(readImageMetaFromBuffer(png, png.length).generation).toBeNull();
    expect(meta.info.format).toBe('unknown');
    expect(meta.info.width).toBeNull();
    expect(meta.generation).toBeNull();
  });

  it('detects JPEG format without dimensions or generation metadata', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

    const meta = readImageMetaFromBuffer(jpeg, jpeg.length);

    expect(meta.info).toEqual({ width: null, height: null, format: 'jpeg', sizeBytes: jpeg.length });
    expect(meta.generation).toBeNull();
  });
});
