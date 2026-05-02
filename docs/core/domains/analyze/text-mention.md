# 텍스트 언급 분석 (Text Mention)

이 페이지는 로어북 본문에서 평문(Plain Text) 형태의 언급 내역을 탐색하는 텍스트 언급 분석기(Text Mention Analyzer) 명세만을 다룹니다.

## 현재 공개 인터페이스

- 루트 브라우저 엔트리에서 재내보내기되는 인터페이스는 `analyzeTextMentions` 함수와 `TextMentionEdge` 타입입니다.
- 근거는 [`../../../../packages/core/src/domain/index.ts`](../../../../packages/core/src/domain/index.ts), [`../../targets/root-browser.md`](../../targets/root-browser.md), [`../../../../packages/core/tests/export-surface.test.ts`](../../../../packages/core/tests/export-surface.test.ts)입니다.

## 현재 구현 명세

- `analyzeTextMentions(entries, variables, functions, lorebookEntries?)` 함수는 로어북 내용을 스캔하여 다음 세 가지 유형의 연결선(Edge)을 생성합니다.
  - `variable-mention`: 변수 이름 언급
  - `lua-mention`: Lua 함수 이름 언급
  - `lorebook-mention`: 다른 로어북 엔트리 이름 또는 키워드 언급
- 변수명, 함수명, 로어북 용어의 길이가 3자 미만인 경우, 오탐 방지를 위해 분석 대상에서 제외합니다.
- 정규식 분석 시 단어 경계(`\b`) 대신 `(^|[^a-zA-Z0-9_]) ... (?=[^a-zA-Z0-9_]|$)` 패턴을 사용하여 한글 및 유니코드 텍스트의 경계를 정확히 식별합니다.
- 로어북 언급 분석 시 엔트리 이름과 `keys[]` 배열 전체를 검색 대상 용어로 사용합니다.
- 동일한 용어가 여러 엔트리를 동시에 가리키는 경우(Ambiguous), 모호성 제거를 위해 해당 연결은 무시합니다.
- 동일한 출처 엔트리에서 동일한 대상으로 향하는 중복 연결선은 하나로 통합(Dedupe)합니다.
- 자기 자신을 가리키는 로어북 언급은 생성하지 않습니다.

## 출력 명세 (Contract)

`TextMentionEdge`는 다음과 같은 필드로 구성됩니다.

- `sourceEntry`: 언급이 발생한 출처 엔트리
- `target`: 언급된 대상 이름
- `type`: 언급 유형

이 분석기는 언급된 구체적인 위치, 횟수, 가중치 점수 등은 반환하지 않습니다.

## 현재 사용 위치

- 캐릭터 및 모듈 분석 워크플로우에서 로어북, Lua, 변수 집합을 수집한 후 이 분석기를 호출합니다.
- 관계 네트워크(Relationship Network) 및 Wiki 체인 문서에서 이 결과를 소비합니다.
- 근거는 [`../../../../packages/core/src/cli/analyze/charx/workflow.ts`](../../../../packages/core/src/cli/analyze/charx/workflow.ts), [`../../../../packages/core/src/cli/analyze/module/workflow.ts`](../../../../packages/core/src/cli/analyze/module/workflow.ts), [`../../../../packages/core/src/cli/analyze/shared/relationship-network-builders.ts`](../../../../packages/core/src/cli/analyze/shared/relationship-network-builders.ts)입니다.

## 범위 경계

- CBS `getvar` / `setvar` 매크로 자체의 추출은 이 분석기의 범위가 아니며, 상관관계(Correlation) 및 변수 흐름 분석 계열에서 담당합니다.
- 이 분석기는 순수 텍스트 언급만을 다룹니다. 활성화 체인(Activation Chain) 판정이나 실제 아티팩트 간 의존성을 단독으로 보증하지 않습니다.


## evidence anchors

- 소스: [`../../../../packages/core/src/domain/analyze/text-mention.ts`](../../../../packages/core/src/domain/analyze/text-mention.ts)
- 테스트: [`../../../../packages/core/tests/text-mention.test.ts`](../../../../packages/core/tests/text-mention.test.ts)

## 같이 읽을 문서

- [`./correlation.md`](./correlation.md)
- [`./lua-analysis.md`](./lua-analysis.md)
- [`./README.md`](./README.md)
