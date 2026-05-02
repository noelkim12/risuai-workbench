# HTML 표준 (.risuhtml)

`.risuhtml`은 캐릭터 카드(charx) 및 모듈(module)에서 배경 HTML 페이로드를 담는 표준 단일 파일 아티팩트 명세입니다. 파일 전체가 HTML 소스 코드이며, 현재는 **파일 전체를 CBS 분석 영역**으로 간주합니다.

## 지원 범위 및 위치

- **지원 대상**: 캐릭터 카드(`charx`), 모듈(`module`)
- **미지원 대상**: 프리셋(`preset`)
- **파일 위치**: `html/` 디렉토리
- **파일명 규칙**: `background.risuhtml` 경로로 고정됩니다.

## 표준 파일 형식 (Format)

- 파일의 내용 전체가 가공되지 않은 HTML, Script, Style 소스 코드입니다.
- 파싱 및 직렬화 시 데이터의 변형 없이 있는 그대로를 유지(Identity transform)합니다.
- HTML 내부의 CBS 매크로는 별도의 섹션 구분 없이 파일 전체 범위 내에서 분석 및 처리됩니다.

## 단일 파일 원칙 및 오류 규칙

- **파일명 고정**: `html/background.risuhtml` 이외의 다른 파일명은 표준 계약으로 인정되지 않습니다.
- **중복 금지**: 동일한 대상 내에 중복된 파일이 존재할 경우 오류로 처리합니다.
- **LSP 지원**: 언어 서비스(LSP)는 파일 전체를 CBS 포함 문서로 인식하여 분석 기능을 제공합니다.

## 상위(Upstream) 필드 매핑

| 대상 | 매핑되는 상위 인터페이스 |
|---|---|
| 캐릭터 카드 | `extensions.risuai.backgroundHTML` 필드 |
| 모듈 | `backgroundEmbedding` 필드 |

## 작성 예시

```html
<style>
.settings-panel {
  {{#if {{? {{screen_width}} > 768 }} }}
  width: 33%;
  {{/if}}
}
</style>
<script>
console.log("배경 스크립트 실행 중");
</script>
```
