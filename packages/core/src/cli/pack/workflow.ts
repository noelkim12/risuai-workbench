import { runPackWorkflow as runCharacterPack } from './character/workflow';
import { runPackWorkflow as runModulePack } from './module/workflow';
import { runPackWorkflow as runPresetPack } from './preset/workflow';
import { parseRisuLuaMode } from '../shared/lua-bundler/risulua-mode';

export function runPackWorkflow(argv: readonly string[]): number {
  // Validate and strip --risulua-mode at router level
  const { strippedArgv } = parseRisuLuaMode(argv);

  const formatArg = getArgValue(strippedArgv, '--format')?.toLowerCase();
  if (formatArg === 'preset') {
    // Strip --format preset from argv since preset packer uses --format for output type (json/risup)
    const filteredArgv = stripArg(strippedArgv, '--format');
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
