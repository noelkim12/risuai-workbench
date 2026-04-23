# 정규식 도메인 (Regex Domain)

이 문서는 `packages/core/src/domain/regex/`에 정의된 순수 정규식 표준 어댑터(Canonical Adapter) 및 CBS 변수 헬퍼 명세만을 다룹니다.

## 이 페이지가 담당하는 범위

- `.risuregex` 단일 파일을 표준 객체로 파싱(Parse) 및 직렬화(Serialize)하는 헬퍼
- 캐릭터/모듈/프리셋의 상위(Upstream) 형상과 표준 정규식 배열 간의 순수 주입(Inject) 및 추출(Extract) 로직
- 정규식 스크립트 내 CBS 읽기/쓰기 내역 추출
- 기본 변수(`defaultVariables`) 원본 데이터를 텍스트나 JSON으로부터 평탄화된 맵(Flat Map)으로 읽어들이는 헬퍼

## 구현 명세 (Current Truth)

- 루트 내보내기는 `parseRegexContent`, `serializeRegexContent`, `extractRegexFromCharx`, `extractRegexFromModule`, `extractRegexFromPreset`, `injectRegexIntoCharx`, `injectRegexIntoModule`, `injectRegexIntoPreset`, `buildRegexPath`, `extractRegexScriptOps`, `collectRegexCBSFromScripts`, `parseDefaultVariablesText`, `parseDefaultVariablesJson` 함수를 노출합니다.
- 현재 지원하는 정규식 타입은 `editinput`, `editoutput`, `editdisplay`, `editprocess`, `edittrans`, `disabled`의 6종입니다.
- 표준 정규식 엔트리는 `comment`, `type`, 선택적인 `flag` 및 `ableFlag`, `in`, `out` 필드로 구성됩니다.
- 프리셋 브리지(Preset Bridge) 처리 시, 추출 단계에서는 `presetRegex`를 사용하고 패키징 단계의 표준 문서에서는 페이로드 `regex`로 연결되는 비대칭 구조가 존재합니다.

## 주요 공개 인터페이스

| 구분 | 주요 인터페이스 예시 |
|---|---|
| 표준 파일 어댑터 | `parseRegexContent`, `serializeRegexContent`, `CanonicalRegexEntry` |
| 상위 브리지 (Upstream Bridge) | `extractRegexFromCharx`, `extractRegexFromModule`, `injectRegexIntoCharx` |
| 명명 및 타입 | `buildRegexPath`, `REGEX_TYPES` |
| CBS 헬퍼 | `extractRegexScriptOps`, `collectRegexCBSFromCharx` |
| 변수 파싱 | `parseDefaultVariablesText`, `parseDefaultVariablesJson` |

## 현재 구현 확정 사항

- 프론트매터(Frontmatter)는 필수 항목인 `comment`, `type`만을 허용하며, 알 수 없는 키가 포함된 경우 거부(Reject)합니다.
- `@@@ IN` 및 `@@@ OUT` 마커가 모두 존재해야 합니다.
- 누락된 선택적 필드(Optional field)와 명시적으로 지정된 기본값은 서로 다르게 구분하여 보존합니다.
- `buildRegexPath`는 정제된 스템(Stem) 이름을 사용하여 `regex/<stem>.risuregex` 경로를 생성합니다.
- 정규식 스크립트의 CBS 추출 시 `in`, `out`, `flag` 필드를 우선적으로 탐색하며, 비어 있는 경우 `script` 또는 `content` 필드를 폴백(Fallback)으로 참조합니다.

## 범위 명세 (Scope Boundary)

- 정규식 디렉토리 순서 지정 및 `_order.json` 워크스페이스 레이아웃에 대한 설명은 [`../../custom-extension/extensions/regex.md`](../../custom-extension/extensions/regex.md)에서 담당합니다.
- 정규식을 실제 파일로 추출하거나 패키징하는 CLI 워크플로우는 이 문서의 범위가 아닙니다.
- 로어북 및 Lua와의 상관관계 리포트(Correlation Report) 분석은 [`./analyze/README.md`](./analyze/README.md) 및 하위 문서에서 담당합니다.

## evidence anchors

- `../../../packages/core/src/domain/regex/index.ts`
- `../../../packages/core/src/domain/regex/contracts.ts`
- `../../../packages/core/src/domain/regex/adapter.ts`
- `../../../packages/core/src/domain/regex/scripts.ts`
- `../../../packages/core/tests/custom-extension/regex-canonical.test.ts`
- `../../../packages/core/tests/domain-phase1-extraction.test.ts`
- `../../../packages/core/tests/module-extract.test.ts`
- `../../../packages/core/tests/export-surface.test.ts`

## 같이 읽을 문서

- [`../targets/root-browser.md`](../targets/root-browser.md)
- [`./charx.md`](./charx.md)
- [`./module.md`](./module.md)
- [`./preset.md`](./preset.md)
- [`../../custom-extension/extensions/regex.md`](../../custom-extension/extensions/regex.md)
