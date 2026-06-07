# 파일 변경 안전성

이 문서는 `risuai-workbench-mcp`가 파일 변경을 다룰 때 지키는 안전 경계를 설명합니다. 기본 workflow는 [`workflows.md`](workflows.md)를 먼저 읽습니다.

## 기본 원칙

- path input은 상대 경로와 absolute path를 모두 받을 수 있습니다. 상대 경로는 server startup context 기준으로 해석합니다.
- structured file 변경은 `patch_preview` → `patch_apply` flow를 우선 사용합니다.
- mutation target은 workspace path safety check를 통과해야 합니다.
- mutation 결과는 append-only journal에 기록됩니다.
- stale state나 거부된 mutation은 파일 변경 없이 diagnostic 또는 rejected result로 반환됩니다.

## Preview 먼저

`workbench.patch_preview`는 실제 파일을 바꾸기 전에 patch plan과 diff를 생성합니다. agent는 preview 결과를 검토한 뒤 적용할 plan을 선택해야 합니다.

```text
workbench.patch_preview -> stored patch plan -> workbench.patch_apply
```

## Apply는 저장된 plan만

`workbench.patch_apply`는 저장된 patch plan을 기준으로 적용합니다. preview와 apply 사이에 파일이 바뀌어 stale 상태가 되면 적용이 거부될 수 있습니다. 이 경우 최신 파일 기준으로 preview를 다시 생성합니다.

## 거부를 실패로 숨기지 않기

mutation 거부는 안전장치의 정상 결과일 수 있습니다. agent는 거부 사유를 사용자에게 보고하고, workspace boundary·stale hash·unsupported operation 여부를 확인해야 합니다.
