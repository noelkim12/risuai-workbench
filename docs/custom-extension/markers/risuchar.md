# `.risuchar` 루트 마커

`.risuchar`는 캐릭터 카드(`charx`) 표준 워크스페이스의 루트 marker이자 구조화된 캐릭터 metadata owner입니다. 로어북, 정규식, Lua, 변수, HTML, prose 본문처럼 별도 `.risu*` 페이로드 파일로 분리되는 데이터와 달리, 캐릭터 루트 자체를 식별하고 sidebar/discovery/pack 흐름이 읽는 메타데이터를 소유합니다.

## 위치 및 역할

```text
<캐릭터_루트>/
├── .risuchar (캐릭터 루트 marker 및 metadata owner)
├── character/
├── lorebooks/
├── regex/
├── lua/
├── variables/
└── html/
```

- **루트 식별**: VS Code character browser와 CBS LSP workspace root 해석은 `.risuchar`가 놓인 디렉토리를 캐릭터 루트로 간주합니다.
- **메타데이터 소유**: `name`, `creator`, `characterVersion`, `createdAt`, `modifiedAt`, `sourceFormat`, `flags`, `image`, `tags` 같은 구조화된 캐릭터 metadata는 `.risuchar`가 소유합니다.
- **페이로드 비소유**: description, first message, alternate greetings 같은 prose payload는 `character/*.risutext`가 소유합니다. `.risuchar`는 prose path 목록이나 field mapping table을 담지 않습니다.
- **CBS 비대상**: `.risuchar`는 JSON marker/metadata 파일이며 CBS-bearing artifact가 아닙니다. CBS diagnostics, fragment mapping, variable graph occurrence source로 스캔하지 않습니다.

## 최소 JSON 형태

```json
{
  "$schema": "https://risuai-workbench.dev/schemas/risuchar.schema.json",
  "kind": "risu.character",
  "schemaVersion": 1,
  "id": "example-character",
  "name": "Example Character",
  "creator": "Example Creator",
  "characterVersion": "1.0.0",
  "createdAt": null,
  "modifiedAt": null,
  "sourceFormat": "charx",
  "image": null,
  "tags": [],
  "flags": {
    "utilityBot": false,
    "lowLevelAccess": false
  }
}
```

필수 필드와 타입은 `../../schemas/risuchar.schema.json`을 기준으로 합니다. `image`는 보통 `assets/icons/<filename>` 형태의 워크스페이스 상대 경로이고, 실제 바이너리 또는 asset manifest 전체를 `.risuchar`에 넣지 않습니다. `tags`는 CCv3 `data.tags`로 다시 패킹되는 canonical 태그 배열입니다.

## 생성 소스

`.risuchar`는 사용자가 직접 수동 작성할 수도 있지만, 표준 워크플로우에서는 아래 경로에서 생성 또는 갱신됩니다.

| 생성/갱신 경로 | 구현 위치 | 사용되는 소스 |
|---|---|---|
| Character extract | `packages/core/src/cli/extract/character/phases.ts`의 `phase8_extractCharacterFields()` / `buildCharacterManifest()` | `.charx`, `.png`, `.json` 입력을 Phase 1에서 CCv3-like `charx.data` 구조로 파싱한 결과 |
| Character scaffold | `packages/core/src/cli/scaffold/workflow.ts`의 `scaffoldCharx()` | `scaffold charx` CLI 인자(`--name`, `--creator`)와 새 UUID/현재 시각/default 값 |
| Thumbnail selection | `packages/vscode/src/commands/characterImage.ts`의 character image command | 사용자가 선택한 이미지 파일을 `assets/icons/`로 복사한 뒤 `.risuchar.image`만 갱신 |

### Extract에서 생성될 때

Extract workflow는 `.charx`, `.png`, `.json` 입력을 먼저 내부 캐릭터 카드 구조로 파싱한 뒤 Phase 8에서 루트 `.risuchar`를 씁니다. 현재 구현은 입력 컨테이너가 PNG나 JSON이어도 `.risuchar.sourceFormat`을 `"charx"`로 정규화합니다. 스키마에는 `"png"`, `"json"`도 허용되어 있지만, 표준 extract 출력은 canonical character card 구조로 normalize된 값을 기록하는 정책입니다.

| `.risuchar` 필드 | Extract 소스 |
|---|---|
| `id` | `data.character_id`, 없으면 `data.id`, 없으면 빈 문자열 |
| `name` | `data.name` |
| `creator` | `data.creator` |
| `characterVersion` | `data.character_version` |
| `createdAt` | `data.creation_date`, 없으면 `null` |
| `modifiedAt` | `data.modification_date`, 없으면 `null` |
| `sourceFormat` | 현재 extract 출력에서는 `"charx"` |
| `image` | Phase 5 `assets/manifest.json`에서 추출된 icon asset 중 `name: "main"`을 우선 선택하고, 없으면 첫 icon을 `assets/<extracted_path>`로 기록 |
| `tags` | `data.tags` 중 비어 있지 않은 문자열 배열 |
| `flags.utilityBot` | `data.extensions.risuai.utilityBot`, 없으면 `false` |
| `flags.lowLevelAccess` | `data.extensions.risuai.lowLevelAccess`, 없으면 `false` |

### Scaffold에서 생성될 때

`scaffold charx`는 upstream card 없이 새 workspace를 만들기 때문에 `.risuchar`도 기본값으로 생성합니다. `name`과 `creator`는 CLI 인자에서 오고, `id`는 `crypto.randomUUID()`, `createdAt`/`modifiedAt`은 현재 ISO timestamp를 사용합니다. `characterVersion`은 `"1.0"`, `sourceFormat`은 `"scaffold"`, `image`는 `null`, `tags`는 `[]`, 두 flag는 모두 `false`로 시작합니다.

### 이후 갱신될 수 있는 필드

VS Code character image command는 새 marker를 만들지는 않고 기존 `.risuchar`를 읽어 `image` 필드만 갱신합니다. 선택한 이미지 파일은 character root의 `assets/icons/` 아래로 복사되며, `.risuchar.image`에는 그 workspace-relative path가 기록됩니다.

## 탐색 및 패키징 계약

- **Discovery**: 구현은 `**/.risuchar`를 찾아 manifest를 읽고, marker의 부모 디렉토리를 캐릭터 루트로 사용합니다.
- **Detail scan**: character detail view는 `.risuchar`를 Manifest section item으로 표시하되, 하위 artifact scan에서는 `.risuchar` 자체를 일반 페이로드로 재분류하지 않습니다.
- **Pack 우선순위**: `.risuchar`는 `character/metadata.json`보다 우선합니다. legacy metadata는 `.risuchar`가 없을 때만 fallback입니다.
- **호환성**: `character/extensions.json`과 `assets/manifest.json`은 각각 unknown extension namespace와 asset metadata를 보존하는 sidecar이며, `.risuchar`의 역할을 대체하지 않습니다.

## 다른 표준 파일과의 구분

| 파일 | 역할 | CBS 포함 여부 |
|---|---|---|
| `.risuchar` | 캐릭터 루트 marker 및 metadata owner | 없음 |
| `character/*.risutext` | 캐릭터 prose payload | 있음 |
| `lorebooks/*.risulorebook` | 로어북 entry payload | `@@@ CONTENT` |
| `regex/*.risuregex` | 정규식 in/out payload | `@@@ IN`, `@@@ OUT` |
| `lua/*.risulua` | Lua script payload | Lua 파일 전체 |
| `variables/*.risuvar` | 기본 변수 key/value | 없음 |

## 같이 읽을 문서

- `../targets/charx.md`
- `../extensions/text.md`
- `../workflow-output-structures.md`
- `../CLI.md`
- `../../schemas/risuchar.schema.json`
