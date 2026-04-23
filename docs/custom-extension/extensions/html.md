# `.risuhtml`

`html`은 charx / module에서 background HTML payload를 담는 singleton artifact다. 파일 전체가 HTML source이며, 현재는 **full-file CBS-bearing**으로 취급한다.

## 지원 대상 / 위치

- 지원 대상: `charx`, `module`
- 미지원 대상: `preset`
- 디렉토리: `html/`
- 파일명: `background.risuhtml` 고정

## 형식

- 파일 전체가 raw HTML / script / style source다.
- parse / serialize는 identity transform을 기본으로 한다.
- HTML 내부 CBS는 section 분리 없이 전체 파일 범위 안에서 처리한다.

## 현재 계약

- fixed filename이므로 `html/background.risuhtml` 외 다른 stem은 active contract가 아니다.
- duplicate file은 오류로 처리한다.
- LSP는 파일 전체를 CBS-bearing 문서로 볼 수 있다.

## upstream 매핑

| target | upstream surface |
|---|---|
| charx | `extensions.risuai.backgroundHTML` |
| module | `backgroundEmbedding` |

## 예시

```html
<script>
.settings-panel {
  {{#if {{? {{screen_width}} > 768 }} }}
  width: 33%;
  {{/if}}
}
</script>
```
