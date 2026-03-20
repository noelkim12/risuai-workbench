import { runPackWorkflow as runCharacterPack } from './character/workflow';

// TODO: --type flag or auto-detect for module/preset routing
export function runPackWorkflow(argv: readonly string[]): number {
  return runCharacterPack(argv);
}
