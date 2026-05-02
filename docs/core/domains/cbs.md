# CBS 도메인 (CBS Domain)

이 문서는 `packages/core/src/domain/cbs/`가 담당하는 순수 CBS 파싱(Parsing), AST(Abstract Syntax Tree), 내장 함수 메타데이터 범위를 다룹니다.

## 이 페이지가 담당하는 범위

- 루트 브라우저 엔트리를 통해 노출되는 CBS 순수 도메인 인터페이스
- CBS 텍스트를 토큰, AST, 진단(Diagnostic) 정보로 해석하는 파서(Parser) 계층
- 내장 함수 레지스트리(Builtin Registry) 및 호버(Hover)용 문서화 헬퍼
- CBS 변수의 읽기/쓰기 발생 내역(Occurrence) 추출

## 구현 명세 (Current Truth)

- `packages/core/src/domain/cbs/index.ts`는 `cbs.ts`, 파서 하위 모듈, 내장 함수 레지스트리, 문서화 헬퍼를 통합하여 재내보내기합니다.
- `cbs.ts`의 주요 공개 기능은 `extractCBSVariableOccurrences`, `extractCBSVarOps`, `CBSVariableOccurrence`, `CBSVarOps`입니다.
- 파서 인터페이스의 중심은 `CBSParser` 클래스와 AST/토큰/비지터(Visitor) 타입 정의입니다.
- 내장 함수 인터페이스는 `CBSBuiltinRegistry`와 내장 함수 메타데이터 신뢰 기준(Source of Truth)을 포함합니다. 레지스트리는 `docOnly` 여부, 별칭, 지원 중단에 따른 대체 함수, 카테고리, 인자 메타데이터 정보를 관리합니다.
- `documentation.ts`는 레지스트리 메타데이터로부터 시그니처 및 호버용 Markdown 내용을 생성합니다.

## 주요 공개 인터페이스

| 구분 | 주요 인터페이스 예시 |
|---|---|
| 변수 발생 내역 | `extractCBSVariableOccurrences`, `extractCBSVarOps` |
| 파서 (Parser) | `CBSParser`, 토큰/AST/파서/비지터 내보내기 |
| 내장 함수 레지스트리 | `CBSBuiltinRegistry`, 내장 함수 메타데이터 헬퍼 |
| 문서화 헬퍼 | `generateDocumentation`, `formatHoverContent` |

## 현재 구현 확정 사항

- `extractCBSVariableOccurrences`는 `getvar`, `setvar`, `addvar`, `setdefaultvar`만을 추적합니다.
- 정적 평문 키(Static Plain Text Key)만을 발생 내역으로 인정하며, 동적 키 접근은 분석 대상에서 제외합니다.
- 파싱 실패 시, 정규식 폴백(Regex Fallback)을 통해 유효한 발생 내역의 복구를 시도합니다.
- `CBSParser`는 중첩된 매크로, `#when`, `#each`, `#func`, 순수 모드(Pure-mode) 블록, 지원 중단된 블록 표기법을 AST 수준에서 보존합니다.
- 내장 함수 레지스트리는 대소문자 구분 없는 조회, 별칭 조회, 출력 이름 정규화, `docOnly` 분류 기능을 제공합니다.

## 범위 명세 (Scope Boundary)

- 이 페이지는 CBS 구문을 어디서 읽어들이는지(로어북/정규식/프롬프트 등 파일별 조각 라우팅)에 대해서는 상세히 다루지 않습니다. 해당 경계는 [`./custom-extension.md`](./custom-extension.md) 및 각 아티팩트 문서에서 정의합니다.
- LSP 프로바이더, 코드 완성(Completion), 호버 페이로드 형상은 `packages/core`의 범위를 벗어납니다.
- 분석 상관관계 그래프에서 CBS가 소비되는 방식은 [`./analyze/README.md`](./analyze/README.md) 및 하위 문서에서 담당합니다.

## evidence anchors

- `../../../packages/core/src/domain/cbs/index.ts`
- `../../../packages/core/src/domain/cbs/cbs.ts`
- `../../../packages/core/src/domain/cbs/registry/builtins.ts`
- `../../../packages/core/src/domain/cbs/registry/documentation.ts`
- `../../../packages/core/tests/domain/cbs/parser.test.ts`
- `../../../packages/core/tests/domain/cbs/builtins.test.ts`
- `../../../packages/core/tests/domain/cbs/cbs-extract.test.ts`
- `../../../packages/core/tests/domain-phase1-extraction.test.ts`
- `../../../packages/core/tests/export-surface.test.ts`

## 같이 읽을 문서

- [`../targets/root-browser.md`](../targets/root-browser.md)
- [`./custom-extension.md`](./custom-extension.md)
- [`./lorebook.md`](./lorebook.md)
- [`./regex.md`](./regex.md)
