-- 11 런북 1단계 — 읽기만 한다. 아무것도 바꾸지 않는다.
-- 실행: pnpm exec supabase db query --linked -f supabase/ops/11-reopen/01-check.sql

-- (a) 마이그레이션이 원격에 있나 — 칸이 없으면 날짜 규칙(stale)과 '사이트가 맞아요' 의 날짜가 조용히 꺼진다.
select
  exists (select 1 from information_schema.columns where table_name = 'places' and column_name = 'verified_at')       as has_verified_at,
  exists (select 1 from information_schema.columns where table_name = 'places' and column_name = 'stay_environment')  as has_stay_environment,
  exists (select 1 from information_schema.tables  where table_name = 'place_blocks')                                 as has_place_blocks,
  exists (select 1 from information_schema.tables  where table_name = 'place_reports')                                as has_place_reports;

-- (b) H.1 — 옛 규칙(alreadyHave)으로 버려진 글 수와 장소 언급 수. 이 글들이 다시 열 대상이다.
select
  count(*)                                                                                    as posts_already_have,
  coalesce(sum((select count(*) from jsonb_array_elements(analysis->'excluded') e where e->>'reason' = 'alreadyHave')), 0) as mentions_already_have
from blog_posts
where analysis->'excluded' @> '[{"reason":"alreadyHave"}]';

-- (c) 그중 **사람이 반려한 형제 후보가 있는 글** — 다시 읽으면 반려한 가게가 새 후보로 또 선다(블랙리스트에 없으면).
--     03 은 이 글들을 기본으로 **뺀다**.
select count(distinct b.url) as posts_with_rejected_sibling
from blog_posts b
join candidates c on c.post_url = b.url
where b.analysis->'excluded' @> '[{"reason":"alreadyHave"}]'
  and c.status = 'rejected'
  and coalesce(c.reviewer_note, '') not like '%[admin] 재분석%';

-- (d) 시드(notion) 중 확인 날짜가 빈 곳 — H.6 대상.
select source, count(*) filter (where status = 'published') as published, count(*) filter (where verified_at is null) as no_verified_at
from places group by source order by source;
