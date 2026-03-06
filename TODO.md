# TODO

## Repack/Extract 정책 체크리스트

### Done

- [x] 루트 `AGENTS.md` 추가 (TODO 업데이트/잔여 작업 리마인드 규칙 명시)
- [x] `pack.js` 구현 (`png`, `charx`, `charx-jpg`)
- [x] `lorebooks/manifest.json` 기반 lorebook 재구성
- [x] `regex/_order.json` 기반 customScripts 재구성
- [x] `module.risum` 재생성 로직 추가
- [x] 현재 제한사항 문서화 (`docs/what_we_extract.md`, `template/AGENT.md`, `pack --help`)
- [x] `template/scripts/analyze-card/correlators.js` 추가 (`buildUnifiedCBSGraph` 구현, 브리지/정렬/트렁케이션)
- [x] `analyze-card.js` 종합 분석기 구현 (4-phase pipeline: collect → correlate → analyze → report)
- [x] `analyze-card/collectors.js` — lorebook/regex/variables/HTML/TS/Lua CBS 수집기
- [x] `analyze-card/constants.js` — MAX_* 상수, ELEMENT_TYPES, CBS_OPS
- [x] `analyze-card/correlators.js` — unified CBS graph + lorebook-regex 상관관계
- [x] `analyze-card/lorebook-analyzer.js` — 폴더 트리, 활성화 통계, 키워드 분석
- [x] `analyze-card/reporting.js` — 8섹션 Markdown 리포트 생성기
- [x] `analyze-card/reporting/htmlRenderer.js` — Chart.js 포함 자체완결 HTML 리포트
- [x] `extract.js` Phase 9 통합 (analyze-card.js 자동 실행, non-fatal)

### Remaining

#### Repack Contract & Validation

- [ ] 병합 우선순위(contract) 문서화 (`card.json` vs 추출 컴포넌트)
- [ ] `--out` 경로 해석 규칙 문서화 (파일 경로 vs 디렉토리)
- [ ] `pack -> extract` 검증 체크리스트 문서화

#### Lorebook & Regex Policy

- [ ] `lorebooks/manifest.json` 미존재 시 정책 확정 (fallback 유지/자동 생성)
- [ ] regex 파일 누락/불일치 시 에러 정책 문서화

#### Format Support Decisions

- [ ] strict cover 모드 추가 여부 결정 (현재는 1x1 fallback)
- [ ] `lua/*.lua -> triggerscript` 역변환 지원 여부 결정/설계
- [ ] `chara_card_v2` 지원 여부 결정
