/**
 * 캐릭터 입력 파일을 canonical 추출용 데이터로 파싱하는 phase 모음.
 * @file packages/core/src/cli/extract/character/phases/parse.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { parsePngChunks, stripPngTextChunks } from '@/node';
import { getErrorMessage } from '../../../shared';
import { parseCharx, parseCharxAsync, parseModuleRisum } from '../../parsers';
import type { ParsedCharacterResult } from './types';

/**
 * RisuAI의 .jpg/.jpeg 캐릭터 카드에서 ZIP 아카이브 부분만 추출.
 * RisuAI는 JPEG CharX 하이브리드를 [JPEG 이미지 바이트][ZIP 아카이브] 형태로 저장한다.
 * ZIP은 항상 Local File Header 시그니처(PK\x03\x04)로 시작하므로 첫 출현 위치까지 잘라낸다.
 */
function extractZipFromJpegHybrid(buf: Buffer): Buffer {
  const ZIP_LOCAL_FILE_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  const zipStart = buf.indexOf(ZIP_LOCAL_FILE_HEADER);
  if (zipStart < 0) {
    throw new Error('JPEG 파일에서 CharX ZIP 아카이브를 찾을 수 없습니다 (RisuAI JPEG 하이브리드가 아닐 수 있음).');
  }
  return buf.subarray(zipStart);
}

export function phase1_parseCharx(inputPath: string): ParsedCharacterResult {
  const ext = path.extname(inputPath).toLowerCase();
  const buf = fs.readFileSync(inputPath);

  console.log('\n  📦 Phase 1: 캐릭터 카드 파싱');
  console.log(`     입력: ${path.basename(inputPath)} (${(buf.length / 1024).toFixed(1)} KB)`);

  if (ext === '.charx' || ext === '.jpg' || ext === '.jpeg') {
    const isJpegHybrid = ext === '.jpg' || ext === '.jpeg';
    const zipBuf = isJpegHybrid ? extractZipFromJpegHybrid(buf) : buf;

    console.log(
      isJpegHybrid ? '     포맷: JPEG+ZIP 하이브리드 (CharX)' : '     포맷: CharX (ZIP)',
    );
    const { card: charx, moduleData, assets } = parseCharx(zipBuf);
    if (!charx) {
      throw new Error('charx.json을 찾을 수 없습니다.');
    }

    console.log(`     spec: ${charx.spec || 'unknown'}`);
    console.log(`     이름: ${charx.data?.name || 'unknown'}`);

    if (moduleData) {
      console.log(`     module.risum: ${(moduleData.length / 1024).toFixed(1)} KB`);
      const mod = parseModuleRisum(moduleData);
      if (mod) {
        console.log(`     모듈 이름: ${mod.name || 'unknown'}`);

        charx.data = charx.data || {};
        charx.data.extensions = charx.data.extensions || {};
        charx.data.extensions.risuai = charx.data.extensions.risuai || {};

        if (mod.trigger && mod.trigger.length > 0) {
          charx.data.extensions.risuai.triggerscript = mod.trigger;
          console.log(`     triggerscript: ${mod.trigger.length}개 병합됨`);
        }

        if (mod.regex && mod.regex.length > 0) {
          charx.data.extensions.risuai.customScripts = mod.regex;
          console.log(`     customScripts: ${mod.regex.length}개 병합됨`);
        }

        if (mod.lorebook && mod.lorebook.length > 0) {
          charx.data.extensions.risuai._moduleLorebook = mod.lorebook;
          console.log(`     lorebook (module): ${mod.lorebook.length}개 병합됨`);
        }

        if (typeof mod.customModuleToggle === 'string') {
          charx.data.extensions.risuai.toggles = mod.customModuleToggle;
          console.log('     toggles: module.risum에서 병합됨');
        }
      }
    }

    const assetCount = Object.keys(assets).length;
    if (assetCount > 0) {
      console.log(`     에셋: ${assetCount}개`);
    }

    return { charx, assetSources: assets, mainImage: null };
  }

  if (ext === '.png') {
    console.log('     포맷: PNG');
    const chunks = parsePngChunks(buf);
    const keys = Object.keys(chunks);
    console.log(`     tEXt 청크: ${keys.join(', ') || '(없음)'}`);

    const assetSources: Record<string, Uint8Array> = {};
    const assetChunkRe = /^chara-ext-asset_:?(\d+)$/;
    for (const key of Object.keys(chunks)) {
      const match = assetChunkRe.exec(key);
      if (match) {
        assetSources[match[1]] = Buffer.from(chunks[key], 'base64');
      }
    }

    let jsonStr: string | null = null;
    if (chunks.ccv3) {
      jsonStr = Buffer.from(chunks.ccv3, 'base64').toString('utf-8');
      console.log('     사용 청크: ccv3 (V3)');
    } else if (chunks.chara) {
      jsonStr = Buffer.from(chunks.chara, 'base64').toString('utf-8');
      console.log('     사용 청크: chara (V2)');
    }

    if (!jsonStr) {
      throw new Error('캐릭터 데이터 청크를 찾을 수 없습니다 (chara/ccv3).');
    }

    let charx: any;
    try {
      charx = JSON.parse(jsonStr);
    } catch (error) {
      const message = getErrorMessage(error);
      throw new Error(`JSON 파싱 실패: ${message}`);
    }

    console.log(`     spec: ${charx.spec || 'unknown'}`);
    console.log(`     이름: ${charx.data?.name || charx.name || 'unknown'}`);

    return { charx, assetSources, mainImage: stripPngTextChunks(buf) };
  }

  if (ext === '.json') {
    console.log('     포맷: JSON');
    const charx = JSON.parse(buf.toString('utf-8'));
    console.log(`     spec: ${charx.spec || 'unknown'}`);
    console.log(`     이름: ${charx.data?.name || charx.name || 'unknown'}`);
    return { charx, assetSources: {}, mainImage: null };
  }

  throw new Error(`지원하지 않는 파일 포맷: ${ext} (지원: .charx, .png, .jpg, .jpeg, .json)`);
}

/** phase1_parseCharx의 async 버전 — .charx ZIP 해제에 fflate async unzip 사용 (worker_threads) */
export async function phase1_parseCharxAsync(inputPath: string): Promise<ParsedCharacterResult> {
  const ext = path.extname(inputPath).toLowerCase();
  const buf = fs.readFileSync(inputPath);

  console.log('\n  📦 Phase 1: 캐릭터 카드 파싱');
  console.log(`     입력: ${path.basename(inputPath)} (${(buf.length / 1024).toFixed(1)} KB)`);

  if (ext === '.charx' || ext === '.jpg' || ext === '.jpeg') {
    const isJpegHybrid = ext === '.jpg' || ext === '.jpeg';
    const zipBuf = isJpegHybrid ? extractZipFromJpegHybrid(buf) : buf;

    console.log(
      isJpegHybrid
        ? '     포맷: JPEG+ZIP 하이브리드 (CharX) — async unzip'
        : '     포맷: CharX (ZIP) — async unzip',
    );
    const { card: charx, moduleData, assets } = await parseCharxAsync(zipBuf);
    if (!charx) {
      throw new Error('charx.json을 찾을 수 없습니다.');
    }

    console.log(`     spec: ${charx.spec || 'unknown'}`);
    console.log(`     이름: ${charx.data?.name || 'unknown'}`);

    if (moduleData) {
      console.log(`     module.risum: ${(moduleData.length / 1024).toFixed(1)} KB`);
      const mod = parseModuleRisum(moduleData);
      if (mod) {
        console.log(`     모듈 이름: ${mod.name || 'unknown'}`);

        charx.data = charx.data || {};
        charx.data.extensions = charx.data.extensions || {};
        charx.data.extensions.risuai = charx.data.extensions.risuai || {};

        if (mod.trigger && mod.trigger.length > 0) {
          charx.data.extensions.risuai.triggerscript = mod.trigger;
          console.log(`     triggerscript: ${mod.trigger.length}개 병합됨`);
        }

        if (mod.regex && mod.regex.length > 0) {
          charx.data.extensions.risuai.customScripts = mod.regex;
          console.log(`     customScripts: ${mod.regex.length}개 병합됨`);
        }

        if (mod.lorebook && mod.lorebook.length > 0) {
          charx.data.extensions.risuai._moduleLorebook = mod.lorebook;
          console.log(`     lorebook (module): ${mod.lorebook.length}개 병합됨`);
        }

        if (typeof mod.customModuleToggle === 'string') {
          charx.data.extensions.risuai.toggles = mod.customModuleToggle;
          console.log('     toggles: module.risum에서 병합됨');
        }
      }
    }

    const assetCount = Object.keys(assets).length;
    if (assetCount > 0) {
      console.log(`     에셋: ${assetCount}개`);
    }

    return { charx, assetSources: assets, mainImage: null };
  }

  // PNG와 JSON은 ZIP 해제가 없으므로 sync와 동일
  return phase1_parseCharx(inputPath);
}
