# `.risulua`

`lua`는 charx / module이 사용하는 canonical singleton artifact다. 현재 구현은 upstream `triggerscript`를 function 단위로 쪼개지 않고 **파일 전체를 그대로 보존**한다.

## 지원 대상 / 위치

- 지원 대상: `charx`, `module`
- 미지원 대상: `preset`
- 디렉토리: `lua/`
- suffix: `.risulua`
- stem policy: target name 기반 singleton

## 형식

- 파일 전체가 raw Lua source다.
- 별도 frontmatter나 section marker가 없다.
- parse / serialize는 identity transform을 기본으로 한다.

## CBS 해석 (현재 truth)

- 현재 `cbs-fragments.ts` 기준 `.risulua`는 **파일 전체를 단일 CBS fragment**로 본다.
- 즉 현재 LSP truth는 "Lua AST 기반 string-literal 추출"이 아니라 **full-file first-cut routing**이다.
- future T15/T15+에서 literal-only fragment extraction을 하더라도, 그것은 아직 active contract가 아니다.

## upstream 매핑

| target | upstream surface |
|---|---|
| charx | `triggerscript` |
| module | module trigger/lua payload |

## singleton / 오류 규칙

- target당 `.risulua`는 하나만 허용한다.
- duplicate source는 자동 병합하지 않고 오류로 처리한다.
- preset에서 `.risulua`를 authoring surface로 쓰는 것은 계약 위반이다.

## 예시

```lua
function onInput()
  if {{getvar::flag}} == "1" then
    return "ok"
  end
  return "fallback"
end
```
