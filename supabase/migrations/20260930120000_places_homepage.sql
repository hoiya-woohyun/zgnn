-- 장소의 **공식 홈페이지 링크 카드**(ADR-002 v2). 사진 파일은 저장하지 않는다 — 업체가 공유 미리보기용으로 내놓은
-- `og:image` 의 **URL 만** 남기고, 사이트 상세는 그것을 "사진 + 출처 도메인 + 홈페이지로 가는 링크" 카드로만 그린다.
--
-- 세 칸을 jsonb 하나가 아니라 text 셋으로 두는 이유 — 업체가 사진을 내려 달라고 하면 운영자가 Studio 에서
-- `homepage_image` 한 칸을 비우는 것으로 끝나야 한다. jsonb 안의 키를 고치는 것은 그 자리에서 실수하기 쉽다.
--
-- 채우는 쪽은 `data:analyze`(후보 extracted.homepage) → 승인(`toNewPlaceRow`·`mergeIntoExisting`) 하나뿐이고,
-- 기존 테이블에 칸을 얹는 것이라 20260922120000_narrow_grants 의 테이블 단위 GRANT·RLS 가 그대로 적용된다.
-- 새 권한은 없다(anon 은 여전히 published 행 select 만).
alter table places add column if not exists homepage_url   text;
alter table places add column if not exists homepage_name  text;
alter table places add column if not exists homepage_image text;

comment on column places.homepage_url is
  '업체 공식 홈페이지. 네이버 지역 검색의 link 중 네이버·SNS·예약 플랫폼이 아닌 것(scripts/analyze/homepageCard.mjs).';
comment on column places.homepage_name is
  '홈페이지의 og:site_name 또는 title. 카드의 이름 줄.';
comment on column places.homepage_image is
  '홈페이지의 og:image URL(https). 파일은 저장하지 않는다. 업체가 요청하면 이 칸만 비운다(ADR-002 v2).';
