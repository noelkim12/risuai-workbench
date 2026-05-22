import fs from 'node:fs';
import path from 'node:path';

import {
  RISULUA_MODULE_TABLE_ASYNC_ACTIONS_PATH,
  RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH,
  RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH,
  RISULUA_MODULE_TABLE_DUPLICATE_GLOBALS_PATH,
  RISULUA_MODULE_TABLE_GLOBAL_FUNCTIONS_PATH,
  RISULUA_MODULE_TABLE_PROMPT_STORE_PATH,
  RISULUA_MODULE_TABLE_RUNTIME_BUTTON_CLICK_PATH,
  RISULUA_MODULE_TABLE_RUNTIME_INPUT_PATH,
  RISULUA_MODULE_TABLE_RUNTIME_LISTEN_EDIT_PATH,
  RISULUA_MODULE_TABLE_RUNTIME_OUTPUT_PATH,
  RISULUA_MODULE_TABLE_RUNTIME_START_PATH,
  RISULUA_MODULE_TABLE_VARIABLE_STORE_PATH,
} from '../module-table/module-table-contracts';
import { isPathSafe } from '../shared/path-policy';

const RISULUA_STARTER_MODULE_PATHS = [
  RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH,
  'lua/common/helpers.risulua',
  RISULUA_MODULE_TABLE_GLOBAL_FUNCTIONS_PATH,
  RISULUA_MODULE_TABLE_DUPLICATE_GLOBALS_PATH,
  RISULUA_MODULE_TABLE_ASYNC_ACTIONS_PATH,
  RISULUA_MODULE_TABLE_BUTTON_ACTIONS_PATH,
  RISULUA_MODULE_TABLE_RUNTIME_START_PATH,
  RISULUA_MODULE_TABLE_RUNTIME_INPUT_PATH,
  RISULUA_MODULE_TABLE_RUNTIME_OUTPUT_PATH,
  RISULUA_MODULE_TABLE_RUNTIME_BUTTON_CLICK_PATH,
  RISULUA_MODULE_TABLE_RUNTIME_LISTEN_EDIT_PATH,
  'lua/runtime/listeners.risulua',
  'lua/handler_helpers/output_helpers.risulua',
  'lua/handler_helpers/input_helpers.risulua',
  'lua/handler_helpers/start_helpers.risulua',
  'lua/handler_helpers/button_click_helpers.risulua',
  'lua/handler_helpers/listen_edit_helpers.risulua',
  RISULUA_MODULE_TABLE_VARIABLE_STORE_PATH,
  RISULUA_MODULE_TABLE_PROMPT_STORE_PATH,
  'lua/domain/core.risulua',
  'lua/schema/constants.risulua',
  'lua/features/core.risulua',
] as const;

const RISULUA_STARTER_DIRECTORIES = [
  'lua/sections',
  'lua/preload',
] as const;

export interface WriteRisuLuaStarterSurfaceOptions {
  outputRoot: string;
  existingPaths?: readonly string[];
}

export function writeRisuLuaStarterSurface(options: WriteRisuLuaStarterSurfaceOptions): void {
  const existing = new Set(options.existingPaths ?? []);

  for (const modulePath of RISULUA_STARTER_MODULE_PATHS) {
    if (existing.has(modulePath)) continue;
    writeStarterModule(options.outputRoot, modulePath);
  }

  for (const dirPath of RISULUA_STARTER_DIRECTORIES) {
    if (!isPathSafe(dirPath)) {
      throw new Error(`Refusing to create unsafe risulua starter directory: ${dirPath}`);
    }
    fs.mkdirSync(path.join(options.outputRoot, ...dirPath.split('/')), { recursive: true });
  }
}

function writeStarterModule(outputRoot: string, modulePath: string): void {
  if (!isPathSafe(modulePath)) {
    throw new Error(`Refusing to write unsafe risulua starter path: ${modulePath}`);
  }

  const outputPath = path.join(outputRoot, ...modulePath.split('/'));
  if (fs.existsSync(outputPath)) return;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, renderStarterModule(modulePath), 'utf8');
}

function renderStarterModule(modulePath: string): string {
  const moduleId = modulePath
    .replace(/^lua\//, '')
    .replace(/\.risulua$/, '')
    .replace(/\//g, '.');
  return [
    `-- ${moduleId}`,
    '-- Empty starter module for risulua-split editing surface.',
    '-- It is intentionally not added to the split plan or dist graph until real code requires it.',
    '',
    'local M = {}',
    '',
    'return M',
    '',
  ].join('\n');
}
