# Risu Workbench Webview 문서 인덱스

`packages/webview`는 RisuAI Workbench의 VS Code webview UI bundle을 만드는 Svelte/Vite/Monaco 패키지입니다. 이 문서는 webview runtime entry, editor component subtree, VS Code host와의 message boundary, 테스트/빌드 루프를 빠르게 탐색하기 위한 진입점입니다.

문서의 신뢰 기준(Source of Truth)은 코드와 테스트를 따릅니다. 이 README는 `packages/vscode`와 함께 읽어야 하는 제품 경계를 설명하되, VS Code API나 파일 시스템 side effect는 이 패키지의 소유로 적지 않습니다.

## 이 패키지는 무엇을 소유하나

- Vite production bundle entry(`index.html`, `src/main.ts`)와 Svelte app mounting
- Artifact Browser sidebar UI와 detail view UI
- main editor, marker editor, preview, simulator, variable/LSP UI component subtree
- Monaco language/client adapter와 editor option/theme policy
- VS Code webview API wrapper와 webview-to-host message creator
- pure helper, adapter, component-adjacent state 로직의 Vitest/svelte-check 검증

`packages/vscode`는 이 bundle을 Extension Host webview resource로 로드하고, workspace 파일 접근, custom editor lifecycle, command, LSP process, editor open/save 같은 host-only 책임을 처리합니다.

## Entry × Page 매트릭스

현재 작업 주제별로 먼저 확인할 구현/테스트 위치입니다.

| surface                  | 먼저 볼 경계                               | 현재 근거 파일                                                                                            |
| :-- | :-- | :-- |
| Webview runtime entry    | mode별 mount 분기                          | `src/main.ts`, `src/App.svelte`, `index.html`                                                             |
| Artifact Browser UI      | sidebar card/detail component              | `src/App.svelte`, `src/lib/components/SidebarView.svelte`, `src/lib/components/ArtifactDetailView.svelte` |
| VS Code message bridge   | webview API singleton + protocol envelopes | `src/lib/vscode.ts`, `src/lib/protocolEnvelope.ts`, `src/lib/types.ts`                                    |
| Main editor UI           | webview-backed main editor subtree         | `src/lib/components/editor/main/*`, `src/lib/components/editor/shared/*`                                  |
| Marker editor UI         | root marker form/editor subtree            | `src/lib/components/editor/marker/*`                                                                      |
| Monaco integration       | language/client/options/theme adapter      | `src/lib/monaco/*`                                                                                        |
| Preview/simulator panels | editor-side preview surfaces               | `src/lib/components/editor/PREVIEW_PANEL_ENTRYPOINT.md`, `src/lib/components/editor/simulator/*`          |
| Test placement           | source/test mirror policy                  | [`TESTING.md`](TESTING.md), `tests/*`                                                                     |

## VS Code ↔ Webview 관계

두 패키지는 한 제품 경계를 나눠 가진다.

1. `packages/webview`는 UI bundle, browser-side state, Monaco adapter, typed outbound message creator를 소유한다.
2. `packages/vscode`는 build 시 `packages/webview/dist`를 extension `dist/webview`로 복사하고 webview HTML을 구성한다.
3. Webview는 `window.acquireVsCodeApi()`에서 얻은 API로 versioned protocol envelope를 보낸다.
4. Extension Host는 message를 검증한 뒤 파일 열기, marker 저장/reset, 이미지 선택, workspace discovery, LSP bridge 같은 host-only 작업을 수행한다.
5. Webview는 host 작업을 직접 수행하지 않고, host 응답 payload를 화면 상태와 Monaco/editor UI에 반영한다.

따라서 UI 구조, Svelte state, Monaco helper, webview protocol creator는 이 패키지에서 수정하고, VS Code provider와 파일/프로세스 side effect는 `packages/vscode`에서 수정한다.

## Runtime entry

`src/main.ts`는 하나의 bundle 안에서 view mode를 나눕니다.

- `document.documentElement.dataset.editorMode === 'true'`이고 `risuWorkbenchView`가 `main-editor`이면 `MainEditor`를 mount합니다.
- editor mode이지만 main editor가 아니면 `MarkerEditor`를 mount합니다.
- 그 외에는 Artifact Browser sidebar용 `App`을 mount하고 ready/refresh/select/openItem message 흐름을 연결합니다.

이 분기 때문에 새 webview surface를 추가할 때는 HTML dataset, VS Code provider의 HTML 생성, `src/main.ts` mount 조건을 함께 확인해야 합니다.

## 디렉토리 구조

```text
packages/webview/
├── README.md                         ← 이 파일. 인덱스 + 탐색 가이드
├── TESTING.md                        ← 테스트 배치/검증 규칙
├── index.html                        ← Vite HTML entry
├── src/
│   ├── main.ts                       ← webview runtime mount + message handling
│   ├── App.svelte                    ← Artifact Browser top-level app
│   ├── styles.css                    ← bundle-wide style entry
│   └── lib/
│       ├── components/               ← Svelte UI components
│       │   └── editor/               ← main/marker/preview/editor subtree
│       ├── monaco/                   ← Monaco adapters and policies
│       ├── vscode.ts                 ← acquireVsCodeApi wrapper + outbound messages
│       ├── protocolEnvelope.ts       ← protocol envelope guards
│       └── types.ts                  ← shared webview protocol/types
└── tests/                            ← Vitest tests mirroring src paths
```

## 개발과 검증

패키지 단위 기본 루프입니다.

```bash
npm run check
npm run test
npm run build
```

- `npm run check` — Svelte/TypeScript type contract를 확인합니다.
- `npm run test` — `tests/` 아래 Vitest suite를 실행합니다.
- `npm run build` — VS Code extension이 복사해 갈 production webview bundle을 `dist/`에 생성합니다.
- `npm run dev` — Vite dev server를 실행합니다. VS Code provider의 dev-server HTML 경계와 함께 사용할 때만 의미가 있습니다.

테스트 배치와 runtime bundle 오염 방지 규칙은 [`TESTING.md`](TESTING.md)를 먼저 읽습니다.

## 문서 수정 규칙

- `packages/webview` 문서는 UI bundle과 browser-side protocol 경계를 설명합니다. VS Code host 책임은 경로 문자열로만 언급하고 canonical 설명으로 삼지 않습니다.
- claim은 구현 파일과 테스트 파일을 함께 확인해 고정합니다. 테스트가 없는 현재 구현 설명은 보장처럼 쓰지 않습니다.
- 링크를 추가해야 한다면 이 패키지 내부 또는 하위 경로의 문서만 사용합니다.
- editor subtree의 세부 설계 문서는 필요할 때 [`src/lib/components/editor/DESIGN.md`](src/lib/components/editor/DESIGN.md)와 [`src/lib/components/editor/PREVIEW_PANEL_ENTRYPOINT.md`](src/lib/components/editor/PREVIEW_PANEL_ENTRYPOINT.md)처럼 하위 문서로 분리합니다.

## 같이 읽을 문서

- [`TESTING.md`](TESTING.md)
- [`src/lib/components/editor/DESIGN.md`](src/lib/components/editor/DESIGN.md)
- [`src/lib/components/editor/PREVIEW_PANEL_ENTRYPOINT.md`](src/lib/components/editor/PREVIEW_PANEL_ENTRYPOINT.md)
