import path from 'node:path';
import { runExtractWorkflow as runCharacterExtract } from './character/workflow';
import { runExtractWorkflow as runPresetExtract, isPresetFile } from './preset/workflow';
import { runExtractWorkflow as runModuleExtract } from './module/workflow';
import { isModuleJson } from './parsers';
import { parseRisuLuaMode } from '../shared/lua-bundler/risulua-mode';

const PRESET_ONLY_EXTENSIONS = new Set(['.preset', '.risupreset', '.risup']);
const MODULE_ONLY_EXTENSIONS = new Set(['.risum']);

export async function runExtractWorkflow(argv: readonly string[]): Promise<number> {
  // Validate and strip --risulua-mode at router level
  const { strippedArgv } = parseRisuLuaMode(argv);

  const typeIdx = strippedArgv.indexOf('--type');
  const typeArg = typeIdx >= 0 ? strippedArgv[typeIdx + 1] : null;
  const stripType = (v: string) => v !== '--type' && v !== typeArg;

  if (typeArg === 'module') {
    return await runModuleExtract(argv.filter(stripType));
  }

  if (typeArg === 'preset') {
    return runPresetExtract(strippedArgv.filter(stripType));
  }

  if (typeArg === 'character') {
    return await runCharacterExtract(argv.filter(stripType));
  }

  const filePath = strippedArgv.find(
    (v) =>
      !v.startsWith('-') &&
      v !== typeArg &&
      v !== '--type' &&
      v !== '--out' &&
      !isOptionValue(strippedArgv, v),
  );

  if (filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (MODULE_ONLY_EXTENSIONS.has(ext)) {
      return await runModuleExtract(argv);
    }
    if (PRESET_ONLY_EXTENSIONS.has(ext)) {
      return runPresetExtract(strippedArgv);
    }
    if (ext === '.json') {
      if (isModuleJson(filePath)) {
        return await runModuleExtract(argv);
      }
      if (isPresetFile(filePath)) {
        return runPresetExtract(strippedArgv);
      }
    }
  }

  return await runCharacterExtract(argv);
}

function isOptionValue(argv: readonly string[], value: string): boolean {
  const idx = argv.indexOf(value);
  if (idx <= 0) return false;
  const prev = argv[idx - 1];
  return prev === '--out' || prev === '--type';
}
