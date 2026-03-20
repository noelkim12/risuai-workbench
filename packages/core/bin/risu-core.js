#!/usr/bin/env node
// @ts-check
const path = require("path");

// Load the compiled CLI dispatcher from dist/cli/main.js
let run;
try {
  const mainModule = require(path.join(__dirname, "..", "dist", "cli", "main"));
  run = mainModule.run;
  if (typeof run !== "function") {
    throw new Error("dist/cli/main.js does not export a 'run' function");
  }
} catch (e) {
  console.error(`\n  ❌ Failed to load CLI dispatcher: ${e.message}`);
  console.error(`  Make sure to run: npm run build --workspace risu-workbench-core\n`);
  process.exit(1);
}

// Delegate to the in-process CLI runner
const argv = process.argv.slice(2);
const exitCode = run(argv);
process.exit(exitCode);
