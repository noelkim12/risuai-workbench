/**
 * 캐릭터 TriggerLua 추출과 RisuLua split 연동 phase.
 * @file packages/core/src/cli/extract/character/phases/lua.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { sanitizeFilename } from '@/domain';
import { ensureDir, writeText } from '@/node';
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

export async function phase4_extractTriggerLua(
  charx: any,
  outputDir: string,
  risuluaMode: RisuLuaMode = 'classic',
  risuluaRecovery: RisuLuaRecoveryMode = 'none',
  risuluaSplitMode: RisuLuaSplitCliMode = 'none',
  domainGeneration: RisuLuaDomainGenerationCliMode = 'validated',
): Promise<number> {
  console.log('\n  🌙 Phase 4: TriggerLua 추출 (canonical)');

  const luaDir = path.join(outputDir, 'lua');
  ensureDir(luaDir);

  // Get triggerscript from charx - it's an array of trigger objects, not a string
  const triggerscript = charx.data?.extensions?.risuai?.triggerscript;
  if (!triggerscript || !Array.isArray(triggerscript) || triggerscript.length === 0) {
    console.log('     (triggerscript 없음)');
    return 0;
  }

  // Extract Lua code from trigger effects
  // Each trigger has effects array, and effects with type 'triggerlua' contain Lua code
  const luaParts: string[] = [];
  for (const trigger of triggerscript) {
    if (!trigger.effect || !Array.isArray(trigger.effect)) continue;

    for (const effect of trigger.effect) {
      if (
        effect.type === 'triggerlua' &&
        typeof effect.code === 'string' &&
        effect.code.length > 0
      ) {
        // Classic mode keeps the existing contextual trigger comments.
        // Modular mode writes the upstream Lua payload body without synthetic splits/metadata.
        if (risuluaMode === 'classic' && trigger.comment) {
          luaParts.push(`-- Trigger: ${trigger.comment}`);
        }
        luaParts.push(effect.code);
        if (risuluaMode === 'classic') {
          luaParts.push(''); // Empty line between code blocks
        }
      }
    }
  }

  if (luaParts.length === 0) {
    console.log('     (triggerlua effect 없음)');
    return 0;
  }

  // Write as canonical .risulua file using the selected authoring layout.
  const charxName = charx.data?.name || 'character';
  const sanitizedName = sanitizeFilename(charxName, 'character');
  const luaFileName = risuluaMode === 'modular' ? 'main.risulua' : `${sanitizedName}.risulua`;
  const fileName = path.join(luaDir, luaFileName);
  const luaSource = risuluaMode === 'modular' ? luaParts.join('\n\n') : luaParts.join('\n');
  const recoveryBlock = risuluaMode === 'modular' ? decodeRisuLuaRecoveryBlock(luaSource) : null;
  if (recoveryBlock && risuluaRecovery !== 'none') {
    restoreRisuLuaRecoveryFiles({ outputRoot: outputDir, files: recoveryBlock.manifest.files });
    cleanupRisuLuaSplitTemps(outputDir);
    console.log(
      `     ✅ embedded recovery manifest → ${path.relative('.', path.join(outputDir, 'lua'))}/`,
    );
    return 1;
  }

  const strippedLuaSource = removeRisuLuaRecoveryBlock(luaSource);
  writeText(fileName, strippedLuaSource);
  cleanupRisuLuaSplitTemps(outputDir);
  try {
    await runRisuLuaSplitExtract({
      mode: risuluaSplitMode,
      outputRoot: outputDir,
      source: strippedLuaSource,
      sourcePath: fileName,
      targetName: uniqueRisuLuaSplitTargetName(sanitizedName),
      cwd: process.cwd(),
      domainGeneration,
      buttonActionSources: collectRegexButtonActionSources(outputDir),
    });
  } catch (error) {
    if (risuluaMode !== 'modular') throw error;

    cleanupRisuLuaSplitTemps(outputDir);
    writeText(fileName, strippedLuaSource);
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `     ⚠️ RisuLua split failed; preserving ${path.relative('.', fileName)} as single-file Lua and continuing extract: ${message}`,
    );
  }

  console.log(`     ✅ ${triggerscript.length}개 trigger → ${path.relative('.', fileName)}`);
  return 1;
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
