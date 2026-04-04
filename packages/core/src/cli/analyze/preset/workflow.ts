const HELP_TEXT = `
  🐿️ RisuAI Preset Analyzer

  Usage:  risu-core analyze --type preset <extracted-preset-dir> [options]

  Options:
    --help, -h    Show this help
`;

/** preset analyze CLI 진입점. Phase 2에서 구현 예정. */
export function runAnalyzePresetWorkflow(argv: readonly string[]): number {
  const helpMode = argv.length === 0 || argv.includes('-h') || argv.includes('--help');

  if (helpMode) {
    console.log(HELP_TEXT);
    return 0;
  }

  console.log('  ⚠️  Preset analysis is not yet implemented.');
  return 1;
}
