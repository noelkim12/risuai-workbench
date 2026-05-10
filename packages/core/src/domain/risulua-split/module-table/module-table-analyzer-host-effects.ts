import { createEmptyRisuLuaModuleTableHostEffects, type RisuLuaModuleTableHostEffects } from './module-table-contracts';

const HOST_READS = new Set(['getChatVar', 'getState', 'getChat', 'getFullChat', 'getChatLength', 'getPersonaName', 'getCharacter', 'getLorebook', 'getModules', 'getAssets']);
const HOST_WRITES = new Set(['setChatVar', 'setState', 'setStateTracked', 'setChat', 'addChat', 'removeChat', 'setCharacter', 'setLorebook', 'setModules', 'setAssets', 'addMessage', 'removeMessage', 'reloadDisplay', 'reloadChat']);
const HOST_UI = new Set(['alertSelect', 'alertNormal', 'alertError', 'alertInput', 'alertConfirm']);
const HOST_ASYNC_MODEL_NETWORK = new Set(['async', 'LLM', 'axLLM', 'request', 'Promise', 'fetch']);
const HOST_DYNAMIC_ENVIRONMENT = new Set(['_G', 'rawget', 'rawset', 'load', 'loadstring', 'setfenv', 'getfenv']);

export const GLOBAL_IGNORE_NAMES = new Set(['string', 'table', 'math', 'os', 'pairs', 'ipairs', 'pcall', 'xpcall', 'tostring', 'tonumber', 'type', 'print', 'return']);

export function isHostWriteName(name: string): boolean {
  return HOST_WRITES.has(name);
}

export function isDynamicEnvironmentName(name: string): boolean {
  return HOST_DYNAMIC_ENVIRONMENT.has(name);
}

export function recordHostEffect(name: string, hostEffects: RisuLuaModuleTableHostEffects): void {
  const rootName = name.split('.')[0] ?? name;
  if (HOST_READS.has(name) || HOST_READS.has(rootName)) addUnique(hostEffects.reads, name);
  if (HOST_WRITES.has(name) || HOST_WRITES.has(rootName)) addUnique(hostEffects.writes, name);
  if (HOST_UI.has(name) || HOST_UI.has(rootName)) addUnique(hostEffects.uiInteraction, name);
  if (HOST_ASYNC_MODEL_NETWORK.has(name) || HOST_ASYNC_MODEL_NETWORK.has(rootName) || name.startsWith('RisuAI.')) addUnique(hostEffects.asyncModelNetwork, name);
  if (HOST_DYNAMIC_ENVIRONMENT.has(name) || HOST_DYNAMIC_ENVIRONMENT.has(rootName)) addUnique(hostEffects.dynamicEnvironment, name);
}

export function summarizeHostEffects(effectsList: RisuLuaModuleTableHostEffects[]): RisuLuaModuleTableHostEffects {
  const output = createEmptyRisuLuaModuleTableHostEffects();
  for (const effects of effectsList) {
    for (const value of effects.reads) addUnique(output.reads, value);
    for (const value of effects.writes) addUnique(output.writes, value);
    for (const value of effects.uiInteraction) addUnique(output.uiInteraction, value);
    for (const value of effects.asyncModelNetwork) addUnique(output.asyncModelNetwork, value);
    for (const value of effects.dynamicEnvironment) addUnique(output.dynamicEnvironment, value);
  }
  output.reads.sort();
  output.writes.sort();
  output.uiInteraction.sort();
  output.asyncModelNetwork.sort();
  output.dynamicEnvironment.sort();
  return output;
}

export function addUnique(values: string[], value: string): void {
  if (!values.includes(value)) values.push(value);
}
