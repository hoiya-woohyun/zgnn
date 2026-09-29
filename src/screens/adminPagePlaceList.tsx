'use client';

import { SearchLg } from '@untitledui/icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Button } from '../components/base/button';
import { Input } from '../components/base/input';
import type { TPlaceRow, TPlaceStatus } from '../lib/adminCandidates';
import {
  archivePlace,
  countPlacesByStatus,
  fetchManagedPlaces,
  matchesPlaceQuery,
  PLACE_STATUS_LABEL,
  restorePlace,
  sortManagedPlaces,
  type TArchiveReason,
} from '../lib/adminPlaces';
import { AdminPagePlaceRow, type TAdminPagePlaceState } from './adminPagePlaceRow';

/**
 * '올린 장소' 칸 — 이미 사이트에 있는 장소를 **내리고 되살린다**(소프트 삭제). 후보를 올리는 칸과 형제다.
 *
 * 왜 하드 삭제가 없나: GRANT 가 애초에 `delete` 를 주지 않는다(`20260922120000_narrow_grants.sql`) —
 * 고민의 결과가 아니라 경계가 그렇게 그어져 있다. 자세한 것은 `src/lib/adminPlaces.ts` 머리 주석.
 *
 * 목록을 **여기서 따로 읽는다.** `adminPage` 가 들고 있는 `placesRef` 를 그대로 쓰지 않는 이유가 있다 —
 * 그 배열은 `approveGroup` 이 제자리에서 고치는 대조 장부(ref)라, 같은 객체를 state 로 그리면 승인 한 번이
 * 리렌더 없이 이 목록의 내용을 바꿔 놓는다. 쓰기 뒤에는 `onPlaceChanged` 로 그 장부에도 상태를 알려 준다 —
 * 같은 세션에서 방금 내린 곳에 후보가 합쳐지지 않게.
 */

const PAGE_SIZE = 20;

type TStatusFilter = 'all' | TPlaceStatus;

const STATUS_FILTERS: { key: TStatusFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'published', label: PLACE_STATUS_LABEL.published },
  { key: 'archived', label: PLACE_STATUS_LABEL.archived },
  { key: 'draft', label: PLACE_STATUS_LABEL.draft },
];

type TAdminPagePlaceListProps = {
  /**
   * 클라이언트를 **함수로** 받는다. `adminPage` 가 그것을 ref 에 들고 있어서인데(세션이 바뀌면 새로 만든다),
   * ref 는 렌더 중에 읽을 수 없다(react-hooks/refs). 값 대신 읽는 법을 넘기면 읽는 시점이 효과·콜백 안으로 미뤄진다.
   */
  getClient: () => SupabaseClient | null;
  /** 쓰기를 시작해도 되는가(세션 살아 있음 + 다른 쓰기 없음). 실패 사유는 `report` 로 온다 — 소유자는 `adminPage`. */
  beginWrite: (report: (message: string) => void) => boolean;
  endWrite: () => void;
  /** 쓰기가 성공했다 — `adminPage` 가 재빌드 기록을 다시 읽는다. */
  onWritten: () => void;
  /** 대조 장부(`placesRef`)의 같은 행에도 바뀐 상태를 반영한다. */
  onPlaceChanged: (place: TPlaceRow) => void;
};

const messageOf = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

export function AdminPagePlaceList({
  getClient,
  beginWrite,
  endWrite,
  onWritten,
  onPlaceChanged,
}: TAdminPagePlaceListProps) {
  const [places, setPlaces] = useState<TPlaceRow[] | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [states, setStates] = useState<Record<string, TAdminPagePlaceState>>({});
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<TStatusFilter>('all');
  const [shown, setShown] = useState(PAGE_SIZE);

  /**
   * 목록을 읽는다. **먼저 await 하고 그 뒤에 state 를 만진다** — 효과 안에서 동기적으로 setState 하면
   * 리렌더가 연쇄한다(react-hooks/set-state-in-effect). `adminPage` 의 마운트 효과와 같은 모양이다.
   */
  const load = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    try {
      const rows = await fetchManagedPlaces(client);
      setFatal(null);
      setPlaces(rows);
    } catch (error) {
      setFatal(messageOf(error, '장소 목록을 불러오지 못했어요.'));
      setPlaces(null);
    }
  }, [getClient]);

  /*
   * 효과 본문이 아니라 async 안에서 부른다 — `adminPage` 의 마운트 효과와 같은 장치다(react-hooks/set-state-in-effect).
   * 칸을 처음 열 때 한 번 읽고, 다시 읽는 길은 오류 화면의 '다시 시도' 뿐이다(목록이 스스로 폴링하지 않는다).
   */
  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const patchState = useCallback((id: string, patch: Partial<TAdminPagePlaceState>) => {
    setStates((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  /**
   * 내리기·되살리기는 한 함수로 둔다 — 순서와 실패 처리가 글자까지 같고, 다른 것은 부르는 쓰기 하나와 문구뿐이다.
   * 갈라 두면 한쪽에만 `endWrite` 를 빼먹는 날이 온다(그러면 그 뒤 모든 버튼이 "다른 묶음을 처리하고 있어요" 가 된다).
   */
  const change = useCallback(
    async (place: TPlaceRow, kind: 'archive' | 'restore', reason?: TArchiveReason, note?: string) => {
      const client = getClient();
      if (!client) return;
      if (!beginWrite((message) => patchState(place.id, { error: message }))) return;
      patchState(place.id, { busy: kind === 'archive' ? 'archiving' : 'restoring', error: undefined });
      try {
        const nowIso = new Date().toISOString();
        const updated =
          kind === 'archive'
            ? await archivePlace(client, place, { nowIso, reason, note })
            : await restorePlace(client, place, { nowIso, note });
        // 목록에서 지우지 않는다 — 내린 곳도 이 목록의 일부고(되살리려면 보여야 한다) 정렬만 바뀐다.
        setPlaces((prev) => (prev ? sortManagedPlaces(prev.map((row) => (row.id === updated.id ? updated : row))) : prev));
        onPlaceChanged(updated);
        patchState(place.id, {
          busy: undefined,
          archiving: false,
          done:
            kind === 'archive'
              ? '내렸어요 · 다음 빌드부터 사이트에서 사라져요'
              : '되살렸어요 · 다음 빌드부터 사이트에 보여요',
        });
        onWritten();
      } catch (error) {
        patchState(place.id, { busy: undefined, error: messageOf(error, '바꾸지 못했어요.') });
      } finally {
        endWrite();
      }
    },
    [beginWrite, endWrite, getClient, onPlaceChanged, onWritten, patchState],
  );

  const counts = useMemo(() => countPlacesByStatus(places ?? []), [places]);

  /*
   * 방금 바꾼 줄은 **구간을 벗어나도 한 번은 남긴다**(`states[id]?.done`). '내림' 칩을 켜 둔 채 되살리면
   * 그 줄은 곧바로 이 필터를 벗어나 사라지는데, 그러면 방금 쓴 "되살렸어요" 를 아무도 못 본다 —
   * "눌렀는데 아무 일도 안 났다" 가 된다(내림 칩은 되살릴 곳을 찾는 주 경로라 이 조합이 가장 흔하다).
   * 칩·검색어를 다시 건드리면 그 예외도 함께 치운다.
   */
  const filtered = useMemo(
    () =>
      (places ?? []).filter(
        (place) =>
          (status === 'all' || place.status === status || Boolean(states[place.id]?.done)) &&
          matchesPlaceQuery(place, query),
      ),
    [places, query, states, status],
  );

  // 검색어·구간을 바꾸면 '더 보기' 도 처음으로 — 같은 사건의 두 결과라 여기서 함께 바꾼다(후보 칸과 같은 어법).
  // 끝난 줄의 초록 한 줄도 같이 치운다(위 `filtered` 의 예외를 여기서 닫는다).
  const clearDone = () =>
    setStates((prev) =>
      Object.fromEntries(Object.entries(prev).map(([id, state]) => [id, { ...state, done: undefined }])),
    );
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

  if (fatal) {
    return (
      <div className="px-4 pt-6 md:px-6">
        <p className="text-sm text-error-primary">{fatal}</p>
        <Button
          color="primary"
          size="lg"
          className="mt-4"
          onClick={() => {
            setFatal(null);
            void load();
          }}
        >
          다시 시도
        </Button>
      </div>
    );
  }

  if (places === null) {
    return <p className="px-4 pt-6 text-sm text-tertiary md:px-6">장소를 불러오고 있어요</p>;
  }

  return (
    <div>
      <div className="mt-4 px-4 md:px-6">
        <Input
          aria-label="장소 검색"
          placeholder="이름·지역·주소로 찾기"
          value={query}
          onChange={typeQuery}
          size="lg"
          icon={SearchLg}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2 px-4 md:px-6" role="group" aria-label="상태로 걸러 보기">
        {STATUS_FILTERS.map((entry) => {
          const count = entry.key === 'all' ? places.length : counts[entry.key];
          const active = entry.key === status;
          return (
            <Button
              key={entry.key}
              size="sm"
              color={active ? 'primary' : 'secondary'}
              aria-pressed={active}
              className="h-11"
              onClick={() => pickStatus(entry.key)}
            >
              {entry.label} {count}
            </Button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <p className="px-4 pt-6 text-sm text-tertiary md:px-6">
          {query ? '찾는 장소가 없어요.' : '이 상태인 장소가 없어요.'}
        </p>
      ) : (
        <>
          <ul className="mt-4 space-y-3 px-4 md:px-6">
            {filtered.slice(0, shown).map((place) => (
              <AdminPagePlaceRow
                key={place.id}
                place={place}
                state={states[place.id] ?? {}}
                onStartArchive={() => patchState(place.id, { archiving: true, error: undefined, done: undefined })}
                onCancelArchive={() => patchState(place.id, { archiving: false })}
                onArchive={(reason, note) => void change(place, 'archive', reason, note)}
                onRestore={() => void change(place, 'restore')}
              />
            ))}
          </ul>

          {filtered.length > shown && (
            <div className="mt-4 px-4 md:px-6">
              <Button
                color="secondary"
                size="lg"
                className="w-full"
                onClick={() => setShown((prev) => prev + PAGE_SIZE)}
              >
                더 보기 ({filtered.length - shown}개 남음)
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
