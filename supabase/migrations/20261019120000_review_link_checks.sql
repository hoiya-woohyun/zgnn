-- 게시된 장소의 **후기 글 주소가 아직 읽히는가**(14 W261019.4). `pnpm data links`(scripts/check-review-links.mjs)가 장소마다 한 줄을 upsert 한다.
--
-- 왜 새 표인가: 점검 결과를 `places` 에 적으면 안 된다 — `places_notify_vercel_rebuild` 트리거에 WHEN 절이 없어(20261006130000_rebuild_coalesce.sql)
-- 게시된 행의 update 는 무엇이든 재빌드를 세운다. 점검은 읽기 전용 관찰이고 사이트에 영향이 없으므로 재빌드를 걸 이유가 없다.
-- `url` 은 점검한 그 주소다. 화면(/admin)은 지금 `places.review_url` 과 같을 때만 경고한다 — 운영자가 후기를 갈아 끼우면 묵은 결과가 저절로 꺼진다.
-- `gone` 은 삭제·비공개의 **긍정 증거**가 있을 때만이다(스크립트의 classifyReviewPage) — 차단·점검 페이지를 삭제로 읽으면 멀쩡한 출처를 갈아 끼우게 된다.
--
-- 비로그인(공개) 역할에는 아무것도 주지 않는다 — 운영자 검수 재료이고 사이트는 읽지 않는다.
-- `narrow_grants`(20260922120000) 뒤라 새 표는 명시 grant 전엔 API 로 아무도 못 본다(42501) — grant 를 같이 적는다.
-- 쓰기는 스크립트의 upsert(`on conflict (place_id) do update`, `.select()` 없음)라 insert·update 정책 둘 다 지난다. 지우지 않는다(delete grant 없음).
create table public.review_link_checks (
  place_id   text primary key references public.places(id),
  url        text not null,      -- 점검한 그 주소. 화면은 지금 places.review_url 과 같을 때만 경고 — 운영자가 후기를 갈아 끼우면 묵은 결과가 저절로 꺼진다
  state      text not null check (state in ('alive', 'gone', 'unknown')),
  detail     text check (detail is null or char_length(detail) <= 200),
  checked_at timestamptz not null default now()
);

alter table public.review_link_checks enable row level security;

grant select, insert, update on table public.review_link_checks to authenticated;   -- delete 없음 · anon 없음

create policy operators_select on public.review_link_checks for select to authenticated using ((select is_operator()));
create policy operators_insert on public.review_link_checks for insert to authenticated with check ((select is_operator()));
create policy operators_update on public.review_link_checks for update to authenticated using ((select is_operator())) with check ((select is_operator()));

-- 적용 뒤 확인(Claude, 원격 읽기 · 롤백 실측 — 행이 남지 않는다):
--   select count(*) from review_link_checks;                                   -- 표가 있다(0)
--   begin; set local role anon; select * from review_link_checks; rollback;     -- 42501(anon 은 grant 없음)
--   pnpm data links --dry-run                                                   -- "표가 없다" 줄 없이 점검 결과 요약이 나온다(dry-run 은 표를 안 읽는다)
