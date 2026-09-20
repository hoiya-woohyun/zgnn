-- zgnn 스키마 (ADR-015: 원본은 Supabase, 반영은 재빌드). docs/todo/01-schema-and-seed.md 의 초안을 그대로 옮긴다.
-- 모든 테이블에 RLS 를 켜고 정책은 하나도 만들지 않는다 — RLS 를 켜지 않으면 PostgREST 가 anon 키로도 테이블을
-- 그냥 다 읽어 준다(막히는 게 기본이 아니다). 정책이 없는 채로 RLS 만 켜면 anon·authenticated 는 아무것도
-- 못 읽고, 빌드·Actions 는 RLS 를 우회하는 service_role 키로 접근하므로 정책이 필요 없다.

-- updated_at 자동 갱신. places 에만 건다. search_path 를 비워 Supabase 린터의 "role mutable search_path" 경고를 피한다.
create function set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 장소. TPlace 와 1:1. 컬럼명은 snake_case, pull-db.mjs 가 camelCase 로 바꾼다.
create table places (
  id              text primary key,          -- Notion 블록 id(시드) 또는 새 uuid. 라우트 /place/[id] 의 키
  type            text not null check (type in ('stay', 'restaurant', 'cafe')),
  name            text not null,
  region_raw      text not null,             -- "동쪽 (구좌읍)". direction/town 분해는 scripts/lib/placeFields.mjs 가 한다
  features        text not null default '',
  pet_policy_text text not null default '',
  review_url      text,
  naver_url       text,
  naver_place_id  text,
  lat             double precision,
  lng             double precision,
  address         text,
  category        text,
  stay_price_text      text,                 -- 숙소만
  stay_amenities_text  text,                 -- 숙소만
  sort            int,                       -- 기존 places.json 순서 보존(종류별→Notion 순). 새 행은 null 도 OK
  status          text not null default 'published' check (status in ('draft', 'published', 'archived')),
  source          text not null default 'notion' check (source in ('notion', 'blog', 'manual')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index places_status_idx on places (status);

create trigger places_set_updated_at
  before update on places
  for each row
  execute function set_updated_at();

-- 준비물. TItem 과 1:1.
create table items (
  id        text primary key,
  name      text not null,
  emoji     text not null,
  seasons   text[] not null default '{}',
  reason    text not null default '',
  link_url  text,
  sort      int
);

-- 2 단계(블로그 수집)가 채운다. url 이 곧 키.
create table blog_posts (
  url          text primary key,
  blog_id      text,
  log_no       text,
  title        text,
  posted_at    date not null,
  keyword      text not null,
  fetched_at   timestamptz not null default now(),
  analyzed_at  timestamptz
);

create index blog_posts_analyzed_at_idx on blog_posts (analyzed_at);

-- 3 단계(AI 분석)가 채우고 사람이 승인/반려한다.
create table candidates (
  id               uuid primary key default gen_random_uuid(),
  post_url         text references blog_posts (url),
  extracted        jsonb not null,           -- TPlace 의 부분 객체 + evidence(인용 문장)
  match_place_id   text references places (id),
  match_confidence real,
  status           text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'merged')),
  reviewer_note    text,
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now()
);

create index candidates_status_idx on candidates (status);

-- 출처 추적. 한 장소에 글 여러 개가 붙을 수 있다.
create table place_sources (
  place_id  text references places (id),
  post_url  text references blog_posts (url),
  primary key (place_id, post_url)
);

-- RLS 켜기만 하고 정책은 만들지 않는다 — anon·authenticated 는 아무것도 못 읽는다(위 주석 참고).
alter table places enable row level security;
alter table items enable row level security;
alter table blog_posts enable row level security;
alter table candidates enable row level security;
alter table place_sources enable row level security;
