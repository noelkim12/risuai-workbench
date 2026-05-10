# Lua 표준 (.risulua)

`.risulua`는 캐릭터 카드(charx)와 모듈(module)에서 사용하는 표준 Lua 아티팩트입니다. 사용자가 보는 작성 방식은 **단일 파일 개발**과 **모듈식 개발** 두 가지입니다. `bundle mode`는 내부 구현 개념이며, 문서와 UI에서 주로 노출할 사용자용 이름은 아닙니다.

## 지원 범위 및 위치

- **지원 대상**: 캐릭터 카드(`charx`), 모듈(`module`)
- **미지원 대상**: 프리셋(`preset`)
- **확장자**: `.risulua`
- **모드 옵션**: `--risulua-mode <classic|modular>`
- **단일 파일 개발**: `lua/<targetName>.risulua`
- **모듈식 개발**: 작성 진입점 `lua/main.risulua`, 작성 모듈 `lua/**/*.risulua`, 생성 산출물 `dist/<targetName>.risulua`

## 작성 모드

### 단일 파일 개발

단일 파일 개발은 기존 classic 동작입니다.

- 대상당 하나의 `lua/<targetName>.risulua` 파일을 편집합니다.
- 기존 패키징 동작은 사용자가 `--risulua-mode modular`를 지정하거나 `lua/main.risulua` 자동 감지에 걸리지 않는 한 그대로 유지됩니다.
- 자동 모듈 병합, `require` 해석, `dist/` 재생성은 수행하지 않습니다.
- `lua/main.risulua`가 존재하는 워크스페이스를 단일 파일 개발로 처리해야 할 때는 `--risulua-mode classic`을 명시합니다. 이 escape hatch는 호환성 선택을 분명하게 만들며, 충돌 상태는 결정적으로 실패해야 합니다.

### 모듈식 개발

모듈식 개발은 `lua/main.risulua`를 진입점으로 두고 정적 `require("module.id")` 그래프를 빌드 시 하나의 Lua 파일로 합치는 방식입니다.

- 작성 진입점은 오직 `lua/main.risulua`입니다.
- `lua/**/*.risulua`는 작성용 source module입니다.
- `dist/<targetName>.risulua`는 build가 생성하는 유일한 pack artifact입니다.
- pack은 modular pack 동작에서 dist를 다시 만들고 `dist/<targetName>.risulua`만 upstream Lua로 주입합니다. `lua/main.risulua`나 source module 파일을 직접 주입하지 않습니다.
- extract는 upstream Lua를 `lua/main.risulua`에 씁니다. 현재 구현은 기존 Lua를 자동으로 여러 모듈로 나누지 않습니다.
- scaffold는 `lua/main.risulua`, 예시 모듈, `dist/` 디렉토리까지 만들지만 생성된 dist 파일은 만들지 않습니다.
- `risulua-split`/auto-decomposition is future work. 기존 단일 Lua를 자동 분해하는 기능은 현재 동작이 아닙니다.

## Lua manifest 정책

No Lua manifest in first implementation.

첫 구현에서는 `risulua.json`, `lua/manifest.json`, package manifest 같은 Lua 전용 manifest를 사용하지 않습니다. 루트 `.risuchar` 또는 `.risumodule`은 대상 루트와 metadata owner를 식별하지만, Lua module graph를 선언하는 별도 manifest 역할을 하지 않습니다. 모듈식 개발의 그래프는 `lua/main.risulua`에서 도달 가능한 정적 `require("module.id")`만으로 결정됩니다.

## 정적 require 규칙

모듈식 개발에서 `require`는 빌드 타임 전용입니다. module id는 루트 `lua/` 디렉토리 기준의 점 표기만 허용합니다.

허용 예시:

```lua
local variables = require("common.variables")
```

위 호출은 다음 파일로 해석됩니다.

```text
lua/common/variables.risulua
```

금지 예시:

```lua
require(moduleName)                  -- dynamic require
require("common." .. moduleName)     -- dynamic require
require("common/variables")          -- slash paths
require("common.variables.risulua")  -- .risulua suffix

package.path = package.path .. ";./?.lua"
package.cpath = package.cpath .. ";./?.so"
package.searchers = {}
package.loaders = {}

dofile("other.lua")
loadfile("other.lua")

local require = customRequire        -- require shadow
local r = require                    -- require alias
require = customRequire              -- require reassignment
```

금지 패턴은 빌드와 LSP 진단에서 같은 의미로 다뤄야 합니다. 최종 `dist/<targetName>.risulua`에는 빌드 타임 `require`가 남지 않아야 하며, RisuAI가 읽는 단일 Lua 파일이어야 합니다.

## LSP 동작

- 모듈식 source 파일은 RisuLua 진단을 받습니다. 금지 패턴, 누락된 module id, 순환 require, 그래프 문제를 표시합니다.
- module id completion은 `lua/**/*.risulua`에서 계산된 점 표기 module id를 제안합니다.
- graph diagnostics는 `lua/main.risulua`에서 도달 가능한 모듈 그래프를 기준으로 누락, 순환, 금지 패턴을 연결해 보여줍니다.
- generated dist awareness 때문에 `dist/<targetName>.risulua`는 생성 산출물로 인식됩니다. 기본적으로 source처럼 수정하라고 유도하지 않고, classic과 generated dist는 조용하게 유지됩니다.

## `lua/main.risulua` 자동 감지와 호환성

명시적인 `--risulua-mode <classic|modular>`가 없을 때 `lua/main.risulua`가 있으면 모듈식 개발로 자동 감지됩니다. 이 선택은 새 모듈식 워크스페이스를 쉽게 열기 위한 호환성 trade-off입니다.

기존 프로젝트가 우연히 `lua/main.risulua`라는 단일 파일을 사용하고 있었다면 `--risulua-mode classic`을 명시해 단일 파일 개발 경로를 선택합니다. 이 escape hatch는 자동 감지보다 우선하며, 충돌 상태에서는 자동 추측 대신 결정적 오류를 냅니다.

## 상위(Upstream) 필드 매핑

| 대상        | 매핑되는 상위 인터페이스                     |
| ----------- | -------------------------------------------- |
| 캐릭터 카드 | `triggerscript` 필드                         |
| 모듈        | 모듈 내 트리거(Trigger) 및 Lua 페이로드 영역 |

## CBS 분석 영역

- `.risulua` 파일은 CBS 관점에서 파일 전체가 하나의 분석 조각으로 취급됩니다.
- 리터럴 단위의 정밀한 조각 추출은 future work입니다.

## 작성 예시

```lua
local variables = require("common.variables")

function onInput()
  if variables.enabled() then
    return "성공"
  end
  return "폴백"
end
```
