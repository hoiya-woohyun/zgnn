# 6. 운영자 검수 화면 — 앱 안 `/admin` 에서 후보를 보고 바로 올린다

> 최종 수정: 2026-09-29 (v3: **2~4단계 구현이 끝났다** — 코드 13파일·문서 12편, 리뷰 2명이 major 2 + minor 12 를 잡아 14건 반영·1건 근거와 함께 기각.
> 실측 636 테스트(34파일) · tsc·lint 통과 · 빌드 유출 검사 539파일. 계획과 **실제가 다른 자리 여섯 곳**을 「계획과 다르게 간 것」 절에 적었다.
> 남은 것은 사용자 몫 둘(로그인해서 검수 · 4b 웹훅)이다)
> 이전 (v2: 1단계를 `ff62eba` 로 커밋하고, 재개 지점을 못 박았다 — 세션 한도(03:50 리셋)로 두 번 끊겼다.
> **파일 단위 상세 계획·시그니처는 `.omc/plans/2026-09-29-admin-review/admin-plan.md`**(결정은 `admin-brief.md`, file:line 근거는 `admin-map.md`) —
> 이 문서는 "무엇을 왜" 이고 저기가 "어떻게" 다. 레포에 담지 않은 이유: 구현이 끝나면 버릴 작업 지시서라서다(`.omc` 는 gitignore))
> 이전 (v1: 계획을 문서로 옮겼다 — 세션이 한도로 끊겨도 다음 세션이 여기서 이어가게.
> 조사(에이전트 6개)와 설계는 끝났고, 1단계(스크립트 정리)는 **코드가 이미 들어가 있다**. 남은 것은 2~4단계다)

`pnpm data:review`(CLI 검수 창, 2026-09-28)와 Studio 를 대신할 **화면**을 앱 안에 만든다.
사용자 요구를 그대로 옮기면 셋이다 — **(1) 정리된 DB 내용과 블로그 주소를 보여 준다 · (2) 맞다/아니다를 눌러
판정한다 · (3) 맞다면 그 장소가 다른 사용자에게 보인다.** (3) 이 이 문서의 어려운 부분이고, 아래 「사이트에
보이기까지」 가 그 거리를 다룬다.

관련 결정: [ADR-018](../decisions/ADR-018-in-app-admin-review.md)(이 화면의 결정 — 2026-09-29 신설) · [ADR-015](../decisions/ADR-015-supabase-source-and-rebuild.md)(원본=Supabase, 반영=재빌드) ·
[ADR-016](../decisions/ADR-016-secrets-by-login.md)(시크릿은 로그인으로) · [ADR-017](../decisions/ADR-017-ai-structured-pet-policy.md)(이용 조건은 AI 가 뽑는다).
승인·병합 규칙의 정본은 [03](03-analyze-and-review.md) 이고 이 문서가 그것을 바꾸지 않는다 — **화면은 CLI 와 같은 규칙으로 쓴다.**

## 결정 (설계 단계에서 닫은 것 — 구현이 다시 열지 않는다)

| 무엇 | 결정 | 왜 |
|---|---|---|
| 경로 | `/admin` — 탭바·스와이프·프리캐시에 넣지 않는 숨은 하위 화면 | 셸이 뒤로가기를 붙인다(ADR-007). 링크가 없을 뿐 공개 HTML 이고 **경계는 RLS 다** |
| 로그인 | 이메일·비밀번호(`signInWithPassword`) → `rpc('is_operator')` 로 운영자 확인 | 회원가입 off·SMTP 없음이라 매직링크가 불가. 비운영자는 RLS 가 빈 결과를 주므로 **"후보 없음" 으로 속이지 않고** 명시 문구를 띄운다 |
| 세션 | access token 만 localStorage. refresh token 은 버린다 | CLI(`login.mjs`)와 같은 원칙. refresh 를 저장하면 사실상 영구 로그인이 돼 ADR-016 경계("exp ≤ 1일")가 조용히 깨진다. 서버 JWT expiry 12시간 → 하루에 한 번 재로그인 |
| 번들의 키 | publishable 키 + 프로젝트 호스트 **리터럴**이 번들에 들어간다 | ADR-015 §2("앱 번들에 Supabase 없음")를 번복하는 자리다. publishable 키는 브라우저에 실으라고 만든 키이고 방어선은 RLS·GRANT 다 |
| 유출 검사 | `supabase.co` 전면 차단 → **우리 호스트만 허용**(lookbehind) | 다른 프로젝트로 데이터가 새는 오타는 계속 잡는다. service 키 이름·secret 접두·JWT 패턴은 **손대지 않는다** |
| 승인의 뜻 | 브라우저가 `places` 까지 쓴다. 신규 장소는 **곧바로 `published`** | 요구 (3). draft 로 넣으면 Studio 를 또 열어야 해 화면을 만든 이유가 사라진다 → [03](03-analyze-and-review.md) 의 🙋 "draft 생략" 이 여기서 닫힌다 |
| 승인의 순서 | `apply-approved.mjs` 와 **같은 순서·같은 필드** | 중간에 실패하면 후보가 `approved` 로 남아 터미널 `pnpm data:apply` 가 그대로 이어받는다. 두 도구가 다른 규칙으로 쓰면 `places` 가 조용히 오염된다 |
| 못 하는 것 | 삭제 UI 없음 | `authenticated` 에 DELETE grant 가 없다(42501). 되돌리기는 상태 변경뿐 |
| 편집 | 지역 고르기 · "신규로 승인"(짝 비우기) 둘만 | 반영을 막는 유일한 필수 칸이 `regionRaw` 다. 나머지는 Studio 가 여전히 있다 |

**"임시" 의 뜻**: Studio 를 대신하는 영구 관리 도구가 아니라 **첫 160건을 사람 눈으로 통과시키는 검수 창**이다.
없애도 데이터 경로(`data:analyze` → `data:review` → `data:apply`)는 CLI 로 그대로 남는다.

## 단계와 상태

```
[Claude]  ✅ 1. 스크립트 정리 + 빌드 게이트     — `ff62eba` 커밋(2026-09-29 01:05)
[Claude]  ✅ 2. 브라우저 데이터 계층            — `src/lib/admin{Session,Supabase,Candidates,Apply}.ts` + 테스트 2편(26케이스)
[Claude]  ✅ 3. 화면 + 서비스워커 규칙          — `/admin`(라우트 2 + 화면 5) · `sw.ts` 에 Supabase NetworkOnly
[Claude]  ✅ 4. 문서                            — ADR-018 신설 · ADR-015 v3 · ADR-016 v7 · architecture 3편 · ARCHITECTURE v16 · features/admin-review.md · 01 · 03 v11 · 05 v12 · README v24 · CLAUDE.md
[Claude]  ✅ 5. 검사 + 독립 리뷰 2명 → 반영      — major 2 + minor 12 중 14건 반영, 1건 기각(근거: 브리프 결정)
[사용자]     6. /admin 로그인 → 후보 160건 검수(맞다/아니다)   ← **다음 차례**
[사용자]     7. 4b 웹훅 연결 — 크리티컬 패스다(아래 「사이트에 보이기까지」)
```

### 1단계에서 들어간 것 (다시 하지 말 것)

- **`scripts/lib/supabasePublic.mjs`(신설)** — `PROJECT_REF`·`PUBLISHABLE_KEY`·`PROJECT_URL`(리터럴)·`assertPublishableKey`·`projectUrl`.
  import 이 없는 순수 모듈이라 브라우저가 가져갈 수 있다. `supabaseClient.mjs` 는 이것을 쓰고 **같은 이름으로 다시 내보낸다** —
  기존 importer(`login.mjs`·테스트 9곳)는 한 줄도 안 바뀐다.
- **`scripts/lib/dataJson.mjs`(신설)** — `writeDataJson` 을 `placeFields.mjs` 에서 떼어 냈다. **이 분리가 2단계의 전제다**:
  `placeFields.mjs` 에 `node:fs` 가 있으면 `matchPlace`·`mergeIntoExisting` 을 브라우저가 import 할 수 없다.
  `normalize.mjs`·`pull-db.mjs` 의 import 만 따라 바뀌었다.
- **`scripts/check-bundle.mjs`** — `supabase.co` 패턴을 `(?<!<ref>\.)supabase\.co` 로 좁혔다.
- **`package.json`** — `@supabase/supabase-js` 를 devDependencies → dependencies.
- **시드 개수 단언 완화** — `petPolicy.test.ts`·`eligibility.test.ts` 의 `toHaveLength(86)` → `toBeGreaterThanOrEqual(86)`.
  **이걸 안 하면** 승인한 장소가 `data:pull` 로 들어온 다음 `pnpm test` 가 빨개진다(빌드는 초록이라 조용히 어긋난다).

### 2~3단계에서 만들 것

| 파일 | 몫 |
|---|---|
| `src/lib/adminSession.ts` | localStorage 세션(읽기·쓰기·만료 판정), `jwtExpiresAt`(브라우저는 `atob`), `appendReviewerNote` |
| `src/lib/adminSupabase.ts` | `createAdminClient`(`persistSession:false`·`autoRefreshToken:false`·`Authorization: Bearer`), `signInAdmin`, `isOperator` |
| `src/lib/adminCandidates.ts` | 행·묶음 타입, `CANDIDATE_SELECT`(`blog_posts`·`places` 임베딩), 조회, `groupCandidates`/`previewPolicy`/`groupFlags` 래퍼, 지역 선택지 |
| `src/lib/adminApply.ts` | 승인·반려 오케스트레이션 — `apply-approved.mjs` 와 같은 순서 |
| `src/app/admin/page.tsx` · `adminRouteClient.tsx` | 메타(`robots: noindex`) + `dynamic(ssr:false)` — 세션이 localStorage 에만 있어 서버가 그릴 수 없다 |
| `src/screens/adminPage.tsx` + `adminPage{Login,GroupCard,GroupDetail,RejectForm}.tsx` | 상태 머신·카드·버튼 |
| `src/app/sw.ts` | `*.supabase.co` 에 `NetworkOnly` 를 `defaultCache` **앞에** |

**왜 서비스워커 규칙이 필요한가**: `@serwist/next` 의 `defaultCache` 끝에 cross-origin catch-all(`NetworkFirst`·1시간)이 있어
REST **GET** 이 URL 로 캐시된다. 그러면 후보 목록이 한 시간 묵고, 로그아웃한 뒤에도 사본이 남는다.

**승인 한 건의 순서**(`adminApply.ts` — `apply-approved.mjs` 와 같다):
지역·종류·이름 검사 → `candidates.status='approved'`(트리거가 `reviewed_at`) → 병합이면 빈 칸만 채우는 patch,
신규면 `places.insert` 후 **즉시** 후보에 `match_place_id` 적기 → `place_sources` upsert → `status='merged'` + `extracted.applied`.
분석 때 '신규' 였던 후보는 insert 전에 현재 장소와 **다시 대조**한다(같은 가게를 말하는 글 둘이 따로 승인되는 경우).
0.4~0.85 구간이면 화면이 "비슷한 곳이 있다" 를 보여 주고 사람이 고른다.

## 사이트에 보이기까지 — 여기가 요구 (3) 의 실제 거리

DB 에 `published` 장소가 생겨도 **정적 사이트는 다시 빌드돼야** 보인다(`pnpm data:pull && pnpm build`).
오늘 방아쇠는 수동뿐이다(Vercel Redeploy / `vercel deploy --prod` / git push).

- **4b 웹훅**(→ [04](04-deploy-and-propagate.md)): **DB 쪽 배선은 2026-09-29 에 깔렸다**(마이그레이션 `20260929023000`). 남은 것은 Vercel 에서 Deploy Hook 발급 후 Studio 에서 `vault.create_secret('<URL>','vercel_deploy_hook')` 한 줄이다.
  **Claude 몫이 아닌 이유는 권한이 아니라 그 URL 이 시크릿**이어서다(ADR-016: 값은 읽지도 찍지도 않는다). 대시보드 두 곳, 브라우저 작업이라 CLI 로그인도 필요 없다.
- 연결 전까지 화면은 **"올렸어요 · 사이트에는 다음 빌드에서 보여요"** 라고만 말한다. 거짓말을 하지 않는 게 요점이다.
- 승인 N건 = 빌드 N번이 될 수 있다(04 의 관찰 항목). 잦으면 `deploy_requests` 테이블 + "반영" 버튼으로 모아 쏘는 안이 04 에 있다.

## 계획과 다르게 간 것 (구현이 이유와 함께 바꾼 것 — 문서를 읽을 때 여기를 먼저 본다)

1. **서비스워커 규칙은 와일드카드가 아니라 호스트 하나다.** 계획은 `*.supabase.co` 였는데, 그러면 `out/sw.js` 에
   `.supabase.co` 조각이 남아 **좁혀 둔 유출 검사가 빌드를 멈춘다**(실제로 멈췄다). 그래서 `url.hostname === PROJECT_URL 의 호스트`
   하나만 본다. 1단계 주석이 경고한 그 함정이 바로 이 자리에서 발화했다.
2. **지역 선택지는 `region.raw` 고유값 18개가 아니라 15개다**(`direction|town` 으로 묶어 읍·면마다 가장 짧은 것). 남은 셋은
   `남쪽 (서귀포시 월평로)` 처럼 특정 장소의 길 이름이라, 새 장소의 `region_raw` 에 그 길이 박힌다.
3. **`factsLine`(AI 판단을 한국어 한 줄로)은 화면이 아니라 `src/lib/adminCandidates.ts` 에 있다.** CLI 쪽 원본이 미export 라
   다시 만들어야 했고, 로직은 `src/lib` 에 순수 함수로 둔다는 규칙을 따랐다. 두 사본을 함께 고치라는 주석이 달려 있다.
4. **폐업(archived) 대상 검사는 첫 쓰기보다 앞이다.** CLI 와 같은 순서이고, 뒤에 두면 "막혔다" 고 말하면서 후보가 이미
   `approved` 로 빠져 목록에서 사라진다. 테스트가 그 경우 DB 호출이 0건인 것을 못 박는다.
5. **필터는 `Tabs` 가 아니라 칩 버튼 다섯 개**(전체·일치·확인요청·신규·조건문 있음, 개수 포함). 레포에 `Tabs` 사용례가 없고
   `placesPageFilters.tsx` 가 칩 버튼을 이미 관례로 세워 뒀다.
6. **새 장소 id 는 `crypto.randomUUID` 가 없으면 `getRandomValues` 로 만든다.** `randomUUID` 는 보안 컨텍스트에서만 있어서,
   폰으로 `http://192.168.x.x` 로 열면(이 레포가 자주 하는 일 → BUG-004) 승인마다 예외가 났다.

리뷰가 잡아 반영한 것 중 기억할 둘: **쓰기 직전에 세션 만료를 다시 본다**(12시간 뒤 첫 승인이 PostgREST 오류로 보이지 않게),
**승인을 직렬화한다**(두 건이 겹치면 두 번째가 낡은 장소 목록을 읽어 같은 가게가 두 개 생길 수 있었다).
반영이 끊긴 후보(`approved` 로 남은 것)는 화면 머리에 건수로 보여 주고 `pnpm data:apply` 를 안내한다.

## 검증

1단계 실측(2026-09-29 01:0x): `pnpm test` **609 통과**(32파일) · `node --check` 전부 · 순수 lib 6개가 node 모듈 없이 로드 ·
`supabaseClient.mjs` 가 네 이름을 그대로 재export · **`pnpm data:pull` = places 86 · items 15, `git diff src/data` 빈 결과**.

마지막 줄이 중요하다. 재export 를 더하면서 옛 상수 선언을 안 지워 `Identifier already declared` 가 된 적이 있는데,
**vitest 는 초록이었고 `node --check` 도 통과했다** — 모듈을 실제로 로드해야만 드러난다. 그 상태로 커밋하면
Vercel 빌드의 첫 단계(`pnpm data:pull`)가 죽는다. 그래서 검증에 "Node 가 읽는가" 와 "pull 이 도는가" 를 넣어 뒀다.

3단계 뒤 돌릴 것: `pnpm exec tsc --noEmit` · `pnpm lint` · `pnpm test` · **`pnpm build`**(좁힌 유출 검사가 통과해야 한다 —
실패하면 어떤 파일의 어떤 문자열인지 보고, `@supabase/supabase-js` 내부 리터럴이면 그 문자열만 허용 목록에 넣고 주석) ·
`pnpm dev` 로 `/admin/` 200 확인. **로그인은 Claude 가 하지 않는다**(자격증명이 없다) — 로그인 뒤 화면은 사용자가 본다.

## 위험 (미리 적어 두는 것)

- **트랜잭션이 없다.** PostgREST 에는 트랜잭션이 없어 승인 중간에 실패하면 후보가 `approved` 로 남는다. 설계상 그게 안전한 자리이고(CLI 가 이어받는다)
  화면은 실패를 삼키지 않고 그대로 보여 준다. 삼키면 사람이 두 번 누르고 장소가 두 개 생긴다.
- **`/admin/index.html` 은 공개 파일이다.** 숨은 링크가 보안이 아니다 — 경계는 RLS·GRANT 뿐이고, Preview 배포는 프로덕션 DB 를 공유한다(05 의 프리뷰 보호 항목은 여전히 열려 있다).
- **첫 화면이 곱지 않다.** 160건은 옛 프롬프트로 키 없이 돌린 결과라 `petPolicy`·`visited`·좌표가 없고, 목록글 101건·홍보 13건이 섞여 있다.
  "AI 판단 없음"·"좌표 없음" 은 버그가 아니다 — 새 `data:analyze` 를 돌리면 채워진다.
- **다른 세션이 같은 레포를 만지는 중이면 검사 결과가 섞인다.** 2026-09-29 00:40 시점에도 팔레트·칩 작업이 커밋 전 상태로 있었다 —
  실행자는 자기 파일만 만지고, 남의 미커밋 변경을 "고치지" 않는다.
