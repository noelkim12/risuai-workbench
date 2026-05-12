/**
 * 프리셋 입력 파일을 canonical 추출용 데이터로 파싱하는 phase.
 * @file packages/core/src/cli/extract/preset/phases/parse.ts
 */

import fs from 'node:fs';
import { createDecipheriv, createHash } from 'node:crypto';
import path from 'node:path';
import { decode as decodeMsgpack } from 'msgpackr';
import { decompressSync } from 'fflate';
import { decodeRPackData, initRPack } from '../../parsers';
import { detectPresetType, isRecord } from './shared';
import type { ParsedPreset } from './types';

export function phase1_parsePreset(inputPath: string): ParsedPreset {
  const ext = path.extname(inputPath).toLowerCase();
  const buf = fs.readFileSync(inputPath);

  console.log('\n  ⚙️  Phase 1: 프리셋 파싱');
  console.log(`     입력: ${path.basename(inputPath)} (${(buf.length / 1024).toFixed(1)} KB)`);

  if (ext === '.json' || ext === '.preset') {
    console.log(`     포맷: JSON (${ext})`);

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(buf.toString('utf-8'));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`JSON 파싱 실패: ${message}`);
    }

    const presetType = detectPresetType(data);
    const name =
      (typeof data.name === 'string' && data.name) ||
      path.basename(inputPath, ext) ||
      'Unnamed Preset';

    console.log(`     프리셋 타입: ${presetType}`);
    console.log(`     이름: ${name}`);

    return {
      raw: data,
      presetType,
      sourceFormat: ext.replace('.', ''),
      name,
      importFormat: 'native',
    };
  }

  if (ext === '.risupreset' || ext === '.risup') {
    console.log(`     포맷: Binary (${ext})`);

    const containerData = ext === '.risup' ? decodeBinaryRPack(buf, inputPath) : buf;
    const outerDecoded = decodePresetContainer(containerData, inputPath);
    const normalized = normalizeDecodedPreset(outerDecoded);
    const presetType = detectPresetType(normalized);
    const name =
      (typeof normalized.name === 'string' && normalized.name) ||
      path.basename(inputPath, ext) ||
      'Unnamed Preset';
    const importFormat =
      (typeof outerDecoded.type === 'string' && outerDecoded.type === 'preset') ||
      outerDecoded.preset !== undefined ||
      outerDecoded.pres !== undefined
        ? 'encrypted-container'
        : 'native';

    console.log(`     프리셋 타입: ${presetType}`);
    console.log(`     이름: ${name}`);

    return {
      raw: normalized,
      presetType,
      sourceFormat: ext.replace('.', ''),
      name,
      importFormat,
    };
  }

  throw new Error(`지원하지 않는 프리셋 포맷: ${ext} (지원: .json, .preset, .risupreset, .risup)`);
}

/**
 * decodeBinaryRPack 함수.
 * `.risup` 바이너리 컨테이너를 rpack map 기반으로 디코딩함.
 *
 * @param buf - 입력 파일 버퍼
 * @param inputPath - 오류 메시지에 사용할 원본 경로
 * @returns 디코딩된 컨테이너 버퍼
 */
function decodeBinaryRPack(buf: Buffer, inputPath: string): Buffer {
  if (!initRPack()) {
    throw new Error(
      `rpack_map.bin을 찾을 수 없어 ${path.basename(inputPath)} 디코딩에 실패했습니다.`,
    );
  }
  return decodeRPackData(buf);
}

/**
 * decodePresetContainer 함수.
 * 압축된 msgpack preset 컨테이너를 객체로 복원함.
 *
 * @param buf - 압축된 컨테이너 버퍼
 * @param inputPath - 오류 메시지에 사용할 원본 경로
 * @returns 디코딩된 컨테이너 객체
 */
function decodePresetContainer(buf: Buffer, inputPath: string): Record<string, unknown> {
  let decompressed: Uint8Array;
  try {
    decompressed = decompressSync(new Uint8Array(buf));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${path.basename(inputPath)} 압축 해제 실패: ${message}`);
  }

  const decoded = decodeMsgpack(Buffer.from(decompressed));
  if (!isRecord(decoded)) {
    throw new Error(`${path.basename(inputPath)} 프리셋 컨테이너가 객체가 아닙니다.`);
  }
  return decoded;
}

/**
 * normalizeDecodedPreset 함수.
 * encrypted-container 형식이면 내부 preset payload를 복호화해 원본 프리셋 객체로 정규화함.
 *
 * @param container - 디코딩된 외부 컨테이너 객체
 * @returns 추출 phase에서 읽을 normalized preset 객체
 */
function normalizeDecodedPreset(container: Record<string, unknown>): Record<string, unknown> {
  const version = container.presetVersion;
  const type = container.type;
  if ((version === 0 || version === 2) && type === 'preset') {
    const encrypted = toBufferLike(container.preset ?? container.pres);
    if (!encrypted) {
      throw new Error('암호화된 프리셋 payload가 없습니다.');
    }

    const decrypted = decryptAesGcmZeroIv(encrypted, 'risupreset');
    const decoded = decodeMsgpack(decrypted);
    if (!isRecord(decoded)) {
      throw new Error('복호화된 프리셋 데이터가 객체가 아닙니다.');
    }
    return decoded;
  }

  return container;
}

/**
 * decryptAesGcmZeroIv 함수.
 * RisuAI preset payload의 AES-GCM zero-IV 암호화를 해제함.
 *
 * @param data - auth tag가 뒤에 붙은 암호문 버퍼
 * @param keyText - sha256 key material로 사용할 문자열
 * @returns 복호화된 msgpack payload
 */
function decryptAesGcmZeroIv(data: Buffer, keyText: string): Buffer {
  if (data.length < 17) {
    throw new Error('AES-GCM payload가 너무 짧습니다.');
  }

  const key = createHash('sha256').update(keyText, 'utf-8').digest();
  const iv = Buffer.alloc(12, 0);
  const tag = data.subarray(data.length - 16);
  const ciphertext = data.subarray(0, data.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * toBufferLike 함수.
 * msgpack decode 결과의 binary-like 값을 Node Buffer로 정규화함.
 *
 * @param value - Buffer/Uint8Array/ArrayBuffer 후보 값
 * @returns 변환 가능한 Buffer 또는 null
 */
function toBufferLike(value: unknown): Buffer | null {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  return null;
}
