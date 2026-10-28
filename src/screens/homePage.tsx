'use client';

import { useMemo, useState } from 'react';
import { HomePageAreaCards } from './homePageAreaCards';
import { HomePageHero } from './homePageHero';
import { HomePageInstall } from './homePageInstall';
import { HomePageIntro } from './homePageIntro';
import { HomePageTripCard } from './homePageTripCard';
import { HomeTypeCard } from './homeTypeCard';
import { BottomSheet } from '../components/base/bottom-sheet';
import { Button } from '../components/base/button';
import { PawMark } from '../components/pawMark';
import { PlaceLinkList } from '../components/placeLinkList';
import { dogCallNames, withJosa } from '../lib/korean';
import { META, PLACE_TYPES, placesOfType, SOURCE_LINE, TYPE_META } from '../lib/places';
import { countByLevel, type TLevelCounts } from '../lib/eligibilityCounts';
import { homePageIndoorNote, homePageReach, homePageReachNote } from '../lib/homePageCounts';
import { homePageRegisterPreview, homePageRegisterPreviewText } from '../lib/homePageRegisterPreview';
import { useStoreHydrated } from '../providers/storeHydration';
import { useAppStore, useDog } from '../store/useAppStore';
import type { TPlaceType } from '../types';

export function HomePage() {
  const dog = useDog();
  const needsIndoor = useAppStore((state) => state.needsIndoor);
  // 종류별 판정 레벨 수. 목록 머리와 같은 함수(countByLevel)로 센다 — 홈이 "7/26", 목록이
  // "26곳" 이라 서로 다른 숫자처럼 읽혔다(T2.2). 프로필이 없으면 null(카드는 총수만).
  const levelCountsByType = useMemo(() => {
    if (!dog) return null;
    const counts = {} as Record<TPlaceType, TLevelCounts>;
    for (const type of PLACE_TYPES) counts[type] = countByLevel(placesOfType(type), dog, { needsIndoor });
    return counts;
  }, [dog, needsIndoor]);
  // 히어로 "갈 수 있는 곳 N곳" 의 그 곳들(14 W261007.12)과 그중 야외 자리만 되는 곳(W261013.2). 수 · "… 포함" · 시트의 줄 · '야외만' 표식이
  // 전부 이 결과 하나(`homePageReach` — 종류마다 가능 · 야외를 한 번 가른다)에서 나온다. 화면에서 판정을 다시 부르지 않는다.
  // 종류 목록 + '어려운 곳 숨기기' 로 보내지 않는 것은 그 목록에 확인 필요·정보 없음이 남아 "44곳" 을 눌러 44곳이 아닌 화면을 보기 때문이다.
  const reach = useMemo(() => (dog ? homePageReach(placesOfType, dog, { needsIndoor }) : null), [dog, needsIndoor]);
  const reachCount = reach?.count ?? 0;
  const outdoorNote = reach ? homePageReachNote(reach.outdoor) : null;
  // '실내 자리 필요' 는 둘러보기 필터에서 켜는 퍼시스트 전역 값이라 홈 수 전체를 말없이 바꿨다(14 W261010.22). 켜져 있을 때만 끈 수를 한 번 더 센다.
  const setNeedsIndoor = useAppStore((state) => state.setNeedsIndoor);
  const reachIfOff = useMemo(() => (dog && needsIndoor ? homePageReach(placesOfType, dog).count : null), [dog, needsIndoor]);
  const indoorNote = reachIfOff === null ? null : homePageIndoorNote(needsIndoor, reachCount, reachIfOff);
  // 켜면 야외 곳은 0 이라 둘이 함께 서는 일은 없지만(테스트가 묶는다), 규칙이 바뀌어도 한쪽이 말없이 가려지지 않게 잇는다.
  const reachNote = [indoorNote, outdoorNote].filter(Boolean).join(' · ') || null;
  const [reachOpen, setReachOpen] = useState(false);
  const dogNames = dog ? dogCallNames(dog.dogs.map((d) => d.name)) : '';
  // 등록 전 미리보기(14 C2610.2) — 예시 두 몸무게로 숙소를 세어 "아이마다 다르다" 를 숫자로. 데이터가 빌드 시점에 묶여 있어 한 번만 센다.
  const registerPreview = useMemo(() => homePageRegisterPreview(placesOfType('stay')), []);

  // 인사말은 첫 방문에만 히어로 밑에 펼치고, 그 뒤로는 맨 아래 한 줄이다(07 U2). 읽기가 끝나기 전엔 **둘 다 그리지 않는다** —
  // 저장된 값은 마운트 뒤에 들어오므로(skipHydration) 기본값(0)으로 먼저 그리면 재방문자에게도 카드가 펼쳐졌다가
  // 접히며 화면 전체가 위로 튄다. 첫 방문자는 반대로 비어 있다 카드가 생기는데, 그건 처음 한 번뿐이고 밀리는 쪽이라 덜 거슬린다.
  const hydrated = useStoreHydrated();
  const visitCount = useAppStore((state) => state.visitCount);
  const intro = !hydrated ? null : visitCount <= 1 ? 'card' : 'row';

  return (
    <div>
      {/* 잉크 히어로가 스크롤을 따라 그대로 헤더가 된다 — 카드가 줄어들며 크림 헤더 한 줄로 붙는다(HomePageHero).
          좌우 여백·시작 높이는 PageHeader 와 같은 `px-4 pt-6 md:px-6 md:pt-10` 이라 다른 루트 화면과 첫 블록이 같은 자리다. */}
      <HomePageHero
        subtitle={dog ? `${withJosa(dogNames, '이랑/랑')} 제주 어디 갈까요?` : '짱구누나의 반려견 동반 제주 가이드'}
        reach={
          reach
            ? {
                label: `${withJosa(dogNames, '이/가')} 갈 수 있는 곳`,
                // 야외 자리만 되는 곳도 센다(14 W261007.5) — 카드 머리글이 "야외 자리에서 갈 수 있어요" 라 '확인 필요' 와 달리 갈 수 있는 곳이다.
                // 센다는 말은 수 밑에 한 줄로(W261013.2) — 종류 카드 '가능' 합과 수가 다른 이유다.
                count: reachCount,
                note: reachNote,
                onOpen: () => setReachOpen(true),
                editHref: '/dog',
              }
            : null
        }
        // 프로필이 없으면 히어로가 곧 등록 버튼이다(18 T4). 첫 진입 강제 등록은 이탈로 이어진다는 리뷰 지적이 있어(2026-09-15 §1)
        // 버튼 하나로만 유도하고 강제 라우팅은 하지 않는다.
        cta={
          dog
            ? undefined
            : {
                title: '우리 강아지 등록하기',
                body: registerPreview
                  ? `${homePageRegisterPreviewText(registerPreview)} — 우리 아이는요?`
                  : '등록하면 갈 수 있는 곳을 바로 보여드려요',
                href: '/dog',
              }
        }
      />

      {/* 「내 여행」 — 저장·준비물(그리고 16 의 동선)이 한 입구다(18 T3). 머리 줄까지 카드가 그린다 —
          등록 전에 아무것도 없으면 섹션째 null 이라 머리만 남는 빈 섹션이 없다. */}
      {/* `home-scroll-depth` — 줄이 접힌 히어로 밑으로 들어가기 직전에 작아지며 흐려진다(`styles/microMotion.css`, 스크롤 위치의 함수라 JS 가 없다).
          섹션째가 아니라 **줄마다** 붙인다 — 긴 섹션에 붙이면 아래쪽을 아직 읽는 중에 흐려진다. */}
      <div className="home-scroll-depth">
        <HomePageTripCard />
      </div>

      {intro === 'card' && (
        <div className="home-scroll-depth mt-4 px-4 md:px-6">
          <HomePageIntro variant="card" />
        </div>
      )}

      <section className="mt-8 px-4 md:px-6">
        <h2 className="text-md font-bold text-primary">어디로 갈까요</h2>
        {/* 면 없는 행 셋 — 사이는 선 하나(22 G2.3 · 면 0). */}
        <div className="mt-1 divide-y divide-secondary">
          {PLACE_TYPES.map((type) => (
            <div key={type} className="home-scroll-depth">
              <HomeTypeCard type={type} levelCounts={levelCountsByType?.[type]} />
            </div>
          ))}
        </div>
      </section>

      <HomePageAreaCards />

      {/* 두 번째 방문부터의 인사말 자리 — 출처 줄 바로 위, "이 자료는 누가" 와 같은 묶음이다.
          설치 안내(07 U9)도 같은 "두 번째 방문부터" 라 그 밑에 한 줄로 붙는다. 서지 않는 기기에선 스스로 null 이다. */}
      {intro === 'row' && (
        <section className="mt-8 space-y-3 px-4 md:px-6">
          <HomePageIntro variant="row" />
          <HomePageInstall />
        </section>
      )}

      <footer className="mt-10 px-4 pb-8 text-sm text-tertiary md:px-6">
        <p>
          {SOURCE_LINE}{' '}
          {/* 문장 안 링크라 WCAG 2.5.8 의 예외지만 바깥으로 나가는 링크치고 16px 높이는 작다고 두 번 걸렸다(ux-expert L-9 · designer-03, 14 W261010.33d).
              줄 높이는 그대로 두고 투명 히트 영역만 위아래로 내민다(naverLinkButton 과 같은 방식) — 링크가 두 줄로 갈리면 영역의 기준 상자가 브라우저마다 달라 nowrap.
              Chrome 실측 링크 77×17 · 누르는 자리 약 45px · 문단 줄 높이 21px 그대로(390 한 줄 · 320 두 줄). */}
          <a
            href={META.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className='relative font-semibold whitespace-nowrap text-brand-secondary underline underline-offset-2 before:absolute before:inset-x-0 before:-inset-y-3.5 before:content-[""]'
          >
            원본 노션 보기
          </a>
        </p>
        <p className="mt-2">방문 전 영업시간과 동반 조건을 한 번 더 확인해 주세요.</p>
        {/* 이스터에그 — 끝까지 내려온 사람에게만 발바닥이 고개를 내민다(스크롤 위치의 함수, `home-footer-peek`). 지원하지 않는 브라우저에선 가만히 서 있다. */}
        <div aria-hidden="true" className="mt-6 flex justify-center">
          <PawMark className="home-footer-peek block size-7 text-brand-300" />
        </div>
      </footer>

      {/* 히어로 수의 그 곳들 — 둘러보기의 야외 차선·지도의 「지도에 없는 N곳」 과 같은 줄 목록, 종류별로 묶는다.
          시트는 히어로(sticky·transform 블록) 밖에 둔다. 묶음마다 가능 먼저, 야외 뒤(`reachablePlaces` 와 같은 순서).
          야외 자리만 되는 곳엔 줄마다 '야외만'(14 W261013.2) — 식당 2곳이 표식 없이 섞여 "가능" 으로 읽혔다(seongho-15). */}
      {/* 40곳이 넘는다 — 필터 시트와 같이 머리는 서 있고 줄만 넘어간다(`max-h-[80dvh]` + `min-h-0 flex-1`, placesPageFilterSheet 주석). */}
      <BottomSheet isOpen={reachOpen && reach !== null} onOpenChange={setReachOpen} label="갈 수 있는 곳">
        <div className="flex max-h-[80dvh] flex-col">
          <p className="shrink-0 pr-8 text-md font-bold text-primary">
            {withJosa(dogNames, '이/가')} 갈 수 있는 {reachCount}곳
          </p>
          {/* 끄는 자리는 시트 머리 — 히어로의 덧말은 수 버튼 안이라 버튼을 겹칠 수 없다. 상세 판정 카드의 '끄기' 와 같은 모양(`placeDetailEligibilityCard`). */}
          {indoorNote && (
            <p className="mt-0.5 flex shrink-0 flex-wrap items-center gap-x-2 text-sm text-tertiary">
              {indoorNote}
              <Button color="link-color" size="sm" className="min-h-11" onClick={() => setNeedsIndoor(false)}>
                끄기
              </Button>
            </p>
          )}
          {outdoorNote && (
            <p className="mt-0.5 shrink-0 text-sm text-tertiary">{outdoorNote} — 그 곳엔 &lsquo;야외만&rsquo; 이라고 적었어요.</p>
          )}
          {reachCount === 0 && (
            <p className="mt-0.5 shrink-0 text-sm text-tertiary">아직 없어요. 확인이 필요한 곳은 종류별 목록에서 볼 수 있어요.</p>
          )}
          <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
            {reach &&
              PLACE_TYPES.map((type) => {
                const { ok, outdoor } = reach.byType[type];
                if (ok.length + outdoor.length === 0) return null;
                return (
                  <section key={type} className="mt-2">
                    <h3 className="text-sm text-secondary">
                      {TYPE_META[type].label} {ok.length + outdoor.length}곳
                    </h3>
                    <PlaceLinkList places={[...ok, ...outdoor]} tagOf={(place) => (outdoor.includes(place) ? '야외만' : null)} />
                  </section>
                );
              })}
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
