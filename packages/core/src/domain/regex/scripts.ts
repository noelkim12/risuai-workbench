import { extractCBSVarOps } from '../cbs/cbs';
import { asRecord, type GenericRecord } from '../types';
import { getCustomScriptsFromCharx } from '../card/data';
import { ELEMENT_TYPES } from '../analyze/constants';
import type { ElementCBSData } from '../analyze/correlation';

/**
 * 정규식 스크립트에서 추출된 변수 조작 정보를 담는 인터페이스
 */
export interface RegexScriptOps {
  /** 스크립트 이름 */
  elementName: string;
  /** 읽기 연산 변수 집합 */
  reads: Set<string>;
  /** 쓰기 연산 변수 집합 */
  writes: Set<string>;
}

/**
 * 정규식 스크립트 객체에서 CBS 변수 조작 연산을 추출
 * 'in', 'out', 'flag' 필드 등을 분석
 *
 * @param script - 분석할 스크립트 객체
 * @param index - 스크립트 인덱스 (이름이 없을 경우 대비)
 * @returns 추출된 연산 정보 (추출할 연산이 없으면 null)
 */
export function extractRegexScriptOps(script: unknown, index: number): RegexScriptOps | null {
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
    const alt = getStringField(record, 'script') || getStringField(record, 'content');
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

/**
 * 캐릭터 카드 객체에서 모든 정규식 스크립트의 CBS 정보를 수집
 *
 * @param card - 캐릭터 카드 객체
 * @returns 수집된 CBS 정보 배열
 */
export function collectRegexCBSFromCard(card: unknown): ElementCBSData[] {
  const scripts = getCustomScriptsFromCharx(card);
  return collectRegexCBSFromScripts(scripts);
}

/**
 * 정규식 스크립트 레코드 배열에서 CBS 정보를 수집
 *
 * @param scripts - 분석할 스크립트 레코드 배열
 * @returns 수집된 CBS 정보 배열
 */
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

/**
 * 텍스트 형식의 기본 변수(defaultVariables) 설정을 파싱
 * 'key=value' 형식의 줄 단위 텍스트를 처리
 *
 * @param raw - 파싱할 텍스트 데이터
 * @returns {변수명: 값} 매핑 객체
 */
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

/**
 * JSON 형식(객체 또는 객체 배열)의 기본 변수 설정을 파싱
 *
 * @param raw - 파싱할 데이터 (객체 또는 배열)
 * @returns {변수명: 값} 매핑 객체
 */
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
