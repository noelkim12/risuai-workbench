/**
 * 문서 경로를 CBS artifact 타입과 diagnostics 라우팅 대상으로 분류하는 유틸 모음.
 * @file packages/cbs-lsp/src/utils/document-router.ts
 */

import {
  isCbsBearingFile as isCbsBearingFileCore,
  isNonCbsArtifact,
  parseCustomExtensionArtifactFromPath,
  type CustomExtensionArtifact,
} from 'risu-workbench-core'

/**
 * SUPPORTED_CBS_EXTENSIONS 상수.
 * LSP diagnostics 라우팅 대상이 되는 CBS-bearing 확장자를 모음.
 */
export const SUPPORTED_CBS_EXTENSIONS = [
  '.risulorebook',
  '.risuregex',
  '.risuprompt',
  '.risuhtml',
  '.risulua',
] as const

/**
 * EXPLICITLY_IGNORED_EXTENSIONS 상수.
 * CBS fragment가 없어 라우팅에서 명시적으로 제외하는 확장자를 모음.
 */
export const EXPLICITLY_IGNORED_EXTENSIONS = [
  '.risutoggle',
  '.risuvar',
] as const

/**
 * isCbsBearingFile 함수.
 * 파일 경로가 CBS-bearing artifact인지 core 분류 규칙으로 판별함.
 *
 * @param filePath - CBS-bearing 여부를 판별할 문서 경로
 * @returns CBS diagnostics 대상으로 봐야 하면 true
 */
export function isCbsBearingFile(filePath: string): boolean {
  return isCbsBearingFileCore(filePath)
}

/**
 * getArtifactTypeFromPath 함수.
 * 파일 경로를 custom-extension artifact 타입으로 해석하고 non-CBS/unknown은 null로 돌려줌.
 *
 * @param filePath - artifact 타입을 해석할 문서 경로
 * @returns 지원하는 CBS artifact 타입, 아니면 null
 */
export function getArtifactTypeFromPath(filePath: string): CustomExtensionArtifact | null {
  try {
    const artifact = parseCustomExtensionArtifactFromPath(filePath)
    if (isNonCbsArtifact(artifact)) {
      return null
    }
    return artifact
  } catch {
    return null
  }
}

/**
 * shouldRouteForDiagnostics 함수.
 * 문서가 CBS diagnostics 라우팅 대상인지 빠르게 판별함.
 *
 * @param filePath - diagnostics 라우팅 여부를 확인할 문서 경로
 * @returns 라우팅 대상이면 true, ignored/unknown이면 false
 */
export function shouldRouteForDiagnostics(filePath: string): boolean {
  return isCbsBearingFile(filePath)
}
