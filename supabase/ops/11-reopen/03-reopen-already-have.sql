-- 11 런북 3단계 — 옛 규칙(alreadyHave)으로 버려진 글만 다시 연다(리셋 대신).
-- /admin 의 '재분석' 버튼과 같은 규칙이다(docs/architecture/data-pipeline.md 「재분석」):
--   1) 그 글들의 pending 후보를 눕힌다(status='rejected' + '[admin] 재분석'). 안 눕히면 같은 가게가 옛·새 두 줄이 된다.
--      사람이 고친 후보('[admin] 고침')는 눕히지 않는다 — 다시 읽어도 그 (글, 가게)는 새로 만들지 않는다.
--   2) 글의 analyzed_at 을 비운다. analysis 는 두어도 된다(다음 실행이 덮는다).
-- 사람이 반려한 형제 후보가 있는 글은 뺀다(01 의 (c)) — 넣고 싶으면 `not exists (...)` 절을 지운다.
-- **문장 하나**(데이터 변경 CTE)라 둘 다 되거나 둘 다 안 된다.
-- 실행: pnpm exec supabase db query --linked -f supabase/ops/11-reopen/03-reopen-already-have.sql
with reopen as (
  select b.url
  from blog_posts b
  where b.analysis->'excluded' @> '[{"reason":"alreadyHave"}]'
    and not exists (
      select 1 from candidates c
      where c.post_url = b.url
        and c.status = 'rejected'
        and coalesce(c.reviewer_note, '') not like '%[admin] 재분석%'
    )
),
laid as (
  update candidates c
  set status = 'rejected',
      reviewer_note = case when coalesce(c.reviewer_note, '') = '' then '[admin] 재분석' else c.reviewer_note || E'\n[admin] 재분석' end
  where c.status = 'pending'
    and c.post_url in (select url from reopen)
    and coalesce(c.reviewer_note, '') not like '%[admin] 고침%'
  returning c.id
),
opened as (
  update blog_posts
  set analyzed_at = null
  where url in (select url from reopen)
  returning url
)
select (select count(*) from opened) as reopened_posts, (select count(*) from laid) as laid_down_candidates;
