# zgnn — 강아지랑 제주

반려견 동반 제주 가이드 PWA. Next 16 App Router **정적 내보내기**(서버 없음) · React 19 ·
Tailwind v4 + Untitled UI · zustand persist · 네이버 지도(NCP Maps v3). 데이터는 빌드 시점 JSON 3개.

핵심 도메인은 **내 강아지 조건 × 장소의 이용 조건 → 갈 수 있는가** 판정이다.

## 어디를 읽을까 (한 홉으로 끝내기)

| 무엇을 하려는가 | 읽을 곳 |
|---|---|
| 빌드·PWA·서비스워커가 안 됨 | [README.md](README.md#실행) → [docs/architecture/pwa-offline.md](docs/architecture/pwa-offline.md) |
| 이용 조건 파싱·판정 로직 | [docs/architecture/pet-policy-and-eligibility.md](docs/architecture/pet-policy-and-eligibility.md) · `src/lib/petPolicy.ts` · `src/lib/eligibility.ts` |
| 준비물·장소별 필요 물건 | [docs/features/checklist.md](docs/features/checklist.md) · [docs/decisions/ADR-009-trip-derived-checklist.md](docs/decisions/ADR-009-trip-derived-checklist.md) · `src/lib/itemNeeds.ts` |
| 라우팅·화면 셸·클라이언트 상태 | [docs/architecture/app-shell-and-state.md](docs/architecture/app-shell-and-state.md) · `src/store/useAppStore.ts` |
| 화면 간 좌우 스와이프·스크롤 복원 | [docs/decisions/ADR-014-shell-owned-swipe-pager.md](docs/decisions/ADR-014-shell-owned-swipe-pager.md) · `src/components/layout/appShellSwipe.ts` · `src/lib/appScroll.ts` |
| 둘러보기 안의 종류 스와이프·탭 전환 애니메이션 | [docs/decisions/ADR-013-places-swipe-pager.md](docs/decisions/ADR-013-places-swipe-pager.md) · `src/screens/placesPageSwipe.ts` · `src/lib/swipePager.ts` |
| 뒤로가기가 안 보임·새 화면 추가 | [docs/decisions/ADR-007-shell-owned-back-navigation.md](docs/decisions/ADR-007-shell-owned-back-navigation.md) · `src/lib/appRoutes.ts` |
| 노치·상태바 밑으로 내용이 들어감 | [docs/decisions/ADR-010-shell-owned-safe-area.md](docs/decisions/ADR-010-shell-owned-safe-area.md) · `src/components/layout/appShell.tsx` |
| 데이터 갱신·정규화 | [docs/architecture/data-pipeline.md](docs/architecture/data-pipeline.md) · `scripts/normalize.mjs` |
| 지도(네이버 NCP Maps v3)·마커·오프라인 | [docs/decisions/ADR-008-map-provider.md](docs/decisions/ADR-008-map-provider.md) · `src/lib/naverMap.ts` · `src/screens/mapPageCanvas.tsx` · 상세 미니 지도 `src/screens/placeDetailMiniMap.tsx` — **지도 비용은 "지도를 띄운 방문 수"**(인증이 페이지 로드당 1회, ADR-008 「과금」) |
| 색·토큰·팔레트 | [docs/decisions/ADR-003-untitled-ui-and-palette.md](docs/decisions/ADR-003-untitled-ui-and-palette.md) · `src/styles/theme.css` |
| 크기 스케일·반응형·글꼴 | [docs/decisions/ADR-006-responsive-scale-and-font.md](docs/decisions/ADR-006-responsive-scale-and-font.md) · `src/styles/globals.css` |
| 회원·로그인·개인정보를 붙이려 함 | [docs/decisions/ADR-011-app-gate-and-supabase.md](docs/decisions/ADR-011-app-gate-and-supabase.md) · [ADR-012](docs/decisions/ADR-012-personal-data-and-consent.md) — **둘 다 제안 단계라 코드에 대응물이 없다** |
| 블로그 수집·AI 분석·검수·승인·Supabase·Vercel 배포 | [docs/todo/README.md](docs/todo/README.md)(진행 트래커) · [docs/architecture/data-pipeline.md](docs/architecture/data-pipeline.md) · 결정은 [ADR-015](docs/decisions/ADR-015-supabase-source-and-rebuild.md)(원본=Supabase, 반영=재빌드, 회원은 범위 밖) · [ADR-017](docs/decisions/ADR-017-ai-structured-pet-policy.md)(동반 조건 구조화는 AI 가 뽑을 때, 정규식은 시드·안전망) · [ADR-019](docs/decisions/ADR-019-ai-cross-check-and-address-rules.md)(**Claude 를 두 번 부른다** — 조건 문장 없는 후보에 교차점검, 주소 표기 대조는 AI 가 아니라 규칙). 코드는 `scripts/collect*`·`scripts/analyze*`·`scripts/review-candidates.mjs`(`pnpm data:review` — 검수 창)·`scripts/apply-approved.mjs` — **`pnpm data:*` 는 사용자 터미널에서 돈다(스케줄·Actions 없음), Claude 는 구독(`claude -p`)으로 부른다, API 키 아님** |
| 시크릿·API 키·`.env.local`·`pnpm data:login` | [ADR-016](docs/decisions/ADR-016-secrets-by-login.md) · `scripts/lib/supabaseClient.mjs` · `scripts/login.mjs` — **값을 저장하지 않는다**. 운영자가 `pnpm data:login` 한 짧은 세션(JWT)으로 RLS 안에서 쓰고, 만료면 멈춘다. 인증 출처는 세션·anon 둘뿐(service 키는 env 에 있어도 쓰기 스크립트가 멈춘다). 네이버 키는 사용자 로컬 관리(env 또는 TTY 숨김 입력) — `data:collect` 는 사용자 터미널 몫. 레포에 env 파일은 없다(`.env.local` 은 선택) |
| 운영자 검수 화면(`/admin`)·후보 승인 | [docs/features/admin-review.md](docs/features/admin-review.md) · [ADR-018](docs/decisions/ADR-018-in-app-admin-review.md) · 진행은 [docs/todo/06](docs/todo/06-admin-review.md) · `src/screens/adminPage.tsx` · `src/lib/adminApply.ts` — **여기만 브라우저에서 Supabase 를 직접 부른다**(publishable 키가 번들에 있다, 경계는 RLS·GRANT). 승인 한 번이 `places` 에 `published` 로 들어가고, 사이트에는 다음 빌드에서 보인다 |
| 올린 장소 **내리기**(소프트 삭제)·되살리기 | [docs/features/admin-review.md](docs/features/admin-review.md) 의 「올린 장소를 내린다」 · [ADR-018](docs/decisions/ADR-018-in-app-admin-review.md) 결정 6~8 · `src/lib/adminPlaces.ts` · `src/screens/adminPagePlaceList.tsx` — 하드 삭제는 **불가능하다**(GRANT 에 delete 가 없다). `status='archived'` 한 칸이 전부이고 그것이 `pull-db` 집합에서 빠지는 것으로 사라진다. ⚠️ **대조 corpus 세 곳이 archived 를 읽어야 한다** — 안 그러면 내린 곳이 새 id 로 되살아난다 |
| 재빌드가 정말 걸렸나·Deploy Hook | [docs/todo/04](docs/todo/04-deploy-and-propagate.md) 4b · [ADR-018](docs/decisions/ADR-018-in-app-admin-review.md) 결정 9 · `src/lib/adminRebuild.ts` · `supabase/migrations/20260929121000_rebuild_log.sql` — `places` 변경 → 트리거 → Vault 의 훅. **`published` 가 끼는 변경만** 부르고, 결과가 `rebuild_log` 에 남아 `/admin` 머리글에 한 줄로 뜬다(4xx 면 훅 폐기). 훅 회전 절차는 [docs/todo/05](docs/todo/05-security.md) |
| 매장 사진·공식 홈페이지 카드·'사진 보기' 버튼 | [ADR-002](docs/decisions/ADR-002-no-place-photos.md) v2·v3 · `scripts/analyze/homepageCard.mjs` · `src/lib/naverPlaceLink.ts` · `src/screens/placeDetailHomepage.tsx` — **사진 파일은 갖지 않는다.** 플레이스 사진은 링크로 보내고, 홈페이지는 `og:image` 한 장의 URL 만 출처와 함께 카드로. 출처 표시는 허락이 아니다 |
| "왜 이렇게 했나" | [docs/decisions/](docs/decisions/) (ADR 19편) · 전체 지도는 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |

탐색 전에 위 표를 먼저 본다. 전체 구조가 필요하면 `docs/ARCHITECTURE.md` 하나만 읽으면 된다.

## 조용히 깨지는 것들 (건드리기 전에 확인)

빌드가 통과하거나 화면이 그려지는데도 기능이 사라지는 경우들이다.

- **폰에서 버튼·스크롤 반응만 죽고 콘솔에 `_next/hmr` 웹소켓 에러만 있으면 iOS 가 아니라
  `allowedDevOrigins` 다.** Next 16 이 localhost 밖 출처의 dev 요청을 막는데, 정적 HTML 과
  링크는 그대로라 하이드레이션만 조용히 안 끝난다. 사설 대역은 `next.config.mjs` 에 넣어 뒀고,
  `172.16~31.*.*`·`*.local`·터널 도메인은 한 줄 더한다(→ [BUG-004](docs/bugs/BUG-004-lan-dev-origin-blocked.md)).
- **`vercel.json` 에 `outputDirectory: "out"` 을 넣지 않는다.** `framework: "nextjs"` 일 때 Vercel 빌더는
  `.next/` 의 매니페스트를 읽은 뒤 `output: 'export'` 를 스스로 감지해 `out/` 을 서빙한다. `out` 을 못 박으면
  `pull`·`next build`·유출 검사가 전부 통과한 **뒤에** `out/routes-manifest.json` 없음으로 배포만 실패한다
  (→ [BUG-005](docs/bugs/BUG-005-vercel-output-directory.md)). 배포 설정 검증은 로컬 `vercel build --prod`(배포 없음).
- **`pnpm build` 의 `--webpack` 은 필수.** `@serwist/next` 가 webpack 플러그인이라, 빼면
  빌드는 통과하지만 `sw.js` 가 안 만들어져 PWA 가 조용히 사라진다. `dev` 의 `--turbopack`
  명시도 필수(webpack 설정만 있으면 Next 16 이 빌드를 멈춘다).
- **네이버 지도는 출처(origin)를 NCP 콘솔에 등록해야 뜬다.** 클라이언트 아이디가 맞아도
  Application → Maps → **Web 서비스 URL** 에 주소가 없으면 인증이 거부되고, 콘솔에서
  **Dynamic Map 이 체크돼 있지 않으면** 429(Quota Exceed)가 난다. Kakao 와 달리 실패를
  `window.navermap_authFailure` 로 알려 주므로 화면은 빈 지도 대신 안내를 그린다
  (→ [ADR-008](docs/decisions/ADR-008-map-provider.md)).
- **확대 수준의 방향은 두 번 뒤집혔다** — leaflet `zoom`(클수록 확대) → Kakao `level`(작을수록)
  → 네이버 `zoom`(**다시 클수록 확대**, 기본 11). 벤더를 옮길 때 숫자를 물려받을 수 없고,
  부호를 뒤집어도 빌드·테스트는 통과한다 — 화면에서만 드러난다. 지금 쓰는 값은
  `src/lib/places.ts` 의 `JEJU_ZOOM` 하나뿐이다(→ [ADR-008](docs/decisions/ADR-008-map-provider.md)).
- **`additionalPrecacheEntries` 는 `globPublicPatterns` 를 대체한다** — 더해지지 않는다.
  그래서 아이콘을 `next.config.mjs` 에 손으로 나열한다. 지우면 아이콘이 프리캐시에서 빠진다.
- **이동가방·케이지·유모차는 준비물 표(`ITEM_NEEDS`)에 넣지 않는다.** 판정(`eligibility.ts` H4·H5·C2·C3)이
  이미 같은 말을 한다 — 넣으면 한 화면에서 "갈 수 있어요"와 "가방을 안 챙겼어요"가 **서로 반대를**
  말한다. 빌드·테스트는 그대로 통과한다(→ [ADR-009](docs/decisions/ADR-009-trip-derived-checklist.md)).
- **`<main>` 안에 `position: fixed` 를 새로 두면 스와이프 중에 자리가 어긋난다.** 셸이 화면을
  끌 때 `<main>` 에 transform 이 걸리는데, transform 이 걸린 조상이 있으면 `fixed` 는 화면이 아니라
  그 조상 기준이 된다 — `top: 0` 이 문서 맨 위를 가리켜, 내려 본 상태에서 끌면 그 요소가 화면
  위로 사라진다. 그런 요소는 `top: var(--swipe-viewport-top, 0px)` 로 상쇄한다(셸이 끄는 순간 스크롤 값을 적는다).
  화면 위에 붙는 제목은 `fixed` 가 아니라 **`sticky`** 로 만든다 — 준비물·설정의 `StickyMorphTitle`, 홈의 `HomePageHero` 가 그렇다
  (→ [ADR-014](docs/decisions/ADR-014-shell-owned-swipe-pager.md)).
- **종류 색(숙소·식당·카페)은 두 곳에 같은 값이 있다** — `src/styles/theme.css` 와
  `src/lib/places.ts`(지도 마커). 한쪽만 고치면 지도와 화면 색이 어긋난다.
- **팔레트를 바꾸면** `pnpm icons` 로 아이콘을 다시 만들고 `src/app/layout.tsx` ·
  `src/app/manifest.ts` 의 `theme_color` 도 함께 맞춘다.
- **`pnpm data:pull` 이 빈 결과를 받으면 파일을 덮어쓰지 않고 exit 1** 한다. RLS 정책이 바뀌거나 다른 프로젝트를 가리키면 PostgREST 는 에러가 아니라 `[]` 를
  주고, 그대로 쓰면 빌드는 초록인데 사이트가 빈다. "places 0" 로 멈추면 정책·`PROJECT_REF` 를 본다(→ [ADR-016](docs/decisions/ADR-016-secrets-by-login.md)).
- **내린 장소(`archived`)를 대조 corpus 에서 빼면 그 가게가 새 id 로 되살아난다.** 내린 곳을 쓴 새 글이
  수집되면 `matchPlace` 가 짝을 못 찾아 '신규' 로 판정하고, 승인 한 번에 **복제본**이 게시된다 — 내린 행이
  돌아오는 게 아니라 쌍둥이가 생기는 것이라 눈에 안 띈다. 그래서 세 곳(`analyze-candidates.mjs` ·
  `apply-approved.mjs` · `fetchMatchablePlaces`)이 상태를 가리지 않고 읽고, 대조용 행은 `fromPlaceRow` 가
  아니라 **`toMatchablePlace`** 로 만든다(`status` 한 칸을 얹는다 — 한 군데만 빠져도 동점 규칙이 조용히 꺼진다).
  빌드·테스트는 전부 통과한다(→ [ADR-018](docs/decisions/ADR-018-in-app-admin-review.md) 결정 7).
- **`extracted.verify` 의 `null` 은 "근거 없음" 이 아니라 "안 봤다" 다.** 교차점검(`scripts/analyze/verifyPlaces.mjs`)의 상태는
  셋이 아니라 **넷**이고(미점검 · 동반 확인 · 동반 근거 없음 · 동반 불가 정황), `verify` 의 truthy 만 보는 구현은 아직 안 본 후보를
  "봤고 괜찮았다" 로 보여 준다 — 그 패스를 만든 이유가 그대로 되돌아온다. 지금 쌓인 후보 218건이 전부 `null` 이다.
  화면은 그때 뱃지를 **안 그린다**(`src/lib/adminVerify.ts` 의 `verifyView`). 빌드·테스트는 통과한다
  (→ [ADR-019](docs/decisions/ADR-019-ai-cross-check-and-address-rules.md) 결정 3).
- **주소 표기 대조에 AI 를 붙이면 하나 있는 진짜 신호를 잃는다.** 두 주소(네이버 ↔ 원글)의 불일치 43쌍 중 39쌍이 `제주특별자치도`↔`제주`
  뿐이었고, 정말 다른 2쌍이 "검색이 동명의 다른 가게를 집었다" 는 유일한 신호다. 남은 갈래(지번↔도로명)는 조회해야 아는 것이라 모델이
  지어내고, 지어낸 '같다' 가 그 2쌍을 덮는다 — `src/lib/addressMatch.ts` 의 `sameAddress` 가 `'unknown'` 을 돌려주는 것은 포기가 아니라 결정이다.
- **`TPetPolicy` 에 조건 필드를 더하면 `readNothing`(`petPolicy.ts`)에도 더한다.** 빠지면 그 조건만 읽힌 원문이
  `unread` 가 되어 판정 C7("원문을 확인해 주세요")로 떨어진다 — 시드 86곳엔 그런 원문이 없어 테스트는 통과한다.
  같은 이유로 AI 판단은 `correctPetPolicyFacts`(`scripts/lib/petPolicyFacts.mjs`)를 거쳐야 판정에 닿는다: 원문에 근거 없는
  숫자 하나(`weightLimitKg: 10`)가 대형견을 '어려움' 으로 보낸다(→ [BUG-009](docs/bugs/BUG-009-unread-and-denied-policy-judged-ok.md)).
- **첫 프레임에 "저장 0" 으로 보이는 것은 의도**다(`skipHydration`). 정적 HTML 이라
  localStorage 를 마운트 뒤에 읽는다 — 버그로 보고 고치지 않는다.
- **`src/components/base/` 는 Untitled UI 복사본**이라 직접 고치지 않는다(eslint 도 이
  폴더만 꺼 뒀다). 고쳐야 하면 감싸는 컴포넌트를 만든다.
- **크기는 `--spacing` 한 축으로만 커진다**(ADR-006). 브레이크포인트마다 `globals.css` 의
  `--spacing` 만 4 → 4.25px(768px 부터 한 단) 로 바뀌고 모든 크기 토큰이 파생된다. 자리마다 `md:text-lg` 를
  손으로 붙이지 않는다 — 아무것도 안 해도 따라오는 게 요점이다. 모바일 값은 44px 터치
  기준(`h-11`)이 걸려 있어 **줄이지 않는다**. 지도 마커는 의도적으로 이 축에서 빼 뒀다.
  **예외는 `/admin` 하나** — 운영자가 PC 로 훑는 표라 `src/styles/adminDensity.css` 가 그 화면에서만 축을
  기준값(4px)에 **못 박는다**(`:root:has([data-admin-dense])`). 커지는 것을 멈출 뿐 줄이지는 않는다.
  화면 안쪽 상자에 `--spacing` 을 덮어쓰는 것으로는 **글자가 안 따라온다**(`--text-*` 는 `:root` 선언이다)
  → [ADR-018 결정 10](docs/decisions/ADR-018-in-app-admin-review.md).
- **색은 시맨틱 토큰으로만** (`bg-primary` · `text-secondary` · `bg-brand-solid`).
  원시 색값은 `theme.css` 에만 둔다.
  **네이버(지도·플레이스)로 나가는 버튼은 `src/components/naverLinkButton.tsx` 하나로** 만든다 — 네이버 공식 초록(`bg-naver`)·작은 알약·44px 히트 영역이
  거기 들어 있다. `Button color="primary"` 로 새로 만들면 핑크 주 버튼과 구분이 안 된다(→ ADR-003 v13).
- **장소 사진은 없는 것이 기본 디자인**이다(저작권 문제로 전량 제거, 86곳 모두 `cover` 없음).
  사진 자리는 종류별 색 + 아이콘이 대신한다 → [ADR-002](docs/decisions/ADR-002-no-place-photos.md).

## 작성 규칙

- **시크릿 값은 읽지도 찍지도 않는다**(ADR-016 v5). 로컬엔 장기 키가 없다 — `pnpm data:*` 는 운영자가 별도 터미널에서 `pnpm data:login` 한 짧은 세션(키체인)으로 붙고,
  세션이 없거나 만료면 "pnpm data:login" 으로 멈춘다. **그때는 사용자에게 로그인을 요청하고 기다린다** — `pnpm data:login` 은 에이전트가 부를 수 없다(TTY 가드).
  값이 필요해 보이면 값 없이 되는 검사로 바꾼다(`pnpm data:pull` 의 exit 0, `gh secret list` 의 이름). GitHub Secrets 는 **0개**(2026-09-22 실측)라 넣을 것도 지울 것도 없다 —
  다시 생기면 `gh secret list` 로 보고 `gh secret delete`(이름만 다루므로 Claude 가 해도 된다). `supabase projects api-keys`·`security find-generic-password`·`vercel env pull` 금지 — `.claude/settings.json` 의 deny 는 사고 방지 장치지
  경계가 아니다(경계는 "값이 파일에 없다 · exp ≤ 1일 · RLS 범위"). `supabase` CLI 는 휴지 상태가 로그아웃이라 `db push`·`db query` 가 안 되면 사용자에게 로그인을 요청한다.
- **뒤로가기는 화면이 아니라 셸이 붙인다.** 새 화면에 `AppBar` 를 직접 달지 않는다 —
  탭바에 넣을 화면이면 `src/lib/appRoutes.ts` 의 `ROOT_ROUTES` 에 한 줄 더하고, 아니면 아무것도 안 한다.
- **상태바 인셋도 셸이 처리한다**(ADR-010 v3). 화면에서 `env(safe-area-inset-top)` 이나 `pt-safe` 를
  쓰지 않는다 — 셸이 `<main>` 에 인셋만큼 여백을 주고 **아무도 칠하지 않아 페이지 바탕(크림)이 비친다.**
  맨 위 면은 전 화면 크림이라 **화면 쪽에서 색을 적을 자리가 없다**(경로별 색 표는 ADR-010 v2 에서 없어졌다).
  남은 것은 sticky 줄의 덮개 `bleed-top-*` 하나(둘러보기 검색 줄·하위 화면 헤더).
- **상태바·홈 인디케이터 자리에 닿는 크롬은 바탕색(크림 `bg-secondary`)이다**(ADR-010 v4). 탭바·축약 줄·검색 줄·
  하위 화면 헤더가 전부 그렇다. **흰색(`bg-primary`)은 떠 있는 카드에만** 쓴다 — 크롬을 흰색으로 칠하면 SAT·SAB 가
  스크롤 위치마다 크림/흰색으로 갈린다. 상단 크롬은 불투명(반투명이면 밑의 카드가 상태바 뒤로 비친다), 본문과는 선으로 가른다.
  하단 시트(`base/bottom-sheet`)도 크림이다 — 그 위에서 눌림 표시는 `primary_hover`(크림과 같은 값)가 아니라 `bg-tertiary`.
- **화면 본체는 `src/screens/`** (클라이언트), `src/app/**/page.tsx` 는 주소·메타·
  `generateStaticParams` 만. `src/pages/` 는 Next 가 옛 Pages Router 로 인식해서 못 쓴다.
- **단일 소유자 파일은 소유자 접두어**를 파일명과 대표 export 에 붙인다(camelCase).
  예: `dogProfileDogRows.tsx` → `DogProfileDogRows`.
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
