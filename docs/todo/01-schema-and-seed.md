# 1. 스키마 · RLS · 시드 · `data:pull`

> 최종 수정: 2026-10-01 (v8: `places.verified_at` 칸(마이그레이션 `20261001140000`, 원격 미적용) — `fromPlaceRow` 가 `verifiedAt` 으로 옮기고 시드는 null 이라 JSON 바이트는 그대로다. 10 T2.1)
> 이전 2026-09-29 (v7: `supabase-js` 를 devDependency 로 두고 "`out/` 에 supabase 문자열이 있으면 잘못된 것" 이라던 항목에 **정정**을 달았다 —
> 운영자 화면 `/admin` 이 생겨 그 셋이 전부 뒤집혔다([ADR-018](../decisions/ADR-018-in-app-admin-review.md)). 체크된 항목을 지우지 않고 정정을 덧붙이는 이유: 그때의 판단은 그때 맞았다)
> 이전 (v6: 4a 는 끝났다(빌드 명령이 `pnpm data:pull && pnpm build`) — 상태 줄에서 뺐고, "잠들어도 마지막 스냅샷으로 빌드된다" 도 걷었다(배포는 `data:pull` 로 시작해 막힌다))
> 이전 (v5: 출처는 세션·anon 둘, service 키 없음 — Actions 폐지(ADR-016 v5). RLS 절·`supabaseClient` 포인터만 갱신)
> 이전 (v4: 인증은 운영자 세션(`pnpm data:login`)+RLS, `data:pull` 은 anon(ADR-016 v4) — 포인터만)
> 이전 (v3: 키는 로그인된 `supabase` CLI 에게 실행 시점에(ADR-016) — 포인터만)
> 이전 (v2: 스키마 적용·RLS·시드·`data:pull` 코드 완료. `sort` 컬럼 반영, [data-pipeline.md v2](../architecture/data-pipeline.md) 작성)
> 이전 (v1: 신설)
> 상태: **끝났다.** 선행: [00](00-setup-supabase-vercel.md). Vercel 빌드 전환(4a)도 됐다 — 배포가 `pnpm data:pull` 로 시작한다. Studio 수정 → 반영 왕복도 확인됐다(2026-09-20 (2)).

## 원칙

- **`src/types.ts` 가 계약이다.** 테이블은 `TPlace`·`TItem` 을 그대로 담는다. 화면·lib 는 아무것도 안 바뀐다 —
  바뀌는 건 `src/data/places.json` 을 **누가 만드느냐**뿐(Notion export → Supabase).
- **`src/data/*.json` 은 계속 커밋한다.** 키 없이도 `pnpm dev`·`pnpm test`·로컬 `pnpm build` 가 돌아야 해서다.
  `data:pull` 은 이 파일을 **갱신**하는 명령이지 대체가 아니다. 단 4a 뒤로 이 스냅샷이 **배포의 안전망은 아니다** —
  배포 빌드는 `data:pull` 로 시작하므로 Supabase 가 잠들면 exit 1 로 재배포가 막힌다(이전 배포는 산다).
- **파싱은 여전히 런타임.** `petPolicyText` 원문을 DB 에 그대로 두고 `parsePetPolicy()` 가 읽는다
  ([data-pipeline.md §3](../architecture/data-pipeline.md)). AI 가 뽑은 조건도 **원문 문장으로** 넣는다 — 구조화된 값을
  DB 에 두면 파서와 두 벌이 된다.

## 스키마 초안

```sql
-- 장소. TPlace 와 1:1. 컬럼명은 snake_case, pull 스크립트가 camelCase 로 바꾼다.
create table places (
  id            text primary key,          -- Notion 블록 id(시드) 또는 새 uuid. 라우트 /place/[id] 의 키
  type          text not null check (type in ('stay','restaurant','cafe')),
  name          text not null,
  region_raw    text not null,             -- "동쪽 구좌읍". direction/town 분해는 normalize 가 한다
  features      text not null default '',
  pet_policy_text text not null default '',
  review_url    text, naver_url text, naver_place_id text,
  lat double precision, lng double precision,
  address text, category text,
  stay_price_text text, stay_amenities_text text,   -- 숙소만
  status        text not null default 'published' check (status in ('draft','published','archived')),
  source        text not null default 'notion' check (source in ('notion','blog','manual')),
  sort          int,                                -- 기존 JSON 순서(종류별 → Notion 순) 보존용. 새 행은 null, pull 은 nulls last
  created_at timestamptz default now(), updated_at timestamptz default now()
);

-- items 도 같은 이유로 sort 를 갖는다: 정렬 기준이 없으면 pull 때마다 순서가 흔들린다
create table items ( id text primary key, name text, emoji text, seasons text[], reason text, link_url text, sort int );

-- 2 단계가 채운다. url 이 곧 키.
create table blog_posts (
  url text primary key, blog_id text, log_no text, title text,
  posted_at date not null, keyword text not null, fetched_at timestamptz default now(),
  analyzed_at timestamptz
);

-- 3 단계가 채우고 사람이 닫는다.
create table candidates (
  id uuid primary key default gen_random_uuid(),
  post_url text references blog_posts(url),
  extracted jsonb not null,                -- TPlace 의 부분 객체 + evidence(인용 문장)
  match_place_id text references places(id),
  match_confidence real,
  status text not null default 'pending' check (status in ('pending','approved','rejected','merged')),
  reviewer_note text, reviewed_at timestamptz, created_at timestamptz default now()
);

-- 출처 추적. 한 장소에 글 여러 개.
create table place_sources ( place_id text references places(id), post_url text references blog_posts(url), primary key (place_id, post_url) );
```

- `status='archived'` 는 폐업. 행은 지우지 않는다(출처·이력 보존). 단 `data:pull` 은 `published` 만 가져오므로 **아카이브된 곳은
  `places.json`·라우트·프리캐시에서 빠지고, 저장 목록에서도 조용히 사라진다** — `selectSavedPlaces` 가 `PLACES.filter` 라
  모르는 id 는 오류 없이 버려지고 개수만 준다(`src/lib/places.ts`). 저장한 사람에게 "폐업" 을 보여 주고 싶으면 archived 도
  pull 해 화면에 상태를 그려야 한다 — 🙋 기능 변경이라 지금 범위 밖, 필요해지면 `docs/features/` 에.
- `updated_at` 트리거(`set_updated_at()`, `places` 만) 하나. 나중에 "무엇이 바뀌었나" 를 볼 유일한 단서다.
  함수는 `set search_path = ''` 로 고정 — 트리거 함수의 search path 하이재킹을 막는 표준 방어다.

## RLS

- [x] **모든 테이블에 RLS 를 켠다. 정책은 하나도 만들지 않는다.** → anon·authenticated 는 아무것도 못 읽는다.
      (당시엔 빌드·Actions 가 `service_role` 이라 정책 불필요 — v4 에서 운영자 RLS 8정책, v5 에서 Actions 폐지 + `narrow_grants` 로 정책·GRANT 축소(원격 적용·실측 완료 2026-09-22). 정본은 ADR-016.)
      SQL 로 확인 완료(당시): `relrowsecurity` true × 5 테이블, `pg_policies` 0행.
- 앱이 런타임에 DB 를 읽지 않는 (A) 에서는 이게 전부다. 관리 화면(03 후반)이나 (B) 로 가면 그때 정책을 더한다.
  **함정**: "RLS 안 켜도 anon 은 어차피 막힌다" 는 틀렸다 — PostgREST 는 RLS 가 꺼져 있으면 anon 키로 다 읽어 준다.

## 시드 — 지금의 86곳·15개를 옮기기

- [x] `scripts/seed-db.mjs`(`pnpm data:seed`): `src/data/places.json` · `items.json` 을 읽어 upsert(`sort` = 배열 인덱스). **1회용**이지만 레포에 둔다(재현성).
- [x] `id` 는 Notion 블록 id 를 그대로 — 라우트·저장 목록 키가 바뀌지 않는다.
- [x] 좌표 없는 5곳(요호르기 스테이·미트타운·개떼목장·브릭스제주·롯지먼트)은 `lat/lng null` 그대로. 지어내지 않는다.
- [x] 시드 뒤 `data:pull` → `git diff src/data/` 가 **비어 있어야** 한다. 이게 합격 기준이다. → 확인 완료.

## `scripts/pull-db.mjs` (`pnpm data:pull`)

- [x] `status='published'` 인 `places` 와 `items` 전체를 읽어 `src/data/places.json` · `items.json` 을 **정렬된 키·안정된 순서**로
      쓴다(diff 가 읽히게). `region_raw` → `TRegion`, `stay_price_text` → `TStayPrice` 변환은 지금 `normalize.mjs` 에 있던
      함수를 **그대로 재사용**한다 — `scripts/lib/placeFields.mjs` 로 뽑았고 `parseRegion`·`parsePrice`·`clean`·`toPlace`·`toItem`·
      `writeDataJson` 을 `normalize.mjs` 도 함께 쓴다. `toPlace` 의 키 순서와 `writeDataJson`(indent 1, 끝 개행 없음)이
      Notion export 경로와 Supabase 경로가 **같은 바이트**를 내는 근거다.
- [x] `normalize.mjs` 는 남긴다. Notion export → 시드 경로로 한 번 더 쓸 수 있다. `data:normalize` 는 이제
      "데이터를 만드는 명령" 이 아니라 "Notion 을 다시 시드하는 명령" 이다 — `data-pipeline.md` v2 에 적었다.
- [x] 키가 없으면(로컬) **명확히 실패**한다(`exit 1`). 조용히 스냅샷을 쓰지 않는다 — CI 에서 조용히 옛 데이터로 빌드되는 것이
      CLAUDE.md 가 경고하는 고장 유형이다. 로컬 dev 는 `data:pull` 을 안 부르면 그만이다. 인증은
      쓰기 스크립트는 운영자 세션(`pnpm data:login`, RLS 안), `data:pull` 은 publishable(anon)만 — 출처는 둘, service 키 없음(`scripts/lib/supabaseClient.mjs`, ADR-016 v5. 처음엔 `.env.local` 에 다 뒀었고 v4 까지는 Actions 가 service_role 이었다).
- [x] `supabase-js` 를 **devDependency** 로. 앱 번들에 들어가지 않는다(`scripts/` 만 쓴다). 나중에 `out/` 에서
      `supabase` 문자열이 나오면 뭔가 잘못된 것이다(→ 05 의 유출 검사).
      **2026-09-29 정정**: 셋 다 뒤집혔다. 운영자 검수 화면(`/admin`)이 브라우저에서 Supabase 를 부르므로 `supabase-js` 는 **dependency** 고,
      `out/` 에 우리 호스트(`<PROJECT_REF>.supabase.co`)와 publishable 키가 **들어가는 것이 정상**이다. 유출 검사는 "supabase.co 금지" 에서
      **"우리 호스트만 허용"** 으로 좁혔다(다른 프로젝트 호스트·`service_role`·`sb_secret_`·JWT 는 그대로 차단) →
      [ADR-018](../decisions/ADR-018-in-app-admin-review.md) · [ADR-015](../decisions/ADR-015-supabase-source-and-rebuild.md) v3 · [05](05-security.md).

## 끝났다고 볼 조건

- [x] DB 에서 한 장소의 `features` 를 고치고(`supabase db query`) → `pnpm data:pull` → `git diff src/data` 에 **그 한 줄만** 나오고,
      `updated_at` 트리거가 발화하고, 되돌리면 diff 0 (2026-09-20). 화면(`build && preview`)은 JSON 이 곧 입력이라 따로 보지 않았다.
- [x] `pnpm test` 기존 케이스 그대로 통과(2026-09-20: 217 passed · 5 skipped 는 03 의 `matchPlace` 본체 자리)(화면·lib 코드는 손대지 않았으니 당연해야 한다).
- [x] `docs/architecture/data-pipeline.md` v2: 다이어그램의 원본을 Supabase 로, "동기화는 수동" 문장을 고친다.
