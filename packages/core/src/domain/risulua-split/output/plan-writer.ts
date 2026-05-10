import fs from 'node:fs';
import path from 'node:path';

import type { RisuLuaSplitPlan } from '../shared/types';

export const RISULUA_SPLIT_PLAN_PATH = 'docs/risulua-split-plan.json';

export interface WriteRisuLuaSplitPlanOptions {
  outputRoot: string;
  cwd?: string;
}

export interface WriteRisuLuaSplitPlanResult {
  path: string;
  json: string;
}

export function writeRisuLuaSplitPlan(
  plan: RisuLuaSplitPlan,
  options: WriteRisuLuaSplitPlanOptions,
): WriteRisuLuaSplitPlanResult {
  const outputPath = path.join(options.outputRoot, ...RISULUA_SPLIT_PLAN_PATH.split('/'));
  const json = serializeRisuLuaSplitPlan(plan, { cwd: options.cwd });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, json, 'utf8');
  return { path: outputPath, json };
}

export function serializeRisuLuaSplitPlan(
  plan: RisuLuaSplitPlan,
  options?: { cwd?: string },
): string {
  const cwd = normalizeSeparators(options?.cwd ?? process.cwd());
  const normalized = normalizeStableValue(plan, cwd) as RisuLuaSplitPlan;
  return `${JSON.stringify(normalized, null, 2)}\n`;
}

function normalizeStableValue(value: unknown, cwd: string): unknown {
  if (typeof value === 'string') return normalizeStableString(value, cwd);
  if (Array.isArray(value)) return value.map((item) => normalizeStableValue(item, cwd));
  if (value !== null && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      output[key] = normalizeStableValue(nested, cwd);
    }
    return output;
  }
  return value;
}

function normalizeStableString(value: string, cwd: string): string {
  const normalized = normalizeSeparators(value);
  if (normalized === cwd) return '<repo-root>';
  if (normalized.startsWith(`${cwd}/`)) return `<repo-root>/${normalized.slice(cwd.length + 1)}`;
  return normalized;
}

function normalizeSeparators(value: string): string {
  return value.replace(/\\/g, '/');
}
