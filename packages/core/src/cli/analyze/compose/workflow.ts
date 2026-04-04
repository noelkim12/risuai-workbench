const HELP_TEXT = `
  🐿️ RisuAI Composition Analyzer

  Usage:  risu-core analyze --type compose <charx-dir> [--module <module-dir>...] [--preset <preset-dir>]

  Options:
    --module <dir>    Add a module directory (repeatable)
    --preset <dir>    Add a preset directory
    --help, -h        Show this help
`;

/** compose analyze CLI 진입점. Phase 5에서 구현 예정. */
export function runAnalyzeComposeWorkflow(argv: readonly string[]): number {
  const helpMode = argv.length === 0 || argv.includes('-h') || argv.includes('--help');

  if (helpMode) {
    console.log(HELP_TEXT);
    return 0;
  }

  console.log('  ⚠️  Composition analysis is not yet implemented.');
  return 1;
}
