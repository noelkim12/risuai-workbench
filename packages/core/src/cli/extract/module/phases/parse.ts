/**
 * 모듈 입력 파일을 canonical 추출용 데이터로 파싱하는 phase.
 * @file packages/core/src/cli/extract/module/phases/parse.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseModuleRisumFull, parseModuleJson } from '../../parsers';
import type { ParsedModuleFull } from '../../parsers';
import type { ParsedModuleResult } from './types';

export function phase1_parseModule(inputPath: string): ParsedModuleResult {
  const ext = path.extname(inputPath).toLowerCase();
  const buf = fs.readFileSync(inputPath);

  console.log('\n  📦 Phase 1: 모듈 파싱');
  console.log(`     입력: ${path.basename(inputPath)} (${(buf.length / 1024).toFixed(1)} KB)`);

  if (ext === '.risum') {
    console.log('     포맷: module.risum');
    const parsed: ParsedModuleFull | null = parseModuleRisumFull(buf);
    if (!parsed) {
      throw new Error('module.risum 파싱 실패');
    }

    console.log(`     이름: ${parsed.module?.name || 'unknown'}`);
    console.log(`     ID: ${parsed.module?.id || 'unknown'}`);
    if (parsed.assetBuffers.length > 0) {
      console.log(`     에셋 버퍼: ${parsed.assetBuffers.length}개`);
    }

    return {
      module: parsed.module,
      assetBuffers: parsed.assetBuffers,
      sourceFormat: 'risum',
    };
  }

  if (ext === '.json') {
    console.log('     포맷: JSON');
    const module = parseModuleJson(buf);
    if (!module) {
      throw new Error('module.json 파싱 실패 (유효한 RisuAI module 형식이 아닙니다)');
    }

    console.log(`     이름: ${module.name || 'unknown'}`);
    console.log(`     ID: ${module.id || 'unknown'}`);

    return {
      module,
      assetBuffers: [],
      sourceFormat: 'json',
    };
  }

  throw new Error(`지원하지 않는 파일 포맷: ${ext} (지원: .risum, .json)`);
}
