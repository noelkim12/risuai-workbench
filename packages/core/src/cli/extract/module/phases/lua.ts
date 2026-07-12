/**
 * 모듈 TriggerLua 추출과 RisuLua split/recovery 연동 phase.
 * @file packages/core/src/cli/extract/module/phases/lua.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { buildLuaPath, extractLuaFromModule } from '@/domain/custom-extension/extensions/lua';
import { writeText } from '@/node';
import { getErrorMessage } from '../../../shared';
import type { RisuLuaMode, RisuLuaRecoveryMode } from '../../../shared/lua-bundler/risulua-mode';
import {
  decodeRisuLuaRecoveryBlock,
  decodeRisuLuaRecoveryPayload,
  removeRisuLuaRecoveryBlock,
  RisuLuaRecoveryError,
  restoreRisuLuaRecoveryFiles,
} from '../../../shared/lua-bundler/risulua-recovery';
import {
  filterRisuLuaRecoveryAssetPairs,
  isRisuLuaRecoveryRisumAssetTuple,
} from '../../../shared/lua-bundler/risulua-recovery-asset';
import {
  cleanupRisuLuaSplitTemps,
  runRisuLuaSplitExtract,
  uniqueRisuLuaSplitTargetName,
  type RisuLuaDomainGenerationCliMode,
  type RisuLuaSplitCliMode,
} from '../../../shared/risulua-split';
import { resolveModuleTargetName } from './module-name';

const RISULUA_SPLIT_FALLBACK_PATHS = [
  'docs/domain-candidates.json',
  'docs/refactor-map.json',
  'docs/risulua-button-action-index.json',
  'docs/risulua-export-manifest.json',
  'docs/risulua-split-plan.json',
  'docs/risulua-split-report.md',
  'dist',
  'legacy',
] as const;

export type ModuleRisuLuaRecoveryAssets = {
  readonly moduleAssets: readonly unknown[];
  readonly assetBuffers: readonly (Buffer | null | undefined)[];
};

export async function phase4_extractLua(
  module: any,
  outputDir: string,
  risuluaMode: RisuLuaMode = 'classic',
  risuluaRecovery: RisuLuaRecoveryMode = 'none',
  risuluaSplitMode: RisuLuaSplitCliMode = 'none',
  domainGeneration: RisuLuaDomainGenerationCliMode = 'validated',
  recoveryAssets?: ModuleRisuLuaRecoveryAssets,
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
  if (risuluaMode === 'modular' && risuluaRecovery !== 'none') {
    const recoveredFromAsset = restoreRisuLuaRecoveryAsset({ outputDir, recoveryAssets });
    if (recoveredFromAsset) {
      cleanupRisuLuaSplitTemps(outputDir);
      console.log(
        `     ✅ asset recovery manifest -> ${path.relative('.', path.join(outputDir, 'lua'))}/`,
      );
      return 1;
    }
  }

  const recoveryBlock = risuluaMode === 'modular' ? decodeRisuLuaRecoveryBlock(lua) : null;
  if (recoveryBlock && risuluaRecovery !== 'none') {
    restoreRisuLuaRecoveryFiles({ outputRoot: outputDir, files: recoveryBlock.manifest.files });
    cleanupRisuLuaSplitTemps(outputDir);
    console.log(
      `     ✅ embedded recovery manifest -> ${path.relative('.', path.join(outputDir, 'lua'))}/`,
    );
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
    cleanupRisuLuaSplitFallbackArtifacts(outputDir);
    writeText(outPath, strippedLua);
    const message = getErrorMessage(error);
    console.warn(
      `     ⚠️ RisuLua split failed; preserving ${path.relative('.', outPath)} as single-file Lua and continuing extract: ${message}`,
    );
  }
  console.log(`     ✅ ${path.relative('.', outPath)} -> ${lua.length} chars`);
  return 1;
}

function cleanupRisuLuaSplitFallbackArtifacts(outputDir: string): void {
  for (const relativePath of RISULUA_SPLIT_FALLBACK_PATHS) {
    fs.rmSync(path.join(outputDir, ...relativePath.split('/')), { recursive: true, force: true });
  }
}

export const phase4_extractTriggerLua = phase4_extractLua;

function restoreRisuLuaRecoveryAsset(options: {
  readonly outputDir: string;
  readonly recoveryAssets: ModuleRisuLuaRecoveryAssets | undefined;
}): boolean {
  const recoveryAssets = options.recoveryAssets;
  if (recoveryAssets === undefined) return false;

  const result = filterRisuLuaRecoveryAssetPairs(
    recoveryAssets.moduleAssets,
    recoveryAssets.assetBuffers,
    isRisuLuaRecoveryRisumAssetTuple,
  );
  if (result.status === 'no-match') return false;

  const firstPair = result.removedPairs[0];
  if (firstPair === undefined) {
    throw new RisuLuaRecoveryError('Matched RISUM recovery asset tuple was not available');
  }

  const buffer = firstPair.buffer;
  if (buffer === null || buffer === undefined) {
    throw new RisuLuaRecoveryError(
      `Missing RISUM recovery asset buffer at module.assets[${firstPair.index}]`,
    );
  }

  const manifest = decodeRisuLuaRecoveryPayload(buffer);
  restoreRisuLuaRecoveryFiles({ outputRoot: options.outputDir, files: manifest.files });
  return true;
}

function collectRegexButtonActionSources(
  outputDir: string,
): Array<{ sourceFile: string; source: string }> {
  const regexDir = path.join(outputDir, 'regex');
  if (!fs.existsSync(regexDir)) return [];
  const sources: Array<{ sourceFile: string; source: string }> = [];
  for (const filePath of listRisuRegexFiles(regexDir)) {
    sources.push({
      sourceFile: path.relative(outputDir, filePath),
      source: fs.readFileSync(filePath, 'utf8'),
    });
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
