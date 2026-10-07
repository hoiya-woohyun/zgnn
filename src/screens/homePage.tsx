'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Heart, Map01 } from '@untitledui/icons';
import { HomePageHero, PawMark } from './homePageHero';
import { HomePageInstall } from './homePageInstall';
import { HomePageIntro } from './homePageIntro';
import { HomePageLandmarkChips } from './homePageLandmarkChips';
import { HomeTypeCard } from './homeTypeCard';
import { Button } from '../components/base/button';
import { SeasonChips } from '../components/seasonChips';
import { dogCallNames, withJosa } from '../lib/korean';
import { META, PLACE_TYPES, placesOfType, SOURCE_LINE } from '../lib/places';
import { checklistView } from '../lib/checklist';
import type { TEligibilityLevel } from '../lib/eligibility';
import { countByLevel } from '../lib/eligibilityCounts';
import { homePageRegisterPreview, homePageRegisterPreviewText } from '../lib/homePageRegisterPreview';
import { useStoreHydrated } from '../providers/storeHydration';
import { useAppStore, useDog, useSavedPlaces } from '../store/useAppStore';
import type { TPlaceType } from '../types';
import { CARD_SURFACE } from '../components/cardSurface';

export function HomePage() {
  const savedPlaces = useSavedPlaces();
  const savedCount = savedPlaces.length;
  const season = useAppStore((state) => state.season);
  const setSeason = useAppStore((state) => state.setSeason);
  const checkedItemIds = useAppStore((state) => state.checkedItemIds);
  // 준비물 화면과 같은 함수로 센다 — 두 화면이 다른 숫자를 보여주면 안 된다.
  // 분모는 계절 전체이고, 저장한 숙소가 갖고 있는 물건은 내가 챙긴 것과 따로 센다(ADR-009 v3 · 07 U6).
  const progress = useMemo(
    () => checklistView(season, checkedItemIds, savedPlaces),
    [season, checkedItemIds, savedPlaces],
  );

  const dog = useDog();
  const needsIndoor = useAppStore((state) => state.needsIndoor);
  // 종류별 판정 레벨 수. 목록 머리와 같은 함수(countByLevel)로 센다 — 홈이 "7/26", 목록이
  // "26곳" 이라 서로 다른 숫자처럼 읽혔다(T2.2). 프로필이 없으면 null(카드는 총수만).
  const levelCountsByType = useMemo(() => {
    if (!dog) return null;
    const counts = {} as Record<TPlaceType, Record<TEligibilityLevel, number>>;
    for (const type of PLACE_TYPES) counts[type] = countByLevel(placesOfType(type), dog, { needsIndoor });
    return counts;
  }, [dog, needsIndoor]);
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
        subtitle={
          dog
            ? `${withJosa(dogCallNames(dog.dogs.map((d) => d.name)), '이랑/랑')} 제주 어디 갈까요?`
            : '짱구누나의 반려견 동반 제주 가이드'
        }
        reach={
          dog && levelCountsByType
            ? {
                label: `${withJosa(dogCallNames(dog.dogs.map((d) => d.name)), '이/가')} 갈 수 있는 곳`,
                count: PLACE_TYPES.reduce((sum, type) => sum + levelCountsByType[type].ok, 0),
              }
            : null
        }
      />

      {/* 프로필이 없을 때만, 히어로 **바로 밑**에. 첫 진입 강제 등록은 이탈로 이어진다는 리뷰 지적이 있어(2026-09-15 §1)
          카드 하나로만 유도하고 강제 라우팅은 하지 않는다 — 대신 이 화면에서 할 일은 이것 하나라 흰 카드가 아니라 **브랜드 면**이고,
          인사말보다 위다(폴드 아래로 밀렸었다, UX 평가 2026-10-06 · 07 U2).
          예전에는 `-mt-10` 으로 히어로 위에 겹쳐 올렸다. 히어로가 라운드 판이 되면서 그 겹침이 판의 아래 모서리를 덮어 버려
          (같은 폭이다) 판으로 보이지 않게 된다 — 겹치지 않고 아래에 둔다. */}
      {!dog && (
        <div className="px-4 md:px-6">
          <Link
            href="/dog"
            className="mt-4 flex items-center gap-3 rounded-2xl bg-brand-primary px-4 py-4 ring-1 ring-inset ring-brand-200 transition-colors hover:bg-brand-secondary"
          >
            <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-solid">
              <PawMark className="h-5 w-5 text-white" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-primary">우리 강아지 등록하기</p>
              <p className="text-sm text-secondary">
                {registerPreview
                  ? `${homePageRegisterPreviewText(registerPreview)} — 우리 아이는요?`
                  : '등록하면 갈 수 있는 곳을 바로 보여드려요'}
              </p>
            </div>
          </Link>
        </div>
      )}

      {intro === 'card' && (
        <div className="mt-4 px-4 md:px-6">
          <HomePageIntro variant="card" />
        </div>
      )}

      <section className="mt-8 px-4 md:px-6">
        <h2 className="text-lg font-bold text-primary">어디로 갈까요</h2>
        <div className="mt-3 space-y-3">
          {PLACE_TYPES.map((type) => (
            <HomeTypeCard key={type} type={type} levelCounts={levelCountsByType?.[type]} />
          ))}
        </div>

        <Button color="primary" size="lg" iconLeading={Map01} href="/map/" className="mt-3 w-full">
          지도로 보기
        </Button>
      </section>

      <section className="mt-8 px-4 md:px-6">
        <h2 className="text-lg font-bold text-primary">지역으로 찾기</h2>
        <HomePageLandmarkChips />
      </section>

      <section className="mt-8 px-4 md:px-6">
        <h2 className="text-lg font-bold text-primary">여행 준비물</h2>
        <div className={`mt-3 ${CARD_SURFACE} p-4`}>
          <p className="text-sm text-tertiary">{META.itemsIntro.split('\n')[0]}</p>

          {/* 계절칩은 고르기만 한다 — 누르자마자 화면이 넘어가면 다른 계절을 비교해 볼 수 없다.
              준비물로 가는 건 아래 링크이고, 그 숫자가 계절에 따라 바뀌어 고른 결과가 바로 보인다. */}
          <SeasonChips value={season} onSelect={setSeason} label="계절 선택" className="mt-3" />

          <Link
            href="/checklist"
            className="mt-4 flex h-12 items-center justify-between rounded-lg bg-secondary px-4 text-sm font-semibold text-primary transition-colors hover:bg-tertiary"
          >
            준비물 {progress.total}가지 확인하기
            <span className="text-sm font-semibold text-tertiary">
              {progress.packed}개 챙김{progress.atStay > 0 && ` · 숙소 ${progress.atStay}`}
            </span>
          </Link>
        </div>
      </section>

      <section className="mt-8 px-4 md:px-6">
        {/*
          저장한 곳의 주 진입점. 카드 본문은 목록(`/saved`)으로, 오른쪽 버튼은 저장 칩을 켠 지도로 곧장 간다 —
          현장에서 "저장한 곳 중 근처는?" 을 물을 때 목록을 한 번 거치지 않게.
          버튼은 카드 링크 **바깥의 형제**다. 안에 넣으면 a 안에 a 가 된다.
        */}
        <div className={`flex items-center gap-2 ${CARD_SURFACE} pr-3`}>
          <Link
            href="/saved"
            className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-4 py-4 transition-colors hover:bg-secondary"
          >
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-camellia-wash text-camellia"
            >
              <Heart size={20} className="fill-camellia" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-primary">저장한 곳 {savedCount}</p>
              <p className="text-sm text-tertiary">
                {savedCount > 0 ? '모아 둔 곳을 목록과 지도로 봐요' : '마음에 드는 곳의 하트를 눌러보세요'}
              </p>
            </div>
          </Link>
          {savedCount > 0 && (
            <Button color="secondary" size="md" iconLeading={Map01} href="/map/?saved=1" className="shrink-0">
              지도
            </Button>
          )}
        </div>
      </section>

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
          <a
            href={META.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-brand-secondary underline underline-offset-2"
          >
            원본 노션 보기
          </a>
        </p>
        <p className="mt-2">방문 전 영업시간과 동반 조건을 한 번 더 확인해 주세요.</p>
      </footer>
    </div>
  );
}
