-- 운영자 허용 목록 + RLS 정책 (ADR-016 v4: 로컬 스크립트는 service_role 키가 아니라 Auth 사용자의 짧은 JWT 로 접근한다).
-- 첫 마이그레이션은 RLS 만 켜고 정책을 하나도 두지 않았다(anon·authenticated 가 아무것도 못 읽음). 여기서 두 길을 연다:
--   1. anon(publishable 키, Vercel 빌드의 data:pull): places 의 published 행과 items 를 select 만.
--      이미 사이트에 구워져 공개된 데이터와 정확히 같은 집합이라 새로 노출되는 것이 없다.
--   2. authenticated 중 operators 에 있는 사용자(pnpm login): 다섯 테이블 전부 select/insert/update/delete.
--      "authenticated 이면 된다" 로 두지 않는 이유 — 원격 프로젝트가 회원가입을 열어 두면 아무나 authenticated 가 된다. 허용 목록이 관문이다.
-- service_role 은 RLS 를 우회하므로(GitHub Actions) 이 파일과 무관하다.
-- operators 에는 정책을 두지 않는다 — API 로는 아무도 못 읽고(허용 목록을 열거할 수 없다), 행 추가는 SQL 로만(`supabase db query`).

create table operators (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  note       text,                              -- 누구인지 사람이 알아볼 이름. 이메일은 auth.users 에 있으니 여기 복사하지 않는다
  created_at timestamptz not null default now()
);

alter table operators enable row level security;

-- 정책 안의 서브쿼리는 호출자 역할로 돌고 operators 에도 RLS 가 걸리므로, 정책에서 `exists (select 1 from operators …)` 를 직접 쓰면
-- 에러 없이 조용히 false 가 된다(빈 결과). security definer 로 RLS 를 건너뛰어 자기 uid 가 목록에 있는지만 답한다.
-- search_path 를 비우고 전부 완전 수식한다 — definer 함수의 스키마 하이재킹 방지(set_updated_at 과 같은 이유).
create function is_operator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.operators where user_id = (select auth.uid())
  );
$$;

-- (select is_operator()) 로 감싸는 이유: 행마다 함수를 다시 부르지 않고 쿼리당 한 번 평가한다(Supabase RLS 성능 권고, initPlan).
create policy operators_all on places
  for all to authenticated
  using ((select is_operator()))
  with check ((select is_operator()));

create policy operators_all on items
  for all to authenticated
  using ((select is_operator()))
  with check ((select is_operator()));

create policy operators_all on blog_posts
  for all to authenticated
  using ((select is_operator()))
  with check ((select is_operator()));

create policy operators_all on candidates
  for all to authenticated
  using ((select is_operator()))
  with check ((select is_operator()));

create policy operators_all on place_sources
  for all to authenticated
  using ((select is_operator()))
  with check ((select is_operator()));

-- anon: scripts/pull-db.mjs 가 읽는 것과 정확히 같은 집합. status 필터는 여기서도 걸어 draft·archived 는 publishable 키로 못 본다.
create policy anon_read_published on places
  for select to anon
  using (status = 'published');

create policy anon_read_items on items
  for select to anon
  using (true);
