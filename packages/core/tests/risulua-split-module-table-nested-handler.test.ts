import { describe, expect, it } from 'vitest';
import {
  assertModuleStructure,
  assertParameterizedExport,
  getButtonHelpers,
  getHandlerRewrite,
  getInputHelpers,
  getListenerHelpers,
  getOutputHelpers,
  lines,
  nestedHandlerRewriteFixture,
} from './helpers/module-table-refactor-map-helpers';

describe('risulua-split module-table nested handler helper rewrite planner', () => {
  it('returns empty plans when no handler helpers are classified for extraction', async () => {
    const result = await nestedHandlerRewriteFixture(lines([
      'local function helperTrim(value)',
      '  return value:gsub("^%s+", "")',
      'end',
      '',
      'function onOutput(text)',
      '  return helperTrim(text)',
      'end',
    ]));
    expect(result.ok).toBe(true);
    expect(result.handlerModulePlans).toEqual([]);
    expect(result.handlerBodyRewrites).toEqual([]);
  });

  it('extracts pure nested helper to output_helpers module', async () => {
    const result = await nestedHandlerRewriteFixture(lines([
      'function onOutput(text)',
      '  local function normalize(value)',
      '    return tostring(value):gsub("^%s+", "")',
      '  end',
      '  return normalize(text)',
      'end',
    ]));
    expect(result.ok).toBe(true);
    const outputHelpers = getOutputHelpers(result);
    expect(outputHelpers).toBeDefined();
    assertModuleStructure(outputHelpers!, 'normalize');
    expect(outputHelpers!.alias).toBe('__output_helpers');
  });

  it('parameterizes captured read-only handler locals', async () => {
    const result = await nestedHandlerRewriteFixture(lines([
      'function onOutput(text)',
      '  local cleanMsg = "prefix"',
      '  local function appendSuffix(value)',
      '    return cleanMsg .. value',
      '  end',
      '  return appendSuffix(text)',
      'end',
    ]));
    expect(result.ok).toBe(true);
    const outputHelpers = getOutputHelpers(result);
    expect(outputHelpers).toBeDefined();
    expect(outputHelpers!.body).toContain('function appendSuffix(value, cleanMsg)');
    assertParameterizedExport(outputHelpers!, 'appendSuffix', ['cleanMsg']);
  });

  it('preserves mutating nested helpers in handler body', async () => {
    const result = await nestedHandlerRewriteFixture(lines([
      'function onOutput(text)',
      '  local count = 0',
      '  local function bump()',
      '    count = count + 1',
      '    return count',
      '  end',
      '  return bump()',
      'end',
    ]));
    expect(result.ok).toBe(true);
    for (const plan of result.handlerModulePlans) {
      expect(plan.exportNames).not.toContain('bump');
    }
    expect(getOutputHelpers(result)).toBeUndefined();
  });

  it('handles host-read nested helpers distinctly from pure helpers', async () => {
    const result = await nestedHandlerRewriteFixture(lines([
      'function onOutput(text)',
      '  local function readMood()',
      '    return getChatVar("mood")',
      '  end',
      '  return readMood()',
      'end',
    ]));
    expect(result.ok).toBe(true);
    const outputHelpers = getOutputHelpers(result);
    expect(outputHelpers).toBeDefined();
    expect(outputHelpers!.exportNames).toContain('readMood');
  });

  it('groups helpers by parent handler into separate modules', async () => {
    const result = await nestedHandlerRewriteFixture(lines([
      'function onOutput(text)',
      '  local function outputHelper(v)',
      '    return v .. "output"',
      '  end',
      '  return outputHelper(text)',
      'end',
      '',
      'function onInput(text)',
      '  local function inputHelper(v)',
      '    return v .. "input"',
      '  end',
      '  return inputHelper(text)',
      'end',
    ]));
    expect(result.ok).toBe(true);
    expect(result.handlerModulePlans.length).toBe(2);
    const outputHelpers = getOutputHelpers(result);
    const inputHelpers = getInputHelpers(result);
    expect(outputHelpers).toBeDefined();
    expect(outputHelpers!.exportNames).toContain('outputHelper');
    expect(outputHelpers!.parentHandler).toBe('onOutput');
    expect(inputHelpers).toBeDefined();
    expect(inputHelpers!.exportNames).toContain('inputHelper');
    expect(inputHelpers!.parentHandler).toBe('onInput');
  });

  it('handles listenEdit callback helpers with __listener_helpers alias', async () => {
    const result = await nestedHandlerRewriteFixture(lines([
      'listenEdit(function(state)',
      '  local function trackChange(key)',
      '    return state[key]',
      '  end',
      '  return trackChange("value")',
      'end)',
    ]));
    expect(result.ok).toBe(true);
    const listenerHelpers = getListenerHelpers(result);
    expect(listenerHelpers).toBeDefined();
    expect(listenerHelpers!.exportNames).toContain('trackChange');
    expect(listenerHelpers!.alias).toBe('__listener_helpers');
  });

  it('handles onButtonClick helpers with __button_helpers alias', async () => {
    const result = await nestedHandlerRewriteFixture(lines([
      'function onButtonClick(buttonId)',
      '  local function buttonLabel(id)',
      '    return "button:" .. id',
      '  end',
      '  alertNormal(buttonLabel(buttonId))',
      'end',
    ]));
    expect(result.ok).toBe(true);
    const buttonHelpers = getButtonHelpers(result);
    expect(buttonHelpers).toBeDefined();
    expect(buttonHelpers!.exportNames).toContain('buttonLabel');
    expect(buttonHelpers!.alias).toBe('__button_helpers');
  });

  it('does not generate handler module when all helpers are preserved', async () => {
    const result = await nestedHandlerRewriteFixture(lines([
      'function onOutput(text)',
      '  local changedVars = {}',
      '  local function mutateTable()',
      '    changedVars.count = 1',
      '  end',
      '  mutateTable()',
      '  return text',
      'end',
    ]));
    expect(result.ok).toBe(true);
    expect(getOutputHelpers(result)).toBeUndefined();
  });

  it('produces handler body rewrite plans with extracted and preserved lists', async () => {
    const result = await nestedHandlerRewriteFixture(lines([
      'function onOutput(text)',
      '  local function pureHelper(v)',
      '    return v .. "!"',
      '  end',
      '  local count = 0',
      '  local function mutatingHelper()',
      '    count = count + 1',
      '    return count',
      '  end',
      '  return pureHelper(text)',
      'end',
    ]));
    expect(result.ok).toBe(true);
    const onOutputRewrite = getHandlerRewrite(result, 'onOutput');
    expect(onOutputRewrite).toBeDefined();
    expect(onOutputRewrite!.extractedHelpers).toContain('pureHelper');
    if (onOutputRewrite!.preservedHelpers.length > 0) {
      expect(onOutputRewrite!.preservedHelpers).toContain('mutatingHelper');
    }
  });

  it('rewrites pure helper calls to use module alias', async () => {
    const result = await nestedHandlerRewriteFixture(lines([
      'function onOutput(text)',
      '  local function normalize(value)',
      '    return tostring(value):gsub("^%s+", "")',
      '  end',
      '  return normalize(text)',
      'end',
    ]));
    expect(result.ok).toBe(true);
    const onOutputRewrite = getHandlerRewrite(result, 'onOutput');
    expect(onOutputRewrite).toBeDefined();
    expect(onOutputRewrite!.rewrittenSource).toContain('__output_helpers.normalize(text)');
    expect(onOutputRewrite!.rewrittenSource).not.toContain('return normalize(text)');
  });

  it('rewrites parameterized helper calls with existing args', async () => {
    const result = await nestedHandlerRewriteFixture(lines([
      'function onOutput(text)',
      '  local cleanMsg = "prefix"',
      '  local function appendSuffix(value)',
      '    return cleanMsg .. value',
      '  end',
      '  return appendSuffix(text)',
      'end',
    ]));
    expect(result.ok).toBe(true);
    const onOutputRewrite = getHandlerRewrite(result, 'onOutput');
    expect(onOutputRewrite).toBeDefined();
    expect(onOutputRewrite!.rewrittenSource).toContain('__output_helpers.appendSuffix(text, cleanMsg)');
  });

  it('rewrites parameterized helper calls with no original args', async () => {
    const result = await nestedHandlerRewriteFixture(lines([
      'function onOutput(text)',
      '  local cleanMsg = "prefix"',
      '  local function getMessage()',
      '    return cleanMsg',
      '  end',
      '  return getMessage()',
      'end',
    ]));
    expect(result.ok).toBe(true);
    const onOutputRewrite = getHandlerRewrite(result, 'onOutput');
    expect(onOutputRewrite).toBeDefined();
    expect(onOutputRewrite!.rewrittenSource).toContain('__output_helpers.getMessage(cleanMsg)');
  });

  it('preserves handler boundary text in originalSource and rewrittenSource', async () => {
    const result = await nestedHandlerRewriteFixture(lines([
      'function onOutput(text)',
      '  local function helper(v)',
      '    return v .. "!"',
      '  end',
      '  return helper(text)',
      'end',
    ]));
    expect(result.ok).toBe(true);
    const onOutputRewrite = getHandlerRewrite(result, 'onOutput');
    expect(onOutputRewrite).toBeDefined();
    expect(onOutputRewrite!.originalSource).toContain('function onOutput(text)');
    expect(onOutputRewrite!.rewrittenSource).toContain('function onOutput(text)');
    expect(onOutputRewrite!.originalSource).toContain('return helper(text)');
    expect(onOutputRewrite!.rewrittenSource).toContain('return __output_helpers.helper(text)');
  });

  it('does not modify callback parameter lists', async () => {
    const result = await nestedHandlerRewriteFixture(lines([
      'listenEdit(function(state)',
      '  local function trackChange(key)',
      '    return state[key]',
      '  end',
      '  return trackChange("value")',
      'end)',
    ]));
    expect(result.ok).toBe(true);
    const listenEditRewrite = getHandlerRewrite(result, 'listenEdit');
    expect(listenEditRewrite).toBeDefined();
    expect(listenEditRewrite!.originalSource).toContain('function(state)');
    expect(listenEditRewrite!.rewrittenSource).toContain('function(state)');
  });

  it('sorts captured reads lexically in function signatures and call sites', async () => {
    const result = await nestedHandlerRewriteFixture(lines([
      'function onOutput(text)',
      '  local zebra = "z"',
      '  local apple = "a"',
      '  local mango = "m"',
      '  local function concatAll(value)',
      '    return apple .. mango .. zebra .. value',
      '  end',
      '  return concatAll(text)',
      'end',
    ]));
    expect(result.ok).toBe(true);
    const outputHelpers = getOutputHelpers(result);
    const onOutputRewrite = getHandlerRewrite(result, 'onOutput');
    expect(outputHelpers).toBeDefined();
    expect(onOutputRewrite).toBeDefined();
    expect(outputHelpers!.body).toContain('function concatAll(value, apple, mango, zebra)');
    assertParameterizedExport(outputHelpers!, 'concatAll', ['apple', 'mango', 'zebra']);
    expect(onOutputRewrite!.rewrittenSource).toContain('__output_helpers.concatAll(text, apple, mango, zebra)');
  });

  it('uses forward declaration compatible body for parameterized helpers', async () => {
    const result = await nestedHandlerRewriteFixture(lines([
      'function onOutput(text)',
      '  local cleanMsg = "prefix"',
      '  local function appendSuffix(value)',
      '    return cleanMsg .. value',
      '  end',
      '  return appendSuffix(text)',
      'end',
    ]));
    expect(result.ok).toBe(true);
    const outputHelpers = getOutputHelpers(result);
    expect(outputHelpers).toBeDefined();
    const bodyLines = outputHelpers!.body.split('\n');
    const forwardDeclIndex = bodyLines.findIndex((l) => l.trim() === 'local appendSuffix');
    const funcDefIndex = bodyLines.findIndex((l) => l.startsWith('function appendSuffix('));
    expect(forwardDeclIndex).toBeGreaterThan(-1);
    expect(funcDefIndex).toBeGreaterThan(-1);
    expect(funcDefIndex).toBeGreaterThan(forwardDeclIndex);
    const funcDefLine = bodyLines[funcDefIndex];
    expect(funcDefLine.trim()).not.toMatch(/^local function\b/);
    expect(funcDefLine.trim()).toMatch(/^function appendSuffix\(/);
  });

  it('removes extracted helper declarations from rewritten handler body', async () => {
    const result = await nestedHandlerRewriteFixture(lines([
      'function onOutput(text)',
      '  local function normalize(value)',
      '    return tostring(value):gsub("^%s+", "")',
      '  end',
      '  return normalize(text)',
      'end',
    ]));
    expect(result.ok).toBe(true);
    const onOutputRewrite = getHandlerRewrite(result, 'onOutput');
    expect(onOutputRewrite).toBeDefined();
    expect(onOutputRewrite!.rewrittenSource).toContain('function onOutput(text)');
    expect(onOutputRewrite!.rewrittenSource).toContain('__output_helpers.normalize(text)');
    expect(onOutputRewrite!.rewrittenSource).not.toContain('local function normalize');
    expect(onOutputRewrite!.rewrittenSource).not.toContain('local function __output_helpers.normalize');
    expect(onOutputRewrite!.rewrittenSource).not.toContain('function __output_helpers.normalize');
  });

  it('removes parameterized helper declarations from rewritten handler body', async () => {
    const result = await nestedHandlerRewriteFixture(lines([
      'function onOutput(text)',
      '  local cleanMsg = "prefix"',
      '  local function appendSuffix(value)',
      '    return cleanMsg .. value',
      '  end',
      '  return appendSuffix(text)',
      'end',
    ]));
    expect(result.ok).toBe(true);
    const onOutputRewrite = getHandlerRewrite(result, 'onOutput');
    expect(onOutputRewrite).toBeDefined();
    expect(onOutputRewrite!.rewrittenSource).toContain('function onOutput(text)');
    expect(onOutputRewrite!.rewrittenSource).toContain('__output_helpers.appendSuffix(text, cleanMsg)');
    expect(onOutputRewrite!.rewrittenSource).not.toContain('local function appendSuffix');
    expect(onOutputRewrite!.rewrittenSource).not.toContain('local function __output_helpers.appendSuffix');
  });

  it('does not create rewrite plan when only preserved helpers exist', async () => {
    const result = await nestedHandlerRewriteFixture(lines([
      'function onOutput(text)',
      '  local count = 0',
      '  local function bump()',
      '    count = count + 1',
      '    return count',
      '  end',
      '  return bump()',
      'end',
    ]));
    expect(result.ok).toBe(true);
    expect(getHandlerRewrite(result, 'onOutput')).toBeUndefined();
    expect(getOutputHelpers(result)).toBeUndefined();
  });

  it('handles mixed extracted and preserved helpers correctly', async () => {
    const result = await nestedHandlerRewriteFixture(lines([
      'function onOutput(text)',
      '  local function pureHelper(v)',
      '    return v .. "!"',
      '  end',
      '  local count = 0',
      '  local function mutatingHelper()',
      '    count = count + 1',
      '    return count',
      '  end',
      '  return pureHelper(mutatingHelper())',
      'end',
    ]));
    expect(result.ok).toBe(true);
    const onOutputRewrite = getHandlerRewrite(result, 'onOutput');
    expect(onOutputRewrite).toBeDefined();
    expect(onOutputRewrite!.rewrittenSource).not.toContain('local function pureHelper');
    expect(onOutputRewrite!.rewrittenSource).toContain('__output_helpers.pureHelper(');
    expect(onOutputRewrite!.rewrittenSource).toContain('local function mutatingHelper()');
    expect(onOutputRewrite!.rewrittenSource).toContain('mutatingHelper())');
    expect(onOutputRewrite!.rewrittenSource).not.toContain('__output_helpers.mutatingHelper');
  });
});
