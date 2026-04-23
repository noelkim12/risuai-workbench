# 모듈 도메인 (Module Domain)

이 문서는 `packages/core/src/domain/module/`에 정의된 순수 모듈 객체(Module Object) 헬퍼만을 다룹니다. 패키징, 추출, CLI 워크플로우 전반에 대한 설명은 이 문서에 포함되지 않습니다.

## 이 페이지가 담당하는 범위

- 가공되지 않은(Raw) 모듈 객체로부터 로어북, 정규식, 트리거(Trigger), 배경 임베딩 정보를 읽어들이는 얇은 헬퍼
- 모듈 DTO 타입 내보내기 명세

## 구현 명세 (Current Truth)

- `packages/core/src/domain/module/index.ts`는 현재 네 개의 주요 공개 헬퍼를 제공합니다: `getModuleLorebookEntriesFromModule`, `getModuleRegexScriptsFromModule`, `getModuleTriggersFromModule`, `getModuleBackgroundEmbeddingFromModule`.
- 모든 배열 관련 헬퍼는 입력값이 유효한 배열이 아닐 경우 빈 배열을 반환합니다.
- `backgroundEmbedding` 헬퍼는 입력값이 문자열이 아닐 경우 빈 문자열을 반환합니다.
- 루트 도메인 배럴(Barrel)은 이 위치를 통해 `MCPModule`, `RisuModule` 타입을 재내보내기합니다.

## 주요 공개 인터페이스

| 구분 | 주요 인터페이스 예시 |
|---|---|
| 배열 처리 헬퍼 | `getModuleLorebookEntriesFromModule`, `getModuleRegexScriptsFromModule`, `getModuleTriggersFromModule` |
| 문자열 처리 헬퍼 | `getModuleBackgroundEmbeddingFromModule` |
| 주요 타입 | `MCPModule`, `RisuModule` |

## 현재 구현 확정 사항

- 헬퍼는 모듈 페이로드를 직접 해석하거나 보정하지 않으며, 단순하고 안전한 읽기 어댑터(Safe Read Adapter) 역할만을 수행합니다.
- 로어북은 `module.lorebook`, 정규식은 `module.regex`, 트리거는 `module.trigger`, 배경 HTML은 `module.backgroundEmbedding` 필드만을 참조합니다.
- 반환 타입은 모두 순수 데이터(Pure Data) 형식입니다. 파일 시스템 작업이나 아카이브 파싱 로직은 포함하지 않습니다.

## 범위 명세 (Scope Boundary)

- 표준 모듈 워크스페이스 레이아웃 및 `metadata.json`, `toggle/`, `variables/`, `assets/` 소유권 규칙은 [`../../custom-extension/targets/module.md`](../../custom-extension/targets/module.md)에서 담당합니다.
- 모듈 추출, 패키징, `.risum` 파일 처리, 에셋 언팩(Unpack) 작업은 Node/CLI 계층의 영역입니다.
- 이 페이지는 전체 워크플로우나 유효성 검사 정책을 보장하지 않으며, 오직 순수 객체 헬퍼 명세만을 다룹니다.

## evidence anchors

- `../../../packages/core/src/domain/module/index.ts`
- `../../../packages/core/src/domain/module/contracts.ts`
- `../../../packages/core/tests/export-surface.test.ts`
- `../../../packages/core/tests/module-extract.test.ts`
- `../../../packages/core/tests/custom-extension/module-canonical-pack.test.ts`

## 같이 읽을 문서

- [`../targets/root-browser.md`](../targets/root-browser.md)
- [`./custom-extension.md`](./custom-extension.md)
- [`./lorebook.md`](./lorebook.md)
- [`./regex.md`](./regex.md)
- [`../../custom-extension/targets/module.md`](../../custom-extension/targets/module.md)
