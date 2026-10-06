-- **추가 수집 요청**. `/admin` 검수 대기의 `추가 수집` 버튼이 한 줄을 넣고, 다음 `pnpm data:collect` 가 읽어 그 상호명으로 블로그를 한 번 더 찾는다.
-- docs/features/admin-review.md 「추가 수집」.
--
-- 왜 버튼이 바로 수집하지 않나: 사이트는 정적 내보내기라 서버가 없고, 네이버 검색 키는 운영자 로컬에만 있다(ADR-016 v5) — 브라우저가 부르면
-- 키가 번들에 실린다. 그래서 버튼은 **요청만 남기고**, 수집은 지금처럼 사용자 터미널이 한다(`다시 분석` 이 `analyzed_at` 만 되돌리는 것과 같은 틀).
--
-- 수명: `queued` → (data:collect 가 검색 · upsert 를 마친 뒤) `done`. 실행이 도중에 죽으면 `queued` 로 남아 다음 실행이 다시 한다.
-- `post_urls` 는 그 검색이 담은 글 url 이다 — `data:analyze` 가 이 글들을 **미분석 줄 맨 앞**에 세운다(안 그러면 수천 건 뒤에 밀려 몇 주가 지나도
-- 안 읽힌다 · 업주 블로그는 '한 가게 블로그' 로 뒤로 간다). `found` 는 담은 글, `new_posts` 는 그중 DB 에 없던 글 — 0 이면 "새로 읽을 글이 없어요" 다.
--
-- 같은 가게(`name_key` = normalizeName(이름), `place_blocks` 와 같은 키)는 대기 중인 요청이 하나뿐이다 — 두 번 눌러도 한 번 찾는다.
-- DELETE 는 주지 않는다(`20260922120000_narrow_grants.sql` 과 같은 경계). 비로그인 역할에는 아무것도 없다 — 운영자의 결정이다.
create table public.collect_requests (
  id            uuid primary key default gen_random_uuid(),
  query         text not null,                 -- 네이버 블로그 검색어 그대로(화면이 만든다 — adminCollectRequest.ts 의 collectRequestQuery)
  name          text not null,                 -- 화면용 원 이름
  name_key      text not null,                 -- normalizeName(이름). 대기 중 중복 막기
  candidate_id  uuid references candidates (id),
  status        text not null default 'queued' check (status in ('queued', 'done')),
  requested_at  timestamptz not null default now(),
  done_at       timestamptz,
  found         int,                           -- 검색이 담은 글(1년 안 · 제주 · 네이버 블로그)
  new_posts     int,                           -- 그중 DB 에 없던 글
  post_urls     text[] not null default '{}'
);

create unique index collect_requests_one_queued_idx on public.collect_requests (name_key) where status = 'queued';
create index collect_requests_done_at_idx on public.collect_requests (done_at) where status = 'done';

alter table public.collect_requests enable row level security;

-- 새 표에는 grant 가 자동으로 붙지 않는다(`20260922120000` 의 4번).
grant select, insert, update on table public.collect_requests to authenticated;   -- delete 없음

create policy operators_select on public.collect_requests for select to authenticated using ((select is_operator()));
create policy operators_insert on public.collect_requests for insert to authenticated with check ((select is_operator()));
create policy operators_update on public.collect_requests for update to authenticated using ((select is_operator())) with check ((select is_operator()));
