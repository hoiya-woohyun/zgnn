'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from '@untitledui/icons';
import { ChecklistPageGroupList } from './checklistPageGroupList';
import { ChecklistPageItemRow } from './checklistPageItemRow';
import { CollapsingTitleBar } from '../components/layout/collapsingTitleBar';
import { PageHeader } from '../components/layout/pageHeader';
import { SeasonChips } from '../components/seasonChips';
import { META } from '../lib/places';
import { checklistView } from '../lib/checklist';
import { ITEM_GROUP_LABEL, groupItems, groupOfItem } from '../lib/itemGroups';
import { cx } from '../utils/cx';
import { useAppStore, useSavedPlaces } from '../store/useAppStore';
import type { TItem } from '../types';

/** 저장한 곳과 무관하게 필요한 묶음. 섹션으로 따로 빼 맨 위에 둔다 — 아래 주석 참고. */
const isTravelItem = (item: TItem) => groupOfItem(item) === 'travel';

export function ChecklistPage() {
  const season = useAppStore((state) => state.season);
  const setSeason = useAppStore((state) => state.setSeason);
  const checkedItemIds = useAppStore((state) => state.checkedItemIds);
  const toggleChecked = useAppStore((state) => state.toggleChecked);
  const savedPlaces = useSavedPlaces();

  const view = useMemo(
    () => checklistView(season, checkedItemIds, savedPlaces),
    [season, checkedItemIds, savedPlaces],
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [restOpen, setRestOpen] = useState(false);

  const savedStays = savedPlaces.filter((place) => place.type === 'stay');

  /*
    '오가는 길에'(기내용 가방·유모차)만 따로 떼어 맨 위 섹션으로 올린다.

    이 묶음은 장소 규칙이 없어서 — 비행기와 차의 물건이지 숙소·식당의 물건이 아니다 —
    저장한 곳이 아무리 많아도 '저장한 N곳에 필요해요' 에 들어가지 못하고, 늘 접혀 있는
    '그 밖에' 아래로 떨어진다. 제주로 가는 사람에게 기내용 가방이 접힌 채 묻히는 것은
    순서가 거꾸로다. 그래서 여기서만 묶음 하나를 섹션으로 승격시킨다.
  */
  const travelItems = useMemo(
    () => [...view.tripItems, ...view.restItems].filter(isTravelItem),
    [view.tripItems, view.restItems],
  );
  const tripGroups = useMemo(
    () => groupItems(view.tripItems.filter((item) => !isTravelItem(item))),
    [view.tripItems],
  );
  const restGroups = useMemo(
    () => groupItems(view.restItems.filter((item) => !isTravelItem(item))),
    [view.restItems],
  );
  const restCount = restGroups.reduce((sum, group) => sum + group.items.length, 0);

  const percent = view.total > 0 ? Math.round((view.ready / view.total) * 100) : 0;

  const renderRow = (item: TItem) => (
    <ChecklistPageItemRow
      key={item.id}
      item={item}
      checked={checkedItemIds.includes(item.id)}
      provided={view.providedItemIds.has(item.id)}
      expanded={expandedId === item.id}
      onToggleChecked={() => toggleChecked(item.id)}
      onToggleExpanded={() => setExpandedId(expandedId === item.id ? null : item.id)}
    />
  );

  return (
    <div>
      {/* 제목·계절·진행률이 한 덩어리라 통째로 감싼다 — 이 덩어리가 화면 밖으로 나가는
          순간이 축약 줄이 대신 나서는 지점이다. 준비물은 목록이 길어 아래에서 "몇 개
          남았더라" 를 확인하려면 맨 위까지 되올라가야 했다. */}
      <CollapsingTitleBar
        title="여행 준비물"
        trailing={`${view.ready}/${view.total} 준비됨`}
        percent={percent}
      >
        <PageHeader
          title="여행 준비물"
          description={<span className="whitespace-pre-line">{META.itemsIntro}</span>}
        />

        <div className="px-4 pt-4 md:px-6">
          <SeasonChips value={season} onSelect={setSeason} label="계절" />

          <p className="mt-3 text-sm text-tertiary">
            {view.scopedToTrip && '저장한 곳 기준 '}
            {view.total}가지 중 {view.ready}가지 준비됐어요
          </p>
          {/*
            숫자 옆에 막대를 하나 둔다. "12가지 중 4가지" 는 읽어서 비율로 옮겨야 알지만,
            막대는 눈이 먼저 안다. 진행률은 위 문장이 이미 말하므로 막대는 장식이다(aria-hidden).
          */}
          <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-tertiary">
            <div
              className="h-full rounded-full bg-brand-solid transition-[width] duration-300 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </CollapsingTitleBar>

      {travelItems.length > 0 && (
        <section className="mt-6 px-4 md:px-6">
          <h2 className="text-lg font-bold text-primary">{ITEM_GROUP_LABEL.travel}</h2>
          <p className="mt-0.5 text-sm text-tertiary">
            비행기와 차에서 쓰는 것이라, 어디를 저장했든 똑같이 필요해요.
          </p>
          <ul className="mt-3 space-y-2">{travelItems.map(renderRow)}</ul>
        </section>
      )}

      {view.scopedToTrip ? (
        <section className="mt-6 px-4 md:px-6">
          {/*
            '이번 여행' 이라고 부르지 않는다 — 다른 화면은 모두 같은 하트를 '저장' 이라 부르는데 여기서만
            이름이 달라, 이 목록이 내가 누른 하트에서 나온다는 인과가 끊겼다. 제목에 개수를 걸어
            하트를 누르면 여기가 바뀐다는 것을 보이게 한다.
          */}
          <h2 className="text-lg font-bold text-primary">저장한 {savedPlaces.length}곳에 필요해요</h2>
          <p className="mt-0.5 text-sm text-tertiary">
            하트로 저장한 곳을 기준으로 골랐어요. 저장을 바꾸면 이 목록도 바뀌어요.
            {/*
              숙소 선택 셀렉트를 없앴다 — 이미 하트로 저장해 둔 숙소를 준비물 화면에서 또
              고르게 하는 것이 이 화면에서 가장 번거로운 단계였다. 대신 저장한 숙소 전부의
              구비 용품을 자동으로 반영한다.
            */}
            {view.providedItemIds.size > 0 && ' 저장한 숙소에 있는 물건은 흐리게 표시했어요.'}
          </p>
          {savedStays.length > 0 && view.providedItemIds.size === 0 && (
            // 26곳 중 23곳이 '기본적인 용품 구비.' 처럼 뭉뚱그려 적혀 있다.
            // 아무 일도 일어나지 않은 것처럼 두지 않고, 왜 반영이 안 되는지 그대로 말한다.
            <p className="mt-1 text-sm text-tertiary">
              저장한 숙소는 구비 용품이 뭉뚱그려 적혀 있어 반영할 항목이 없어요.
            </p>
          )}
          <div className="mt-3">
            <ChecklistPageGroupList groups={tripGroups} renderRow={renderRow} />
          </div>
        </section>
      ) : (
        <section className="mt-6 px-4 md:px-6">
          {/* 저장한 곳이 없으면 좁힐 근거가 없어 전체를 보여준다. 대신 좁히는 법을 알려준다. */}
          <Link
            href="/places/stay"
            className="block rounded-2xl border border-secondary bg-primary p-4 transition-colors hover:bg-secondary"
          >
            <p className="text-sm font-bold text-primary">갈 곳을 저장해 보세요</p>
            <p className="mt-0.5 text-sm text-tertiary">
              저장한 곳이 있으면 거기에 필요한 준비물만 모아 드려요.
            </p>
          </Link>
        </section>
      )}

      {restCount > 0 && (
        <section className="mt-6 px-4 md:px-6">
          {view.scopedToTrip ? (
            <>
              <button
                type="button"
                onClick={() => setRestOpen(!restOpen)}
                aria-expanded={restOpen}
                className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg text-left"
              >
                <span className="text-lg font-bold text-primary">
                  그 밖에 챙기면 좋아요 {restCount}가지
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={cx(
                    'size-5 shrink-0 text-tertiary transition-transform duration-200',
                    restOpen && 'rotate-180',
                  )}
                />
              </button>
              <div
                className={cx(
                  'grid transition-[grid-template-rows] duration-200 ease-out',
                  restOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                )}
              >
                <div className="overflow-hidden">
                  <div className="pt-3">
                    <ChecklistPageGroupList groups={restGroups} renderRow={renderRow} />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <ChecklistPageGroupList groups={restGroups} renderRow={renderRow} />
          )}
        </section>
      )}

      <footer className="mt-8 space-y-3 px-4 pb-8 md:px-6">
        <p className="rounded-2xl border border-secondary bg-primary p-4 text-sm text-secondary">
          {META.itemsAdvice}
        </p>
        <p className="text-xs text-tertiary">{META.disclosure}</p>
      </footer>
    </div>
  );
}
