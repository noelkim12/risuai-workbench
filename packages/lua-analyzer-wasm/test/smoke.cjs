const assert = require('node:assert/strict');
const wasm = require('../pkg');

assert.equal(typeof wasm.analyze_lua, 'function');

const source = ["function boot()", "  return getState('mode')", 'end'].join('\n');
const result = wasm.analyze_lua(
  source,
  JSON.stringify({ includeStringLiterals: true, includeStateAccesses: true }),
);
assert.equal(typeof result, 'string');

const parsed = JSON.parse(result);
assert.equal(parsed.ok, true);
assert.equal(parsed.parser, 'rust-wasm-lua');
assert.equal(parsed.version, 1);
assert.equal(parsed.sourceLengthUtf16, source.length);
assert.equal(parsed.sourceLengthBytes, Buffer.byteLength(source, 'utf8'));
assert.equal(parsed.totalLines, 3);
assert.equal(parsed.stringLiterals.length, 1);
assert.equal(parsed.stringLiterals[0].quoteKind, 'single');
assert.equal(parsed.stringLiterals[0].hasCbsMarker, false);
assert.equal(parsed.stateAccesses.length, 1);
assert.equal(parsed.stateAccesses[0].apiName, 'getState');
assert.equal(parsed.stateAccesses[0].key, 'mode');
assert.equal(parsed.stateAccesses[0].direction, 'read');
assert.equal(parsed.stateAccesses[0].containingFunction, '<top-level>');
assert.deepEqual(parsed.diagnostics, []);
assert.equal(parsed.error, null);

console.log('lua-analyzer-wasm smoke test passed');
