/**
 * 모듈 TriggerLua 추출과 RisuLua split/recovery 연동 phase.
 * @file packages/core/src/cli/extract/module/phases/lua.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { buildLuaPath, extractLuaFromModule } from '@/domain/custom-extension/extensions/lua';
import { writeText } from '@/node';
import type { RisuLuaMode, RisuLuaRecoveryMode } from '../../../shared/lua-bundler/risulua-mode';
import {
  decodeRisuLuaRecoveryBlock,
  removeRisuLuaRecoveryBlock,
  restoreRisuLuaRecoveryFiles,
} from '../../../shared/lua-bundler/risulua-recovery';
import {
  cleanupRisuLuaSplitTemps,
  runRisuLuaSplitExtract,
  uniqueRisuLuaSplitTargetName,
  type RisuLuaDomainGenerationCliMode,
  type RisuLuaSplitCliMode,
} from '../../../shared/risulua-split';
import { resolveModuleTargetName } from './module-name';

export async function phase4_extractLua(
  module: any,
  outputDir: string,
  risuluaMode: RisuLuaMode = 'classic',
  risuluaRecovery: RisuLuaRecoveryMode = 'none',
  risuluaSplitMode: RisuLuaSplitCliMode = 'none',
  domainGeneration: RisuLuaDomainGenerationCliMode = 'validated',
): Promise<number> {
  console.log('\n  🌙 Phase 4: Lua triggerscript 추출');

  const lua =
    risuluaMode === 'modular'
      ? extractModularLuaPayload(module ?? {})
      : extractLuaFromModule(module ?? {}, 'module');
  if (lua === null) {
    console.log('     (module triggerscript 없음)');
    return 0;
  }

  const targetName = uniqueRisuLuaSplitTargetName(resolveModuleTargetName(module));
  const outPath = path.join(
    outputDir,
    risuluaMode === 'modular' ? 'lua/main.risulua' : buildLuaPath('module', targetName),
  );
  const recoveryBlock = risuluaMode === 'modular' ? decodeRisuLuaRecoveryBlock(lua) : null;
  if (recoveryBlock && risuluaRecovery !== 'none') {
    restoreRisuLuaRecoveryFiles({ outputRoot: outputDir, files: recoveryBlock.manifest.files });
    cleanupRisuLuaSplitTemps(outputDir);
    console.log(`     ✅ embedded recovery manifest -> ${path.relative('.', path.join(outputDir, 'lua'))}/`);
    return 1;
  }

  const strippedLua = removeRisuLuaRecoveryBlock(lua);
  writeText(outPath, strippedLua);
  cleanupRisuLuaSplitTemps(outputDir);
  try {
    await runRisuLuaSplitExtract({
      mode: risuluaSplitMode,
      outputRoot: outputDir,
      source: strippedLua,
      sourcePath: outPath,
      targetName,
      cwd: process.cwd(),
      domainGeneration,
      buttonActionSources: collectRegexButtonActionSources(outputDir),
    });
  } catch (error) {
    if (risuluaMode !== 'modular') throw error;

    cleanupRisuLuaSplitTemps(outputDir);
    writeText(outPath, strippedLua);
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `     ⚠️ RisuLua split failed; preserving ${path.relative('.', outPath)} as single-file Lua and continuing extract: ${message}`,
    );
  }
  console.log(`     ✅ ${path.relative('.', outPath)} -> ${lua.length} chars`);
  return 1;
}

export const phase4_extractTriggerLua = phase4_extractLua;

function collectRegexButtonActionSources(outputDir: string): Array<{ sourceFile: string; source: string }> {
  const regexDir = path.join(outputDir, 'regex');
  if (!fs.existsSync(regexDir)) return [];
  const sources: Array<{ sourceFile: string; source: string }> = [];
  for (const filePath of listRisuRegexFiles(regexDir)) {
    sources.push({ sourceFile: path.relative(outputDir, filePath), source: fs.readFileSync(filePath, 'utf8') });
  }
  return sources;
}

function listRisuRegexFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listRisuRegexFiles(fullPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.risuregex')) {
      files.push(fullPath);
    }
  }
  return files;
}

function extractModularLuaPayload(module: {
  triggerscript?: string;
  trigger?: unknown[];
}): string | null {
  if (typeof module.triggerscript === 'string') {
    return module.triggerscript;
  }

  const trigger = module.trigger;
  if (!Array.isArray(trigger) || trigger.length === 0) {
    return null;
  }

  const luaParts: string[] = [];
  for (const item of trigger) {
    const effects = (item as { effect?: unknown[] } | null | undefined)?.effect;
    if (!Array.isArray(effects)) continue;
    for (const effect of effects) {
      const candidate = effect as { type?: unknown; code?: unknown } | null | undefined;
      if (
        candidate?.type === 'triggerlua' &&
        typeof candidate.code === 'string' &&
        candidate.code.length > 0
      ) {
        luaParts.push(candidate.code);
      }
    }
  }

  return luaParts.length > 0 ? luaParts.join('\n\n') : null;
}
