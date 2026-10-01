-- 숙소 **환경**(독채 · 마당 · 울타리 마당 · 계단) — AI 가 블로그 원문에서 읽은 값(docs/todo/10 F6 · T3.1).
--
-- 왜 `pet_policy` 안이 아니라 새 칸인가: `pet_policy` 는 **판정**(갈 수 있나)의 입력이다(ADR-017). 환경은 갈 수 있는지와 무관한 선호라
-- 판정에 넣지 않기로 했고, 같은 jsonb 에 섞으면 판정 코드(`withPolicyFacts`)가 그 칸을 지나가며 "모르는 칸" 을 다루게 된다.
-- 모양은 `{ standalone, yard, fencedYard, stairs }` 이고 칸마다 true · false · null(원문에 없음). 시드 86곳은 null — 앱이 `features` 를
-- 정규식으로 읽어 대조군으로 쓴다(`scripts/lib/stayEnvironment.mjs`).
--
-- 비로그인 역할의 select 는 테이블 단위라 `data:pull` 이 그대로 읽는다(새 grant 없음). 쓰는 쪽(`toNewPlaceRow`·`mergeIntoExisting`)은
-- 행에 이 칸이 있을 때만 싣는다 — 마이그레이션 전 원격에 없는 칸을 쓰면 PostgREST 가 쓰기를 통째로 거절한다.
alter table places add column if not exists stay_environment jsonb;

comment on column places.stay_environment is
  '숙소 환경 {standalone, yard, fencedYard, stairs} — 칸마다 true/false/null. AI 가 원문에서 읽고 근거 단어로 걸렀다. 판정에는 쓰지 않는다(선호). docs/todo/10 F6.';
