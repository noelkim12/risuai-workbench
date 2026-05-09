import { runPackWorkflow as runCharacterPack } from './character/workflow';
import { runPackWorkflow as runModulePack } from './module/workflow';
import { runPackWorkflow as runPresetPack } from './preset/workflow';
import { parseRisuLuaMode, parseRisuLuaRecoveryMode } from '../shared/lua-bundler/risulua-mode';

export function runPackWorkflow(argv: readonly string[]): number {
  // Validate and strip --risulua-mode / --risulua-recovery at router level
  // so format routing never treats their values as pack inputs.
  let modeResult: ReturnType<typeof parseRisuLuaMode>;
  let recoveryResult: ReturnType<typeof parseRisuLuaRecoveryMode>;
  try {
    modeResult = parseRisuLuaMode(argv);
    recoveryResult = parseRisuLuaRecoveryMode(modeResult.strippedArgv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n  ❌ ${message}\n`);
    return 1;
  }

  const formatArg = getArgValue(recoveryResult.strippedArgv, '--format')?.toLowerCase();
  if (formatArg === 'preset') {
    // Strip --format preset from argv since preset packer uses --format for output type (json/risup)
    const filteredArgv = stripArg(recoveryResult.strippedArgv, '--format');
    return runPresetPack(filteredArgv);
  }
  if (formatArg === 'module') {
    // Strip --format module from argv since module packer uses --format for output type (json/risum)
    const filteredArgv = stripArg(argv, '--format');
    return runModulePack(filteredArgv);
  }

  return runCharacterPack(argv);
}

function getArgValue(argv: readonly string[], name: string): string | null {
  const index = argv.indexOf(name);
  if (index < 0) return null;
  return argv[index + 1] ?? null;
}

function stripArg(argv: readonly string[], name: string): string[] {
  const index = argv.indexOf(name);
  if (index < 0) return [...argv];
  const result = [...argv];
  result.splice(index, 2); // Remove arg and its value
  return result;
}
