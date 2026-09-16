# 프로젝트 아키텍처 인덱스

> AI 와 개발자 모두를 위한 빠른 참조 문서.
> 각 섹션은 상세 문서로 연결된다.
>
> 최종 수정: 2026-09-16 (v2: 강아지 프로필 v1 화면 반영 완료를 반영 — 판정이 홈·목록·상세·지도에 붙었다. 클라이언트 상태에 읍면(town) 추가, lib·컴포넌트 목록과 테스트 현황 갱신)
>
> 최종 수정: 2026-09-15 (v1: 문서 체계 신설 — 컨셉·아키텍처 4편·ADR 5편·기능 문서 1편. 팔레트를 핑크+크림으로 확정하고 상세 헤더를 파스텔 워시로 바꾼 직후 기준)

---

## 핵심 도메인

이 프로젝트(`zgnn`)는 반려견 동반 제주 여행 가이드 **강아지랑 제주** 의 PWA 다.
핵심은 **내 강아지 조건 × 장소의 이용 조건 → 갈 수 있는가** 판정이다(→ [CONCEPT.md](./CONCEPT.md)).
일반 필터(v0) 위에 강아지 프로필 기반 판정(v1)이 올라가 있다 — 등록·판정 로직과 화면 반영(홈·목록·상세·지도)이 모두 구현됐다.

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
| 테스트 | vitest — `src/lib/*.test.ts` 5개 스위트 75케이스(파서·판정·정렬·필터·히스토리) |

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
- v1: `judgeEligibility(TDogProfile, TPetPolicy, opts) → TEligibility(ok/cond/unknown/hard)` (`src/lib/eligibility.ts`).
- 판정은 훅(`src/store/useDogEligibility.ts`)으로 화면에 들어가고, 배지(`src/components/eligibilityBadge.tsx`)와
  목록 정렬(`src/lib/sortByEligibility.ts`)이 같은 등급을 쓴다. 등급을 늘리면 이 세 곳을 함께 본다.
- 붙은 화면: 홈 · 둘러보기(목록·토글) · 상세(판정 카드·근처 장소) · 지도(마커·시트).

---

## 라우트 구조

> 상세: [architecture/app-shell-and-state.md](./architecture/app-shell-and-state.md)

```
/                 홈 — 인사말, 종류별 요약, 준비물·저장 진입
/places/[type]    둘러보기 — 검색·방향·이용 조건 필터, 숙소는 가격 정렬
/place/[id]       상세 — 이용 조건(원문 포함), 판정 카드, 요금, 근처 장소
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

- 스토어 하나(`src/store/useAppStore.ts`, persist 키 `zgnn-jeju`). 퍼시스트 필드 7개:
  저장한 곳(`savedIds`) · 준비물 체크(`checkedItemIds`) · 계절(`season`) · 구비용품 기준 숙소(`amenityStayId`) ·
  우리 강아지 프로필(`dog`) · 실내 필요 여부(`needsIndoor`) · 읍면 선택(`town`).
- 읍면 선택은 스토어에 있어 둘러보기·지도·근처 장소 사이를 오가도 유지된다.
- `merge` 로 퍼시스트 값을 현재 데이터에 맞춰 걸러낸다(없어진 id·깨진 프로필은 버린다).
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
- 크기 토큰은 전부 `--spacing` 파생이고, 브레이크포인트는 그 값만 4 → 4.5 → 5px 로 바꾼다
  (→ [ADR-006](./decisions/ADR-006-responsive-scale-and-font.md)). 본문 글꼴은 나눔스퀘어 네오 self-host(400·700).

---

## 디렉토리 구조 (핵심만)

```
src/
├── app/                      # Next App Router. 주소·메타·정적 파라미터만
│   ├── layout.tsx            # 셸(AppShell)·providers·themeColor
│   ├── manifest.ts           # 웹 매니페스트
│   ├── sw.ts                 # 서비스워커 소스 (→ public/sw.js)
│   └── (place|places|map|checklist|saved|dog)/
├── screens/                  # 화면 본체(클라이언트). 파일명 = 소유 화면 접두어
├── components/
│   ├── base/                 # Untitled UI 복사본. 직접 고치지 않음(eslint 제외)
│   ├── layout/               # AppShell · AppBar · 사이드바 · 탭바 · PageHeader · Section · EmptyState
│   ├── icons/                # 숙소·식당·카페 아이콘 3종
│   ├── foundations/          # Untitled UI 부속 아이콘(dot-icon)
│   └── *.tsx                 # placeCard · placeThumb · petBadges · eligibilityBadge · saveButton · seasonChips · townChip
├── lib/                      # 순수 로직. petPolicy · eligibility · sortByEligibility · placeFilters
│                             #            checklist · amenities · places · category · format · mapTiles · appHistory
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
| [dog-profile.md](./features/dog-profile.md) | 구현 완료(v1) | 내 강아지 등록과 장소별 판정. 등록·판정 로직 + 홈·목록·상세·지도 반영까지 |

## 주요 의사결정 (ADR)

| ADR | 제목 |
|---|---|
| [ADR-001](./decisions/ADR-001-pwa-static-export.md) | PWA + Next 정적 내보내기, 서버·스토어 없음 |
| [ADR-002](./decisions/ADR-002-no-place-photos.md) | 장소 사진을 쓰지 않는다 |
| [ADR-003](./decisions/ADR-003-untitled-ui-and-palette.md) | Untitled UI 토큰 위에 핑크·크림·잉크 팔레트 |
| [ADR-004](./decisions/ADR-004-pet-policy-parser.md) | 이용 조건은 수동 태깅 대신 규칙 파서 + 원문 병기 |
| [ADR-005](./decisions/ADR-005-dog-profile-eligibility.md) | 강아지 프로필 기반 판정을 v1 의 중심으로 (채택) |
| [ADR-006](./decisions/ADR-006-responsive-scale-and-font.md) | 화면이 커지면 크기도 커진다 — `--spacing` 한 축 + 나눔스퀘어 네오 self-host (채택) |

## 버그 기록

아직 없음. 생기면 `docs/bugs/BUG-NNN-{slug}.md` (증상 / 재현 조건 / 원인 / 수정 내용 / 관련 문서).
