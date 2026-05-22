import { runPackWorkflow as runCharacterPack } from './character/workflow';
import { runPackWorkflow as runModulePack } from './module/workflow';
import { runPackWorkflow as runPresetPack } from './preset/workflow';
import { argValue, getErrorMessage, stripArg } from '../shared';
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
    const message = getErrorMessage(error);
    console.error(`\n  ❌ ${message}\n`);
    return 1;
  }

  const formatArg = argValue(recoveryResult.strippedArgv, '--format')?.toLowerCase();
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
