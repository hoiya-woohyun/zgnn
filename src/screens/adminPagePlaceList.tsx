'use client';

import { SearchLg } from '@untitledui/icons';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '../components/base/button';
import { Input } from '../components/base/input';
import { Select } from '../components/base/select';
import { TYPE_LABEL, type TCandidateType, type TPlaceRow, type TPlaceStatus } from '../lib/adminCandidates';
import {
  countPlacesByStatus,
  matchesPlaceQuery,
  PLACE_GAP_LABEL,
  PLACE_STATUS_LABEL,
  placeGaps,
  type TArchiveReason,
  type TPlaceAddressPatch,
  type TPlaceGap,
} from '../lib/adminPlaces';
import type { TBlockChoice, TPlaceBlock } from '../lib/adminBlocks';
import type { TReportRow, TVisitedTally } from '../lib/adminReports';
import { useAdminInfiniteScroll } from './adminInfiniteScroll';
import { AdminPagePlaceRow, type TAdminPagePlaceState } from './adminPagePlaceRow';
import { ADMIN_PLACE_GRID, AdminTable } from './adminTable';

/**
 * '등록 완료' · '등록 해제' 칸 — 이미 올린 장소를 **내리고 되살린다**(소프트 삭제). 두 칸은 같은 개체(`places`)를 `status` 로 가른 것이라
 * 이 컴포넌트 하나가 `mode` 로 둘 다 그린다(09 D4).
 *
 * 왜 하드 삭제가 없나: GRANT 가 애초에 `delete` 를 주지 않는다(`20260922120000_narrow_grants.sql`) —
 * 고민의 결과가 아니라 경계가 그렇게 그어져 있다. 자세한 것은 `src/lib/adminPlaces.ts` 머리 주석.
 *
 * 목록·줄 상태·쓰기는 **`adminPage` 가 소유한다**(두 칸이 한 state 를 나눠 써야 되살리기 한 번에 두 탭 건수가 같은 틱에 움직인다).
 * 여기는 검색·걸러 보기·펼침처럼 이 칸만의 화면 상태만 든다. 대조 장부(`placesRef`)에 상태를 알리는 일도 쓰기 쪽(`adminPage`)이 한다 —
 * 같은 세션에서 방금 내린 곳에 후보가 합쳐지지 않게.
 */

/** 한 번에 더 그리는 줄 수. 줄이 얇아져(표) 20 은 PC 한 화면도 못 채운다 — 감시판이 곧바로 또 보인다. */
const PAGE_SIZE = 40;

/** 제보 없는 줄에 넘기는 빈 배열 — 줄마다 새 배열을 만들지 않게. */
const NO_REPORTS: TReportRow[] = [];

/** 앞의 다섯 열을 후보 표와 맞춘다(`adminPage.tsx` 의 `COLUMNS`) — 두 칸을 오갈 때 같은 값이 같은 자리에 있게. */
const COLUMNS = ['장소', '지역', '동반 조건', '소개', '종류', ''];

type TTypeFilter = 'all' | TCandidateType;

const TYPE_FILTERS: { key: TTypeFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  ...(['stay', 'restaurant', 'cafe', 'other'] as const).map((key) => ({ key, label: TYPE_LABEL[key] })),
];

/**
 * 빠진 정보로 좁히기 — **정리할 곳을 찾는 손잡이**다. '빠진 게 있는 곳' 은 갈래 전부의 합집합이고,
 * 갈래 하나를 고르면 그것만 본다(좌표만 한꺼번에 채우러 갈 때처럼). 내린 곳은 세지 않는다(`placeGaps` 를 줄에서 끄는 것과 같은 이유).
 */
type TGapFilter = 'all' | 'any' | TPlaceGap;

const GAP_FILTERS: { key: TGapFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'any', label: '빠진 게 있는 곳' },
  ...(Object.keys(PLACE_GAP_LABEL) as TPlaceGap[]).map((key) => ({ key, label: PLACE_GAP_LABEL[key] })),
];

const gapMatches = (key: TGapFilter, place: TPlaceRow): boolean => {
  if (key === 'all') return true;
  if (place.status === 'archived') return false;
  const gaps = placeGaps(place);
  return key === 'any' ? gaps.length > 0 : gaps.includes(key);
};

/** 등록 완료 칸 안의 구간 — 내림은 자기 칸이 생겨 여기서 빠졌다. */
type TStatusFilter = 'all' | Exclude<TPlaceStatus, 'archived'>;

const STATUS_FILTERS: { key: TStatusFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'published', label: PLACE_STATUS_LABEL.published },
  { key: 'draft', label: PLACE_STATUS_LABEL.draft },
];

type TAdminPagePlaceListProps = {
  /** `active` = 등록 완료(게시중·게시 대기), `archived` = 등록 해제. */
  mode: 'active' | 'archived';
  /** 관리 목록 전체(상태 불문) — 이 칸이 자기 몫을 가른다. */
  places: TPlaceRow[];
  states: Record<string, TAdminPagePlaceState>;
  /** 방금 한 일의 한 줄(두 칸에 같이 선다 — 줄이 다른 칸으로 옮겨 가므로 "아무 일도 안 났다" 로 보이지 않게). */
  notice?: string;
  patchState: (id: string, patch: Partial<TAdminPagePlaceState>) => void;
  onChange: (place: TPlaceRow, kind: 'archive' | 'restore', reason?: TArchiveReason, note?: string, block?: TBlockChoice) => void;
  /** 장소 id → 열린 블랙리스트. `undefined` 면 표가 없거나 못 읽었다(칩을 안 그린다). */
  blocks?: Record<string, TPlaceBlock>;
  onSetBlock: (place: TPlaceRow, choice: TBlockChoice) => void;
  /** 장소 id → 처리할 사용자 제보. 표가 없으면 빈 객체. */
  reports: Record<string, TReportRow[]>;
  onHandleReports: (place: TPlaceRow, ids: string[], status: 'handled' | 'dismissed', note: string) => void;
  /** 장소 id → 다녀왔어요 집계. */
  visited: Record<string, TVisitedTally>;
  onApplyVisited: (place: TPlaceRow, ids: string[]) => void;
  /** 주소·좌표 고치기(쓰기는 `adminPage` 의 `savePlaceAddress`). 등록 해제 칸의 줄에는 버튼이 서지 않는다. */
  onSaveAddress: (place: TPlaceRow, patch: TPlaceAddressPatch) => void;
  /** 끝난 줄의 초록 한 줄을 치운다 — 검색어·구간을 바꾸면 같이. */
  onClearDone: () => void;
};

export function AdminPagePlaceList({
  mode,
  places,
  states,
  notice,
  patchState,
  onChange,
  blocks,
  onSetBlock,
  reports,
  onHandleReports,
  visited,
  onApplyVisited,
  onSaveAddress,
  onClearDone,
}: TAdminPagePlaceListProps) {
  /** "제보 있는 곳" 만 보기 — 10 T1.4 의 걸러 보기. */
  const [reportedOnly, setReportedOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<TStatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TTypeFilter>('all');
  const [gapFilter, setGapFilter] = useState<TGapFilter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE_SIZE);
  const archivedMode = mode === 'archived';

  // 이 칸의 몫 — 정렬은 부모가 이미 한 번 했다(`sortManagedPlaces`, 내림은 `archived_at` 최신순).
  const inMode = useMemo(
    () => places.filter((place) => (place.status === 'archived') === archivedMode),
    [archivedMode, places],
  );

  /*
   * 칩 숫자는 **검색·종류·빠진 정보를 건 결과 기준**이다 — `전체 89 · 게시중 3` 처럼 숫자끼리 모순되지 않게 `all` 도 같은 집합을 센다.
   * 드롭다운 둘의 숫자는 **자기 축만 뺀** 집합에서 센다(후보 칸의 걸러 보기와 같은 어법) — 고른 값의 숫자가 곧 보이는 줄 수가 되게.
   */
  const searched = useMemo(() => inMode.filter((place) => matchesPlaceQuery(place, query)), [inMode, query]);
  const visible = useMemo(
    () =>
      searched.filter(
        (place) =>
          (typeFilter === 'all' || place.type === typeFilter) &&
          gapMatches(gapFilter, place) &&
          (!reportedOnly || (reports[place.id]?.length ?? 0) > 0),
      ),
    [gapFilter, reportedOnly, reports, searched, typeFilter],
  );
  const counts = useMemo(() => countPlacesByStatus(visible), [visible]);
  const reportedCount = inMode.filter((place) => (reports[place.id]?.length ?? 0) > 0).length;
  const inStatus = (place: TPlaceRow) => status === 'all' || place.status === status;
  const baseType = searched.filter((place) => inStatus(place) && gapMatches(gapFilter, place));
  const baseGap = searched.filter((place) => inStatus(place) && (typeFilter === 'all' || place.type === typeFilter));

  const filtered = useMemo(
    () => visible.filter((place) => status === 'all' || place.status === status),
    [status, visible],
  );

  // 검색어·구간을 바꾸면 '더 보기' 도 처음으로 — 같은 사건의 두 결과라 여기서 함께 바꾼다(후보 칸과 같은 어법).
  // 끝난 줄의 초록 한 줄도 같이 치운다.
  const clearDone = onClearDone;
  const showMore = useCallback(() => setShown((prev) => prev + PAGE_SIZE), []);
  const setSentinel = useAdminInfiniteScroll(filtered.length > shown, shown, showMore);

  const pickStatus = (next: TStatusFilter) => {
    clearDone();
    setStatus(next);
    setShown(PAGE_SIZE);
  };
  const typeQuery = (next: string) => {
    clearDone();
    setQuery(next);
    setShown(PAGE_SIZE);
  };
  const pickType = (next: TTypeFilter) => {
    clearDone();
    setTypeFilter(next);
    setShown(PAGE_SIZE);
  };
  const pickGap = (next: TGapFilter) => {
    clearDone();
    setGapFilter(next);
    setShown(PAGE_SIZE);
  };

  return (
    <div>
      {/* 검색과 걸러 보기를 한 줄에 — PC 에서는 나란히 서고 좁으면 접힌다. */}
      <div className="mt-3 flex flex-wrap items-center gap-2 px-4 md:px-6">
        <div className="w-full sm:w-64">
          <Input
            aria-label="장소 검색"
            placeholder="이름·지역·주소로 찾기"
            value={query}
            onChange={typeQuery}
            size="sm"
            icon={SearchLg}
          />
        </div>
        {!archivedMode && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="상태로 걸러 보기">
        {STATUS_FILTERS.map((entry) => {
          const count = entry.key === 'all' ? visible.length : counts[entry.key];
          const active = entry.key === status;
          return (
            <Button
              key={entry.key}
              size="sm"
              color={active ? 'primary' : 'secondary'}
              aria-pressed={active}
              onClick={() => pickStatus(entry.key)}
            >
              {entry.label} {count}
            </Button>
          );
        })}
        </div>
        )}
        {reportedCount > 0 || reportedOnly ? (
          <Button
            size="sm"
            color={reportedOnly ? 'primary' : 'secondary'}
            aria-pressed={reportedOnly}
            onClick={() => {
              clearDone();
              setReportedOnly((prev) => !prev);
              setShown(PAGE_SIZE);
            }}
          >
            제보 있는 곳 {reportedCount}
          </Button>
        ) : null}
      </div>

      {notice ? <p className="mt-2 px-4 text-xs text-success-primary md:px-6">{notice}</p> : null}

      {/* 후보 칸과 같은 드롭다운 — 종류와 빠진 정보. 상태 칩은 자주 오가는 축이라 칩으로 남긴다. */}
      <div className="mt-2 flex flex-wrap items-end gap-2 px-4 md:px-6">
        <Select
          label="종류"
          size="sm"
          className="w-36"
          selectedKey={typeFilter}
          onSelectionChange={(key) => key && pickType(key as TTypeFilter)}
        >
          {TYPE_FILTERS.map((entry) => (
            <Select.Item key={entry.key} id={entry.key}>
              {`${entry.label} ${entry.key === 'all' ? baseType.length : baseType.filter((place) => place.type === entry.key).length}`}
            </Select.Item>
          ))}
        </Select>
        {/* 내린 곳은 빠진 정보를 세지 않는다(`placeGaps`) — 등록 해제 칸에서는 이 축이 늘 0 이라 그리지 않는다. */}
        {!archivedMode && (
          <Select
            label="빠진 정보"
            size="sm"
            className="w-56"
            selectedKey={gapFilter}
            onSelectionChange={(key) => key && pickGap(key as TGapFilter)}
          >
            {GAP_FILTERS.map((entry) => (
              <Select.Item key={entry.key} id={entry.key}>
                {`${entry.label} ${baseGap.filter((place) => gapMatches(entry.key, place)).length}`}
              </Select.Item>
            ))}
          </Select>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="px-4 pt-6 text-sm text-tertiary md:px-6">
          {query
            ? '찾는 장소가 없어요.'
            : archivedMode && inMode.length === 0
              ? '등록 해제한 장소가 없어요.'
              : '걸러 보기에 맞는 장소가 없어요.'}
        </p>
      ) : (
        <>
          <div className="mt-3">
            <AdminTable grid={ADMIN_PLACE_GRID} columns={COLUMNS}>
            {filtered.slice(0, shown).map((place) => (
              <AdminPagePlaceRow
                key={place.id}
                place={place}
                state={states[place.id] ?? {}}
                expanded={expanded === place.id}
                onToggle={() => setExpanded((prev) => (prev === place.id ? null : place.id))}
                onStartArchive={() => patchState(place.id, { archiving: true, error: undefined, done: undefined })}
                onCancelArchive={() => patchState(place.id, { archiving: false, archiveReason: undefined })}
                onArchive={(reason, note, block) => onChange(place, 'archive', reason, note, block)}
                block={blocks?.[place.id]}
                blocksUnavailable={blocks === undefined}
                onStartBlock={() => patchState(place.id, { pickingBlock: true, error: undefined, done: undefined })}
                onCancelBlock={() => patchState(place.id, { pickingBlock: false })}
                onSetBlock={(choice) => onSetBlock(place, choice)}
                reports={reports[place.id] ?? NO_REPORTS}
                onHandleReports={(ids, nextStatus, note) => onHandleReports(place, ids, nextStatus, note)}
                visited={visited[place.id]}
                onApplyVisited={() => onApplyVisited(place, visited[place.id]?.ids ?? [])}
                onArchiveFromReport={() =>
                  patchState(place.id, { archiving: true, archiveReason: '폐업', error: undefined, done: undefined })
                }
                onRestore={() => onChange(place, 'restore')}
                onStartEditAddress={() => patchState(place.id, { editingAddress: true, error: undefined, done: undefined })}
                onCancelEditAddress={() => patchState(place.id, { editingAddress: false })}
                onSaveAddress={(patch) => onSaveAddress(place, patch)}
              />
            ))}
            </AdminTable>
          </div>

          {/*
            * 감시판과 남은 수를 **함께** 둔다. 저절로 이어 그리더라도 "지금 몇 개 중 몇 개를 보고 있나" 가
            * 화면에서 사라지면, 걸러 보기를 켠 목록이 끝난 것인지 아직 그리는 중인지 구분할 자리가 없다.
            */}
          <div ref={setSentinel} className="px-4 pt-3 text-xs text-tertiary md:px-6">
            {filtered.length > shown
              ? `${filtered.length}곳 중 ${shown}곳 · 스크롤하면 더 보여요`
              : `${filtered.length}곳을 모두 봤어요`}
          </div>
        </>
      )}
    </div>
  );
}
