import { useMemo } from 'react';
import Link from 'next/link';
import { CheckDone01, ChevronRight, Heart, Map01 } from '@untitledui/icons';
import { CARD_SURFACE } from '../components/cardSurface';
import { checklistView, type TChecklistView } from '../lib/checklist';
import { useStoreHydrated } from '../providers/storeHydration';
import { useAppStore, useDog, useSavedPlaces } from '../store/useAppStore';

const ROW_LINK = 'flex min-h-11 min-w-0 flex-1 items-center gap-3 px-4 py-3.5 transition-colors hover:bg-secondary';

/**
 * 홈의 「내 여행」 — 저장한 곳과 준비물을 카드 하나로(18 T3 · H1).
 *
 * 준비물은 저장한 숙소에서 파생되고(ADR-009), 동선(16)도 저장 위에 얹는다. 셋이 한 원천이라 홈의 입구도 하나다 —
 * 예전엔 「여행 준비물」 과 저장 카드가 따로 섰고 동선이 오면 넷째 섹션이 될 참이었다.
 *
 * - 저장했거나 하나라도 챙겼으면 카드(두 줄). 숫자는 `/saved`·`/checklist` 머리와 같은 함수(`useSavedPlaces`·`checklistView`)로 센다.
 * - 아무것도 없으면 등록한 사람에게만 크림 위 한 줄(ADR-003 v15 — 빈 상태는 면 없이). 등록 전엔 히어로·CTA 가 할 일이다.
 * - 저장값을 읽기 전엔 그리지 않는다(`skipHydration`) — 한 줄로 먼저 그렸다가 카드로 바뀌면 아래가 통째로 밀린다.
 */
export function HomePageTripCard() {
  const hydrated = useStoreHydrated();
  const dog = useDog();
  const savedPlaces = useSavedPlaces();
  const season = useAppStore((state) => state.season);
  const checkedItemIds = useAppStore((state) => state.checkedItemIds);
  const progress = useMemo(
    () => checklistView(season, checkedItemIds, savedPlaces),
    [season, checkedItemIds, savedPlaces],
  );
  const savedCount = savedPlaces.length;

  if (!hydrated) return null;

  const empty = savedCount === 0 && progress.packed === 0;
  if (empty && !dog) return null;

  return (
    <section className="mt-8 px-4 md:px-6">
      <h2 className="text-lg font-bold text-primary">내 여행</h2>
      {empty ? (
        <p className="mt-2 text-sm text-tertiary">마음에 드는 곳의 하트를 눌러 모아 두세요</p>
      ) : (
        <HomePageTripCardRows savedCount={savedCount} progress={progress} />
      )}
    </section>
  );
}

function HomePageTripCardRows({ savedCount, progress }: { savedCount: number; progress: TChecklistView }) {
  return (
    <div className={`mt-3 divide-y divide-secondary overflow-hidden ${CARD_SURFACE}`}>
      {/* 지도 링크는 저장 줄 링크 **바깥의 형제**다 — 안에 넣으면 a 안에 a 가 된다.
          테두리 버튼이면 아래 준비물 줄의 `>` 와 모양이 갈려, 같은 `>` 를 끝에 단 글자 링크로 둔다 — px-4 라 두 셰브론이 한 세로선에 선다. */}
      <div className="flex items-stretch">
        <Link href="/saved" className={ROW_LINK}>
          <Heart aria-hidden="true" size={20} className="shrink-0 fill-camellia text-camellia" />
          <span className="flex-1 text-sm font-semibold text-primary">
            저장한 곳 <span className="font-bold">{savedCount}</span>
          </span>
          {savedCount === 0 && <span className="text-sm text-tertiary">하트로 모아 두세요</span>}
        </Link>
        {savedCount > 0 && (
          <Link
            href="/map/?saved=1"
            className="flex min-h-11 shrink-0 items-center gap-1 px-4 text-sm font-semibold text-brand-secondary transition-colors hover:bg-secondary"
          >
            <Map01 aria-hidden="true" size={18} className="shrink-0" />
            지도
            <ChevronRight aria-hidden="true" size={18} className="shrink-0 text-fg-quaternary" />
          </Link>
        )}
      </div>

      <Link href="/checklist" className={ROW_LINK}>
        <CheckDone01 aria-hidden="true" size={20} className="shrink-0 text-fg-brand-secondary" />
        <span className="flex-1 text-sm font-semibold text-primary">
          준비물 <span className="font-bold">{progress.packed}</span>/{progress.total} 챙김
          {progress.atStay > 0 && <span className="font-normal text-tertiary"> · 숙소 {progress.atStay}</span>}
        </span>
        <ChevronRight aria-hidden="true" size={18} className="shrink-0 text-fg-quaternary" />
      </Link>

      {/* 16 T1.4 가 오면 셋째 줄 "1일차 3곳 · 2일차 2곳"(→ /saved 하루 보기)이 여기 들어온다. 지금은 그리지 않는다. */}
    </div>
  );
}
