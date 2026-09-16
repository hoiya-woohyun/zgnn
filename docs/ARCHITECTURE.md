# 프로젝트 아키텍처 인덱스

> AI 와 개발자 모두를 위한 빠른 참조 문서.
> 각 섹션은 상세 문서로 연결된다.
>
> 최종 수정: 2026-09-15 (v1: 문서 체계 신설 — 컨셉·아키텍처 4편·ADR 5편·기능 문서 1편. 팔레트를 핑크+크림으로 확정하고 상세 헤더를 파스텔 워시로 바꾼 직후 기준)

---

## 핵심 도메인

이 프로젝트(`zgnn`)는 반려견 동반 제주 여행 가이드 **강아지랑 제주** 의 PWA 다.
핵심은 **내 강아지 조건 × 장소의 이용 조건 → 갈 수 있는가** 판정이다(→ [CONCEPT.md](./CONCEPT.md)).
지금(v0)의 일반 필터에 더해, 강아지 프로필 기반 판정(v1)의 등록·판정 로직은 구현됐고 화면 반영은 다음 웨이브다.

---

## 기술 스택

| 레이어 | 기술 |
|---|---|
| UI | React 19, TypeScript |
| 프레임워크 | Next.js 16 App Router, **정적 내보내기**(`output: 'export'`, 서버 없음) |
| 스타일 | Tailwind CSS v4 + Untitled UI(소스 복사 방식, `src/components/base/`) |
| 상태 | zustand + persist(localStorage). 서버 상태 없음 |
| 지도 | leaflet + react-leaflet, OSM 타일(CARTO 키 있으면 CARTO) |
| PWA | `@serwist/next` (webpack 플러그인 — 빌드만 webpack, dev 는 Turbopack) |
| 데이터 | 빌드 시점 JSON (`src/data/*.json`), Notion 에서 스크립트로 추출 |
| 테스트 | vitest (파서·히스토리 유틸 단위 테스트) |

---

## 데이터 흐름 (요약)

> 상세: [architecture/data-pipeline.md](./architecture/data-pipeline.md)

```
Notion 공개 페이지 ──(scripts, 무인증 API)──▶ data/jejudo-notion-export.json
                                                    │ pnpm data:normalize
                                                    ▼
                                    src/data/{places,items,meta}.json ──▶ 빌드에 포함
```

- 앱은 런타임에 아무것도 fetch 하지 않는다. 장소 86곳(숙소 26·식당 34·카페 26), 준비물 15가지.
- 좌표는 81곳, 도로명주소는 76곳에 있다. 없는 곳은 지도에서 빠지고 "좌표 없는 N곳 제외" 로 알린다.

---

## 반려동물 이용 조건과 판정

> 상세: [architecture/pet-policy-and-eligibility.md](./architecture/pet-policy-and-eligibility.md)

- `petPolicyText`(사람이 쓴 문장) → `parsePetPolicy()` → `TPetPolicy`(실내 가능 여부·무게 제한·마릿수·요금 …).
- 규칙은 `src/lib/petPolicy.ts` 상단 테이블에 모여 있고, 화면은 항상 **원문을 함께** 보여준다.
- v1 구현됨: `judgeEligibility(TDogProfile, TPetPolicy, opts) → TEligibility(ok/cond/unknown/hard)`. 화면 반영(상세·목록·지도·홈)은 다음 웨이브.

---

## 라우트 구조

> 상세: [architecture/app-shell-and-state.md](./architecture/app-shell-and-state.md)

```
/                 홈 — 인사말, 종류별 요약, 준비물·저장 진입
/places/[type]    둘러보기 — 검색·방향·이용 조건 필터, 숙소는 가격 정렬
/place/[id]       상세 — 이용 조건(원문 포함), 요금, 근처 장소
/map              지도 — 종류·방향 필터, 마커 → 미니 카드. ?saved=1 은 저장한 곳만
/checklist        준비물 — 계절별, 체크 상태 저장, 숙소 구비 용품 반영
/saved            저장한 곳
/dog              우리 강아지 등록 — 이름·마리별 몸무게·이동 수단. 저장하면 판정(v1)의 입력이 된다
```

`src/app/**/page.tsx` 는 주소·메타데이터·`generateStaticParams` 만 맡는 서버 컴포넌트,
화면 본체는 `src/screens/` 의 클라이언트 컴포넌트다. 없는 종류·id 는 `dynamicParams = false` 로 404.

---

## 클라이언트 상태

> 상세: [architecture/app-shell-and-state.md](./architecture/app-shell-and-state.md#클라이언트-상태)

- 스토어 하나(`src/store/useAppStore.ts`, persist 키 `zgnn-jeju`): 저장한 곳·준비물 체크·계절·구비용품 기준 숙소·우리 강아지 프로필·실내 필요 여부.
- HTML 이 빌드 때 만들어지므로 localStorage 읽기는 마운트 뒤(`skipHydration`). 첫 프레임의 "저장 0" 은 의도.

---

## PWA / 오프라인

> 상세: [architecture/pwa-offline.md](./architecture/pwa-offline.md)

- 라우트 HTML 93개 + 매니페스트·아이콘·404 를 **직접 만든 프리캐시 목록**으로 넣는다(정적 내보내기 HTML 은 webpack 자산이 아니라서).
- 지도 타일·장소 이미지는 런타임 CacheFirst.

---

## 디자인 시스템

> 상세: [decisions/ADR-003-untitled-ui-and-palette.md](./decisions/ADR-003-untitled-ui-and-palette.md)

- 색은 시맨틱 토큰(`bg-primary`, `text-brand-secondary`, `bg-brand-solid` …)으로만. 원시 색은 `src/styles/theme.css` 에만 있다.
- 브랜드 핑크(oklch 358°) + 크림 바탕 + 잉크 히어로. 종류 색(바다/앰버/라떼)은 `theme.css` 와 `src/lib/places.ts` 두 곳에 같은 값.
- 면은 파스텔 워시(`typeTint`), 글씨·아이콘·주요 버튼만 진하게.

---

## 디렉토리 구조 (핵심만)

```
src/
├── app/                      # Next App Router. 주소·메타·정적 파라미터만
│   ├── layout.tsx            # 셸(AppShell)·providers·themeColor
│   ├── manifest.ts           # 웹 매니페스트
│   ├── sw.ts                 # 서비스워커 소스 (→ public/sw.js)
│   └── (place|places|map|checklist|saved)/
├── screens/                  # 화면 본체(클라이언트). 파일명 = 소유 화면 접두어
├── components/
│   ├── base/                 # Untitled UI 복사본. 직접 고치지 않음(eslint 제외)
│   ├── layout/               # AppShell · AppBar · 사이드바 · 탭바 · PageHeader · Section · EmptyState
│   ├── icons/                # 숙소·식당·카페 아이콘 3종
│   └── *.tsx                 # placeCard · placeThumb · petBadges · saveButton · seasonChips · townChip
├── lib/                      # 순수 로직. petPolicy · placeFilters · checklist · amenities · places · mapTiles · appHistory
├── store/useAppStore.ts      # zustand persist
├── store/useDogEligibility.ts # useEligibility · useEligibilityMap
├── providers/                # storeHydration · routerProvider(react-aria Link → Next router)
├── data/                     # 빌드에 박히는 JSON 3개
├── styles/                   # theme.css(토큰) · globals.css · typography.css
└── types.ts                  # 도메인 타입
scripts/                      # normalize · make-icons · (fetch|optimize)-images
data/                         # Notion 추출본(커밋) · raw/(무시)
```

---

## 기능 문서 (features)

| 문서 | 상태 | 내용 |
|---|---|---|
| [dog-profile.md](./features/dog-profile.md) | 구현 중 | 내 강아지 등록과 장소별 판정. v1 의 핵심 기능. 등록·판정 로직은 구현, 화면 반영은 다음 웨이브 |

## 주요 의사결정 (ADR)

| ADR | 제목 |
|---|---|
| [ADR-001](./decisions/ADR-001-pwa-static-export.md) | PWA + Next 정적 내보내기, 서버·스토어 없음 |
| [ADR-002](./decisions/ADR-002-no-place-photos.md) | 장소 사진을 쓰지 않는다 |
| [ADR-003](./decisions/ADR-003-untitled-ui-and-palette.md) | Untitled UI 토큰 위에 핑크·크림·잉크 팔레트 |
| [ADR-004](./decisions/ADR-004-pet-policy-parser.md) | 이용 조건은 수동 태깅 대신 규칙 파서 + 원문 병기 |
| [ADR-005](./decisions/ADR-005-dog-profile-eligibility.md) | 강아지 프로필 기반 판정을 v1 의 중심으로 (채택) |

## 버그 기록

아직 없음. 생기면 `docs/bugs/BUG-NNN-{slug}.md` (증상 / 재현 조건 / 원인 / 수정 내용 / 관련 문서).
