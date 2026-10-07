-- `blog_posts.requested_at` 채우기(docs/todo/17 리뷰 1). 칸(`20261007140000_local_worker.sql`)이 생기기 **전에** 끝난 추가 수집 요청이 담은 글은
-- 그 칸이 비어 있다 — 상주 워커의 자동 분석(`--requested-only`)도, 기본 분석의 앞줄도 이제 이 칸 하나만 본다(리뷰 14 — `collect_requests.post_urls`
-- 를 따로 읽던 길을 걷어냈다). 그대로 두면 그 글들이 저수지에 섞여 영영 안 읽힌다. 적용 전 원격 실측: 대상 24건(2026-10-07).
--
-- 값은 그 요청이 끝난 시각(`done_at`) — 오래 기다린 순서가 그대로 선다. 한 글을 여러 요청이 담았으면 가장 이른 것.
-- 이미 분석된 글은 건드리지 않는다(다시 읽게 하는 것은 재분석 버튼의 일이다). 이미 찍힌 글도 그대로다 — 여러 번 돌려도 같다.
update public.blog_posts b
set requested_at = cr.done_at
from (
  select url, min(done_at) as done_at
  from (select unnest(post_urls) as url, done_at from public.collect_requests where status = 'done' and done_at is not null) urls
  group by url
) cr
where b.url = cr.url
  and b.analyzed_at is null
  and b.requested_at is null;
