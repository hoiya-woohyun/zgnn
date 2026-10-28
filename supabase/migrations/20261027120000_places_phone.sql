-- 가게 전화번호(07 P0 — 사용성 평가 6회 1위: "확인이 필요해요" 앞에서 번호가 네이버 너머에만 있었다).
--
-- 출처는 **운영자 입력**이다(사용자 2026-09-29). `/admin` 「올린 장소」 고치기의 번호 칸이 저장 때 한 번 정규화해서 쓴다
-- (scripts/lib/phone.mjs — `064-123-4567` · `010-…` · `0507-…` 안심번호 · `1588-…`). 네이버 지역 검색의 `telephone` 은 쓰지 않는다.
-- 형식 check 는 정규화를 우회한 쓰기(Studio 에서 손으로)가 `tel:` 링크를 깨는 것을 막는 안전망이다 — 숫자와 하이픈 8~14자뿐.
--
-- `verified_at` 처럼 트리거가 아니라 쓰는 코드가 찍지 않는다: 번호는 사실 칸이 아니다(조건을 확인한 날이 아니다) —
-- 번호만 고친 저장이 "조건을 이날 확인했다" 로 읽히면 안 된다(`adminPlaceEdit.ts` 의 `VERIFYING_COLUMNS` 에 넣지 않는다).
--
-- 기존 테이블에 칸을 얹는 것이라 20260922120000_narrow_grants 의 테이블 단위 GRANT·RLS 가 그대로 적용된다. 새 권한은 없다.
-- anon 의 select 는 테이블 단위라 `pnpm data pull` 이 이 칸도 그대로 읽는다. 사이트가 번호를 내는 것은 별도 줄(`tel:` 버튼)이다.
-- 이 마이그레이션이 원격에 적용되기 전에도 pull·/admin 이 깨지지 않는다 — pull 은 `select('*')` 라 칸이 없으면 undefined 이고,
-- /admin 은 `'phone' in row` 로 칸이 있을 때만 폼에 줄을 세우고 쓴다.
alter table public.places add column if not exists phone text
  check (phone is null or phone ~ '^[0-9][0-9-]{6,12}[0-9]$');

comment on column public.places.phone is
  '가게 전화번호(하이픈 정규 표기). 운영자가 /admin 에서 입력한다. null = 번호 없음 — 사이트는 그때 전화 버튼을 그리지 않는다.';

-- 적용 뒤 확인(Claude, 원격 읽기):
--   select count(*) filter (where phone is not null) from places;       -- 0 (아직 입력 전)
--   pnpm data pull                                                      -- exit 0, `git diff src/data` 비어 있음
