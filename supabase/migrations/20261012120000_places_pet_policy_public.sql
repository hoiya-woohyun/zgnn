-- 조건 원문을 **사이트에 그대로 내도 되는가** + AI 가 자기 말로 쓴 **이용 안내**(ADR-017 결정 13 D2, v10 · docs/todo/21 S3).
--
-- `pet_policy_text` 는 블로그 문장을 글자 그대로 옮긴 대조군이다(원문 대조가 그 위에 선다). 그 문장이 공개 상세·`places.json`·번들에
-- 그대로 나가고 있었다(레포도 PUBLIC). 그래서 원문은 그대로 저장하고, 공개 여부를 칸 하나로 가른다:
--   - `pet_policy_text_public` — 기본 **false(숨김)**. 쓰기 경로가 이 칸을 빠뜨려도 새지 않는 쪽으로 넘어진다.
--     `source` 로 대신하지 않는 이유: 기본값이 'notion' 이고 블로그 값으로 채우거나 덮어써도 그대로라 신호가 못 된다.
--   - `pet_policy_guide` — `{ text, basis }`. `basis` 는 안내를 쓴 시점 판단의 지문(`policyFingerprint`, scripts/lib/petPolicyGuide.mjs)이고
--     지금 판단과 다르면 화면이 숨긴다(판단을 고치면 문장이 낡는다). null = 안내 없음. 백필하지 않는다 — 다시 분석될 때 채워진다.
--
-- 기존 테이블에 칸을 얹는 것이라 20260922120000_narrow_grants 의 테이블 단위 GRANT·RLS 가 그대로 적용된다. 새 권한은 없다.
alter table places add column if not exists pet_policy_text_public boolean not null default false;
alter table places add column if not exists pet_policy_guide jsonb;

comment on column places.pet_policy_text_public is
  '조건 원문을 사이트에 그대로 보여도 되는가. 시드(가족이 쓴 문장)만 true, 블로그 원문은 false — 화면은 판단에서 만든 문장을 보인다(ADR-017 결정 13).';
comment on column places.pet_policy_guide is
  'AI 가 원문을 읽고 자기 말로 쓴 이용 안내 {text, basis}. basis(판단 지문)가 지금 pet_policy 와 다르면 화면이 숨긴다. null = 안내 없음.';

-- 시드만 공개(ADR-017 결정 13 D3) — Notion 에서 온 행 중 AI 판단이 없는 것. 2026-10-12 원격 실측: 86행(게시 84 + 내림 2),
-- 판단이 붙은 시드(블로그 값으로 덮인 시드) 0행 · 판단 없는 블로그 행 0행. 판단이 붙은 시드가 생겼다면 그 행의 원문은 블로그 문장이라 false 로 둔다.
-- 게시된 행이 바뀌므로 재빌드가 한 번 걸린다(places 트리거). 이미 true 인 행은 건드리지 않는다(다시 돌려도 재빌드가 안 걸리게).
update places
   set pet_policy_text_public = true
 where source = 'notion'
   and pet_policy is null
   and not pet_policy_text_public;
