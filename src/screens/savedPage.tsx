'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDate, MarkerPin01, Share01 } from '@untitledui/icons';
import { Button } from '../components/base/button';
import { InkButton } from '../components/inkButton';
import { PageHeader } from '../components/layout/pageHeader';
import { EmptyState } from '../components/layout/emptyState';
import { showAppStatus } from '../lib/appStatus';
import { PLACES_BY_ID } from '../lib/places';
import { cx } from '../utils/cx';
import { shareMethodOf } from '../lib/placeShare';
import { parseSharedIds, sharedSavedUrl, type TSharedIds } from '../lib/savedShare';
import { useStoreHydrated } from '../providers/storeHydration';
import { useAppStore, useSavedPlaces, useUnlistedSavedCount } from '../store/useAppStore';
import { SavedPageDays } from './savedPageDays';
import { SavedPageGroups } from './savedPageGroups';
import { useSavedPageListed } from './savedPageListed';
import { SavedPageShared } from './savedPageShared';

const KNOWN_IDS: ReadonlySet<string> = new Set(PLACES_BY_ID.keys());

export function SavedPage() {
  const saved = useSavedPlaces();
  // 그리는 목록은 따로다 — 이번 방문에 하트를 끈 카드도 남는다(12 U2.2 v2). 세는 것은 `saved`.
  const listed = useSavedPageListed();
  const unlisted = useUnlistedSavedCount();
  const hydrated = useStoreHydrated();
  const router = useRouter();
  const hasPlan = useAppStore((state) => Object.keys(state.tripDays).length > 0);

  // 보기 전환(16 T1.4) — 화면 state 로만. 처음 하이드레이션이 끝났을 때 한 번 정한다(라벨이 하나라도 있으면 날짜별).
  // 계속 파생하면 종류별에서 첫 라벨을 다는 순간 화면이 날짜별로 뒤집힌다.
  const [view, setView] = useState<'type' | 'day' | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setView((current) => current ?? (Object.keys(useAppStore.getState().tripDays).length > 0 ? 'day' : 'type'));
  }, [hydrated]);

  /*
   * 공유받은 목록(`?ids=`, 07 P1). `useSearchParams` 는 정적 내보내기에서 Suspense 경계를 요구하고 그 누락은 `pnpm build` 에서야 드러나,
   * 마운트 뒤 주소를 직접 읽는다(`/admin/ops` 의 `?run=` 과 같다). 읽기 전(undefined)엔 머리만 그린다 — 받은 사람에게 "저장한 곳이 없어요" 가
   * 한 프레임 비치지 않게. 담고 나면 주소를 내 목록(`/saved/`)으로 바꾸고 여기도 비운다(같은 화면이라 다시 읽히지 않는다).
   */
  const [shared, setShared] = useState<TSharedIds | null | undefined>(undefined);
  useEffect(() => {
    // 주소창은 React 밖의 상태다 — 마운트 때 한 번 옮겨 담는다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShared(parseSharedIds(new URLSearchParams(window.location.search).get('ids'), KNOWN_IDS));
  }, []);

  if (shared === undefined || (shared && !hydrated)) return <PageHeader title="저장한 곳" />;
  if (shared) {
    return (
      <SavedPageShared
        shared={shared}
        onDone={() => {
          setShared(null);
          router.replace('/saved/');
        }}
      />
    );
  }

  // 누른 순간에 갈래를 가른다(상세의 공유와 같다 — 렌더 중에 navigator 를 보면 미리 그린 HTML 과 어긋난다). 메모는 싣지 않는다(10 F5).
  const share = () => {
    const url = sharedSavedUrl(window.location.origin, saved.map((place) => place.id));
    const method = shareMethodOf(navigator);
    if (method === 'share') {
      // 공유 시트를 닫아도 reject 된다 — 실패가 아니라 취소라 조용히 넘긴다.
      void navigator.share({ title: `저장한 곳 ${saved.length}곳 | 강아지랑 제주`, url }).catch(() => undefined);
      return;
    }
    if (method === 'copy') {
      navigator.clipboard.writeText(url).then(
        () => showAppStatus('목록 링크를 복사했어요'),
        () => showAppStatus('링크를 복사하지 못했어요'),
      );
      return;
    }
    showAppStatus('이 브라우저에서는 공유할 수 없어요');
  };

  return (
    <div>
      <PageHeader title="저장한 곳" count={saved.length > 0 ? saved.length : undefined} />

      {/* 운영자가 내린 곳은 하트를 지우지 않고 감춘다 — 되살리면 메모와 함께 돌아온다(12 U2.3). */}
      {unlisted > 0 && (
        <p className="px-4 pt-3 text-sm text-tertiary md:px-6">
          더 이상 안내하지 않는 곳 {unlisted}곳은 빼고 보여 드려요.
        </p>
      )}

      {listed.length === 0 ? (
        <div className="px-4 pt-6 md:px-6">
          <EmptyState
            title="하트를 누른 곳이 여기 모여요"
            action={{ label: '둘러보기', href: '/places/stay/' }}
          />
        </div>
      ) : (
        <>
          {/* 같이 가는 사람에게 목록을 통째로 보낸다(07 P1). 지도가 주 동작이라 넓게, 공유는 옆 칸. */}
          <div className="flex gap-2 px-4 pt-4 md:px-6">
            <InkButton size="lg" iconLeading={MarkerPin01} href="/map/?saved=1" className="flex-1">
              지도에서 보기
            </InkButton>
            <Button color="secondary" size="lg" iconLeading={Share01} onClick={share} className="shrink-0">
              목록 공유
            </Button>
          </div>

          {/* 보기 전환 — 글자 탭 둘 + 켜진 쪽 2px 밑줄(둘러보기 종류 탭과 같은 문법, 22 R27.1 D-1). 면·그림자 없이 크림 위. 줄은 화면 끝까지. */}
          <div role="group" aria-label="보기" className="mt-4 flex border-b border-secondary">
            {(['type', 'day'] as const).map((value) => {
              const active = (view ?? 'type') === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setView(value)}
                  className={cx(
                    'relative h-11 flex-1 text-sm transition-colors active:bg-tertiary',
                    active ? 'font-semibold text-primary' : 'text-tertiary hover:text-secondary',
                  )}
                >
                  {value === 'type' ? '종류별' : '날짜별'}
                  {active && <span aria-hidden="true" className="absolute inset-x-0 -bottom-px h-0.5 bg-primary-solid" />}
                </button>
              );
            })}
          </div>

          {/*
            날짜·순서는 한 화면에서 끌어 놓아 정한다(`/saved/plan`). 처음 오는 사람은 종류별로 들어오므로(라벨이 없으면 `view` 가 종류별)
            아직 아무 날도 안 정했으면 두 보기 모두에, 정한 뒤엔 날짜별에만 — 종류별을 고른 사람에게 일정 버튼이 늘 붙어 있을 이유는 없다.
          */}
          {(view === 'day' || !hasPlan) && (
            <div className="px-4 pt-3 md:px-6">
              <Button color="secondary" size="lg" iconLeading={CalendarDate} href="/saved/plan/" className="w-full" data-ev="saved-plan">
                {hasPlan ? '날짜·순서 바꾸기' : '날짜별로 정리하기'}
              </Button>
            </div>
          )}

          {view === 'day' ? <SavedPageDays places={listed} /> : <SavedPageGroups places={listed} withNotes />}
        </>
      )}
    </div>
  );
}
