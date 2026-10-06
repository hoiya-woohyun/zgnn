# 6. 운영자 검수 화면 — 앱 안 `/admin` 에서 후보를 보고 바로 올린다

> 최종 수정: 2026-10-01 (v12: 사용자 제보 처리가 등록 완료 칸에 붙었다 — 명세·태스크는 [10](10-user-feedback-personas.md) T1.4, 화면은 [features/admin-review.md](../features/admin-review.md) 「사용자 제보」)
> 이전 2026-10-01 (v11: D 절 낱말 메모 — 반려→`제외` 는 09 T1.3 에서 결정 줄·일괄 줄·폼 라벨만 먼저 바꿨다. `승인`·`반영`·`게시` 정리는 09 T3.4)
> 이전 2026-10-01 (v10: 「열린 것」 #11(되살리기 확인) 닫힘 — `되살리기(게시중으로)` + 한 줄 확인, 09 T6.2)
> 이전 2026-10-01 (v9: 「열린 것」 에 **G. 주의해서 볼 자리 강조** 를 더했다 — 사용자 의견: 운영자가 놓치면 안 되는 문장·값을
> 카드 안에서 텍스트 하이라이트로 보여 달라. 블로그 근거와 API 근거(관광공사 등)가 충돌하는 자리가 첫 대상이다)
> 이전 (v8: A-3 을 고쳤다 — 갈래 (A), 조건 원문도 고칠 수 있게 하고 보정은 그대로. 폼이 결과를 미리 보여 준다)
> 이전 (v7: **승인 전 후보를 고치는 폼**이 생겼다(`고치기` — 이름·종류·주소·좌표·AI 요약).
> 새 열린 것 **A-3**: 동반 정보(`petPolicy`)만 그 폼에 못 넣었다 — 사람이 넣은 값도 `correctPetPolicyFacts` 가 지우고,
> 조건 원문이 빈 후보(50묶음 중 22)는 `pet_policy` 를 아예 안 쓴다. 🙋 사용자가 정할 자리)
> 이전 (v6: 「열린 것」 A-1·A-2 를 고쳤다 — [BUG-009](../bugs/BUG-009-unread-and-denied-policy-judged-ok.md). `/admin` 의 "AI 는 읽었는데 사이트에 안 나와요" 는 이제 거의 뜨지 않는다 — 그 값들이 배지·판정에 닿는다. 뺀 AI 판단은 표식 `AI 판단 일부 뺌` 과 펼친 줄로 보인다)
> 이전 (v5: **화면 말을 운영자 말로** — 처음 쓰는 운영자가 '일치'·'확인요청'·'정규식 못읽음'·'조건: 자유' 를
> 읽지 못한다는 지적에서. 구간 라벨을 바꾸고, 걸러 보기를 두 축으로 가르고(5번 개정), 조건 미리보기 세 줄을 결론 한 줄 + 접는 줄로 접었다.
> 표식은 표기 층(`src/lib/adminPreview.ts`)이 색·자리를 정한다 — CLI 문자열은 그대로 두고 화면만 바꾸는 이음새다.
> 같은 감사가 잡았지만 **문구가 아니라서 안 고친 14건**은 아래 「열린 것」 에 있다 — 1·2번은 사용자 앱의 판정에 번진다)
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

- [x] 마이그레이션 2개 원격 적용(`supabase db push` — 휴지 상태면 로그인부터).
  > 메모: 2026-10-06 대기열 정리 때 코드로 확인 — `places_archive`·`rebuild_log` 둘 다 원격에 있다 — 10 H.1 메모(2026-10-04 `supabase migration list` 전부 일치), 13 T3.2 가 `rebuild_log` 를 직접 읽었고, 15 T1.1 의 `db push` 때 대기 파일은 `pipeline_runs` 하나뿐이었다.
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
5. **필터는 `Tabs` 가 아니라 칩 버튼**, 그리고 **두 축**이다(2026-09-29 개정) — 하나만 고르는 줄(전체 · 이미 있는 곳 · 같은 곳일까요? · 처음 보는 곳)과
   따로 켜는 토글 하나(`조건이 적힌 것만`). 다섯을 한 줄에 같은 모양으로 두었더니 조건 토글이 구간 필터를 **대체해서** 목록이 조용히 비었다
   (142묶음 중 조건문 없는 112건이 통째로 사라지는데 화면은 다 본 것처럼 보였다). 레포에 `Tabs` 사용례가 없고
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

## 열린 것 — 문구 작업에서 **일부러 안 고친** 별건 (2026-09-29)

화면 말을 바꾸는 작업(v5)에서 페르소나 감사가 함께 잡은 것들이다. 문구가 아니라 **동작·판정·배선**이라 같은 커밋에 섞지 않았다.
위에서 아래로 위험한 순이다. 🙋 는 사용자가 정할 자리.

### A. 사용자 앱의 판정에 번지는 것 (가장 위험)

0. ~~🙋 **동반 정보(`petPolicy`)를 사람이 고칠 수 없다**~~ → **고침**(2026-09-30, A-3): 갈래 **(A)** 로 정했다(사용자 선택) —
   **조건 원문도 같이 고칠 수 있게** 하고 보정 규칙은 그대로 뒀다. 근거를 만들 수 있으면 보정과 싸울 일이 없다.
   폼이 보정을 미리 돌려(`editPreview`) "사이트에 이렇게 나가요 / 원문에 없어서 뺀 것" 을 같은 자리에서 보여 준다.
   아래는 그때의 맥락이다.
   `고치기` 폼에 이름·종류·주소·좌표·AI 요약은 넣었지만 `petPolicy` 는 넣지 못했다. 넣으면 **두 곳에서 조용히 사라진다**:
   - `correctPetPolicyFacts`(BUG-009 / ADR-017 v2)가 **원문에 근거 단어가 없는 판단을 지운다.** 사람이 넣은 값도 예외가 아니고,
     그 보정은 분석 시점과 **앱 런타임(`places.ts:16`)** 두 곳에서 돌아 게시 뒤에도 다시 걸린다.
   - 조건 원문(`petPolicyText`)이 비면 `toNewPlaceRow`·`mergeIntoExisting` 이 `pet_policy` 를 **아예 안 쓴다**(ADR-017).
     2026-09-30 실측으로 50묶음 중 **22묶음**(44%)이 그 상태다 — 그 후보들에서는 고쳐도 아무 일도 일어나지 않는다.

   갈래 셋이고 고르는 것은 도메인 판단이다:
   (A) **`petPolicyText` 도 고칠 수 있게 한다** — 근거가 생기므로 원칙을 안 바꾼다. 대가는 운영자의 말이 '원문' 에 섞이는 것.
   (B) **사람이 넣은 값 표식을 `pet_policy` 안에 둬 보정을 건너뛴다** — ADR-017 을 고쳐 써야 하고 사용자 앱의 판정 경로에 닿는다.
   (C) **근거가 있는 오독 교정만 허용**하고, 빠지는 값은 폼이 그 자리에서 보여 준다 — 정직하지만 좁다.


1. ~~**조건 문장이 있는데 파서가 다 실패하면 앱이 '갈 수 있어요' 를 준다**~~ → **고침**(2026-09-30, [BUG-009](../bugs/BUG-009-unread-and-denied-policy-judged-ok.md)): `unread` → 판정 C7(확인 필요) · 배지 '원문 확인 필요'. 🙋 방향은 '새 플래그' 로 정했다(사용자: "다같이 고치고"). — BUG-008 이 막으려던 상태가 이 경로로 살아 있다.
   `petPolicy.ts:283` 의 `noInfo` 는 원문이 **빈 문자열**일 때만 켜진다. 원문이 있는데 정규식도 AI 도 아무것도 못 읽으면
   `noInfo=false` · 뱃지 0개로 남고, `eligibility` 가 제한 없음으로 읽어 `ok` 를 준다. 2026-09-28 첫 분석에서 조건 문장이 있는
   32건 중 **20건이 정규식 0** 이었다(ADR-017) — 드문 경로가 아니다.
   `/admin` 쪽 표기는 v5 에서 고쳤다(`조건을 못 읽었어요`, 옛 `조건: 자유` 를 버렸다). **앱 판정은 그대로다.**
   → `docs/bugs/` 에 BUG-008 인접 항목으로 세울 것. 🙋 고치는 방향이 "원문이 있는데 못 읽었으면 `callFirst`(전화 확인)" 인지
   "새 플래그를 만들어 `조건 확인 필요`" 인지는 도메인 판단이다.
2. ~~**`withPolicyFacts` 의 `anyFact` 가 뱃지를 안 만드는 필드까지 '판단 있음' 으로 센다**~~ → **고침**(2026-09-30, BUG-009): `largeDogOk: false` → `largeDogNo` → 판정 H7(대형견 어려움) · 배지 '대형견 불가', `feeFree: false` → 배지 '추가요금 있음'. 같은 작업에서 AI 판단을 원문에 대 보는 보정을 더했다(ADR-017 v2).(`petPolicy.ts:352-354`).
   `largeDogOk === false` · `feeFree === false` 가 그렇다 — **AI 가 '대형견 불가' 를 제대로 읽어낸 후보도 뱃지가 0개**가 되어
   위 1번과 같은 자리로 떨어진다. 1번과 한 몸으로 볼 것.

### B. 같은 화면 안에서 두 기준이 갈리는 것

3. **`조건이 적힌 것만` 칩과 카드의 기준이 다르다.** 칩은 묶음 전체를 본다(`rows.some(r => r.extracted?.petPolicyText)`,
   `reviewCandidates.mjs:59`)는데 뱃지·미리보기는 `group.lead` 하나로만 계산된다(`adminPage.tsx` 의 `cards`).
   lead 에 조건문이 없고 형제 행에 있으면 **그 묶음은 칩에 걸린 채 카드가 `조건 문장이 없어요` 를 말한다.**
   문구로는 못 고친다 — 미리보기 기준을 묶음으로 올리는 일이다.
4. **승인을 막는 기준과 뱃지를 붙이는 기준이 다르다.** 막는 쪽은 `regionUsable`(`adminCandidates.ts`, 방향을 못 읽으면 false)이고
   표식은 `!e.regionRaw`(`reviewCandidates.mjs:91`, 있기만 하면 통과)다. Studio 에서 `동쪽 구좌읍`(괄호 빠짐)처럼 적으면
   **카드가 막히는데 `지역 없음` 뱃지가 하나도 안 붙는다.** 카드는 이미 `regionOk` 를 들고 있어 연결만 바꾸면 되지만 문구 수정이 아니다.
5. **접힘/펼침이 세는 수가 CLI 와 다르다.** 화면은 `group.rows.length`(후보 행), CLI 는 `group.posts.length`(중복 제거한 `post_url`,
   `reviewCandidates.mjs:61`). 한 글에서 후보 둘이 나오면 화면 "블로그 글 2건", 터미널 "글 1".

### C. 내부 값이 화면으로 새는 것

6. **`similar.reason` 이 영어 코드값을 보여 준다** — `matchPlace.mjs:133` 의 `종류 다름(cafe≠stay)`. 그 파일이 `TYPE_LABEL` 을
   이미 갖고 있어 **화면 쪽에서만** 치환할 이음새가 있다.
7. **승인 성공 문구가 DB 컬럼명을 그대로 뿌린다** — `adminPage.tsx` 의 `outcome.patchKeys.join(', ')` →
   `pet_policy_text, stay_price_text, naver_place_id`. 컬럼→한국어 맵이 필요하고, `status` 키는 "빈 칸을 채운 것" 이 아니라
   게시 상태를 바꾼 것이라 따로 말해야 한다(`adminApply.ts:180-182`).
8. **`failIf` 가 PostgREST 영문을 그대로 붙인다**(`adminApply.ts` 외 4곳). v5 는 단계 이름 둘만 한국어로 고쳤다.
   운영에 익숙한 사람에게 원문은 유일한 진단 근거라 **지우지 않는 것이 맞고**, 앞에 사람 말 한 줄을 세우는 일이 별건이다.

### D. 낱말·동작 정리

9. **`빌드`/`재빌드` 가 한 사건의 네 이름으로 남아 있다** — `다시 빌드된`(adminPage) · `다음 빌드에서`(승인 성공) ·
   `재빌드`(adminRebuild 7줄) · `다음 빌드부터`(내리기). 통일하려면 `adminRebuild.test.ts` 단정 11개와
   `features/admin-review.md` 의 정본 표를 **한 커밋에** 묶어야 한다.
   🙋 낱말은 **`갱신`** 이어야 한다 — `반영` 은 이 레포에서 후보→`places` **DB 쓰기**를 뜻한다(25곳). 한 머리글 안에
   `반영이 끊긴 후보 N건` 과 `사이트 반영을 보냈어요` 가 세 줄 간격으로 붙는다.
10. **`재빌드가 걸렸어요`(`adminRebuild.ts:107`)의 `걸렸어요` 가 양방향으로 읽힌다**(시작됐다 / 멈췄다). 동사 하나 교체이고
    `adminRebuild.test.ts:59` 가 전문을 단정한다.
11. **(닫힘 — 09 T6.2: 되살리기는 `되살리기(게시중으로)` + 한 줄 확인. 올리기 버튼은 초안에 두지 않는다)** ~~되살리기·올리기에 확인 단계가 없다.~~ 내리기는 사유 폼을 지나는데 `onRestore` 는 확인 없이 바로 쓴다(게시가 되는 일이다).
12. **펼친 조건 박스가 사용자 화면과 같은 칩이 아니라 텍스트다.** 같게 만들려면 `previewPolicy` 가 `merged`(TPetPolicy)를 한 칸 더
    돌려주고 `<PetBadges>` 를 쓰면 된다. 반환 필드 추가는 `reviewCandidates.test.mjs` 를 깨지 않는다(전체 객체를 `toEqual` 하는
    단정이 없다) — **`.mjs` 를 열 일이 생기면 같이 할 것**(v5 가 그 파일을 동결로 두어 텍스트를 골랐다).

### F. 초안(`게시 대기`)을 앱에서 올릴 길이 없다 — 시도했다가 되돌렸다

v5 에서 `올린 장소` 칸의 초안 행에 `올리기(게시중으로)` 버튼을 넣었다가 **리뷰에서 걷어냈다.** 배선을 새로 깔지 않고
`restorePlace` 를 그대로 쓰면 두 가지가 조용히 틀린다:

- **지역 형식 검사를 건너뛴다.** 게시로 가는 다른 두 길은 모두 `regionUsable`(`adminApply.ts` 의 `leadProblem`)·
  `parseRegion(...).direction === 'unknown'`(`applyApproved.mjs`)을 본다. 스키마는 `region_raw text not null` 뿐이라
  `''` 도 `동쪽 구좌읍`(괄호 빠짐)도 통과한다 — Studio 에서 손으로 만든 draft 를 올리면 상세 헤더가 '기타' 가 되고
  읍·면 칩에서 빠진다. `leadProblem` 이 막으려던 바로 그 상태다.
- **`archive_note` 에 `되살림` 이 적힌다.** 내린 적 없는 행에 그 줄이 남으면, 나중에 진짜로 내렸다 되살릴 때
  기록이 `되살림 / 내림 / 되살림` 으로 읽혀 첫 줄이 없던 일을 말한다. 이 칸이 이력의 유일한 자리라 더 나쁘다.

**제대로 하려면 막는 것만으로 안 된다** — 이 칸에는 지역을 고칠 자리가 없어서 막다른 패널이 된다(`b5f3c4b` 에서
후보 카드의 같은 문제를 이미 고쳤다). 필요한 것 셋: `archiveNoteLine` 에 `'publish'` 갈래, 게시 전 지역 검사,
그리고 **막혔을 때 지역을 고치는 길**(후보 카드의 지역 셀렉트와 같은 것). 그때까지 초안을 올리는 길은
'확인할 장소' 의 승인 하나이고(`adminApply.ts:157` 이 병합 대상 draft 를 `published` 로 올린다), 화면도 그렇게 말한다.

### G. 🙋 주의해서 볼 자리를 텍스트 하이라이트로 (2026-10-01, 사용자 의견)

지금 카드는 뱃지·접힌 줄로 "확인이 필요하다" 를 알리지만, **어느 문장·어느 값 때문인지**는 운영자가 원문을 다시 읽어 찾아야 한다.
사용자 의견은 "주의 깊게 봐야 할 사항은 text highlighting" 이다. 대상 후보(위에서 아래로 중요한 순):

- [ ] **원글 근거 ↔ 다른 글 근거가 충돌하는 자리** — 교차점검(원글)과 재검색(다른 글, [ADR-019](../decisions/ADR-019-ai-cross-check-and-address-rules.md) 결정 7)의
      인용이 다를 때 **양쪽 문장을 나란히 두고 다른 부분을 칠한다.** 어느 쪽이 이기는지는 코드가 정하지 않는다(`split` → 불가 정황 → 사람).
      (처음엔 "공식 API 근거" 라 적었는데 반려동물 칸을 주는 공식 API 가 없고 관광공사 API 는 선택지에서 뺐다 — ADR-019 「고려했다 버린 것」)
- [ ] **동반 불가 정황** — 교차점검(`verifyPlaces`)이 "동반 불가 정황" 을 낸 근거 문장(`목줄 필수` 가 아니라 `반려동물 출입 금지` 같은 것).
- [ ] **원문에 근거가 없어 보정이 뺀 AI 판단** — `correctPetPolicyFacts` 가 지운 값(`AI 판단 일부 뺌`)의 자리. 원문의 어느 단어와 대조했는지.
- [ ] **주소 불일치(`different`)** — `addressView` 가 다르다고 본 두 주소에서 도로명·건물번호처럼 실제로 다른 토큰만.

지키는 것:
- 칠하는 범위는 **`src/lib/` 의 순수 함수가 정한다**(문자열 → 구간 목록). 화면은 그 구간을 `<mark>` 로 감싸기만 한다 —
  표기 층(`adminPreview.ts`)이 색·자리를 정하는 지금 이음새를 따른다.
- 색은 시맨틱 토큰으로만(경고 = `warning`, 충돌 = `error` 계열). 원시 색을 쓰지 않는다.
- 색만으로 뜻을 싣지 않는다(접근성) — 구간 앞에 짧은 말(`API 와 다름`·`불가 정황`)을 함께 둔다.
- `verify` 가 `null`(안 봤다)인 후보는 칠할 것이 없다 — "칠한 게 없다" 를 "괜찮다" 로 읽히게 두지 않는다(ADR-019 결정 3).

### E. 접근성·자잘한 것

13. 로딩 갈래 넷 중 `checking` 만 `PageHeader` 없이 맨 줄을 그린다 — 머리글이 뒤늦게 튀어 들어온다.
14. 칸 전환의 `role="tablist"` 에 `aria-controls`·`tabpanel` 이 없다.

## 위험 (미리 적어 두는 것)

- **트랜잭션이 없다.** PostgREST 에는 트랜잭션이 없어 승인 중간에 실패하면 후보가 `approved` 로 남는다. 설계상 그게 안전한 자리이고(CLI 가 이어받는다)
  화면은 실패를 삼키지 않고 그대로 보여 준다. 삼키면 사람이 두 번 누르고 장소가 두 개 생긴다.
- **`/admin/index.html` 은 공개 파일이다.** 숨은 링크가 보안이 아니다 — 경계는 RLS·GRANT 뿐이고, Preview 배포는 프로덕션 DB 를 공유한다(05 의 프리뷰 보호 항목은 여전히 열려 있다).
- **첫 화면이 곱지 않다.** 160건은 옛 프롬프트로 키 없이 돌린 결과라 `petPolicy`·`visited`·좌표가 없고, 목록글 101건·홍보 13건이 섞여 있다.
  "AI 분석 완료" 뱃지가 없는 것과 "지도에 안 보여요" 는 버그가 아니다 — 새 `data:analyze` 를 돌리면 채워진다.
- **다른 세션이 같은 레포를 만지는 중이면 검사 결과가 섞인다.** 2026-09-29 00:40 시점에도 팔레트·칩 작업이 커밋 전 상태로 있었다 —
  실행자는 자기 파일만 만지고, 남의 미커밋 변경을 "고치지" 않는다.
