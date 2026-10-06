'use client';

import { useMemo, useState } from 'react';
import { ChecklistPageItemRow } from './checklistPageItemRow';
import { StickyMorphTitle } from '../components/layout/stickyMorphTitle';
import { SeasonChips } from '../components/seasonChips';
import { META } from '../lib/places';
import { checklistView } from '../lib/checklist';
import { ITEM_GROUP_HINT, groupItems } from '../lib/itemGroups';
import { useAppStore, useSavedPlaces } from '../store/useAppStore';
import type { TItem } from '../types';

/**
 * 여행 준비물 — 짐 싸는 목록.
 *
 * **목록은 저장한 곳에 따라 좁혀지지 않는다**(ADR-009 v3). 예전에는 하트로 저장한 곳에 필요한 것만
 * 위로 올리고 나머지를 '그 밖에' 로 접었고, 저장한 곳이 없으면 "갈 곳을 저장해 보세요" 로
 * 둘러보기에 보냈다. 짐을 싸러 온 사람을 장소 찾기로 되돌려 보내는 흐름이었고, 숙소를 아직
 * 안 골랐을 뿐인 사람에게 이불을 '필요 없는 것' 처럼 접어 보였다.
 *
 * 이제 순서가 반대다 — 여기서 짐 목록을 한 번 채우고, 장소를 열면 그 장소가 이 목록을 읽어
 * "여기 필요한 것" 을 보여준다(`PlaceItemsNote`). 이 화면에서 장소로 가는 길은 없다.
 */
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
  const groups = useMemo(() => groupItems(view.items), [view.items]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const savedStayCount = savedPlaces.filter((place) => place.type === 'stay').length;
  const isReady = (item: TItem) => checkedItemIds.includes(item.id) || view.providedItemIds.has(item.id);

  // 막대는 "더 챙길 게 없는 몫"(챙김 + 숙소에 있음)으로 차고, 그 안에서 두 몫을 다른 색으로 가른다.
  // 숫자는 둘을 따로 말한다(07 U6) — 합친 숫자 하나는 숙소 물건을 내가 챙긴 것처럼 읽혔다.
  const percent = view.total > 0 ? Math.round((view.ready / view.total) * 100) : 0;
  const progressText =
    view.atStay > 0
      ? `${view.total}가지 중 ${view.packed}가지 챙겼고, ${view.atStay}가지는 숙소에 있어요`
      : `${view.total}가지 중 ${view.packed}가지 챙겼어요`;
  const trailing = `${view.packed}/${view.total} 챙김${view.atStay > 0 ? ` · 숙소 ${view.atStay}` : ''}`;

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
      {/* 제목이 곧 헤더다 — 스크롤하면 같이 올라가다 상단에 붙고, 스크롤한 만큼 헤더로 접힌다.
          준비물은 목록이 길어 아래에서 "몇 개 남았더라" 를 확인하려면 맨 위까지 되올라가야 했다 —
          접힌 헤더 오른쪽의 요약과 진행 막대가 그 자리를 대신한다. */}
      <StickyMorphTitle title="여행 준비물" trailing={trailing} percent={percent} />

      {/* 제목 줄 바로 밑에서 시작한다 — 제목이 줄 바닥에 앉아 있어 PageHeader 때의 간격(mt-1)이 그대로 난다. */}
      <p className="px-4 text-sm whitespace-pre-line text-tertiary md:px-6">{META.itemsIntro}</p>
      {/* 제휴 링크가 대부분이라 고지는 링크가 나오는 이 목록의 머리에 둔다 — 맨 아래 작은 글씨는 링크와 너무 멀다. */}
      <p className="mt-2 px-4 text-sm text-tertiary md:px-6">{META.disclosure}</p>

      <div>
        <div className="px-4 pt-4 md:px-6">
          <SeasonChips value={season} onSelect={setSeason} label="계절" />

          <p className="mt-3 text-sm text-tertiary">{progressText}</p>
          {/*
            숫자 옆에 막대를 하나 둔다. "12가지 중 4가지" 는 읽어서 비율로 옮겨야 알지만,
            막대는 눈이 먼저 안다. 진행률은 위 문장이 이미 말하므로 막대는 장식이다(aria-hidden).
            두 겹이다 — 바깥(옅은 색)이 숙소 몫까지 찬 길이, 안쪽(진한 색)이 내가 챙긴 길이.
          */}
          <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-tertiary">
            <div
              className="relative h-full rounded-full bg-brand-secondary transition-[width] duration-300 ease-out"
              style={{ width: `${percent}%` }}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-brand-solid transition-[width] duration-300 ease-out"
                style={{ width: view.ready > 0 ? `${(view.packed / view.ready) * 100}%` : '0%' }}
              />
            </div>
          </div>

          {/*
            이 화면과 장소 화면의 관계를 한 번 말해 둔다 — 여기가 원본이고 장소는 읽는 쪽이다.
            예전의 "갈 곳을 저장해 보세요" 카드 자리다. 장소로 보내지 않고, 장소에서 무엇이 보일지만 알린다.
          */}
          <p className="mt-3 text-sm text-tertiary">
            장소를 열면 그곳에 필요한 준비물을 이 목록에서 골라 보여드려요.
            {/*
              저장한 숙소 전부의 구비 용품을 자동으로 반영한다 — 숙소 선택 셀렉트는 ADR-009 v1 에서 없앴다.
              26곳 중 23곳이 '기본적인 용품 구비.' 처럼 뭉뚱그려 적혀 있어 반영할 것이 없는 경우가 많은데,
              아무 일도 일어나지 않은 것처럼 두지 않고 왜 반영이 안 되는지 그대로 말한다.
            */}
            {view.providedItemIds.size > 0 && ' 저장한 숙소에 있는 물건은 흐리게 표시했어요.'}
            {savedStayCount > 0 &&
              view.providedItemIds.size === 0 &&
              ' 저장한 숙소는 구비 용품이 뭉뚱그려 적혀 있어 반영할 항목이 없어요.'}
          </p>
        </div>
      </div>

      {/*
        묶음이 곧 섹션이다 — 오가는 길에 → 어디를 가든 → 식당·카페에서 → 숙소에서, 여행의 시간 순서.
        머리글 오른쪽의 "2/3" 은 "숙소 것은 다 챙겼나" 를 목록을 훑지 않고 답하려고 둔다.
      */}
      {groups.map((group) => {
        const groupReady = group.items.filter(isReady).length;
        return (
          <section key={group.id} className="mt-6 px-4 md:px-6" aria-labelledby={`items-${group.id}`}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 id={`items-${group.id}`} className="text-lg font-bold text-primary">
                {group.label}
              </h2>
              <span className="shrink-0 text-sm font-semibold text-tertiary">
                {groupReady}/{group.items.length}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-tertiary">{ITEM_GROUP_HINT[group.id]}</p>
            <ul className="mt-3 space-y-2">{group.items.map(renderRow)}</ul>
          </section>
        );
      })}

      <footer className="mt-8 space-y-3 px-4 pb-8 md:px-6">
        <p className="text-sm text-secondary">
          {META.itemsAdvice}
        </p>
      </footer>
    </div>
  );
}
