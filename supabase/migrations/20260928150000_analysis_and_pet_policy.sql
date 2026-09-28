-- 2026-09-28 설계 검토(docs/todo/03 · ADR-017). 세 가지를 더한다 — 기존 테이블에 컬럼·트리거를 얹는 것이라
-- 20260922120000_narrow_grants 의 테이블 단위 GRANT·RLS 가 그대로 적용된다(컬럼 단위 grant 는 쓰지 않았다).
--
-- 1) blog_posts.analysis — 글 단위 분석 결과 { model, promptVersion, candidates, candidateNames, excluded:[{name,type,reason}], skip }.
--    후보 0건인 글의 "왜"(제주 아님·other·동반 불가) 가 여기 남는다. 없으면 추출 누락(false negative)을 영영 잴 수 없고,
--    프롬프트를 고친 뒤 재분석 대상(`analysis->>'promptVersion' <> '…'`)도 고를 수 없다. 본문 인용은 넣지 않는다(02 의 저장 원칙).
-- 2) places.pet_policy — AI 가 petPolicyText 를 읽고 판단한 구조화 값(src/types.ts 의 TPetPolicyFacts). 시드 86곳은 null 이고
--    블로그 경로(data:apply)만 채운다. 앱은 이 값이 있으면 정규식 파서 결과를 덮는다(withPolicyFacts).
-- 3) candidates.reviewed_at — 사람이 Studio 나 data:review 로 status 를 approved/rejected 로 바꾼 시각. 어떤 코드도 채우지 않던 칸이라
--    트리거로 찍는다. data:apply 의 approved → merged 는 사람의 결정이 아니므로 찍지 않는다.
alter table blog_posts add column if not exists analysis jsonb;
alter table places add column if not exists pet_policy jsonb;

create or replace function set_candidate_reviewed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    new.reviewed_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists candidates_set_reviewed_at on candidates;
create trigger candidates_set_reviewed_at
  before update of status on candidates
  for each row
  execute function set_candidate_reviewed_at();
