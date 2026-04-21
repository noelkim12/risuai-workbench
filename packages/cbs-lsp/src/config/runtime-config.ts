/**
 * Standalone/runtime config precedence resolver for cbs-lsp.
 * @file packages/cbs-lsp/src/config/runtime-config.ts
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export type CbsLspLogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface CbsLspRuntimeConfig {
  configFilePath: string | null;
  logLevel: CbsLspLogLevel;
  luaLsExecutablePath: string | null;
  workspacePath: string | null;
}

export interface CbsLspRuntimeConfigSources {
  configFilePath: 'cli' | 'discovered' | 'env' | 'initialize' | 'none';
  logLevel: 'cli' | 'config' | 'default' | 'env' | 'initialize';
  luaLsExecutablePath: 'cli' | 'config' | 'default' | 'env' | 'initialize';
  workspacePath: 'cli' | 'config' | 'default' | 'env' | 'initialize';
}

export interface ResolvedCbsLspRuntimeConfig {
  config: CbsLspRuntimeConfig;
  sources: CbsLspRuntimeConfigSources;
}

export interface CbsLspRuntimeConfigOverrides {
  configPath?: string | null;
  logLevel?: CbsLspLogLevel;
  luaLsExecutablePath?: string | null;
  workspacePath?: string | null;
}

interface RuntimeConfigLoaderOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  exists?: (filePath: string) => boolean;
  initializationOptions?: unknown;
  overrides?: CbsLspRuntimeConfigOverrides;
  readFile?: (filePath: string) => string;
}

interface RuntimeConfigContext {
  cwd: string;
  env: NodeJS.ProcessEnv;
  exists: (filePath: string) => boolean;
  initializationOptions?: unknown;
  overrides?: CbsLspRuntimeConfigOverrides;
  readFile: (filePath: string) => string;
}

interface RuntimeConfigValues {
  logLevel?: CbsLspLogLevel;
  luaLsExecutablePath?: string | null;
  workspacePath?: string | null;
}

interface BootstrapConfigValues {
  configPath?: string | null;
  workspacePath?: string | null;
}

type RuntimeValueSource = CbsLspRuntimeConfigSources['logLevel'];
type RuntimeLayerSource = Exclude<RuntimeValueSource, 'default'>;
type ConfigFilePathSource = CbsLspRuntimeConfigSources['configFilePath'];
type ExplicitConfigFilePathSource = Exclude<ConfigFilePathSource, 'discovered' | 'none'>;

interface RuntimeConfigLayer {
  source: RuntimeLayerSource;
  values: RuntimeConfigValues;
}

interface ResolvedRuntimeField<T> {
  source: RuntimeValueSource;
  value: T;
}

interface ResolvedConfigFilePath {
  path: string | null;
  source: ConfigFilePathSource;
}

interface ResolveConfigFilePathOptions {
  cliConfigPath?: string | null;
  cwd: string;
  env: NodeJS.ProcessEnv;
  exists: (filePath: string) => boolean;
  initializationConfigPath?: string | null;
  workspaceCandidates: readonly (string | null | undefined)[];
}

const DEFAULT_CONFIG_FILE_NAMES = Object.freeze([
  'cbs-language-server.json',
  '.cbs-language-server.json',
  'cbs-lsp.json',
  '.cbs-lsp.json',
]);
const DEFAULT_LOG_LEVEL: CbsLspLogLevel = 'debug';
const VALID_LOG_LEVELS = new Set<CbsLspLogLevel>(['error', 'warn', 'info', 'debug']);

class RuntimeConfigFileError extends Error {
  readonly cause: unknown;
  readonly filePath: string;

  /**
   * RuntimeConfigFileError 생성자.
   * runtime config file parse/load 실패를 파일 경로와 함께 감싼다.
   *
   * @param filePath - 읽기 실패한 runtime config 파일 경로
   * @param cause - 원래 발생한 read/parse 오류
   */
  constructor(filePath: string, cause: unknown) {
    super(`Failed to load CBS LSP config file: ${filePath}`);
    this.name = 'RuntimeConfigFileError';
    this.filePath = filePath;
    this.cause = cause;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * createRuntimeConfigContext 함수.
 * 런타임 설정 로더가 재사용할 기본 의존성과 입력값을 한 곳으로 정리한다.
 *
 * @param options - resolveRuntimeConfig 호출부에서 넘긴 로더 옵션
 * @returns cwd/env/file loader가 채워진 공통 context
 */
function createRuntimeConfigContext(
  options: RuntimeConfigLoaderOptions,
): RuntimeConfigContext {
  return {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    exists: options.exists ?? existsSync,
    initializationOptions: options.initializationOptions,
    overrides: options.overrides,
    readFile: options.readFile ?? ((filePath: string) => readFileSync(filePath, 'utf8')),
  };
}

/**
 * parseLogLevel 함수.
 * 문자열 입력을 cbs-lsp가 허용하는 log level 집합으로 정규화함.
 *
 * @param value - CLI/env/config에서 읽은 임의의 log level 값
 * @returns 허용된 log level이면 소문자 값, 해석할 수 없으면 undefined
 */
function parseLogLevel(value: unknown): CbsLspLogLevel | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase() as CbsLspLogLevel;
  return VALID_LOG_LEVELS.has(normalized) ? normalized : undefined;
}

/**
 * parseOptionalPathSetting 함수.
 * 경로 입력을 absent/cleared/path 3-state 규칙으로 정규화함.
 *
 * @param value - CLI/env/config에서 읽은 임의의 경로 값
 * @param baseDir - 상대 경로를 절대 경로로 해석할 기준 디렉터리
 * @returns string이 아니면 undefined, 비어 있으면 null, 아니면 절대 경로 문자열
 */
function parseOptionalPathSetting(
  value: unknown,
  baseDir: string,
): string | null | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return path.isAbsolute(trimmed) ? trimmed : path.resolve(baseDir, trimmed);
}

/**
 * getRuntimeConfigRoot 함수.
 * raw initialize option/config JSON에서 runtime config root 후보를 찾는다.
 *
 * @param value - initialize option 또는 config file JSON의 최상위 값
 * @returns cbs.runtimeConfig 우선 fallback 규칙이 반영된 root object
 */
function getRuntimeConfigRoot(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  const rawCbs = isRecord(value.cbs) ? value.cbs : value;
  return isRecord(rawCbs.runtimeConfig) ? rawCbs.runtimeConfig : rawCbs;
}

/**
 * parseBootstrapConfigValues 함수.
 * config file discovery 전에 필요한 bootstrap 값만 추출한다.
 *
 * @param value - initialize option 또는 config file JSON의 최상위 값
 * @param baseDir - 상대 경로를 해석할 기준 디렉터리
 * @returns configPath/workspacePath bootstrap 후보
 */
function parseBootstrapConfigValues(
  value: unknown,
  baseDir: string,
): BootstrapConfigValues {
  const root = getRuntimeConfigRoot(value);

  return {
    configPath: parseOptionalPathSetting(root.configPath, baseDir),
    workspacePath:
      parseOptionalPathSetting(root.workspacePath, baseDir) ??
      parseOptionalPathSetting(root.workspace, baseDir),
  };
}

/**
 * parseRuntimeConfigValues 함수.
 * runtime field를 precedence 병합에 바로 넣을 수 있는 값으로 정규화한다.
 *
 * @param value - initialize option 또는 config file JSON의 최상위 값
 * @param baseDir - 상대 경로를 해석할 기준 디렉터리
 * @returns runtime field만 담은 정규화된 config values
 */
function parseRuntimeConfigValues(
  value: unknown,
  baseDir: string,
): RuntimeConfigValues {
  const root = getRuntimeConfigRoot(value);
  const luaLs = isRecord(root.luaLs) ? root.luaLs : {};

  return {
    logLevel: parseLogLevel(root.logLevel),
    luaLsExecutablePath:
      parseOptionalPathSetting(luaLs.executablePath, baseDir) ??
      parseOptionalPathSetting(root.luaLsExecutablePath, baseDir) ??
      parseOptionalPathSetting(root.lualsPath, baseDir),
    workspacePath:
      parseOptionalPathSetting(root.workspacePath, baseDir) ??
      parseOptionalPathSetting(root.workspace, baseDir),
  };
}

/**
 * createCliLayer 함수.
 * CLI override를 runtime layer와 bootstrap 값으로 분리해 정규화한다.
 *
 * @param overrides - CLI에서 받은 override 집합
 * @param cwd - CLI 상대 경로를 해석할 기준 작업 디렉터리
 * @returns runtime 병합용 layer와 config path bootstrap 값
 */
function createCliLayer(
  overrides: CbsLspRuntimeConfigOverrides | undefined,
  cwd: string,
): { configPath?: string | null; layer: RuntimeConfigLayer } {
  return {
    configPath: parseOptionalPathSetting(overrides?.configPath, cwd),
    layer: {
      source: 'cli',
      values: {
        logLevel: overrides?.logLevel,
        luaLsExecutablePath: parseOptionalPathSetting(overrides?.luaLsExecutablePath, cwd),
        workspacePath: parseOptionalPathSetting(overrides?.workspacePath, cwd),
      },
    },
  };
}

/**
 * createEnvLayer 함수.
 * process env를 runtime layer로 정규화한다.
 *
 * @param env - process env 또는 테스트에서 주입한 env
 * @param cwd - env 상대 경로를 해석할 기준 작업 디렉터리
 * @returns env source가 붙은 runtime layer
 */
function createEnvLayer(env: NodeJS.ProcessEnv, cwd: string): RuntimeConfigLayer {
  return {
    source: 'env',
    values: {
      logLevel: parseLogLevel(env.CBS_LSP_LOG_LEVEL),
      luaLsExecutablePath: parseOptionalPathSetting(env.CBS_LSP_LUALS_PATH, cwd),
      workspacePath: parseOptionalPathSetting(env.CBS_LSP_WORKSPACE, cwd),
    },
  };
}

/**
 * createInitializationLayer 함수.
 * initialize option을 runtime 병합용 layer로 정규화한다.
 *
 * @param initializationOptions - LSP initialize에서 넘어온 raw options
 * @param cwd - initialize 상대 경로를 해석할 기준 작업 디렉터리
 * @returns initialize source가 붙은 runtime layer
 */
function createInitializationLayer(
  initializationOptions: unknown,
  cwd: string,
): RuntimeConfigLayer {
  return {
    source: 'initialize',
    values: parseRuntimeConfigValues(initializationOptions, cwd),
  };
}

/**
 * discoverConfigPath 함수.
 * 명시 config path가 없을 때 workspace 후보와 cwd 주변의 기본 파일명을 순서대로 탐색한다.
 *
 * @param exists - 후보 파일 존재 여부를 확인할 로더
 * @param cwd - standalone 실행 기준 현재 작업 디렉터리
 * @param workspaceCandidates - discovery 전에 이미 알려진 workspace 후보 목록
 * @returns 발견한 config 파일 절대 경로, 없으면 null
 */
function discoverConfigPath(
  exists: (filePath: string) => boolean,
  cwd: string,
  workspaceCandidates: readonly (string | null | undefined)[],
): string | null {
  const candidateDirectories = [...workspaceCandidates, cwd].filter(
    (value, index, array): value is string =>
      typeof value === 'string' && value.length > 0 && array.indexOf(value) === index,
  );

  for (const directory of candidateDirectories) {
    for (const fileName of DEFAULT_CONFIG_FILE_NAMES) {
      const candidatePath = path.join(directory, fileName);
      if (exists(candidatePath)) {
        return candidatePath;
      }
    }
  }

  return null;
}

/**
 * resolveExplicitConfigPath 함수.
 * config file path bootstrap 값을 CLI → env → initialize 순서로 해석한다.
 *
 * @param cliConfigPath - CLI override에서 정규화한 config path 값
 * @param env - process env 또는 테스트에서 주입한 env
 * @param initializationConfigPath - initialize option에서 읽은 config path 값
 * @param cwd - env 상대 경로를 절대 경로로 해석할 기준 작업 디렉터리
 * @returns 명시적으로 선택된 config path와 source, 없으면 undefined
 */
function resolveExplicitConfigPath(
  cliConfigPath: string | null | undefined,
  env: NodeJS.ProcessEnv,
  initializationConfigPath: string | null | undefined,
  cwd: string,
): { path: string | null; source: ExplicitConfigFilePathSource } | undefined {
  if (cliConfigPath !== undefined) {
    return { path: cliConfigPath, source: 'cli' };
  }

  const envConfigPath = parseOptionalPathSetting(
    env.CBS_LSP_CONFIG ?? env.CBS_LANGUAGE_SERVER_CONFIG,
    cwd,
  );
  if (envConfigPath !== undefined) {
    return { path: envConfigPath, source: 'env' };
  }

  if (initializationConfigPath !== undefined) {
    return { path: initializationConfigPath, source: 'initialize' };
  }

  return undefined;
}

/**
 * resolveConfigFilePath 함수.
 * config file path bootstrap과 discovery 단계를 하나의 결과로 정리한다.
 *
 * @param options - explicit path 후보, discovery 입력, 파일 존재 로더를 묶은 옵션
 * @returns 최종 config file path와 그 source 정보
 */
function resolveConfigFilePath(
  options: ResolveConfigFilePathOptions,
): ResolvedConfigFilePath {
  const explicitConfigPath = resolveExplicitConfigPath(
    options.cliConfigPath,
    options.env,
    options.initializationConfigPath,
    options.cwd,
  );
  if (explicitConfigPath) {
    return explicitConfigPath;
  }

  const discoveredPath = discoverConfigPath(
    options.exists,
    options.cwd,
    options.workspaceCandidates,
  );
  if (discoveredPath) {
    return { path: discoveredPath, source: 'discovered' };
  }

  return { path: null, source: 'none' };
}

/**
 * loadConfigFileLayer 함수.
 * 선택된 config 파일을 읽어 runtime 병합용 config layer로 변환한다.
 *
 * @param filePath - bootstrap/discovery 단계에서 결정된 config 파일 경로
 * @param exists - 파일 존재 여부를 확인할 로더
 * @param readFile - 파일 본문을 읽을 로더
 * @returns config source가 붙은 runtime layer
 */
function loadConfigFileLayer(
  filePath: string | null,
  exists: (filePath: string) => boolean,
  readFile: (filePath: string) => string,
): RuntimeConfigLayer {
  if (!filePath || !exists(filePath)) {
    return {
      source: 'config',
      values: {},
    };
  }

  try {
    const fileText = readFile(filePath);
    const parsed = JSON.parse(fileText) as unknown;

    return {
      source: 'config',
      values: parseRuntimeConfigValues(parsed, path.dirname(filePath)),
    };
  } catch (error) {
    throw new RuntimeConfigFileError(filePath, error);
  }
}

/**
 * resolveField 함수.
 * precedence layer를 앞에서부터 훑으며 value와 source를 함께 결정한다.
 *
 * @param layers - 높은 우선순위부터 정렬된 runtime layer 목록
 * @param read - 각 layer에서 읽을 field selector
 * @param defaultValue - 어떤 layer도 값을 제공하지 않을 때 사용할 기본값
 * @returns 최종 선택된 값과 source metadata
 */
function resolveField<T>(
  layers: readonly RuntimeConfigLayer[],
  read: (values: RuntimeConfigValues) => T | undefined,
  defaultValue: T,
): ResolvedRuntimeField<T> {
  for (const layer of layers) {
    const value = read(layer.values);
    if (value !== undefined) {
      return {
        source: layer.source,
        value,
      };
    }
  }

  return {
    source: 'default',
    value: defaultValue,
  };
}

/**
 * resolveRuntimeConfig 함수.
 * layer 생성 → config path bootstrap → runtime field 병합 순서로 최종 runtime config를 만든다.
 *
 * @param options - 런타임 설정 입력 소스와 파일 로더 옵션
 * @returns 우선순위가 고정된 최종 runtime config와 source 메타데이터
 */
export function resolveRuntimeConfig(
  options: RuntimeConfigLoaderOptions = {},
): ResolvedCbsLspRuntimeConfig {
  const context = createRuntimeConfigContext(options);
  const initializationBootstrap = parseBootstrapConfigValues(
    context.initializationOptions,
    context.cwd,
  );
  const cliLayer = createCliLayer(context.overrides, context.cwd);
  const envLayer = createEnvLayer(context.env, context.cwd);
  const initializationLayer = createInitializationLayer(
    context.initializationOptions,
    context.cwd,
  );
  const configFile = resolveConfigFilePath({
    cliConfigPath: cliLayer.configPath,
    cwd: context.cwd,
    env: context.env,
    exists: context.exists,
    initializationConfigPath: initializationBootstrap.configPath,
    workspaceCandidates: [
      cliLayer.layer.values.workspacePath,
      envLayer.values.workspacePath,
      initializationBootstrap.workspacePath,
    ],
  });
  const configLayer = loadConfigFileLayer(configFile.path, context.exists, context.readFile);
  const runtimeLayers = [cliLayer.layer, envLayer, configLayer, initializationLayer] as const;

  const logLevel = resolveField(runtimeLayers, (values) => values.logLevel, DEFAULT_LOG_LEVEL);
  const workspacePath = resolveField(runtimeLayers, (values) => values.workspacePath, null);
  const luaLsExecutablePath = resolveField(
    runtimeLayers,
    (values) => values.luaLsExecutablePath,
    null,
  );

  return {
    config: {
      configFilePath: configFile.path,
      logLevel: logLevel.value,
      luaLsExecutablePath: luaLsExecutablePath.value,
      workspacePath: workspacePath.value,
    },
    sources: {
      configFilePath: configFile.source,
      logLevel: logLevel.source,
      luaLsExecutablePath: luaLsExecutablePath.source,
      workspacePath: workspacePath.source,
    },
  };
}
