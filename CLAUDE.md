# zgnn — 강아지랑 제주

반려견 동반 제주 가이드 PWA. Next 16 App Router **정적 내보내기**(서버 없음) · React 19 ·
Tailwind v4 + Untitled UI · zustand persist · leaflet. 데이터는 빌드 시점 JSON 3개.

핵심 도메인은 **내 강아지 조건 × 장소의 이용 조건 → 갈 수 있는가** 판정이다.

## 어디를 읽을까 (한 홉으로 끝내기)

| 무엇을 하려는가 | 읽을 곳 |
|---|---|
| 빌드·PWA·서비스워커가 안 됨 | [README.md](README.md#실행) → [docs/architecture/pwa-offline.md](docs/architecture/pwa-offline.md) |
| 이용 조건 파싱·판정 로직 | [docs/architecture/pet-policy-and-eligibility.md](docs/architecture/pet-policy-and-eligibility.md) · `src/lib/petPolicy.ts` · `src/lib/eligibility.ts` |
| 라우팅·화면 셸·클라이언트 상태 | [docs/architecture/app-shell-and-state.md](docs/architecture/app-shell-and-state.md) · `src/store/useAppStore.ts` |
| 데이터 갱신·정규화 | [docs/architecture/data-pipeline.md](docs/architecture/data-pipeline.md) · `scripts/normalize.mjs` |
| 색·토큰·팔레트 | [docs/decisions/ADR-003-untitled-ui-and-palette.md](docs/decisions/ADR-003-untitled-ui-and-palette.md) · `src/styles/theme.css` |
| 크기 스케일·반응형·글꼴 | [docs/decisions/ADR-006-responsive-scale-and-font.md](docs/decisions/ADR-006-responsive-scale-and-font.md) · `src/styles/globals.css` |
| "왜 이렇게 했나" | [docs/decisions/](docs/decisions/) (ADR 6편) · 전체 지도는 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |

탐색 전에 위 표를 먼저 본다. 전체 구조가 필요하면 `docs/ARCHITECTURE.md` 하나만 읽으면 된다.

## 조용히 깨지는 것들 (건드리기 전에 확인)

빌드가 통과하거나 화면이 그려지는데도 기능이 사라지는 경우들이다.

- **`pnpm build` 의 `--webpack` 은 필수.** `@serwist/next` 가 webpack 플러그인이라, 빼면
  빌드는 통과하지만 `sw.js` 가 안 만들어져 PWA 가 조용히 사라진다. `dev` 의 `--turbopack`
  명시도 필수(webpack 설정만 있으면 Next 16 이 빌드를 멈춘다).
- **`additionalPrecacheEntries` 는 `globPublicPatterns` 를 대체한다** — 더해지지 않는다.
  그래서 아이콘을 `next.config.mjs` 에 손으로 나열한다. 지우면 아이콘이 프리캐시에서 빠진다.
- **종류 색(숙소·식당·카페)은 두 곳에 같은 값이 있다** — `src/styles/theme.css` 와
  `src/lib/places.ts`(지도 마커). 한쪽만 고치면 지도와 화면 색이 어긋난다.
- **팔레트를 바꾸면** `pnpm icons` 로 아이콘을 다시 만들고 `src/app/layout.tsx` ·
  `src/app/manifest.ts` 의 `theme_color` 도 함께 맞춘다.
- **첫 프레임에 "저장 0" 으로 보이는 것은 의도**다(`skipHydration`). 정적 HTML 이라
  localStorage 를 마운트 뒤에 읽는다 — 버그로 보고 고치지 않는다.
- **`src/components/base/` 는 Untitled UI 복사본**이라 직접 고치지 않는다(eslint 도 이
  폴더만 꺼 뒀다). 고쳐야 하면 감싸는 컴포넌트를 만든다.
- **크기는 `--spacing` 한 축으로만 커진다**(ADR-006). 브레이크포인트마다 `globals.css` 의
  `--spacing` 만 4 → 4.5 → 5px 로 바뀌고 모든 크기 토큰이 파생된다. 자리마다 `md:text-lg` 를
  손으로 붙이지 않는다 — 아무것도 안 해도 따라오는 게 요점이다. 모바일 값은 44px 터치
  기준(`h-11`)이 걸려 있어 **줄이지 않는다**. 지도 마커는 의도적으로 이 축에서 빼 뒀다.
- **색은 시맨틱 토큰으로만** (`bg-primary` · `text-secondary` · `bg-brand-solid`).
  원시 색값은 `theme.css` 에만 둔다.
- **장소 사진은 없는 것이 기본 디자인**이다(저작권 문제로 전량 제거, 86곳 모두 `cover` 없음).
  사진 자리는 종류별 색 + 아이콘이 대신한다 → [ADR-002](docs/decisions/ADR-002-no-place-photos.md).

## 작성 규칙

- **화면 본체는 `src/screens/`** (클라이언트), `src/app/**/page.tsx` 는 주소·메타·
  `generateStaticParams` 만. `src/pages/` 는 Next 가 옛 Pages Router 로 인식해서 못 쓴다.
- **단일 소유자 파일은 소유자 접두어**를 파일명과 대표 export 에 붙인다(camelCase).
  예: `dogProfileWeightRows.tsx` → `DogProfileWeightRows`.
- `@/` 는 `src/` 다. 테스트는 Next 를 안 거치므로 `vitest.config.mts` 가 같은 경로를 다시 읽는다.
- 로직은 `src/lib/` 에 순수 함수로 두고 단위 테스트를 붙인다(`pnpm test`).

## 문서 갱신

**동작·설계·기능이 바뀔 때만** `docs/` 를 같은 작업 안에서 갱신한다.
건너뛰는 것: 리팩토링, 스타일, 오타, 한 줄 수정, 테스트만 추가. 갱신할 문서가 애매하면
문서를 새로 만들지 말고 사용자에게 한 줄로 묻는다.

어느 문서를 만지는지는 경로별 트리거 표가 정본이다 →
**[.cursor/rules/docs-update-policy.mdc](.cursor/rules/docs-update-policy.mdc)**
(Cursor 전용 위치지만 이 레포의 정본 정책이다). 요약: 설계 결정 → `docs/decisions/ADR-NNN-*.md`,
기능 → `docs/features/*.md`, 버그 → `docs/bugs/BUG-NNN-*.md`.

문서를 고칠 때는 H1 바로 아래 `> 최종 수정: YYYY-MM-DD (vN: 무엇을 왜)` 를 최신이 위로 쌓는다.
코드에서 읽히는 것은 적지 않는다 — "왜 이렇게 했나", "무엇이 비직관적인가" 를 적는다.
