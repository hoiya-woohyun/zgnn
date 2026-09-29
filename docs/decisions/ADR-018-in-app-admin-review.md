# ADR-018 — 검수는 앱 안 숨은 화면(`/admin`)에서 하고, 승인이 곧 반영이다

> 최종 수정: 2026-09-29 (v3: 문구만 바뀌었다 — 결정 본문은 그대로다. 인용된 화면 말이 새 말로 바뀐 자리만 고쳤다
> ('운영자 계정이 아니에요' → '검수 권한이 없어요', '아니에요' → '반려하기'). 왜 바꿨는지는
> [features/admin-review.md](../features/admin-review.md) v3)
> 최종 수정: 2026-09-29 (v2: **내리는 길을 더한다**(결정 6~8) — 올리는 길만 있으면 잘못 올린 것·폐업한 것을 Studio 로 가야 했다.
> 소프트 삭제인 것은 고른 게 아니라 GRANT 가 정해 둔 것이고, 그것만 만들면 내린 것이 **복제본으로 되돌아오므로** 대조 corpus 와
> 승인 갈래를 함께 바꿨다. 그리고 재빌드가 걸렸는지 화면이 말한다(결정 9) — 결정 5 의 "다음 빌드에서 보여요" 가 참인지 확인할 자리가 없었다)
> 이전 (v1: 신설 — 첫 후보 160건을 CLI·Studio 로 통과시키기 어렵다는 사용자 요구에서 나온 결정)
> 상태: 결정. 구현은 [docs/todo/06](../todo/06-admin-review.md) 이 추적한다.

## 맥락

2026-09-28 밤 DB 에 **pending 후보 160건(묶음 142 — 일치 8 · 신규 134 · 이용 조건 문장이 없는 것 112)** 이 쌓였다.
검수 도구는 둘이었다. `pnpm data:review`(CLI 검수 창)는 묶음·미리보기·승인/반려를 다 갖췄지만 터미널이고, id 앞자리를 손으로 옮겨야 한다.
Supabase Studio 는 표 편집기라 `extracted` JSON 을 눈으로 읽어야 하고 원글 링크를 새 탭으로 하나씩 연다.
그리고 **둘 다 `places` 를 직접 건드리지 않는다** — 승인은 `candidates.status` 만 바꾸고, 반영은 터미널의 `pnpm data:apply`, `published` 로 올리는 건 또 Studio 다.
사용자 요구는 그 셋을 한 화면으로 합치는 것이었다: **정리된 내용 + 원글 주소를 보고 · 맞다/아니다를 누르고 · 맞다면 그 장소가 다른 사용자에게 보인다.**

"보인다" 가 어려운 쪽이다. 앱은 정적 내보내기라 승인 직후의 DB 를 화면이 읽지 않는다.

## 결정

1. **앱 안에 숨은 운영자 화면 `/admin` 을 만든다.** 탭바(`NAV_ITEMS`)·스와이프 수열(`SWIPE_ROUTES`)·루트 목록(`ROOT_ROUTES`)에 넣지 않는다 —
   셸이 "모르는 경로는 하위 화면" 으로 보고 뒤로가기를 저절로 붙인다([ADR-007](ADR-007-shell-owned-back-navigation.md), `parentRouteOf('/admin') → '/'`).
   화면은 서버가 그릴 수 없다(세션이 localStorage 에만 있다) → `src/app/admin/page.tsx` 는 메타(`robots: noindex`)만 두고
   `adminRouteClient.tsx` 가 `dynamic(..., { ssr: false })` 로 감싼다. `/map` 이 SDK 때문에 쓰는 것과 같은 장치다.
   프리캐시 목록에는 넣지 않는다 — 오프라인에서 열면 `/404.html` 이 뜬다(의도: 오프라인 검수는 어차피 불가능하다).
2. **번들에 Supabase publishable 키와 프로젝트 호스트 리터럴이 들어간다. [ADR-015 §2](ADR-015-supabase-source-and-rebuild.md) 의 "앱 번들에 Supabase 가 들어가지 않는다" 를 여기서 번복한다.**
   경계는 번들의 비밀이 아니라 **RLS + GRANT** 다([ADR-016](ADR-016-secrets-by-login.md) 결정 1·4): publishable 키만으로는 `places(published)`·`items` select 가 전부이고,
   `candidates` 를 부르면 42501 이다. 운영자 판정은 `operators` 허용 목록과 `is_operator()` 가 한다.
   유출 검사(`scripts/check-bundle.mjs`)의 `supabase.co` 전면 차단은 **우리 프로젝트 호스트만 허용**으로 좁혔다 —
   다른 `*.supabase.co` 가 번들에 박히는 오타(= 다른 프로젝트로 데이터가 새는 사고)는 계속 잡고, `service_role`·`sb_secret_`·JWT 패턴은 손대지 않았다.
   예외가 하나 더 필요했다: `@supabase/supabase-js` 가 자기 안에 와일드카드 상수(`*.supabase.co` 꼴)를 들고 있어 그것만 따로 통과시킨다 —
   우리가 부르는 주소가 아니라 남의 라이브러리 상수라 지울 수 없다. 그래서 `supabasePublic.mjs` 의 주소는 **리터럴**이어야 한다:
   템플릿으로 조립하면 번들엔 `.supabase.co` 조각만 남아 **자기 호스트도 걸린다.**
3. **세션은 access token 하나뿐이다.** `signInWithPassword`(회원가입 off·SMTP 없음이라 매직링크가 불가) → access token 만 localStorage(`zgnn.admin.session`)에 넣고
   **refresh token 은 버린다**. supabase-js 는 `persistSession: false`·`autoRefreshToken: false` + `Authorization: Bearer <jwt>` 헤더로 만든다.
   CLI(`scripts/login.mjs`)와 같은 원칙이고, 같은 이유다 — refresh 를 저장하면 사실상 영구 로그인이 돼 ADR-016 의 경계("값이 파일에 없다 · `exp` ≤ 1일 · RLS 범위") 중
   가운데 것이 조용히 깨진다. 원격 JWT expiry 가 **43200초(12시간)** 이므로 **하루에 한 번 재로그인**이 이 화면의 값이다. 수명이 하루를 넘는 토큰은 CLI 처럼 거부한다.
   비운영자는 빈 목록으로 속이지 않고 "검수 권한이 없어요" 를 그린다(RLS 는 에러가 아니라 빈 결과를 주기 때문에, 화면이 `rpc('is_operator')` 로 따로 묻는다).
4. **승인은 화면이 `places` 까지 쓴다 — `scripts/apply-approved.mjs` 와 같은 순서·같은 필드로.**
   후보 `approved`(트리거가 `reviewed_at`) → 병합이면 **빈 칸만** 채우는 patch, 신규면 `places.insert` 후 **즉시** 후보에 `match_place_id` 적기 →
   `place_sources` upsert → `merged` + `extracted.applied`. 분석 때 '신규' 였던 후보는 insert 전에 현재 장소와 다시 대조한다(같은 가게를 말하는 글 둘이 따로 승인되는 경우).
   **신규 장소는 곧바로 `status = 'published'`** 다 — [03](../todo/03-analyze-and-review.md) 의 🙋 "draft 를 생략하고 바로 published 로 갈지" 가 여기서 닫힌다.
   draft 로 넣으면 승인 뒤에 Studio 를 또 열어야 하고, 그러면 이 화면을 만든 이유(요구 3)가 사라진다.
   완성도 게이트가 draft 단계를 대신한다: `type` ∈ stay|restaurant|cafe · `name` 있음 · `region_raw` 가 `parseRegion` 을 통과. 못 넘으면 버튼 대신 이유를 보여 주고
   **최소 편집**(지역 고르기 · '새 장소로 올리기' = 짝 비우기)만 허용한다. `pnpm data:apply` 는 그대로 `draft` 로 넣는다 — 두 경로의 차이는 이 게이트가 사람 앞에 있다는 것뿐이다.
5. **사이트에 보이는 것은 그 다음 빌드부터다.** 정적 내보내기라 `pnpm data:pull && pnpm build` 가 다시 돌아야 새 장소의 HTML·프리캐시 항목이 생긴다
   ([ADR-015 §2](ADR-015-supabase-source-and-rebuild.md) 의 재빌드 모델은 그대로 살아 있다 — 번복한 것은 §2 의 "번들에 Supabase 없음" 한 줄뿐이다).
   그래서 화면은 성공 문구에 **"사이트에는 다음 빌드에서 보여요"** 를 붙인다. 그 빌드는 `places` 변경이 부르는 웹훅이 방아쇠다(4b, 2026-09-29 연결됨).

6. **이미 올린 장소를 내리는 길은 `status = 'archived'` 뿐이다 — 고른 게 아니라 정해져 있었다.**
   `20260922120000_narrow_grants.sql` 이 authenticated 에 `select, insert, update` 만 주고 `delete` 는 일부러 안 줬다(정책에도 없다).
   그래서 브라우저에서 행을 지우는 길은 처음부터 42501 이고, 남은 수단은 그 한 칸이다. 그 한 칸이 나머지를 알아서 한다 —
   anon 정책(`using (status='published')`)과 `pull-db.mjs` 의 `.eq('status','published')` 가 같은 집합을 보므로 다음 빌드의
   `places.json` 에서 빠지고, `places` 가 바뀌었으니 결정 5 의 웹훅이 그 빌드를 부른다. **재빌드 장치를 새로 만들지 않았다.**
   더한 것은 두 칸(`archived_at`·`archive_note`)과 그것을 찍는 트리거뿐이다. 사유를 남기는 것은 `reviewer_note` 와 같은 이유다 —
   없으면 한 달 뒤에 "이 곳은 폐업인가 중복인가" 를 아무도 모른다. 되살리기는 언제나 `published` 로 간다(이전 상태를 적는 칸이 없다).

7. **대조 corpus 가 `archived` 를 읽는다.** 내리기만 만들면 **내린 것이 복제본으로 되돌아온다**: 폐업한 카페를 내린다 →
   다음 달 그 카페를 쓴 글이 수집된다 → corpus 에 없으니 '신규' 로 판정된다 → 승인하면 같은 가게가 새 id 로 게시된다.
   빌드·테스트는 전부 통과한다. 그래서 세 곳(`analyze-candidates.mjs` · `apply-approved.mjs` · `fetchMatchablePlaces`)이
   상태를 가리지 않고 읽고, 순서를 `.order('id')` 로 고정한다(없으면 동점 승자가 heap 순서로 정해지고 UPDATE 한 번에 바뀐다).
   점수가 **같을 때만** 살아 있는 쪽을 고른다(`matchPlace.mjs` 의 `preferLive`) — 점수가 다른데 내린 쪽을 밀어내면 조용히 틀린
   병합이 되고, 내린 쪽이 이기면 사람에게 물으므로 눈에 보이게 실패한다(그 파일의 집 규칙: 오병합보다 미탐).

8. **짝이 내린 곳이면 승인하지 않고 묻는다**(`archivedTarget` — 쓰기 전에 멈춘다). `blocked` 문구로 뭉개지 않는 이유는 나갈 길이
   다르기 때문이다: `blocked` 는 "고칠 것이 있다" 지만 이것은 "고를 것이 있다" 다. 셋 중 하나를 고른다 —
   `되살려서 합치기`(다시 열었다) · `반려하기`(폐업 그대로) · `정말 다른 가게예요 — 새 장소로`(같은 이름의 다른 가게).
   **셋째에 확인을 요구하는 것이 요점이다**(`confirmedDifferent`): 그 확인 없이 `asNew` 가 내린 짝을 버리면 결정 7 이 막으려는
   복제본이 그대로 생긴다. 접힌 줄의 `짝이 내린 곳` 배지가 누르기 전에 그것을 말하고, 그 배지가 있으면 평소의
   `새 장소로 올리기` 는 감춘다. CLI 는 묻지 않는다 — 영구 실패로 pending 에 되돌리고 사유만 적는다(터미널에 물어볼 자리가 없다).

9. **재빌드가 걸렸는지 화면이 말한다.** 결정 5 는 "다음 빌드에서 보여요" 를 약속하는데, 그것이 참인지 확인할 자리가 앱 안에 없었다 —
   Vault 의 비밀이 지워졌거나 Vercel 에서 훅을 폐기해 404 가 나도 트리거는 **조용히** 끝나고 화면은 똑같이 말했다.
   `net._http_response` 는 스키마 `net` 에 있어 PostgREST 로 보이지 않으니 Studio 를 열지 않으면 진단이 불가능했다.
   그래서 트리거가 호출을 `public.rebuild_log` 에 남기고 `public.rebuild_status()`(운영자 전용)가 그것을 읽는다.
   같은 마이그레이션에서 **게시 집합이 바뀌는 변경만** 훅을 부르게 좁혔다 — 초안이나 내린 곳을 고치는 것은 만들어지는
   사이트가 한 바이트도 다르지 않은데 배포 횟수를 쓴다(소프트 삭제가 그 갈래를 실제로 만들었다).
   이 줄이 급해진 계기는 Deploy Hook URL 이 에이전트 대화 기록에 남은 일이다(→ [todo/05](../todo/05-security.md)):
   폐기·재발급이 권장되는데 새 주소를 잘못 붙여 넣으면 증상이 "아무 일도 안 일어남" 이라, **회전을 안전하게 만드는 것은
   새 주소가 아니라 됐는지 볼 수 있는 자리**다.

## 왜 이것인가

- **"맞다" 한 번으로 끝나야 한다.** 오늘 사람 손이 세 번 든다(승인 → `data:apply` → Studio 에서 published). 도구를 하나 더 만들면서 그 셋을 그대로 두면 아무것도 나아지지 않는다.
- **번들에 키가 들어가는 것이 새 위험이 아니다.** publishable 키는 브라우저에 실으라고 만든 키이고(ADR-016 결정 4), 이미 Vercel 빌드와 로컬 `data:pull` 이 같은 키로 붙는다.
  달라지는 것은 그 키가 **공개 파일에 적힌다**는 것뿐인데, 그 키로 할 수 있는 일은 이미 사이트에 구워져 공개된 것과 같은 집합이다.
- **화면이 CLI 와 다른 규칙으로 쓰면 `places` 가 조용히 오염된다.** 그래서 순수 로직(`matchPlace`·`mergeIntoExisting`·`toNewPlaceRow`·`parseRegion`·`groupCandidates`·`previewPolicy`)을
  TS 로 옮겨 두 벌로 만들지 않고, 브라우저가 `scripts/` 의 그 `.mjs` 를 **그대로 import** 한다. 그러려면 `scripts/lib/placeFields.mjs` 가 순수해야 해서
  `writeDataJson`(`node:fs`)만 `scripts/lib/dataJson.mjs` 로 떼어 냈고, 공개 상수는 `scripts/lib/supabasePublic.mjs`(import 없는 모듈)로 내렸다.
- **트랜잭션이 없는 것이 오히려 안전한 자리다.** PostgREST 에 트랜잭션이 없어 승인 중간에 실패하면 후보가 `approved` 로 남는다.
  같은 규칙을 쓰는 `pnpm data:apply` 가 그 상태를 그대로 이어받으므로 복구 경로가 이미 있다. 화면은 실패를 삼키지 않고 그대로 보여 준다 —
  삼키면 사람이 두 번 누르고 장소가 두 개 생긴다. 카드의 빨간 줄은 메모리에만 있어 새로고침하면 사라지므로, 머리글 아래에 `approved` 후보 수를 세어
  "터미널에서 `pnpm data:apply`" 를 가리킨다 — 그 줄이 없으면 이어받을 일이 있다는 사실 자체가 화면에서 사라진다.
- **쓰기는 화면에서도 한 번에 하나만 돈다.** CLI 는 후보를 한 줄씩 돌아 이 문제가 없지만, 화면은 승인이 도는 동안 다른 카드를 누를 수 있다.
  두 번째 승인은 첫 번째가 아직 넣지 않은 장소를 못 보고 재대조하므로 같은 가게가 두 번 만들어진다 — 이 결정이 막으려는 바로 그 결과다.
  그래서 카드별 비활성(같은 카드만 막는다) 위에 "쓰는 중" 하나를 둔다.

## 하지 않은 것

- **Postgres 함수(RPC)로 승인을 한 번에 쓰기.** 원자성은 얻지만 병합 규칙(`mergeIntoExisting` 의 "빈 칸만")을 SQL 로 한 벌 더 쓰는 일이고,
  그 순간 규칙이 두 곳에 있게 된다 — 이 결정이 피하려는 바로 그 상태다. 트랜잭션은 위의 "이어받기" 로 대신한다.
- **`deploy_requests` 테이블 + "반영" 버튼.** 승인 N건 = 빌드 N번을 모아 쏘는 안은 [04](../todo/04-deploy-and-propagate.md) 에 그대로 남겨 둔다.
  첫 달 빌드 횟수를 보고 정할 관찰 항목이지, 화면을 만들기 전에 정할 것이 아니다.
- **삭제 UI.** `authenticated` 에 DELETE grant 가 없다(42501, `20260922120000_narrow_grants`). 되돌리기는 상태 변경뿐이고, 진짜 삭제는 Studio(postgres)가 한다.
- **숨은 주소를 보안으로 치기.** `out/admin/index.html` 은 링크만 없을 뿐 공개 파일이다. Preview 배포는 프로덕션 DB 를 공유하므로
  Deployment Protection 을 권한다([05](../todo/05-security.md)) — 하지만 그것도 경계가 아니다. 경계는 RLS·GRANT 뿐이다.
- **인라인 편집 일반화.** 지역 고르기와 '새 장소로' 둘만 둔다. 그 밖은 읽기 전용이다 — Studio 가 여전히 있고, 편집 UI 를 늘리면 화면이 Studio 의 못난 복제가 된다.

## 결과

- 파일: `src/lib/adminSession.ts`(세션) · `adminSupabase.ts`(클라이언트·로그인·운영자 판정) · `adminCandidates.ts`(조회·묶음·미리보기) · `adminApply.ts`(승인·반려) ·
  `src/screens/adminPage.tsx` + `adminPage{Login,GroupCard,GroupDetail,RejectForm}.tsx` · `src/app/admin/{page.tsx,adminRouteClient.tsx}`.
  운영자가 보는 것은 [features/admin-review.md](../features/admin-review.md).
- `src/app/sw.ts` 에 **우리 호스트 하나**(`<PROJECT_REF>.supabase.co`, `PROJECT_URL` 리터럴에서 뽑는다) → `NetworkOnly` 규칙이 `defaultCache` **앞에** 붙는다.
  와일드카드로 쓰지 않는 이유는 위 2 와 같다 — `.supabase.co` 조각이 번들에 남으면 좁힌 유출 검사가 자기 호스트를 잡는다. `@serwist/next` 의 `defaultCache` 끝에 cross-origin catch-all(`NetworkFirst`·1시간)이 있어
  REST **GET** 이 URL 로 캐시되는데, 그러면 후보 목록이 한 시간 묵고 로그아웃한 뒤에도 사본이 남는다(→ [pwa-offline](../architecture/pwa-offline.md)).
- 시드 개수를 못 박은 테스트 단언(`toHaveLength(86)`)은 하한(`toBeGreaterThanOrEqual(86)`)으로 바꿨다 — 승인한 장소가 `data:pull` 로 들어오면 86 을 넘는다.
  안 바꾸면 빌드는 초록인데 `pnpm test` 만 빨개진다.
- **"임시" 의 뜻**: Studio 를 대신하는 영구 관리 도구가 아니라 **첫 160건을 사람 눈으로 통과시키는 검수 창**이다.
  없애도 데이터 경로(`data:analyze` → `data:review` → `data:apply`)는 CLI 로 그대로 남는다.
- 마이그레이션은 더 필요하지 않다 — `20260928150000`(`blog_posts.analysis` · `places.pet_policy` · `candidates` 의 `reviewed_at` 트리거)이 적용돼 있고, 화면이 쓰는 권한은 그 위의 GRANT·정책 그대로다.

## 관련

[ADR-015](ADR-015-supabase-source-and-rebuild.md) §2 를 번복(번들의 Supabase) · [ADR-016](ADR-016-secrets-by-login.md) 세션 경계를 상속 ·
[ADR-007](ADR-007-shell-owned-back-navigation.md) 셸이 뒤로가기 · [ADR-017](ADR-017-ai-structured-pet-policy.md) 화면이 나란히 보여 주는 두 판단 ·
[features/admin-review.md](../features/admin-review.md) · [docs/todo/06](../todo/06-admin-review.md)(진행) · [03](../todo/03-analyze-and-review.md) · [05](../todo/05-security.md)
