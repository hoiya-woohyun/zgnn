-- 11 런북 2단계(H.6) — 시드 장소에 확인 날짜를 시드 날짜로 한 번 채운다.
-- 효과: 그 날짜보다 옛 글은 시드를 바꾸자고 하지 않는다(stale). 날짜 뒤의 글만 갱신 후보가 된다.
-- 대가: 사이트 상세에 "2026년 9월 확인" 이 보인다(다음 빌드부터) — 시드를 Notion 에서 옮긴 날이다. 받아들이지 않으면 이 단계를 건너뛴다.
-- 게시 장소의 update 라 재빌드 트리거가 한 번 돈다.
-- 실행: pnpm exec supabase db query --linked -f supabase/ops/11-reopen/02-seed-verified-at.sql
update places
set verified_at = '2026-09-20T00:00:00+09:00'
where source = 'notion' and verified_at is null
returning id, name;
