# 6. 운영자 검수 화면 — 앱 안 `/admin` 에서 후보를 보고 바로 올린다

> 최종 수정: 2026-09-29 (v4: **5단계 — 내리는 길을 더했다**(사용자 요구: "이미 게시된 글에 소프트딜리트가 없다").
> `/admin` 이 두 칸이 됐고(후보 검수 / 올린 장소), 그것만 만들면 **내린 것이 복제본으로 되돌아오는** 구멍이 있어 대조 corpus·승인 갈래·
> 동점 규칙을 함께 바꿨다([ADR-018](../decisions/ADR-018-in-app-admin-review.md) 결정 6~8). 같은 요청의 둘째 갈래로 **재빌드 관측**을 깔았다(결정 9) —
> Deploy Hook URL 이 대화 기록에 남아 회전이 권장되는데, 잘못 붙여 넣으면 증상이 "아무 일도 안 일어남" 이라 회전 자체가 위험했다.
> 실측: 669 테스트(36파일) · tsc·lint 통과 · 빌드 유출 검사 539파일. **사용자 몫 둘** — 마이그레이션 2개 원격 적용, Deploy Hook 회전([05](05-security.md)))
> 이전 (v3: **2~4단계 구현이 끝났다** — 코드 13파일·문서 12편, 리뷰 2명이 major 2 + minor 12 를 잡아 14건 반영·1건 근거와 함께 기각.
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

## 5단계 — 내리기(소프트 삭제) · 재빌드 관측 (2026-09-29)

요구 두 줄에서 나왔다 — **"수집된 글은 조정할 수 있지만 이미 게시된 글은 소프트딜리트가 없다"** 와
**"Deploy Hook 을 그냥 둬도 문제없다고 한 말에 문제가 있을 수 있다"**.

| 무엇 | 어디 |
|---|---|
| `places.archived_at`·`archive_note` + 찍는 트리거 | `supabase/migrations/20260929120000_places_archive.sql` |
| `rebuild_log` · 게시 게이트 · `rebuild_status()` | `supabase/migrations/20260929121000_rebuild_log.sql` |
| '올린 장소' 칸(검색·상태 칩·내리기/되살리기) | `src/screens/adminPagePlaceList.tsx` · `adminPagePlaceRow.tsx` · `src/lib/adminPlaces.ts` |
| 머리글의 재빌드 한 줄 | `src/lib/adminRebuild.ts` |
| 내린 곳 짝 처리(`archivedTarget` · `restoreArchived` · `confirmedDifferent`) | `src/lib/adminApply.ts` · `src/screens/adminPageGroupCard.tsx` |
| 대조 corpus 3곳 + 동점 규칙 + `toMatchablePlace` | `analyze-candidates.mjs` · `apply-approved.mjs` · `adminCandidates.ts` · `matchPlace.mjs` · `placeFields.mjs` |
| `data:seed` 가 내린 곳을 되살리지 않게 | `scripts/seed-db.mjs` |

**계획에 없었는데 해야 했던 것** — 다중 에이전트 감사가 잡은 것들이다:

1. **`matchPlace` 가 status 를 모른다.** corpus 에 archived 가 들어오자, 이름을 바꿔 다시 낸 가게(내린 `숨도` ·
   살아 있는 `숨도카페`)에서 점수가 같아지고 **승자가 PostgREST 의 heap 순서**로 정해졌다 — UPDATE 한 번에 바뀐다.
   → 동점(점수+거리)일 때만 살아 있는 쪽을 고르고(`preferLive`), 세 질의에 `.order('id')` 를 붙였다.
   점수가 **다르면** 개입하지 않는다: 내린 쪽이 이기면 사람에게 묻지만(눈에 보이는 실패), 살아 있는 쪽을 억지로
   택하면 조용히 틀린 병합이 된다.
2. **`asNew` 가 archived 검사를 통째로 건너뛴다.** `새 장소로 올리기` 는 짝을 버리므로 archived 가지에 닿지 않고
   바로 `published` 를 만든다 — 그 버튼이 보이는 카드가 **정확히** archived 짝을 가진 카드들이었다.
   → 버려지는 짝이 내린 곳이면 멈추고, `정말 다른 가게예요`(`confirmedDifferent`) 를 지나야만 만든다. 배지도 접힌 줄에 띄운다.
3. **0.4~0.85 패널이 상태를 모른다.** 이웃이 내린 곳이면 두 버튼이 **둘 다** 틀렸다. → `TSimilarPlace` 에 상태 셋을
   경계에서 얹고(`decideTarget` 은 순수하게 둔다), 라벨과 플래그를 바꿨다.
4. **두 칸이 같은 배열을 나눠 쓰면** 내리기가 `placesRef` 에 안 보여 승인이 내린 곳에 조용히 합친다.
   → 목록은 따로 읽고, 쓰기 뒤에 `onPlaceChanged` 로 장부를 맞춘다. 쓰기 잠금은 **하나**를 나눠 쓴다.

**남은 사용자 몫**

- [ ] 마이그레이션 2개 원격 적용(`supabase db push` — 휴지 상태면 로그인부터).
- [ ] Deploy Hook 회전 — 절차·확인까지 [05](05-security.md) 의 「Deploy Hook 회전」 에 있다. `create`/`list` 는 URL 을 찍으므로 **사람이 자기 터미널에서**.
- [ ] 적용 뒤 `/admin` 에서 한 곳 내렸다 되살려 보고, 머리글이 `재빌드가 걸렸어요(… · 201)` 인지 확인.

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
[Claude]  ✅ 7. 4b 웹훅 연결 — 끝났다(2026-09-29, 실측 201 → 빌드). 승인이 곧 배포다
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

- ✅ **4b 웹훅은 끝났다**(2026-09-29 → [04](04-deploy-and-propagate.md) v7). `places` 가 바뀌면 트리거가 Vercel 을 부르고 빌드가 선다(실측 201). Deploy Hook 은 09-17 부터 이미 있었고 URL 은 Vault 에 있다. **이제 「맞아요」가 곧 배포다.**
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
