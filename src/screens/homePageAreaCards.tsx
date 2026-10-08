'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight } from '@untitledui/icons';
import { usePlacesPageAreaEntry } from './placesPageAreaEntry';
import { CARD_SURFACE } from '../components/cardSurface';
import { FilterChip } from '../components/filterChip';
import { ReportSheet } from '../components/reportSheet';
import { AREAS, areaOf, countByArea, TOWN_TO_AREA, type TAreaId } from '../lib/areaGroups';
import {
  AREA_CARD_TYPES,
  areaLabelGates,
  coverageDogOf,
  homePageAreaCardCounts,
  homePageAreaPicks,
  isAreaLabelCell,
  homePageAreaLandmarks,
  homePageAreaStayGap,
  nearestAreaWithStay,
} from '../lib/homePageAreaCards';
import { dogCallNames, withJosa } from '../lib/korean';
import { PLACES } from '../lib/places';
import { useAppStore, useDog } from '../store/useAppStore';
import { usePlacesPageFilterStore } from '../store/usePlacesPageFilterStore';
import { cx } from '../utils/cx';

// 라벨 문턱(19 §4)도 빌드 시점 데이터로 한 번 — `pnpm data coverage` 와 같은 함수다. 문턱 전 원형(지금은 대형견)엔 라벨이 없다(ADR-027 결정 3).
const LABEL_GATES = areaLabelGates(PLACES);
/** 라벨 머리 — 숙소는 '묵기', 카페는 '가기'. */
const LABEL_TAIL = { stay: '묵기 좋은 곳', cafe: '가기 좋은 카페' } as const;
// 빌드 시점 데이터라 한 번만 센다 — 0곳 관광지 칩은 여기서 빠진다(14 W261007.9).
const LANDMARKS_BY_CARD = homePageAreaLandmarks(PLACES);
/** 등록 전 카드의 총수. 등록 뒤에는 `countByArea` 의 레벨 합과 같은 값이다. */
const TOTALS_BY_CARD = Object.fromEntries(
  AREAS.map(({ id }) => [
    id,
    {
      stay: PLACES.filter((place) => place.type === 'stay' && areaOf(place) === id).length,
      cafe: PLACES.filter((place) => place.type === 'cafe' && areaOf(place) === id).length,
    },
  ]),
) as Record<TAreaId, Record<(typeof AREA_CARD_TYPES)[number], number>>;

/** 권역 밑 줄 — 읍면 꼬리를 뗀 이름. 손으로 적으면 매핑과 갈린다. */
const townsOf = (id: TAreaId) =>
  Object.entries(TOWN_TO_AREA)
    .filter(([, area]) => area === id)
    .map(([town]) => town.replace(/(읍|면)$/, ''))
    .join('·');

const areaLabel = (id: TAreaId) => AREAS.find((area) => area.id === id)?.label ?? id;

/**
 * 홈 「두부랑 갈 동네」 — 6권역 카드(19 T4). 관광지 칩 줄(18 T2)을 대신하고, 칩은 각 카드 안으로 들어갔다.
 *
 * 카드의 "묵을 곳 n · 카페 n" 은 히어로와 같은 셈(`countByArea` → `countByLevel` 의 ok + 야외)이다. 식당은 세지 않는다(19 §1).
 * 누르면 둘러보기가 그 권역 · 숙소 탭 · '갈 수 있는 곳만' 으로 열린다(`usePlacesPageAreaEntry` 하나 — 셋을 따로 걸면 수가 갈린다).
 * 지도는 띄우지 않는다(ADR-008 — 지도 비용은 띄운 방문 수).
 *
 * 1열이다. 320px 에서 2열이면 카드 폭이 ~140px 라 수 줄과 칩이 한 글자씩 꺾인다(W261007.10 과 같은 실패).
 * 머리 줄(누르는 자리)과 칩은 형제다 — 버튼 안에 버튼을 넣지 않는다.
 */
export function HomePageAreaCards() {
  const router = useRouter();
  const dog = useDog();
  const needsIndoor = useAppStore((state) => state.needsIndoor);
  const enterArea = usePlacesPageAreaEntry();
  const enterLandmark = usePlacesPageFilterStore((state) => state.enterLandmark);
  const [suggestOpen, setSuggestOpen] = useState(false);

  const counts = useMemo(() => (dog ? countByArea(PLACES, dog, { needsIndoor }) : null), [dog, needsIndoor]);
  const dogNames = dog ? dogCallNames(dog.dogs.map((d) => d.name)) : '';
  const labelOpen = dog ? LABEL_GATES[coverageDogOf(dog)] : false;

  // 관광지 칩은 예전처럼 검색어를 걸고 숙소로 간다. 권역은 푼다(`enterLandmark`) — '서부' 안에서 '중문' 을 찾는 꼴이 되지 않게.
  const goToLandmark = (word: string) => {
    enterLandmark(word);
    router.push('/places/stay');
  };

  return (
    <section className="home-scroll-depth mt-8 px-4 md:px-6">
      <h2 className="text-lg font-bold text-primary">{dog ? `${withJosa(dogNames, '이랑/랑')} 갈 동네` : '강아지랑 갈 동네'}</h2>
      <div className="mt-3 space-y-3">
        {AREAS.map(({ id, label }) => {
          const card = counts ? homePageAreaCardCounts(counts, id) : null;
          const gap = card ? homePageAreaStayGap(card) : null;
          const nearest = gap && counts ? nearestAreaWithStay(counts, id) : null;
          const landmarks = LANDMARKS_BY_CARD[id];
          // 문턱을 넘은 칸에만 '{이름}랑 …좋은 곳' + 카드가 센 집합의 앞 3곳(19 T6). 문턱 전엔 숫자만 — '추천' 은 데이터가 보증할 때만 한다.
          const labeled = counts && dog ? AREA_CARD_TYPES.filter((type) => isAreaLabelCell(labelOpen, counts[id][type])) : [];

          return (
            <div key={id} className={cx(CARD_SURFACE, 'p-1.5')}>
              <button
                type="button"
                onClick={() => enterArea(id)}
                className="flex min-h-11 w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors active:bg-tertiary"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-1.5">
                    <span className="text-md font-bold text-primary">{label}</span>
                    <span className="text-xs text-tertiary">{townsOf(id)}</span>
                  </span>
                  <span className="mt-0.5 block text-sm text-secondary">
                    {card ? (
                      <>
                        묵을 곳 <strong className="font-bold text-primary">{card.stay.reach}</strong> · 카페{' '}
                        <strong className="font-bold text-primary">{card.cafe.reach}</strong>
                      </>
                    ) : (
                      `숙소 ${TOTALS_BY_CARD[id].stay} · 카페 ${TOTALS_BY_CARD[id].cafe}`
                    )}
                  </span>
                </span>
                <ChevronRight size={20} aria-hidden="true" className="shrink-0 text-quaternary" />
              </button>

              {labeled.map((type) => (
                <div key={type} className="px-2.5 pb-1">
                  <p className="text-xs font-semibold text-brand-secondary">
                    {withJosa(dogNames, '이랑/랑')} {LABEL_TAIL[type]}
                  </p>
                  {/* 이름만 — 소개문은 띄우지 않는다. 카드 안에서 소개가 판정과 다른 말을 할 자리를 만들지 않는다(13 §5.2 P2). */}
                  <ul className="flex flex-wrap gap-x-3">
                    {homePageAreaPicks(PLACES, dog!, id, type, { needsIndoor }).map((place) => (
                      <li key={place.id}>
                        <Link
                          href={`/place/${place.id}`}
                          className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-2 hover:underline"
                        >
                          {place.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {gap && (
                <div className="px-2.5 pb-2 text-sm text-tertiary">
                  {gap.kind === 'thin' ? (
                    <p>
                      저희가 모은 숙소 중엔 아직 {withJosa(dogNames, '이랑/랑')} 묵을 곳이 없어요.{' '}
                      <button
                        type="button"
                        onClick={() => setSuggestOpen(true)}
                        className="font-semibold text-brand-secondary underline underline-offset-2"
                      >
                        아는 곳이 있으면 알려 주세요
                      </button>
                    </p>
                  ) : (
                    <p>
                      모아 둔 숙소 {gap.total}곳 중 {withJosa(dogNames, '이/가')} 묵을 수 있는 곳은 0곳이에요.
                    </p>
                  )}
                  {nearest && (
                    <button
                      type="button"
                      onClick={() => enterArea(nearest)}
                      className="inline-flex min-h-11 items-center font-semibold text-brand-secondary"
                    >
                      가까운 {areaLabel(nearest)}엔 묵을 곳 {homePageAreaCardCounts(counts!, nearest).stay.reach}곳 →
                    </button>
                  )}
                </div>
              )}

              {landmarks.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-1 pb-1" role="group" aria-label={`${label} 관광지 근처 찾기`}>
                  {landmarks.map(({ landmark }) => (
                    <FilterChip
                      key={landmark.name}
                      pressed={false}
                      toggle={false}
                      onClick={() => goToLandmark(landmark.aliases[0])}
                      aria-label={`${landmark.name} 근처 둘러보기`}
                    >
                      {landmark.name}
                    </FilterChip>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ReportSheet
        isOpen={suggestOpen}
        onOpenChange={setSuggestOpen}
        title="여기도 강아지랑 갈 수 있어요"
        lead="가게 이름과 동네를 적어 주세요. 운영자가 찾아보고 확인되면 올릴게요."
        placeId={null}
        kinds={['suggest']}
        noteRequired
        notePlaceholder="예: 펜션 바당, 표선면"
      />
    </section>
  );
}
