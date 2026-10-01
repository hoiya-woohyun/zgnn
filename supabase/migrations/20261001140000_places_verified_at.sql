-- 장소 정보를 **사람이 마지막으로 확인한 날**. 상세의 "2026년 10월 확인" 이 이것이다(docs/todo/10 F3 · T2.1, ADR-021 R5).
--
-- 왜 트리거가 아니라 **쓰는 코드가** 찍나: `updated_at` 처럼 트리거로 찍으면 아무 UPDATE 나 "확인" 이 된다 — 좌표 하나 고친 것,
-- 재분석이 빈 칸을 채운 것, 상태를 내렸다 되살린 것까지. 이 칸은 **사람이 "지금도 맞다" 고 본 순간**만 뜻해야 한다.
-- 쓰는 곳은 셋이다: `/admin` 의 승인·덮어쓰기(`approveGroup`)와 주소 고치기(`updatePlaceAddress`), 제보를 `고쳤어요` 로 닫은 것,
-- 그리고 `visited_ok` 제보가 30일 안에 2건 이상일 때 운영자가 누르는 「최근 확인으로 반영」.
--
-- 시드 86곳은 null 이다(Notion 원본에 작성 시점이 없다) — 사이트는 그때 날짜를 그리지 않는다. 지어낸 날짜는 없는 날짜보다 나쁘다.
-- 비로그인 역할의 select 는 테이블 단위라 이 칸도 `data:pull` 이 그대로 읽는다(새 grant 없음).
alter table places add column if not exists verified_at timestamptz;

comment on column places.verified_at is
  '사람이 정보를 마지막으로 확인한 시각. 쓰는 코드가 찍는다(트리거 아님) — 승인·덮어쓰기·주소 고치기·제보 처리·다녀왔어요 반영. null = 확인 기록 없음.';
