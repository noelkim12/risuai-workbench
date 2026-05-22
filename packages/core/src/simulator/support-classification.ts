/**
 * CBS simulator builtin 지원 등급을 정의하는 source-of-truth 테이블.
 * @file packages/core/src/domain/cbs/simulator/support-classification.ts
 */
import { CBSBuiltinRegistry } from '../domain/cbs/registry/builtins';

/** CBS simulator가 builtin을 다루는 현재 지원 수준. */
export type CbsSupportClass =
  | 'supported'
  | 'approximate'
  | 'unsupported'
  | 'runtime-unknown'
  | 'effect-only';

/** Coverage 검증 결과. */
export interface CbsSupportClassificationCoverage {
  /** registry에는 있지만 classification table에는 없는 canonical builtin 이름. */
  missingClassifications: string[];
  /** classification table에는 있지만 registry에는 없는 canonical builtin 이름. */
  extraClassifications: string[];
}

/**
 * CBS_SIMULATOR_SUPPORT_CLASSIFICATION 상수.
 * `CBSBuiltinRegistry.getAll()`의 canonical name을 simulator parity 의도별로 분류함.
 */
export const CBS_SIMULATOR_SUPPORT_CLASSIFICATION = {
  char: 'runtime-unknown',
  user: 'supported',
  trigger_id: 'runtime-unknown',
  previouscharchat: 'supported',
  previoususerchat: 'supported',
  personality: 'runtime-unknown',
  description: 'runtime-unknown',
  scenario: 'runtime-unknown',
  exampledialogue: 'runtime-unknown',
  persona: 'runtime-unknown',
  mainprompt: 'runtime-unknown',
  lorebook: 'runtime-unknown',
  userhistory: 'runtime-unknown',
  charhistory: 'runtime-unknown',
  jb: 'runtime-unknown',
  globalnote: 'runtime-unknown',
  authornote: 'runtime-unknown',
  chatindex: 'runtime-unknown',
  firstmsgindex: 'runtime-unknown',
  blank: 'supported',
  messagetime: 'runtime-unknown',
  messagedate: 'runtime-unknown',
  messageunixtimearray: 'runtime-unknown',
  unixtime: 'supported',
  time: 'supported',
  isotime: 'supported',
  isodate: 'supported',
  messageidleduration: 'supported',
  idleduration: 'supported',
  br: 'supported',
  model: 'runtime-unknown',
  axmodel: 'runtime-unknown',
  role: 'runtime-unknown',
  isfirstmsg: 'runtime-unknown',
  jbtoggled: 'runtime-unknown',
  maxcontext: 'runtime-unknown',
  lastmessage: 'runtime-unknown',
  lastmessageid: 'runtime-unknown',
  tempvar: 'supported',
  settempvar: 'effect-only',
  return: 'effect-only',
  getvar: 'supported',
  calc: 'supported',
  addvar: 'effect-only',
  setvar: 'effect-only',
  setdefaultvar: 'effect-only',
  getglobalvar: 'supported',
  button: 'unsupported',
  risu: 'runtime-unknown',
  equal: 'supported',
  notequal: 'supported',
  greater: 'supported',
  less: 'supported',
  greaterequal: 'supported',
  lessequal: 'supported',
  and: 'supported',
  or: 'supported',
  not: 'supported',
  file: 'unsupported',
  startswith: 'supported',
  endswith: 'supported',
  contains: 'supported',
  replace: 'supported',
  split: 'supported',
  join: 'supported',
  spread: 'approximate',
  trim: 'supported',
  length: 'supported',
  arraylength: 'supported',
  lower: 'supported',
  upper: 'supported',
  capitalize: 'supported',
  round: 'supported',
  floor: 'supported',
  ceil: 'supported',
  abs: 'supported',
  remaind: 'supported',
  previouschatlog: 'runtime-unknown',
  tonumber: 'supported',
  pow: 'supported',
  arrayelement: 'supported',
  dictelement: 'supported',
  objectassert: 'approximate',
  element: 'supported',
  arrayshift: 'effect-only',
  arraypop: 'effect-only',
  arraypush: 'effect-only',
  arraysplice: 'effect-only',
  arrayassert: 'approximate',
  makearray: 'supported',
  makedict: 'supported',
  emotionlist: 'runtime-unknown',
  assetlist: 'runtime-unknown',
  prefillsupported: 'runtime-unknown',
  screenwidth: 'runtime-unknown',
  screenheight: 'runtime-unknown',
  cbr: 'supported',
  decbo: 'supported',
  decbc: 'supported',
  bo: 'supported',
  bc: 'supported',
  displayescapedbracketopen: 'supported',
  displayescapedbracketclose: 'supported',
  displayescapedanglebracketopen: 'supported',
  displayescapedanglebracketclose: 'supported',
  displayescapedcolon: 'supported',
  displayescapedsemicolon: 'supported',
  chardisplayasset: 'unsupported',
  history: 'runtime-unknown',
  range: 'supported',
  date: 'supported',
  moduleenabled: 'runtime-unknown',
  moduleassetlist: 'runtime-unknown',
  filter: 'supported',
  all: 'supported',
  any: 'supported',
  min: 'supported',
  max: 'supported',
  sum: 'supported',
  average: 'supported',
  fixnum: 'supported',
  unicodeencode: 'supported',
  unicodedecode: 'supported',
  u: 'supported',
  ue: 'supported',
  hash: 'approximate',
  randint: 'supported',
  dice: 'supported',
  fromhex: 'supported',
  tohex: 'supported',
  metadata: 'runtime-unknown',
  iserror: 'approximate',
  xor: 'supported',
  xordecrypt: 'supported',
  crypt: 'supported',
  random: 'supported',
  pick: 'supported',
  roll: 'supported',
  rollp: 'supported',
  hiddenkey: 'runtime-unknown',
  reverse: 'approximate',
  comment: 'supported',
  tex: 'supported',
  ruby: 'supported',
  codeblock: 'supported',
  bkspc: 'supported',
  erase: 'supported',
  declare: 'effect-only',
  '//': 'supported',
  '?': 'supported',
  __: 'unsupported',
  asset: 'unsupported',
  emotion: 'unsupported',
  audio: 'unsupported',
  bg: 'unsupported',
  bgm: 'unsupported',
  video: 'unsupported',
  'video-img': 'unsupported',
  image: 'unsupported',
  img: 'unsupported',
  path: 'unsupported',
  inlay: 'unsupported',
  inlayed: 'unsupported',
  inlayeddata: 'unsupported',
  source: 'runtime-unknown',
  '#if': 'approximate',
  '#if_pure': 'approximate',
  '#when': 'supported',
  ':else': 'supported',
  '#pure': 'supported',
  '#puredisplay': 'supported',
  '#escape': 'supported',
  '#each': 'supported',
  slot: 'supported',
  position: 'runtime-unknown',
} as const satisfies Record<string, CbsSupportClass>;

/**
 * getCbsSupportClassification 함수.
 * registry lookup 규칙으로 canonical builtin을 찾은 뒤 simulator 지원 등급을 반환함.
 *
 * @param name - canonical name 또는 alias
 * @param registry - lookup에 사용할 CBS builtin registry
 * @returns builtin 지원 등급, unknown name이면 undefined
 */
export function getCbsSupportClassification(
  name: string,
  registry = new CBSBuiltinRegistry(),
): CbsSupportClass | undefined {
  const builtin = registry.get(name);
  if (!builtin) return undefined;

  const classificationTable: Record<string, CbsSupportClass> = CBS_SIMULATOR_SUPPORT_CLASSIFICATION;
  return classificationTable[builtin.name];
}

/**
 * assertCbsSupportClassificationCoverage 함수.
 * registry canonical name과 classification table key의 차이를 machine-checkable 형태로 반환함.
 *
 * @param registry - coverage를 비교할 CBS builtin registry
 * @returns missing/extra classification 목록
 */
export function assertCbsSupportClassificationCoverage(
  registry = new CBSBuiltinRegistry(),
): CbsSupportClassificationCoverage {
  const registryNames = new Set(registry.getAll().map((builtin) => builtin.name));
  const classificationNames = new Set(Object.keys(CBS_SIMULATOR_SUPPORT_CLASSIFICATION));

  return {
    missingClassifications: Array.from(registryNames)
      .filter((name) => !classificationNames.has(name))
      .sort(),
    extraClassifications: Array.from(classificationNames)
      .filter((name) => !registryNames.has(name))
      .sort(),
  };
}
