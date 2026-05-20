import fs from 'node:fs';
import path from 'node:path';

import type { RisuLuaSplitPlan } from '../shared/types';
import { serializeStableJson } from '../shared/stable-json';

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
  return serializeStableJson(plan, { cwd: options?.cwd });
}
