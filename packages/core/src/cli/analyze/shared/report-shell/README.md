# report-shell

Analyzer HTML 리포트의 **정적 셸(template.html)** + **클라이언트 런타임(client.js)** 원본이 사는 곳. `html-report-shell.ts`가 빌드 시점에 이 둘을 디스크에서 읽어 슬롯 치환으로 최종 HTML을 조립한다.

## 파일 역할
- `template.html` — `<head>` 전체(CSS/Tailwind config/폰트/D3 CDN) + `<body>` 뼈대 + `<dialog>` 모달. 슬롯: `{{LOCALE}}`, `{{TITLE}}`, `{{BODY}}`, `{{DATA_SCRIPT_FILENAME}}`
- `client.js` — 브라우저에서 실행되는 IIFE. 탭/필터/차트/force-graph 전부 담당. **import/export 금지** (raw script로 로드됨)

## 편집 규칙
1. **CSS/디자인/레이아웃 변경** → `template.html`만 수정. TS 코드 건드리지 말 것.
2. **동적 렌더링 로직(hero/nav/section 구조)** → `html-report-shell.ts`의 `renderBody()` 및 `render*` 함수들.
3. **클라이언트 인터랙션** → `client.js`를 직접 수정. 편집 후 `pnpm build`만 하면 됨(자동 복사).
4. **슬롯 추가/변경** → 반드시 `template.html`과 `renderHtmlReportShell()`의 `.replace()` 체인을 함께 수정.

## 새 디자인 적용 워크플로우
1. 새 HTML/CSS 원본을 `template.html`에 덮어쓴다 (슬롯 마커 위치 유지).
2. 동적 영역 구조가 바뀌었으면 `renderBody()`의 출력을 새 구조에 맞게 조정.
3. `pnpm build` 후 playground로 리포트 재생성해 시각 확인.

## 빌드 파이프라인
`pnpm build` = `tsc` → `tsc-alias` → `build:assets`(template.html/client.js를 dist로 복사). 파일 추가 시 `package.json`의 `build:assets` 복사 목록도 갱신할 것.
