# Lua 표준 (.risulua)

`.risulua`는 캐릭터 카드(charx)와 모듈(module)에서 사용하는 표준 Lua 아티팩트 명세입니다. 현재 구현은 상위의 `triggerscript` 데이터를 함수 단위로 분할하지 않고 **파일 전체를 원본 그대로 보존**하는 레거시 싱글톤 모드를 채택하고 있습니다. 번들 모드는 같은 `.risulua` 확장자 위에 얹는 신규 작성 컨벤션이며, RisuAI 런타임 hook 계약이나 최종 Lua 확장자를 바꾸지 않는 향후 구현 대상 명세입니다.

## 지원 범위 및 위치

- **지원 대상**: 캐릭터 카드(`charx`), 모듈(`module`)
- **미지원 대상**: 프리셋(`preset`)
- **파일 위치**: `lua/` 디렉토리, 번들 모드의 최종 생성물은 `dist/` 디렉토리
- **확장자**: `.risulua`
- **파일명 규칙**: 레거시 싱글톤 모드는 대상 이름(Target name) 기반 단일 파일을 사용합니다. 번들 모드는 `lua/main.risulua`를 작성 진입점으로 삼고 `dist/<targetName>.risulua`를 유일한 생성 산출물로 사용합니다.

## 작성 모드

`.risulua`는 두 가지 모드를 명확히 구분합니다.

### 레거시 싱글톤 모드 (현재 구현)

- 대상당 하나의 `lua/<targetName>.risulua` 파일만 둡니다.
- 이 파일은 상위 `triggerscript` 또는 모듈 Lua 페이로드를 원본 그대로 보존하는 표준 편집 소스입니다.
- 자동 모듈 병합, `require` 해석, 별도 `dist/` 생성은 수행하지 않습니다.

### 번들 모드 (컨벤션 및 향후 구현 명세)

- 루트 `.risuchar` 또는 `.risumodule`가 패키지 manifest처럼 동작하는 root marker가 됩니다. 별도 `package.json` 같은 Lua 전용 manifest를 만들지 않습니다.
- 작성 진입점은 오직 `lua/main.risulua`입니다.
- `lua/**/*.risulua`는 작성용 source module입니다. 예시는 `lua/common/variables.risulua`, `lua/common/function.risulua`입니다.
- `dist/<targetName>.risulua`는 빌드가 만드는 유일한 pack artifact입니다. `dist/` 아래 파일은 직접 편집하는 source가 아닙니다.
- 번들 모드는 `.risulua` 확장자를 그대로 사용합니다. 작성 모듈과 최종 생성물 모두 프로젝트 전용 `.risulua` LSP의 분석 대상입니다.

## 번들 모드 import 및 런타임 경계

- `require("path.to.module")`는 빌드 타임 전용 문법입니다. 경로는 루트 `lua/` 디렉토리를 기준으로 해석합니다.
- 최종 `dist/<targetName>.risulua`에는 `require` 호출이 남아 있으면 안 됩니다. 빌드 결과는 RisuAI가 읽는 단일 Lua 파일이어야 합니다.
- 동적 `require`, `package.path` 수정, `dofile`, `loadfile`, 런타임 파일시스템 로딩은 번들 모드에서 금지합니다.
- 최종 dist는 사용자가 정의한 RisuAI 전역 hook, 예를 들어 `onOutput`, `onButtonClick`, `onInput`, `onStart`를 보존해야 합니다.
- 최종 dist는 RisuAI host 또는 wrapper가 주입하는 `async`, `json`, `getChatVar`, `setChatVar`, `getDualFlag`, `setDualFlag` 같은 전역을 외부 런타임 global로 취급해야 합니다. 빌드가 이 이름들을 로컬 구현으로 대체하거나 제거해서는 안 됩니다.

## 표준 파일 형식 (Format)

- 파일의 내용 전체가 가공되지 않은 Lua 소스 코드입니다.
- 별도의 프론트매터(YAML)나 섹션 마커(`@@@`)를 사용하지 않습니다.
- 파싱 및 직렬화 시 데이터의 변형 없이 있는 그대로를 유지(Identity transform)합니다.
- 번들 모드의 빌드 산출물도 동일하게 plain Lua 소스인 `.risulua` 파일입니다. 차이는 파일 확장자가 아니라 작성 source와 생성 artifact의 역할 구분입니다.

## CBS 분석 영역 (현재 구현 명세)

- **전체 분석**: 현재 `cbs-fragments.ts` 기준, `.risulua` 파일은 **파일 전체를 단일한 CBS 조각**으로 간주합니다.
- **라우팅 정책**: 현재의 LSP 서비스는 Lua AST 분석을 통한 문자열 리터럴 추출이 아닌, 파일 전체를 대상으로 하는 1차 라우팅(First-cut routing) 방식을 사용합니다.
- **향후 계획**: 리터럴 단위의 정밀한 조각 추출(Literal-only fragment extraction) 기능은 향후 고도화 단계에서 지원될 예정입니다.

## 상위(Upstream) 필드 매핑

| 대상 | 매핑되는 상위 인터페이스 |
|---|---|
| 캐릭터 카드 | `triggerscript` 필드 |
| 모듈 | 모듈 내 트리거(Trigger) 및 Lua 페이로드 영역 |

## 단일 파일 원칙 및 오류 규칙

- **레거시 중복 금지**: 레거시 싱글톤 모드에서는 대상당 단 하나의 `.risulua` 파일만 허용됩니다.
- **번들 산출물 중복 금지**: 번들 모드에서는 `dist/<targetName>.risulua` 하나만 pack artifact로 인정합니다. `lua/**/*.risulua`는 작성 source이며 pack 시 직접 upstream으로 복사하지 않습니다.
- **오류 처리**: 동일한 대상 내에 중복된 싱글톤 산출물이나 둘 이상의 dist pack artifact가 발견될 경우 자동 병합을 시도하지 않고 오류로 처리합니다.
- **사용 제한**: 프리셋 대상에서 `.risulua` 파일을 편집 인터페이스로 사용하는 것은 표준 계약 위반으로 간주됩니다.

## 작성 예시

```lua
function onInput()
  if {{getvar::flag}} == "1" then
    return "성공"
  end
  return "폴백"
end
```
