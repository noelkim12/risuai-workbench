import path from 'node:path';
import { runExtractWorkflow as runCharacterExtract } from './character/workflow';
import { runExtractWorkflow as runPresetExtract, isPresetFile } from './preset/workflow';
import { runExtractWorkflow as runModuleExtract, isModuleFile } from './module/workflow';
import { isModuleJson } from './parsers';

const PRESET_ONLY_EXTENSIONS = new Set(['.preset', '.risupreset', '.risup']);
const MODULE_ONLY_EXTENSIONS = new Set(['.risum']);

export function runExtractWorkflow(argv: readonly string[]): number {
  const typeIdx = argv.indexOf('--type');
  const typeArg = typeIdx >= 0 ? argv[typeIdx + 1] : null;
  const stripType = (v: string) => v !== '--type' && v !== typeArg;

  if (typeArg === 'module') {
    return runModuleExtract(argv.filter(stripType));
  }

  if (typeArg === 'preset') {
    return runPresetExtract(argv.filter(stripType));
  }

  if (typeArg === 'character') {
    return runCharacterExtract(argv.filter(stripType));
  }

  const filePath = argv.find(
    (v) =>
      !v.startsWith('-') &&
      v !== typeArg &&
      v !== '--type' &&
      v !== '--out' &&
      !isOptionValue(argv, v),
  );

  if (filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (MODULE_ONLY_EXTENSIONS.has(ext)) {
      return runModuleExtract(argv);
    }
    if (PRESET_ONLY_EXTENSIONS.has(ext)) {
      return runPresetExtract(argv);
    }
    if (ext === '.json') {
      if (isModuleJson(filePath)) {
        return runModuleExtract(argv);
      }
      if (isPresetFile(filePath)) {
        return runPresetExtract(argv);
      }
    }
  }

  return runCharacterExtract(argv);
}

function isOptionValue(argv: readonly string[], value: string): boolean {
  const idx = argv.indexOf(value);
  if (idx <= 0) return false;
  const prev = argv[idx - 1];
  return prev === '--out' || prev === '--type';
}
