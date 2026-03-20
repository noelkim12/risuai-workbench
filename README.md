# risu-workbench

RisuAI 프로젝트를 위한 VSCode 크리에이터 IDE.

봇 설정, 모듈, 캐릭터 카드, 분석용 프로젝트 구조를 임포트하거나 스캐폴딩하고, CBS, Lua, 로어북 등 RisuAI 고유 저작 요소를 전용 툴링으로 다룬 뒤, 유효한 RisuAI 포맷으로 내보낸다.

RisuAI 앱 자체를 대체하지 않는다. 원시 파일이나 임시 웹 플로우로 관리하기 힘든 핵심 아티팩트와 워크플로우를 위한 개발자 중심 워크벤치다.

## 워크플로우 우선순위

편집/분석 > 임포트/스캐폴드 > 내보내기 충실성 > 런타임 시뮬레이션

## 퍼스트클래스 아티팩트

봇 설정, 모듈, 캐릭터 카드, 분석 출력물, 프로젝트 스캐폴드

## RisuAI 고유 영역

- CBS 툴링
- Lua 분석
- 로어북 도메인 로직
- 엄격한 내보내기 계약
- 모델 호출 없는 런타임 시뮬레이션

## 저장소 구조

| 경로 | 역할 |
|------|------|
| `packages/core/` | 코어 엔진 -- 카드 처리, 분석, 런타임 |
| `packages/vscode/` | VSCode 익스텐션 |
| `docs/` | 아키텍처, 기획, 리서치 문서 |

## 개발

```bash
npm install
npm run --workspace packages/core build
npm run --workspace packages/core test
npm run --workspace packages/vscode build
```

## 라이선스

MIT

---

English version: [README_EN.md](./README_EN.md)
