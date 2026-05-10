# `.risumodule` 루트 마커

`.risumodule`는 표준 모듈(`module`) 워크스페이스의 루트 marker이자 구조화된 모듈 metadata owner입니다. 로어북, 정규식, Lua, 변수, HTML, 토글 설정처럼 별도 `.risu*` 페이로드 파일로 분리되는 데이터와 달리, 모듈 루트 자체를 식별하고 sidebar/discovery/pack 흐름이 읽는 메타데이터를 소유합니다.

## 위치 및 역할

```text
<모듈_루트>/
├── .risumodule (모듈 루트 marker 및 metadata owner)
├── lorebooks/
├── regex/
├── lua/
├── toggle/
├── variables/
├── html/
└── assets/
```

- **루트 식별**: VS Code module browser와 CBS LSP workspace root 해석은 `.risumodule`가 놓인 디렉토리를 모듈 루트로 간주합니다.
- **메타데이터 소유**: `name`, `description`, `id`, `image`, `namespace`, `cjs`, `lowLevelAccess`, `hideIcon`, `mcp`, `createdAt`, `modifiedAt`, `sourceFormat` 같은 구조화된 모듈 metadata는 `.risumodule`가 소유합니다.
- **페이로드 비소유**: 로어북, 정규식, Lua, 변수, HTML, 토글 설정 같은 payload는 각각의 `.risu*` 파일이 소유합니다. `.risumodule`는 페이로드 path 목록이나 field mapping table을 담지 않습니다.
- **CBS 비대상**: `.risumodule`는 JSON marker/metadata 파일이며 CBS-bearing artifact가 아닙니다. CBS diagnostics, fragment mapping, variable graph occurrence source로 스캔하지 않습니다.

## 최소 JSON 형태

```json
{
  "$schema": "https://risuai-workbench.dev/schemas/risumodule.schema.json",
  "kind": "risu.module",
  "schemaVersion": 1,
  "id": "example-module",
  "name": "Example Module",
  "description": "Example module description",
  "image": null,
  "namespace": "example",
  "cjs": "",
  "lowLevelAccess": false,
  "hideIcon": false,
  "mcp": {},
  "createdAt": null,
  "modifiedAt": null,
  "sourceFormat": "risum"
}
```

필수 필드와 타입은 `../../schemas/risumodule.schema.json`을 기준으로 합니다. `mcp`는 Model Context Protocol 설정 객체입니다.

## 생성 소스

`.risumodule`는 사용자가 직접 수동 작성할 수도 있지만, 표준 워크플로우에서는 아래 경로에서 생성 또는 갱신됩니다.

| 생성/갱신 경로 | 구현 위치 | 사용되는 소스 |
|---|---|---|
| Module extract | `packages/core/src/cli/extract/module/phases.ts`의 `phase8_extractModuleIdentity()`가 공유 `.risumodule` manifest builder를 호출 | `.risum`, `.json` 입력을 파싱한 결과 |
| Module scaffold | `packages/core/src/cli/scaffold/workflow.ts`의 `scaffoldModule()`이 공유 `.risumodule` manifest builder를 호출 | `scaffold module` CLI 인자(`--name`, 선택 `--namespace`)와 새 UUID/현재 시각/default 값 |

### Extract에서 생성될 때

Extract workflow는 `.risum`, `.json` 입력을 먼저 내부 모듈 구조로 파싱한 뒤 루트 `.risumodule`를 씁니다. 입력 컨테이너가 `.risum`이면 `sourceFormat`은 `"risum"`으로, `.json`이면 `"json"`으로 보존합니다. 스키마에는 `"scaffold"`도 허용되어 있지만, extract 출력은 원본 컨테이너 포맷을 그대로 기록합니다.

| `.risumodule` 필드 | Extract 소스 |
|---|---|
| `id` | `data.id`, 없으면 빈 문자열 |
| `name` | `data.name` |
| `description` | `data.description`, 없으면 빈 문자열 |
| `image` | `data.image`가 문자열 또는 `null`이면 보존, 없으면 생략 |
| `namespace` | `data.namespace`가 문자열이면 보존, 없으면 생략 |
| `cjs` | `data.cjs`가 문자열이면 보존, 없으면 생략 |
| `lowLevelAccess` | `data.lowLevelAccess`가 boolean이면 보존, 없으면 생략 |
| `hideIcon` | `data.hideIcon`가 boolean이면 보존, 없으면 생략 |
| `mcp` | `data.mcp`가 객체이면 보존, 없으면 생략 |
| `createdAt` | `null` (extract 시점에는 생성 시각을 보존하지 않음) |
| `modifiedAt` | `null` (extract 시점에는 수정 시각을 보존하지 않음) |
| `sourceFormat` | `"risum"` (`.risum` 입력) 또는 `"json"` (`.json` 입력) |

### Scaffold에서 생성될 때

`scaffold module`은 upstream module 없이 새 workspace를 만들기 때문에 `.risumodule`도 기본값으로 생성합니다. 현재 구현은 `buildScaffoldRisumoduleManifest({ id, name, namespace, nowIso })`를 호출합니다. `name`은 CLI `--name` 인자에서 오고, `namespace`는 선택 CLI `--namespace` 인자가 문자열로 제공될 때만 기록합니다. `id`는 `crypto.randomUUID()`, `createdAt`/`modifiedAt`은 현재 ISO timestamp를 사용합니다. `sourceFormat`은 `"scaffold"`, `description`은 `""`, `image`는 `null`, `lowLevelAccess`와 `hideIcon`은 `false`로 시작합니다. `--namespace`를 생략하면 `.risumodule.namespace`를 만들지 않으며, `cjs`, `mcp` 같은 다른 선택 필드는 scaffold 기본값으로 생성하지 않습니다. `image`는 Workbench thumbnail metadata shape를 드러내기 위해 `null`로 시작합니다.

## Thumbnail image metadata

`.risumodule.image`는 Workbench sidebar/detail UI가 모듈 썸네일을 표시할 때 쓰는 선택 metadata입니다. 값은 모듈 루트 기준 workspace-relative path이며, 일반적으로 `assets/icons/<filename>` 또는 `assets/thumbnails/<filename>` 형태를 권장합니다.

```json
{
  "image": "assets/icons/module.png"
}
```

이 필드는 이미지 바이너리나 asset manifest entry를 대신하지 않습니다. `.risum`로 패킹할 때 실제 이미지 파일을 포함하려면 `assets/manifest.json`에도 해당 파일이 별도 asset entry로 등록되어 있어야 합니다. 현재 RisuAI runtime은 module `image` 필드를 사용하지 않으므로, 이 값은 Workbench 전용 표시 metadata로 취급합니다.

## 탐색 및 패키징 계약

- **Discovery**: 구현은 `**/.risumodule`를 찾아 manifest를 읽고, marker의 부모 디렉토리를 모듈 루트로 사용합니다.
- **Detail scan**: module detail view는 `.risumodule`를 Manifest section item으로 표시하되, 하위 artifact scan에서는 `.risumodule` 자체를 일반 페이로드로 재분류하지 않습니다.
- **Pack 우선순위**: `.risumodule`가 모듈 메타데이터의 유일한 표준 소스입니다. `.risumodule`와 `metadata.json`이 물리적으로 동시에 존재할 수 있지만, 구현은 오직 `.risumodule`만 읽어야 하며 `metadata.json`로 폴백하거나 병합하지 않습니다. 이전에 `metadata.json`이 모듈 metadata owner였던 방식은 더 이상 표준이 아니며, `.risumodule`가 없을 때도 `metadata.json`로 폴백하지 않습니다. 이는 breaking migration입니다.

## 토글 소유권 분리

- **`customModuleToggle` 금지**: `.risumodule`에는 `customModuleToggle` 필드를 포함할 수 없습니다. 모듈 토글의 유일한 표준 소유자는 `toggle/*.risutoggle`입니다.
- **오류 처리**: `.risumodule`에 `customModuleToggle` 필드가 포함되면 검증/파싱 단계에서 거부됩니다. `customModuleToggle`은 오직 `toggle/*.risutoggle`에서만 읽습니다.

## 다른 표준 파일과의 구분

| 파일 | 역할 | CBS 포함 여부 |
|---|---|---|
| `.risumodule` | 모듈 루트 marker 및 metadata owner | 없음 |
| `lorebooks/*.risulorebook` | 로어북 entry payload | `@@@ CONTENT` |
| `regex/*.risuregex` | 정규식 in/out payload | `@@@ IN`, `@@@ OUT` |
| `lua/*.risulua` | Lua script payload | Lua 파일 전체 |
| `toggle/*.risutoggle` | 토글 설정 payload | 없음 |
| `variables/*.risuvar` | 기본 변수 key/value | 없음 |
| `html/*.risuhtml` | 배경 HTML payload | 파일 전체 |

## 같이 읽을 문서

- `../targets/module.md`
- `../extensions/lorebook.md`
- `../extensions/regex.md`
- `../extensions/lua.md`
- `../extensions/toggle.md`
- `../extensions/variable.md`
- `../extensions/html.md`
- `../workflow-output-structures.md`
- `../CLI.md`
- `../../schemas/risumodule.schema.json`
