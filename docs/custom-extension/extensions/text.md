# 캐릭터 텍스트 아티팩트 (`.risutext`)

`.risutext`는 캐릭터 카드(charx)의 prose 필드를 위한 frontmatter 없는 전체 본문 아티팩트입니다. 파일 전체가 편집 가능한 텍스트이며, CBS LSP에서는 하나의 `TEXT` fragment로 라우팅됩니다.

## 경로 매핑

| 경로 | Upstream 필드 |
|---|---|
| `character/description.risutext` | `data.description` |
| `character/first_mes.risutext` | `data.first_mes` |
| `character/system_prompt.risutext` | `data.system_prompt` |
| `character/replace_global_note.risutext` | `data.replaceGlobalNote` |
| `character/creator_notes.risutext` | `data.creator_notes` |
| `character/additional_text.risutext` | `data.extensions.risuai.additionalText` |
| `character/alternate_greetings/*.risutext` | `data.alternate_greetings[]` |

## 형식 규칙

- frontmatter, section marker, field mapping header를 쓰지 않습니다.
- 파일 전체 본문이 그대로 upstream 문자열 값입니다.
- `character/alternate_greetings/_order.json`은 명시 순서를 소유합니다.
- `_order.json`에 없는 `.risutext` 인사말은 파일명 sort 순서로 마지막에 append됩니다.
- `_order.json`에 존재하지 않는 파일명이 적혀 있으면 pack 단계에서 오류로 처리합니다.

## 호환성 규칙

- 같은 필드에 canonical `.risutext`와 legacy `.txt`가 함께 있으면 canonical이 이깁니다.
- legacy `.txt`는 canonical 파일이 없을 때만 fallback입니다.
- canonical과 legacy 값을 자동 병합하지 않습니다.
- 충돌 시 pack은 warning을 내고 legacy 값을 무시합니다.
