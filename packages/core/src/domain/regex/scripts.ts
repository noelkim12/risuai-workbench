import { extractCBSVarOps } from '../card/cbs';
import { asRecord, getCustomScripts, type GenericRecord } from '../card/data';
import { ELEMENT_TYPES } from '../analyze/constants';
import type { ElementCBSData } from '../analyze/correlation';

export interface RegexScriptOps {
  elementName: string;
  reads: Set<string>;
  writes: Set<string>;
}

export function extractRegexScriptOps(
  script: unknown,
  index: number,
): RegexScriptOps | null {
  const record = asRecord(script);
  if (!record) return null;

  const inText = getStringField(record, 'in');
  const outText = getStringField(record, 'out');
  const flagText = getStringField(record, 'flag');

  const inOps = extractCBSVarOps(inText || '');
  const outOps = extractCBSVarOps(outText || '');
  const flagOps = extractCBSVarOps(flagText || '');

  let reads = new Set([...inOps.reads, ...outOps.reads, ...flagOps.reads]);
  let writes = new Set([...inOps.writes, ...outOps.writes, ...flagOps.writes]);

  if (reads.size === 0 && writes.size === 0) {
    const alt =
      getStringField(record, 'script') || getStringField(record, 'content');
    const altOps = extractCBSVarOps(alt || '');
    reads = altOps.reads;
    writes = altOps.writes;
  }

  if (reads.size === 0 && writes.size === 0) return null;

  return {
    elementName: getRegexScriptName(record, index),
    reads,
    writes,
  };
}

export function collectRegexCBSFromCard(card: unknown): ElementCBSData[] {
  const scripts = getCustomScripts(card);
  return collectRegexCBSFromScripts(scripts);
}

export function collectRegexCBSFromScripts(
  scripts: GenericRecord[] | null | undefined,
): ElementCBSData[] {
  const result: ElementCBSData[] = [];
  for (let i = 0; i < (scripts || []).length; i += 1) {
    const parsed = extractRegexScriptOps((scripts || [])[i], i);
    if (!parsed) continue;
    result.push({
      elementType: ELEMENT_TYPES.REGEX,
      elementName: parsed.elementName,
      reads: parsed.reads,
      writes: parsed.writes,
    });
  }
  return result;
}

export function parseDefaultVariablesText(raw: unknown): Record<string, string> {
  const variables: Record<string, string> = {};
  if (typeof raw !== 'string' || !raw.trim()) return variables;

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) {
      variables[line] = '';
      continue;
    }
    const key = line.slice(0, eqIdx);
    const value = line.slice(eqIdx + 1);
    variables[key] = value;
  }

  return variables;
}

export function parseDefaultVariablesJson(raw: unknown): Record<string, string> {
  const variables: Record<string, string> = {};
  if (!raw) return variables;

  if (isPlainObject(raw)) {
    for (const [key, value] of Object.entries(raw)) {
      variables[String(key)] = typeof value === 'string' ? value : String(value);
    }
    return variables;
  }

  if (Array.isArray(raw)) {
    for (const record of raw) {
      if (!isPlainObject(record)) continue;
      const key =
        typeof record.key === 'string'
          ? record.key
          : typeof record.name === 'string'
            ? record.name
            : '';
      if (!key) continue;
      const value =
        typeof record.value === 'string'
          ? record.value
          : record.value == null
            ? ''
            : String(record.value);
      variables[key] = value;
    }
  }

  return variables;
}

function getRegexScriptName(script: GenericRecord, index: number): string {
  if (typeof script.comment === 'string' && script.comment) return script.comment;
  if (typeof script.name === 'string' && script.name) return script.name;
  return `unnamed-script-${index}`;
}

function getStringField(obj: GenericRecord, key: string): string {
  if (typeof obj[key] === 'string') return obj[key] as string;
  const data = asRecord(obj.data);
  if (data && typeof data[key] === 'string') return data[key] as string;
  return '';
}

function isPlainObject(value: unknown): value is GenericRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
