# 1. 스키마 · RLS · 시드 · `data:pull`

> 최종 수정: 2026-09-18 (v1: 신설)
> 상태: 계획. 선행: [00](00-setup-supabase-vercel.md). 이 단계가 끝나면 **Supabase 가 원본**이고 `src/data/*.json` 은 그 스냅샷이다.

## 원칙

- **`src/types.ts` 가 계약이다.** 테이블은 `TPlace`·`TItem` 을 그대로 담는다. 화면·lib 는 아무것도 안 바뀐다 —
  바뀌는 건 `src/data/places.json` 을 **누가 만드느냐**뿐(Notion export → Supabase).
- **`src/data/*.json` 은 계속 커밋한다.** 키 없이도 `pnpm dev`·`pnpm test` 가 돌아야 하고, Supabase 가 잠들어도
  마지막 스냅샷으로 빌드가 된다. `data:pull` 은 이 파일을 **갱신**하는 명령이지 대체가 아니다.
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
  created_at timestamptz default now(), updated_at timestamptz default now()
);

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

- `status='archived'` 는 폐업. 지우지 않는다 — 저장 목록(localStorage)에 id 가 남아 있는 사람이 있다.
- `updated_at` 트리거 하나. 나중에 "무엇이 바뀌었나" 를 볼 유일한 단서다.

## RLS

- [ ] **모든 테이블에 RLS 를 켠다. 정책은 하나도 만들지 않는다.** → anon·authenticated 는 아무것도 못 읽는다.
      빌드와 Actions 는 `service_role` 로 접근하므로 정책이 필요 없다.
- 앱이 런타임에 DB 를 읽지 않는 (A) 에서는 이게 전부다. 관리 화면(03 후반)이나 (B) 로 가면 그때 정책을 더한다.

## 시드 — 지금의 86곳·15개를 옮기기

- [ ] `scripts/seed-db.mjs`: `src/data/places.json` · `items.json` 을 읽어 upsert. **1회용**이지만 레포에 둔다(재현성).
- [ ] `id` 는 Notion 블록 id 를 그대로 — 라우트·저장 목록 키가 바뀌지 않는다.
- [ ] 좌표 없는 5곳(요호르기 스테이·미트타운·개떼목장·브릭스제주·롯지먼트)은 `lat/lng null` 그대로. 지어내지 않는다.
- [ ] 시드 뒤 `data:pull` → `git diff src/data/` 가 **비어 있어야** 한다. 이게 합격 기준이다.

## `scripts/pull-db.mjs` (`pnpm data:pull`)

- [ ] `status='published'` 인 `places` 와 `items` 전체를 읽어 `src/data/places.json` · `items.json` 을 **정렬된 키·안정된 순서**로
      쓴다(diff 가 읽히게). `region_raw` → `TRegion`, `stay_price_text` → `TStayPrice` 변환은 지금 `normalize.mjs` 에 있는
      함수를 **그대로 재사용**한다 — 그 파일에서 함수를 뽑아 `scripts/lib/` 로 옮긴다.
- [ ] `normalize.mjs` 는 남긴다. Notion export → 시드 경로로 한 번 더 쓸 수 있다. 하지만 `data:normalize` 가 더 이상
      "데이터를 만드는 명령" 이 아님을 `data-pipeline.md` 에 적는다.
- [ ] 키가 없으면(로컬) **명확히 실패**한다. 조용히 스냅샷을 쓰지 않는다 — CI 에서 조용히 옛 데이터로 빌드되는 것이
      CLAUDE.md 가 경고하는 고장 유형이다. 로컬 dev 는 `data:pull` 을 안 부르면 그만이다.
- [ ] `supabase-js` 를 **devDependency** 로. 앱 번들에 들어가지 않는다(`scripts/` 만 쓴다). 나중에 `out/` 에서
      `supabase` 문자열이 나오면 뭔가 잘못된 것이다(→ 05 의 유출 검사).

## 끝났다고 볼 조건

- Studio 에서 한 장소의 `features` 를 고치고 → 로컬에서 `pnpm data:pull && pnpm build && pnpm preview` → 화면에 반영.
- `pnpm test` 133 케이스 그대로 통과(화면·lib 코드는 손대지 않았으니 당연해야 한다).
- `docs/architecture/data-pipeline.md` v2: 다이어그램의 원본을 Supabase 로, "동기화는 수동" 문장을 고친다.
