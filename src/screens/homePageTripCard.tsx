import { useMemo } from 'react';
import Link from 'next/link';
import { CheckDone01, ChevronRight, Heart, Map01 } from '@untitledui/icons';
import { GroupList } from '../components/groupList';
import { checklistProgress, type TChecklistProgress } from '../lib/checklist';
import { useStoreHydrated } from '../providers/storeHydration';
import { useAppStore, useSavedPlaces } from '../store/useAppStore';

// 면 없이 크림 위 행(22 G2.0a) — 설정의 `GroupListRow` · 홈 종류 행과 같은 눌림 판(-mx-2 · r8 · bg-tertiary).
const ROW_LINK = 'flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-3.5 transition-colors hover:bg-tertiary active:bg-tertiary';

/**
 * 저장 줄 밑에 이름을 다는 상한. "저장한 곳 1" 숫자만으론 무엇을 저장했는지 보려고 한 번 더 눌렀다(14 W261013.14n · junhyuk-17).
 * 셋부터는 두 줄에도 다 안 들어가 잘리고, 그때는 숫자가 더 많은 것을 말한다 — 잘린 이름 줄은 몇 곳인지조차 흐린다.
 * 한 줄 말줄임이 아니라 두 줄까지 감싼다 — 폰 폭(이름 칸 ~170px)에선 긴 첫 이름(최장 12자)이 둘째 이름을 통째로 가렸다.
 * 전역 `keep-all` 이라 띄어쓰기에서만 끊기고, `·` 앞은 줄바꿈 없는 공백이라 구분점이 줄 머리로 내려가지 않는다.
 */
const NAMED_SAVED_MAX = 2;
const SAVED_NAME_SEPARATOR = ' · ';

/**
 * 홈의 「내 여행」 — 저장한 곳과 준비물을 한 묶음으로(18 T3 · H1). 면은 없다 — 크림 위 두 줄 + 구분선(22 G2.0a).
 *
 * 여행 준비를 한 입구로 — 예전엔 「여행 준비물」 과 저장 카드가 따로 섰고 동선(16)이 오면 넷째 섹션이 될 참이었다.
 * 준비물 숫자는 내 짐만 센다(ADR-009 v4) — 저장한 숙소 몫(· 숙소 N)은 탭에서 빠지며 여기서도 뺐다.
 *
 * - 저장했거나 하나라도 챙겼으면 카드(두 줄). 숫자는 `/saved`·`/checklist` 머리와 같은 함수(`useSavedPlaces`·`checklistProgress`)로 센다.
 * - 아무것도 없으면 섹션째 그리지 않는다 — '하트를 눌러 모아 두세요' 같은 사용 안내는 화면이 할 말이 아니다(22 G5 · B-4). 빈 섹션은 숨긴다.
 * - 저장값을 읽기 전엔 그리지 않는다(`skipHydration`) — 한 줄로 먼저 그렸다가 카드로 바뀌면 아래가 통째로 밀린다.
 */
export function HomePageTripCard() {
  const hydrated = useStoreHydrated();
  const savedPlaces = useSavedPlaces();
  const checkedItemIds = useAppStore((state) => state.checkedItemIds);
  const progress = useMemo(() => checklistProgress(checkedItemIds), [checkedItemIds]);
  const savedCount = savedPlaces.length;
  const savedNames =
    savedCount > 0 && savedCount <= NAMED_SAVED_MAX ? savedPlaces.map((place) => place.name).join(SAVED_NAME_SEPARATOR) : undefined;

  if (!hydrated) return null;

  if (savedCount === 0 && progress.packed === 0) return null;

  return (
    <section className="mt-8 px-4 md:px-6">
      <h2 className="text-md font-bold text-primary">내 여행</h2>
      <HomePageTripCardRows savedCount={savedCount} savedNames={savedNames} progress={progress} />
    </section>
  );
}

function HomePageTripCardRows({
  savedCount,
  savedNames,
  progress,
}: {
  savedCount: number;
  savedNames?: string;
  progress: TChecklistProgress;
}) {
  return (
    <GroupList className="mt-1">
      {/* 지도 링크는 저장 줄 링크 **바깥의 형제**다 — 안에 넣으면 a 안에 a 가 된다.
          테두리 버튼이면 아래 준비물 줄의 `>` 와 모양이 갈려, 같은 `>` 를 끝에 단 글자 링크로 둔다 — 둘 다 px-2 라 두 셰브론이 한 세로선에 선다. */}
      {/* 바깥 div 가 구분선을, 안쪽이 눌림 판(-mx-2)을 — 판에 선을 그으면 둥근 모서리를 따라 휜다(`GroupListRow` 와 같은 짜임). */}
      <div>
      <div className="-mx-2 flex items-stretch">
        <Link href="/saved" className={ROW_LINK}>
          <Heart aria-hidden="true" size={20} className="shrink-0 text-fg-tertiary" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-md text-primary">
              저장한 곳 <span className="font-bold">{savedCount}</span>
            </span>
            {savedNames && <span className="line-clamp-2 text-sm text-tertiary">{savedNames}</span>}
          </span>
        </Link>
        {savedCount > 0 && (
          <Link
            href="/map/?saved=1"
            className="flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-brand-secondary transition-colors hover:bg-tertiary active:bg-tertiary"
          >
            <Map01 aria-hidden="true" size={18} className="shrink-0" />
            지도
            <ChevronRight aria-hidden="true" size={18} className="shrink-0 text-fg-quaternary" />
          </Link>
        )}
      </div>
      </div>

      <div>
      <Link href="/checklist" className={`-mx-2 ${ROW_LINK}`}>
        <CheckDone01 aria-hidden="true" size={20} className="shrink-0 text-fg-tertiary" />
        <span className="flex-1 text-md text-primary">
          준비물 <span className="font-bold">{progress.packed}</span>/{progress.total} 챙김
        </span>
        <ChevronRight aria-hidden="true" size={18} className="shrink-0 text-fg-quaternary" />
      </Link>
      </div>

      {/* 16 T1.4 가 오면 셋째 줄 "1일차 3곳 · 2일차 2곳"(→ /saved 하루 보기)이 여기 들어온다. 지금은 그리지 않는다. */}
    </GroupList>
  );
}
