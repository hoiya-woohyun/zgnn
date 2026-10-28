-- 확인 날짜에 "무엇으로" 를 붙인다(14 W261007.17 뒤 절반 — 사용성 평가 4회 반복: "2026년 9월에 확인했어요" 가 누가·무엇으로인지 말하지 않아
-- "AI 로 모아 정리했어요" 와 부딪힌다). 사용자 결정 2026-10-27: 붙인다.
--
-- 값은 넷이다 — `review` 후기(블로그 글·노션 후기를 읽고) · `phone` 전화 · `visit` 현장(직접 가 봄) · `report` 제보(이용자의 다녀왔어요·고쳐 달라는 제보).
-- 쓰는 곳은 `verified_at` 과 같은 길이고 **같은 쓰기에** 실린다(`verified_at` 만 찍고 방법을 안 지우면 옛 방법이 새 날짜에 붙는다):
-- 승인(`review`) · 사이트가 맞아요(`review`) · 시드 백필(`review` — 노션 원본이 짱구누나의 후기다) · 고치기(운영자가 고른 값, 모르면 null).
-- 제보 처리 두 길(고쳤어요 · 다녀왔어요 반영)은 `report`.
--
-- **null = 방법을 모른다.** 사이트는 그때 날짜만 말한다("2026년 9월에 확인했어요") — 지어낸 방법은 없는 방법보다 나쁘다.
-- 이미 날짜가 찍힌 행(시드 86곳 등)은 이 칸이 null 로 시작한다 — 날짜가 어떤 방법으로 찍혔는지 거슬러 추정하지 않는다.
--
-- 이 마이그레이션이 원격에 적용되기 전에도 pull·/admin 이 깨지지 않는다 — pull 은 `select('*')` 라 칸이 없으면 undefined 이고,
-- 쓰는 코드는 `'verified_method' in row` 일 때만 이 칸을 쓴다. 새 권한은 없다(20260922120000_narrow_grants 의 테이블 단위 GRANT·RLS 그대로).
alter table public.places add column if not exists verified_method text
  check (verified_method is null or verified_method in ('review', 'phone', 'visit', 'report'));

comment on column public.places.verified_method is
  '확인 날짜(verified_at)를 무엇으로 찍었나: review 후기 · phone 전화 · visit 현장 · report 제보. null = 모름 — 사이트는 날짜만 말한다. verified_at 과 같은 쓰기로 갱신한다.';

-- 적용 뒤 확인(Claude, 원격 읽기):
--   select verified_method, count(*) from places group by 1;      -- 전부 null (입력 전)
--   pnpm data pull                                                -- exit 0, `git diff src/data` 비어 있음
