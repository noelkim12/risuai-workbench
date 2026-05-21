#!/usr/bin/env node
// @ts-check
const path = require('path');

let run;
try {
  const cliModule = require(path.join(__dirname, '..', 'dist', 'cli'));
  run = cliModule.run;
  if (typeof run !== 'function') {
    throw new Error("dist/cli.js does not export a 'run' function");
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n  Failed to load risuai-workbench-mcp CLI: ${message}`);
  console.error('  Make sure to run: npm run build --workspace risuai-workbench-mcp\n');
  process.exit(1);
}

const result = run(process.argv.slice(2));
if (result && typeof result.then === 'function') {
  result
    .then((code) => {
      if (typeof code === 'number') {
        process.exit(code);
      }
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
} else if (typeof result === 'number') {
  process.exit(result);
}
