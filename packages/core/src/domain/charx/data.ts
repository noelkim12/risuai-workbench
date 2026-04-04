export { asRecord, type GenericRecord } from '../types';
import { asRecord, type GenericRecord } from '../types';

/**
 * 캐릭터 카드 객체의 최소 구조를 정의하는 인터페이스
 */
export interface CharxStructure {
  /** 카드 이름 */
  name?: string;
  /** 카드 데이터 */
  data?: GenericRecord & {
    /** 캐릭터 이름 */
    name?: string;
    /** 캐릭터 북(로어북) 설정 */
    character_book?: {
      /** 로어북 엔트리 목록 */
      entries?: unknown[];
    };
    /** 확장 설정 */
    extensions?: {
      /** RisuAI 전용 확장 설정 */
      risuai?: {
        /** 모듈 로어북 엔트리 목록 */
        _moduleLorebook?: unknown[];
        /** 커스텀 스크립트 목록 */
        customScripts?: unknown[];
        /** 기본 변수 설정 (raw) */
        defaultVariables?: unknown;
      };
    };
  };
}

/**
 * 캐릭터 카드 객체에서 캐릭터의 이름을 추출
 * data.name이 있으면 우선적으로 사용하고, 없으면 루트의 name을 사용
 *
 * @param charx - 캐릭터 카드 객체
 * @returns 캐릭터 이름 (찾을 수 없으면 'Unknown')
 */
export function getCharacterName(charx: unknown): string {
  const obj = asRecord(charx) as CharxStructure | null;
  const fromData = typeof obj?.data?.name === 'string' ? obj.data.name : '';
  const fromRoot = typeof obj?.name === 'string' ? obj.name : '';
  return fromData || fromRoot || 'Unknown';
}

/**
 * 캐릭터 카드 객체에서 캐릭터 북(로어북) 엔트리 목록을 추출
 *
 * @param charx - 캐릭터 카드 객체
 * @returns 로어북 엔트리 배열
 */
export function getLorebookEntriesFromCharx(charx: unknown): GenericRecord[] {
  const obj = asRecord(charx) as CharxStructure | null;
  const entries = obj?.data?.character_book?.entries;
  return Array.isArray(entries)
    ? entries.filter((entry): entry is GenericRecord => Boolean(asRecord(entry)))
    : [];
}

/**
 * 캐릭터 카드 객체에서 RisuAI 모듈 로어북 엔트리 목록을 추출
 *
 * @param charx - 캐릭터 카드 객체
 * @returns 모듈 로어북 엔트리 배열
 */
export function getModuleLorebookEntries(charx: unknown): GenericRecord[] {
  const obj = asRecord(charx) as CharxStructure | null;
  const entries = obj?.data?.extensions?.risuai?._moduleLorebook;
  return Array.isArray(entries)
    ? entries.filter((entry): entry is GenericRecord => Boolean(asRecord(entry)))
    : [];
}

/**
 * 캐릭터 카드 객체에서 모든 종류의 로어북 엔트리(캐릭터 북 + 모듈 로어북)를 추출
 *
 * @param charx - 캐릭터 카드 객체
 * @returns 통합 로어북 엔트리 배열
 */
export function getAllLorebookEntriesFromCharx(charx: unknown): GenericRecord[] {
  return [...getLorebookEntriesFromCharx(charx), ...getModuleLorebookEntries(charx)];
}

/**
 * 캐릭터 카드 객체에서 커스텀 스크립트 목록을 추출
 *
 * @param charx - 캐릭터 카드 객체
 * @returns 커스텀 스크립트 배열
 */
export function getCustomScriptsFromCharx(charx: unknown): GenericRecord[] {
  const obj = asRecord(charx) as CharxStructure | null;
  const scripts = obj?.data?.extensions?.risuai?.customScripts;
  return Array.isArray(scripts)
    ? scripts.filter((script): script is GenericRecord => Boolean(asRecord(script)))
    : [];
}

/**
 * 캐릭터 카드 객체에서 가공되지 않은 기본 변수(defaultVariables) 설정을 추출
 *
 * @param charx - 캐릭터 카드 객체
 * @returns 기본 변수 설정 데이터 (Raw)
 */
export function getDefaultVariablesRawFromCharx(charx: unknown): unknown {
  const obj = asRecord(charx) as CharxStructure | null;
  return obj?.data?.extensions?.risuai?.defaultVariables;
}
