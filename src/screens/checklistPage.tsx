'use client';

import { useMemo, useState } from 'react';
import { SearchMd } from '@untitledui/icons';
import { ChecklistPageItemRow } from './checklistPageItemRow';
import { ChecklistPageItemSheet } from './checklistPageItemSheet';
import { Button } from '../components/base/button';
import { Input } from '../components/base/input';
import { EmptyState } from '../components/layout/emptyState';
import { StickyMorphTitle } from '../components/layout/stickyMorphTitle';
import { SEARCH_FIELD } from '../components/noAutofill';
import { PawMark } from '../components/pawMark';
import { useReplay } from '../hooks/useReplay';
import { META } from '../lib/places';
import {
  CHECKLIST_FILTER_LABEL,
  checklistProgress,
  filterChecklistItems,
  type TChecklistFilter,
} from '../lib/checklist';
import { useAppStore } from '../store/useAppStore';
import { cx } from '../utils/cx';
import type { TItem } from '../types';

/** 다 챙긴 순간 진행 막대 위로 뛰어오르는 발바닥 자리(막대 길이의 백분율)와 기울기. */
const PARADE = [10, 26, 42, 58, 74, 90].map((left, index) => ({ left: `${left}%`, tilt: index % 2 ? 14 : -14 }));

const FILTERS: TChecklistFilter[] = ['all', 'unpacked', 'packed'];

/**
 * 여행 준비물 — **내 물건을 찾아 갖고 있는지 표시하는 곳**(ADR-009 v4).
 *
 * 위에서부터 진행 · 검색 · 보기 칩 · 한 줄 목록이고, 짱구누나의 글은 맨 아래로 내렸다.
 * v3 까지 있던 것 중 넷을 뺐다 — 맨 위 편지 글(목록이 화면 아래로 밀렸다), 네 묶음 머리글과 계절 칩(15개 남짓을
 * 찾는 데는 검색과 '안 챙긴 것' 이 더 빠르다), 줄 안 펼침(시트로), 저장한 숙소의 '숙소에 있어요'.
 * 장소와의 연결은 장소 쪽에만 남는다 — 장소를 열면 그곳이 이 목록을 읽어 "여기 필요한 것" 을 보여준다(`PlaceItemsNote`).
 */
export function ChecklistPage() {
  const checkedItemIds = useAppStore((state) => state.checkedItemIds);
  const toggleChecked = useAppStore((state) => state.toggleChecked);

  const progress = useMemo(() => checklistProgress(checkedItemIds), [checkedItemIds]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<TChecklistFilter>('all');
  const shown = useMemo(
    () => filterChecklistItems(progress.items, query, filter, checkedItemIds),
    [progress.items, query, filter, checkedItemIds],
  );

  // 시트는 닫히는 애니메이션 동안에도 내용을 그려야 해서, 연 항목(`detailItem`)과 열림(`detailOpen`)을 따로 든다.
  const [detailItem, setDetailItem] = useState<TItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // 이스터에그 — 마지막 하나를 챙기는 순간 막대 위로 발바닥이 차례로 뛰어오른다. 누른 순간에만 판단한다: 다 챙긴 목록으로
  // 돌아온 사람에게는 아무 일도 없다(체크 목록은 마운트 뒤에 읽어 오므로 상태를 보고 틀면 들어올 때마다 뛴다).
  const [parade, replayParade] = useReplay();

  const percent = progress.total > 0 ? Math.round((progress.packed / progress.total) * 100) : 0;
  const trailing = `${progress.packed}/${progress.total} 챙김`;
  const trimmedQuery = query.trim();

  const renderRow = (item: TItem) => {
    const checked = checkedItemIds.includes(item.id);
    return (
      <ChecklistPageItemRow
        key={item.id}
        item={item}
        checked={checked}
        onToggleChecked={() => {
          if (!checked && progress.packed + 1 === progress.total) replayParade();
          toggleChecked(item.id);
        }}
        onOpenDetail={() => {
          setDetailItem(item);
          setDetailOpen(true);
        }}
      />
    );
  };

  return (
    <div>
      {/* 제목이 곧 헤더다 — 스크롤하면 같이 올라가다 상단에 붙고, 스크롤한 만큼 헤더로 접힌다.
          접힌 헤더 오른쪽의 요약과 진행 막대가 "몇 개 남았더라" 를 맨 위로 되올라가지 않고 답한다. */}
      <StickyMorphTitle title="여행 준비물" trailing={trailing} percent={percent} />

      <div className="px-4 md:px-6">
        <p className="text-sm text-tertiary">
          {progress.total}가지 중 {progress.packed}가지 챙겼어요
        </p>
        {/* 막대를 감싸는 상자 — 다 챙긴 순간의 발바닥(PARADE)이 막대 밖으로 뛰어오르게 `overflow-hidden` 바깥에 선다.
            진행률은 위 문장이 이미 말하므로 막대는 장식이다(aria-hidden). */}
        <div className="relative mt-2">
          <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-tertiary">
            <div
              className="h-full rounded-full bg-brand-solid transition-[width] duration-300 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
          {parade > 0 && (
            <span
              key={parade}
              aria-hidden="true"
              className="motion-paw-parade pointer-events-none absolute inset-x-0 bottom-0 text-brand-secondary"
            >
              {PARADE.map((paw, index) => (
                <span key={paw.left} style={{ left: paw.left, bottom: 0, ['--i' as string]: index, ['--tilt' as string]: `${paw.tilt}deg` }}>
                  <PawMark className="block size-4 -translate-x-1/2" />
                </span>
              ))}
            </span>
          )}
        </div>

        <Input
          aria-label="준비물 검색"
          {...SEARCH_FIELD}
          icon={SearchMd}
          placeholder="준비물 검색"
          value={query}
          onChange={setQuery}
          className="mt-4"
          /* lg 프리셋은 input 자체가 44px 다 — 둘러보기 검색칸과 같은 이유(placesPage.tsx). */
          size="lg"
        />

        {/* 탭이 아니라 세그먼트 컨트롤이다(짝이 되는 패널이 없다) — aria-pressed 버튼 그룹. 어법은 둘러보기 종류 칩과 같다. */}
        <div className="mt-3 flex gap-2" role="group" aria-label="보기">
          {FILTERS.map((value) => {
            const active = filter === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                aria-pressed={active}
                className={cx(
                  'h-11 cursor-pointer rounded-xl px-4 text-sm font-semibold transition-colors',
                  'outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2',
                  active ? 'bg-brand-primary text-brand-secondary' : 'bg-tertiary text-secondary hover:bg-quaternary',
                )}
              >
                {CHECKLIST_FILTER_LABEL[value]}
              </button>
            );
          })}
        </div>
      </div>

      {shown.length > 0 ? (
        <ul className="mt-4 space-y-2 px-4 md:px-6">{shown.map(renderRow)}</ul>
      ) : (
        <div className="mt-4 px-4 md:px-6">
          {trimmedQuery ? (
            <EmptyState
              Icon={SearchMd}
              title={`'${trimmedQuery}'에 맞는 준비물이 없어요`}
              description={filter === 'all' ? undefined : `${CHECKLIST_FILTER_LABEL[filter]} 안에서 찾았어요.`}
              action={
                <Button color="secondary" size="md" onClick={() => setQuery('')}>
                  검색 지우기
                </Button>
              }
            />
          ) : (
            <EmptyState
              Icon={SearchMd}
              title={filter === 'packed' ? '아직 챙긴 준비물이 없어요' : '다 챙겼어요'}
            />
          )}
        </div>
      )}

      {/* 짱구누나의 글 — 맨 위에 있을 땐 목록을 화면 아래로 밀었다. 다 훑고 난 자리에서 읽히게 끝에 둔다. */}
      <footer className="mt-10 space-y-3 px-4 pb-8 md:px-6">
        <h2 className="text-sm font-bold text-secondary">{META.author}의 한마디</h2>
        <p className="text-sm whitespace-pre-line text-tertiary">{META.itemsIntro}</p>
        <p className="text-sm text-tertiary">{META.itemsAdvice}</p>
      </footer>

      <ChecklistPageItemSheet item={detailItem} isOpen={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  );
}
