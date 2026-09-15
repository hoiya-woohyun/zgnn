import { useState } from 'react';
import { ChevronDown, LinkExternal01 } from '@untitledui/icons';
import { useChecklistAmenities } from './useChecklistAmenities';
import { Badge } from '../components/base/badges';
import { Button } from '../components/base/button';
import { Checkbox } from '../components/base/checkbox';
import { PageHeader } from '../components/layout/pageHeader';
import { Section } from '../components/layout/section';
import { META } from '../lib/places';
import { checklistProgress } from '../lib/checklist';
import { linkLabel } from '../lib/format';
import { cx } from '../utils/cx';
import { useAppStore, type TSeasonFilter } from '../store/useAppStore';

const SEASON_CHIPS: { label: string; value: TSeasonFilter }[] = [
  { label: '사계절', value: null },
  { label: '여름', value: '여름' },
  { label: '겨울', value: '겨울' },
];

export function ChecklistPage() {
  const season = useAppStore((state) => state.season);
  const setSeason = useAppStore((state) => state.setSeason);
  const checkedItemIds = useAppStore((state) => state.checkedItemIds);
  const toggleChecked = useAppStore((state) => state.toggleChecked);
  const { allStays, savedStays, selected, providedItemIds, setAmenityStayId } = useChecklistAmenities();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { items, total, checked: checkedCount } = checklistProgress(season, checkedItemIds);

  return (
    <div>
      <PageHeader
        title="여행 준비물"
        description={<span className="whitespace-pre-line">{META.itemsIntro}</span>}
      />

      <div className="px-4 pt-4 md:px-6">
        {/*
          계절은 탭이 아니라 아래 한 목록을 걸러내는 세그먼트 컨트롤이다.

          처음엔 react-aria Tabs 로 만들었는데, 탭에는 짝이 되는 패널이 있어야 한다.
          패널 없이 TabList 만 쓰면 고른 탭에 aria-controls 가 붙은 채 그 id 를 가진
          요소가 화면에 없어서, 보조기술이 존재하지 않는 영역을 가리키게 된다.
          걸러내는 버튼은 aria-pressed 로 눌림 상태만 말하면 충분하다.
        */}
        <div className="flex gap-2" role="group" aria-label="계절">
          {SEASON_CHIPS.map((chip) => {
            const active = season === chip.value;
            return (
              <button
                key={chip.label}
                type="button"
                onClick={() => setSeason(chip.value)}
                aria-pressed={active}
                className={cx(
                  'h-11 rounded-lg px-4 text-sm font-semibold transition-colors',
                  active
                    ? 'bg-brand-primary text-brand-secondary'
                    : 'text-tertiary hover:bg-secondary',
                )}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        <p className="mt-3 text-sm text-tertiary">
          {total}가지 중 {checkedCount}가지 챙겼어요
        </p>
      </div>

      <Section title="숙소 용품 반영" className="mt-6">
        <div className="rounded-2xl border border-secondary bg-primary p-4">
          <p className="text-sm text-tertiary">
            묵을 숙소를 고르면 그 숙소에 있는 물건은 흐리게 표시돼요.
          </p>
          <label className="mt-3 block">
            <span className="sr-only">숙소 선택</span>
            <select
              value={selected?.id ?? ''}
              onChange={(event) => setAmenityStayId(event.target.value || null)}
              className="h-11 w-full rounded-lg border border-primary bg-primary px-3 text-sm font-semibold text-primary shadow-xs outline-hidden focus:ring-2 focus:ring-brand"
            >
              <option value="">숙소를 고르지 않음</option>
              {/* 저장한 숙소는 찾기 쉽게 위로 올려 두기만 한다. 아래 전체 목록에도 그대로 남는다. */}
              {savedStays.length > 0 && (
                <optgroup label="저장한 숙소">
                  {savedStays.map((stay) => (
                    <option key={`saved-${stay.id}`} value={stay.id}>
                      {stay.name} ({stay.region.town})
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="모든 숙소">
                {allStays.map((stay) => (
                  <option key={stay.id} value={stay.id}>
                    {stay.name} ({stay.region.town})
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          {selected?.stay &&
            (providedItemIds.size > 0 ? (
              <p className="mt-3 text-sm text-secondary">
                <span className="font-semibold">구비 용품</span> {selected.stay.amenitiesText}
              </p>
            ) : (
              // 26곳 중 23곳이 '기본적인 용품 구비.' 처럼 뭉뚱그려 적혀 있다.
              // 아무 일도 일어나지 않은 것처럼 두지 않고, 왜 반영이 안 되는지 그대로 말한다.
              <p className="mt-3 text-sm text-tertiary">
                이 숙소는 '{selected.stay.amenitiesText}' 로만 적혀 있어 반영할 항목이 없어요.
              </p>
            ))}
        </div>
      </Section>

      <ul className="mt-6 space-y-2 px-4 md:px-6">
        {items.map((item) => {
          const checked = checkedItemIds.includes(item.id);
          const provided = providedItemIds.has(item.id);
          const expanded = expandedId === item.id;

          return (
            <li
              key={item.id}
              className={cx('rounded-2xl border border-secondary bg-primary', provided && 'opacity-65')}
            >
              <div className="flex items-center gap-1 p-2">
                <Checkbox
                  size="md"
                  aria-label={`${item.name} 챙김`}
                  isSelected={checked}
                  onChange={() => toggleChecked(item.id)}
                  className="h-11 w-11 items-center justify-center"
                />

                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : item.id)}
                  aria-expanded={expanded}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 text-left"
                >
                  {/* item.emoji 는 데이터 콘텐츠라 장식용 이모지 금지 규칙의 예외로 그대로 보여준다. */}
                  <span className="text-xl" aria-hidden="true">
                    {item.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cx(
                        'block text-sm font-semibold',
                        checked ? 'text-tertiary line-through' : 'text-primary',
                      )}
                    >
                      {item.name}
                    </span>
                    {provided && (
                      <Badge size="sm" color="success" className="mt-1">
                        숙소에 있어요
                      </Badge>
                    )}
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className={cx(
                      'size-5 shrink-0 text-tertiary transition-transform',
                      expanded && 'rotate-180',
                    )}
                  />
                </button>
              </div>

              {expanded && (
                <div className="border-t border-secondary px-3 py-3">
                  {item.reason && <p className="text-sm text-secondary">{item.reason}</p>}
                  {item.linkUrl && (
                    <Button
                      href={item.linkUrl}
                      target="_blank"
                      rel="noreferrer"
                      color="tertiary"
                      size="sm"
                      iconTrailing={LinkExternal01}
                      className={cx('h-11 w-full', item.reason ? 'mt-3' : 'mt-0')}
                    >
                      {linkLabel(item.linkUrl)}
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <footer className="mt-8 space-y-3 px-4 pb-8 md:px-6">
        <p className="rounded-2xl border border-secondary bg-primary p-4 text-sm text-secondary">
          {META.itemsAdvice}
        </p>
        <p className="text-xs text-tertiary">{META.disclosure}</p>
      </footer>
    </div>
  );
}
