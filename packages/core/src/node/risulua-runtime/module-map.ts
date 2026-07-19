import { Buffer } from 'node:buffer';

import {
  RISULUA_RUNTIME_LIMITS,
  type RisuLuaModuleMap,
} from './contracts';

const MODULE_ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;

export function validateRuntimeModuleId(moduleId: string): string {
  if (!MODULE_ID_PATTERN.test(moduleId)) {
    throw new Error(`Invalid RisuLua runtime module id: ${JSON.stringify(moduleId)}`);
  }
  return moduleId;
}

export function validateRuntimeModuleMap(moduleMap: RisuLuaModuleMap): RisuLuaModuleMap {
  validateRuntimeModuleId(moduleMap.entryModuleId);

  let bundleBytes = 0;
  const modules: Record<string, string> = {};
  for (const [moduleId, source] of Object.entries(moduleMap.modules)) {
    validateRuntimeModuleId(moduleId);
    if (typeof source !== 'string') {
      throw new Error(`RisuLua module ${moduleId} source must be a string`);
    }

    const moduleBytes = Buffer.byteLength(source, 'utf8');
    if (moduleBytes > RISULUA_RUNTIME_LIMITS.maxModuleBytes) {
      throw new Error(`RisuLua module size exceeds 2 MiB: ${moduleId}`);
    }
    bundleBytes += moduleBytes;
    if (bundleBytes > RISULUA_RUNTIME_LIMITS.maxBundleBytes) {
      throw new Error('RisuLua module bundle size exceeds 8 MiB');
    }
    modules[moduleId] = source;
  }

  if (!Object.prototype.hasOwnProperty.call(modules, moduleMap.entryModuleId)) {
    throw new Error(`RisuLua entry module is missing: ${moduleMap.entryModuleId}`);
  }

  return Object.freeze({
    entryModuleId: moduleMap.entryModuleId,
    modules: Object.freeze(modules),
  });
}
