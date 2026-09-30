# 프로젝트 아키텍처 인덱스

> 최종 수정: 2026-09-30 (v18: 준비물 라우트 설명 — 저장한 곳으로 좁히지 않는 고정 목록, 장소가 읽는 쪽 → [ADR-009 v3](./decisions/ADR-009-trip-derived-checklist.md))
> 이전 (v17: **교차점검 패스와 주소 대조 규칙** 등재([ADR-019](./decisions/ADR-019-ai-cross-check-and-address-rules.md)) — ADR 표에 한 줄)
> 이전 (v16: **숨은 운영자 검수 화면 `/admin`** 등재([ADR-018](./decisions/ADR-018-in-app-admin-review.md)) — 라우트 표·디렉터리·ADR 표.
> 이 화면 하나가 publishable 키로 Supabase 를 직접 읽고 쓰므로 "앱은 런타임에 아무것도 fetch 하지 않는다" 는 **사용자 화면에 대한 말**로 좁혔고,
> 기술 스택의 데이터 줄을 Notion 이 아니라 Supabase 로 고쳤다(원본 전환은 ADR-015, 2026-09-22 부터의 사실))
> 이전 (v15: 저장한 곳(`/saved`)을 설정 아래에서 홈 아래로 — 뒤로가기 부모·탭 하이라이트가 홈이다. 지도에 저장 칩(ADR-008 v11))
>
> AI 와 개발자 모두를 위한 빠른 참조 문서.
> 각 섹션은 상세 문서로 연결된다.
>
> 최종 수정: 2026-09-23 (v14: 지도를 Kakao 에서 네이버(NCP Maps v3)로 교체 — [ADR-008](./decisions/ADR-008-map-provider.md) v4. 좌표 보강도 Kakao 로컬 → 네이버 지역 검색)
> 이전 (v13: 4a 는 끝났다 — Vercel 빌드 명령이 `pnpm data:pull && pnpm build` 로 커밋돼 배포가 DB 를 읽는다(프로덕션 Ready 실측). "배포 전환은 아직" 을 걷었다)
> 이전 (v12: ADR-016 v5 — GitHub Actions 폐지. 수집·분석·반영은 사용자 터미널에서 `pnpm data:collect` → `data:analyze` → `data:apply`(운영자 세션). service_role 은 어디에도 없다)
> 이전 (v11: ADR-016 v4 — 로컬 DB 접근은 운영자 로그인 세션(짧은 JWT)+RLS. service_role 은 Actions 만)
> 이전 (v10: ADR-015·016 을 결정 표에 등재 — 016 은 시크릿을 저장하지 않고 로그인된 CLI 에게 실행 시점에 받는다)
> 이전 (v9: 0·1·2·5 에 코드가 생겨 원본이 Supabase 로 넘어가는 중. 진행 상태는 [todo/README.md](./todo/README.md) 참고)
> 이전 (v8: `docs/todo/` 등재 — 블로그 수집→AI 분석→승인→Supabase→재빌드 계획. **아직 계획이라 아래 데이터 흐름은 현재 코드 기준 그대로다**)
> 이전 (v7: ADR-014 셸이 소유하는 화면 간 스와이프 등재)
> 이전 (v6: ADR-013 둘러보기 스와이프 등재)
> 이전 (v5: 회원 잠금·Supabase·개인정보 결정을 ADR-011·012 로 등재. **아직 제안 단계라 위 본문의 "런타임 fetch 없음"·프리캐시 설명은 현재 코드 기준 그대로다**)
>
> 최종 수정: 2026-09-16 (v4: 저장 탭 → 설정 탭(`/settings` 루트, `/saved`·`/dog` 는 그 안). 프로필이 마리별 이름(`dogs[]`)을 갖고, 요금 문구(`lib/dogFee.ts`)·한국어 호칭(`lib/korean.ts`)이 순수 함수로 분리됐다)
>
> 최종 수정: 2026-09-17 (v4: 지도를 leaflet 에서 Kakao 지도 SDK 로 교체(ADR-008))
>
> 최종 수정: 2026-09-16 (v3: 뒤로가기를 셸이 자동으로 붙인다(ADR-007, `lib/appRoutes.ts`). 둘러보기 조건은 모바일에서 바텀시트로 접힌다)
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
| 지도 | 네이버 지도 JavaScript API v3 / NCP Maps (스크립트 로드, npm 패키지 아님) |
| PWA | `@serwist/next` (webpack 플러그인 — 빌드만 webpack, dev 는 Turbopack) |
| 데이터 | 빌드 시점 JSON (`src/data/*.json`). 원본은 Supabase — 배포마다 `pnpm data:pull` 이 다시 만든다(Notion 은 1회 시드 이력). 운영자 검수 화면 `/admin` 만 브라우저에서 DB 를 직접 부른다 |
| 테스트 | vitest — `src/lib/*.test.ts` + `scripts/**/*.test.mjs` **34파일 636케이스**(2026-09-29 실측). 앱 쪽은 파서·판정·요금·호칭·프로필 변환·정렬·필터·히스토리·라우트·검수 세션/반영, 스크립트 쪽은 수집·분석·대조·병합 |

---

## 데이터 흐름 (요약)

> 상세: [architecture/data-pipeline.md](./architecture/data-pipeline.md)

```
Notion 공개 페이지 ──(scripts, 무인증 API)──▶ data/jejudo-notion-export.json
                                                    │ pnpm data:normalize
                                                    ▼
                                    src/data/{places,items,meta}.json ──▶ 빌드에 포함
```

- 사용자가 보는 화면은 런타임에 아무것도 fetch 하지 않는다. 장소 86곳(숙소 26·식당 34·카페 26), 준비물 15가지 — 승인한 장소가 들어오면 86 을 넘는다.
  **예외는 `/admin` 하나**다: 운영자 검수 화면이 publishable 키로 `candidates`·`places` 를 직접 읽고 쓴다(→ [ADR-018](./decisions/ADR-018-in-app-admin-review.md)).
- 원본을 Supabase 로 옮기고 블로그 수집·AI 분석·승인·자동 재빌드를 붙이는 계획은 [todo/](./todo/README.md), 결정은 [ADR-015](./decisions/ADR-015-supabase-source-and-rebuild.md) — 스키마·시드·`data:pull`·수집 코드가 있고, **배포 전환(4a)도 끝났다**: `vercel.json` 의 `buildCommand` 가 `pnpm data:pull && pnpm build` 라 배포마다 DB 를 읽는다(위 다이어그램의 Notion 경로는 1회 시드 이력이다). 남은 것은 승인이 저절로 재배포를 일으키는 웹훅(4b).
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
/map              지도 — 저장·종류 칩, 마커 → 미니 카드. 저장 칩 = ?saved=1, 저장한 핀엔 하트 배지
/checklist        준비물 — 계절로만 거른 고정 목록(어디서 쓰는가 넷), 저장한 숙소 구비 용품 자동 반영. 장소 화면이 이 목록을 읽는다
/settings         설정(탭) — 우리 강아지 카드, 저장한 곳 진입, 자료 출처
/saved            저장한 곳 (홈 아래 — 뒤로가기는 /, 홈 카드가 주 진입점. 설정 행은 보조 경로)
/dog              우리 강아지 등록 — 마리별 이름·몸무게·이동 수단 (설정 안). 저장하면 판정(v1)의 입력이 된다
/admin            **숨김 · 운영자 전용** 장소 검수 — 로그인(운영자 계정) 뒤 후보를 보고 "맞아요/반려하기". 탭바·스와이프·프리캐시에 없고 링크도 없다(경계는 RLS)
```

`src/app/**/page.tsx` 는 주소·메타데이터·`generateStaticParams` 만 맡는 서버 컴포넌트,
화면 본체는 `src/screens/` 의 클라이언트 컴포넌트다. 없는 종류·id 는 `dynamicParams = false` 로 404.

---

## 클라이언트 상태

> 상세: [architecture/app-shell-and-state.md](./architecture/app-shell-and-state.md#클라이언트-상태)

- 스토어 하나(`src/store/useAppStore.ts`, persist 키 `zgnn-jeju`). 퍼시스트 필드 6개:
  저장한 곳(`savedIds`) · 준비물 체크(`checkedItemIds`) · 계절(`season`) ·
  우리 강아지 프로필(`dog`) · 실내 필요 여부(`needsIndoor`) · 읍면 선택(`town`).
- 읍면 선택은 스토어에 있어 둘러보기·지도·근처 장소 사이를 오가도 유지된다.
- `merge` 로 퍼시스트 값을 현재 데이터에 맞춰 걸러낸다(없어진 id·깨진 프로필은 버린다).
- HTML 이 빌드 때 만들어지므로 localStorage 읽기는 마운트 뒤(`skipHydration`). 첫 프레임의 "저장 0" 은 의도.

---

## PWA / 오프라인

> 상세: [architecture/pwa-offline.md](./architecture/pwa-offline.md)

- 라우트 HTML 95개 + 매니페스트·아이콘·404 를 **직접 만든 프리캐시 목록**으로 넣는다(정적 내보내기 HTML 은 webpack 자산이 아니라서).
- 지도 타일·장소 이미지는 런타임 CacheFirst.

---

## 디자인 시스템

> 상세: [decisions/ADR-003-untitled-ui-and-palette.md](./decisions/ADR-003-untitled-ui-and-palette.md)

- 색은 시맨틱 토큰(`bg-primary`, `text-brand-secondary`, `bg-brand-solid` …)으로만. 원시 색은 `src/styles/theme.css` 에만 있다.
- 브랜드 핑크(oklch 358°) + 크림 바탕 + 잉크 히어로. 종류 색(바다/앰버/라떼)은 `theme.css` 와 `src/lib/places.ts` 두 곳에 같은 값.
- 면은 파스텔 워시(`typeTint`), 글씨·아이콘·주요 버튼만 진하게.
- 크기 토큰은 전부 `--spacing` 파생이고, 브레이크포인트는 그 값만 4 → 4.25px(768px 부터) 로 바꾼다
  (→ [ADR-006](./decisions/ADR-006-responsive-scale-and-font.md)). 본문 글꼴은 나눔스퀘어 네오 self-host(400·700).

---

## 디렉토리 구조 (핵심만)

```
src/
├── app/                      # Next App Router. 주소·메타·정적 파라미터만
│   ├── layout.tsx            # 셸(AppShell)·providers·themeColor
│   ├── manifest.ts           # 웹 매니페스트
│   ├── sw.ts                 # 서비스워커 소스 (→ public/sw.js)
│   └── (place|places|map|checklist|saved|dog|admin)/   # admin 만 숨김 라우트(프리캐시 제외)
├── screens/                  # 화면 본체(클라이언트). 파일명 = 소유 화면 접두어. adminPage*.tsx = 운영자 검수 화면
├── components/
│   ├── base/                 # Untitled UI 복사본. 직접 고치지 않음(eslint 제외)
│   ├── layout/               # AppShell · AppBar · 사이드바 · 탭바 · PageHeader · Section · EmptyState
│   ├── icons/                # 숙소·식당·카페 아이콘 3종
│   ├── foundations/          # Untitled UI 부속 아이콘(dot-icon)
│   └── *.tsx                 # placeCard · placeThumb · petBadges · eligibilityBadge · saveButton · seasonChips · townChip · missingItemsNote
├── lib/                      # 순수 로직. petPolicy · eligibility · dogFee · korean · dogProfile · sortByEligibility · placeFilters
│                             #            checklist · itemNeeds · amenities · places · category · format · appHistory · appRoutes
│                             #            admin{Session,Supabase,Candidates,Apply} — /admin 전용(순수 로직은 scripts/ 모듈을 import)
├── store/useAppStore.ts      # zustand persist
├── store/useDogEligibility.ts # useEligibility · useEligibilityMap
├── providers/                # storeHydration · routerProvider(react-aria Link → Next router)
├── data/                     # 빌드에 박히는 JSON 3개
├── styles/                   # theme.css(토큰) · globals.css · typography.css
└── types.ts                  # 도메인 타입
scripts/                      # normalize · make-icons · (fetch|optimize)-images · collect/analyze/apply(데이터 파이프라인)
├── lib/supabasePublic.mjs    # 공개 상수(PROJECT_REF · PUBLISHABLE_KEY · PROJECT_URL). import 없음 → 브라우저도 가져간다
├── lib/dataJson.mjs          # writeDataJson(node:fs). placeFields.mjs 를 순수하게 두려고 떼어 낸 파일
data/                         # Notion 추출본(커밋) · raw/(무시)
```

---

## 기능 문서 (features)

| 문서 | 상태 | 내용 |
|---|---|---|
| [dog-profile.md](./features/dog-profile.md) | 구현 완료(v1) | 내 강아지 등록과 장소별 판정. 등록·판정 로직 + 홈·목록·상세·지도 반영까지 |
| [admin-review.md](./features/admin-review.md) | 구현 중 | 운영자 검수 화면 `/admin` — 무엇이 보이고 버튼이 무엇을 쓰는지. 진행은 [todo/06](./todo/06-admin-review.md) |

## 주요 의사결정 (ADR)

| ADR | 제목 |
|---|---|
| [ADR-001](./decisions/ADR-001-pwa-static-export.md) | PWA + Next 정적 내보내기, 서버·스토어 없음 |
| [ADR-002](./decisions/ADR-002-no-place-photos.md) | 장소 사진을 쓰지 않는다 |
| [ADR-003](./decisions/ADR-003-untitled-ui-and-palette.md) | Untitled UI 토큰 위에 핑크·크림·잉크 팔레트 |
| [ADR-004](./decisions/ADR-004-pet-policy-parser.md) | 이용 조건은 수동 태깅 대신 규칙 파서 + 원문 병기 |
| [ADR-005](./decisions/ADR-005-dog-profile-eligibility.md) | 강아지 프로필 기반 판정을 v1 의 중심으로 (채택) |
| [ADR-006](./decisions/ADR-006-responsive-scale-and-font.md) | 화면이 커지면 크기도 커진다 — `--spacing` 한 축 + 나눔스퀘어 네오 self-host (채택) |
| [ADR-007](./decisions/ADR-007-shell-owned-back-navigation.md) | 뒤로가기는 화면이 아니라 셸이 붙인다 — 메인 탭 5개만 루트 (채택) |
| [ADR-008](./decisions/ADR-008-map-provider.md) | 지도 제공자: 네이버(NCP Maps v3), 마커는 표준 핀으로 (채택 · v4 에서 Kakao 결정을 번복) |
| [ADR-009](./decisions/ADR-009-trip-derived-checklist.md) | 준비물을 목록이 아니라 여행의 파생값으로 (채택, v3 에서 방향 반전 — 목록이 원본, 장소가 읽는 쪽) |
| [ADR-010](./decisions/ADR-010-shell-owned-safe-area.md) | 상태바 인셋도 화면이 아니라 셸이 처리한다 — 여백은 셸이, 맨 위 면은 전 화면 크림 (채택) |
| [ADR-011](./decisions/ADR-011-app-gate-and-supabase.md) | 앱 전체를 잠그되 정적 내보내기는 버리지 않는다 — 데이터를 번들 밖 Supabase 로 (**제안**) |
| [ADR-012](./decisions/ADR-012-personal-data-and-consent.md) | 휴대폰 번호를 받는 순간 필요한 것들 — 약관·동의 기록·파기 (**제안**) |
| [ADR-013](./decisions/ADR-013-places-swipe-pager.md) | 둘러보기 종류를 손가락으로 넘긴다 — 캐러셀이 아니라 엿보기(peek) + 놓으면 push |
| [ADR-014](./decisions/ADR-014-shell-owned-swipe-pager.md) | 탭바 화면 사이도 손가락으로 넘긴다 — 둘러보기를 펼친 일곱 칸 한 줄, 셸이 소유 |
| [ADR-015](./decisions/ADR-015-supabase-source-and-rebuild.md) | 원본은 Supabase, 반영은 재빌드 — 회원은 범위 밖 |
| [ADR-018](./decisions/ADR-018-in-app-admin-review.md) | 검수는 앱 안 숨은 화면(`/admin`)에서 하고 승인이 곧 반영이다 — 번들에 publishable 키가 들어간다(ADR-015 §2 번복, 경계는 RLS·GRANT), 세션은 access token 만(12시간), 신규 장소는 곧바로 `published`, 사이트 반영은 재빌드 |
| [ADR-016](./decisions/ADR-016-secrets-by-login.md) | 시크릿은 저장하지 않는다 — 운영자가 `pnpm data:login` 하면 짧은 세션(JWT)으로 RLS 안에서 쓴다. 관리자가 없으면(만료) 아무 스크립트도 DB 에 쓰지 못한다. 인증 출처는 세션·anon 둘뿐 — service_role 은 어디에도 없고 GitHub Actions 도 없다(v5). 수집·분석·반영은 사용자 터미널에서 |
| [ADR-019](./decisions/ADR-019-ai-cross-check-and-address-rules.md) | 추출 뒤 **두 번째 Claude 패스**로 교차점검한다(조건 문장 없는 후보만, 글당 한 번) — 근거 없는 후보는 버리지 않고 표식만 달고, `verify: null`(미점검)은 '근거 없음' 과 다른 상태다. 주소 표기 대조는 **AI 가 아니라 규칙**(`src/lib/addressMatch.ts`) — 지번↔도로명은 판단 보류 |

## 버그 기록

`docs/bugs/BUG-NNN-{slug}.md` (증상 / 재현 조건 / 원인 / 수정 내용 / 관련 문서).

- [BUG-001](./bugs/BUG-001-bottom-sheet-bottom-padding.md) — 하단 시트 바닥 여백이 사라지거나 홈 인디케이터에 깔린다(`p-4 pb-safe` 덮어쓰기)
- [BUG-005](./bugs/BUG-005-vercel-output-directory.md) — Vercel 배포가 빌드를 다 끝내고 `out/routes-manifest.json` 없음으로 죽는다(`vercel.json` 의 `outputDirectory: "out"` + Next 프리셋)
