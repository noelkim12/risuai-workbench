# 프리셋 도메인 (Preset Domain)

이 문서는 `packages/core/src/domain/preset/`에 정의된 순수 프리셋 객체(Preset Object) 헬퍼만을 다룹니다. 프리셋 템플릿 베이스 오버레이(Base Overlay)나 CLI 워크플로우 전반에 대한 설명은 이 문서에 포함되지 않습니다.

## 이 페이지가 담당하는 범위

- 가공되지 않은(Raw) 프리셋 객체로부터 주요 프롬프트 텍스트를 읽어들이는 헬퍼
- 프리셋 객체로부터 `promptTemplate` 항목 배열을 읽어들이는 헬퍼

## 구현 명세 (Current Truth)

- 현재 제공되는 순수 프리셋 헬퍼는 `getPresetPromptTextsFromPreset`, `getPresetPromptTemplateItemsFromPreset` 두 가지입니다.
- 프롬프트 텍스트 헬퍼는 `mainPrompt`, `jailbreak`, `globalNote` 필드만을 참조합니다.
- 해당 값이 문자열이고 비어 있지 않은 경우에만 분석 결과에 포함합니다.
- 프롬프트 템플릿 헬퍼는 `promptTemplate` 필드가 배열 형식일 때만 각 항목을 레코드(Record) 형태로 정규화하여 반환합니다.

## 주요 공개 인터페이스

| 구분 | 주요 인터페이스 예시 |
|---|---|
| 프롬프트 텍스트 | `getPresetPromptTextsFromPreset` |
| 템플릿 항목 | `getPresetPromptTemplateItemsFromPreset` |

## 현재 구현 확정 사항

- 프롬프트 텍스트 반환 시 키(Key) 이름은 `main`, `jailbreak`, `global_note` 세 가지로 고정됩니다.
- 누락된 필드는 별도의 자리표시자(Placeholder) 객체를 생성하지 않고 조용히 결과에서 제외됩니다.
- 이 헬퍼들은 프리셋의 정규식, 토글, 프로바이더 설정, 고급 설정 내역을 직접 다루지 않습니다.

## 범위 명세 (Scope Boundary)

- 표준 프리셋 워크스페이스 레이아웃 및 `prompt_template/`, `regex/`, `toggle/`, `prompts/`, `parameters.json`과 같은 보조 인터페이스 명세는 [`../../custom-extension/targets/preset.md`](../../custom-extension/targets/preset.md)를 신뢰 기준(Source of Truth)으로 삼습니다.
- 프리셋 추출, `.risup` 바이너리 처리, 베이스 템플릿 오버레이 로직은 Node/CLI 계층의 영역입니다.
- 이 페이지는 전체 프리셋 작성 명세(Authoring Contract)가 아닌, 순수 객체 읽기 헬퍼 명세만을 다룹니다.

## evidence anchors

- `../../../packages/core/src/domain/preset/index.ts`
- `../../../packages/core/tests/export-surface.test.ts`
- `../../../packages/core/tests/preset-extract-risup.test.ts`
- `../../../packages/core/tests/custom-extension/preset-canonical-pack.test.ts`

## 같이 읽을 문서

- [`../targets/root-browser.md`](../targets/root-browser.md)
- [`./custom-extension.md`](./custom-extension.md)
- [`./regex.md`](./regex.md)
- [`../../custom-extension/targets/preset.md`](../../custom-extension/targets/preset.md)
