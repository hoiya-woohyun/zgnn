import Link from 'next/link';
import { PLACE_TYPE_ICON } from '../components/icons/placeTypeIcon';
import { TYPE_COLOR, TYPE_COLOR_DEEP, TYPE_META, countByType, typeTint } from '../lib/places';
import type { TLevelCounts } from '../lib/eligibilityCounts';
import type { TPlaceType } from '../types';

type THomeTypeCardProps = {
  type: TPlaceType;
  /** 우리 강아지 기준 레벨별 곳 수(`countByLevel`). 없으면(undefined) 프로필이 없다는 뜻 —
   *  기존처럼 전체 건수만 보여준다. */
  levelCounts?: TLevelCounts;
};

/**
 * 홈의 종류별 진입 카드 — 사진 대신 타입 색과 아이콘, 건수.
 * 읍면 칩은 18 T2 에서 뺐다 — 퍼시스트 `town` 을 걸어 다른 종류·다음 방문까지 남았다. 지역은 홈의
 * 「지역으로 찾기」(`HomePageLandmarkChips`)가 비퍼시스트 검색어로 받는다.
 */
export function HomeTypeCard({ type, levelCounts }: THomeTypeCardProps) {
  const meta = TYPE_META[type];
  const Icon = PLACE_TYPE_ICON[type];

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: typeTint(type, 11),
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${TYPE_COLOR[type]} 22%, #fff)`,
      }}
    >
      <Link href={`/places/${type}`} className="block transition-opacity active:opacity-85">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/80"
            style={{ color: TYPE_COLOR[type] }}
          >
            <Icon size={24} />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold" style={{ color: TYPE_COLOR_DEEP[type] }}>
              {meta.label}
            </p>
            <p className="text-sm text-secondary">{meta.blurb}</p>
          </div>

          {!levelCounts && (
            <p className="text-xl font-bold" style={{ color: TYPE_COLOR_DEEP[type] }}>
              {countByType[type]}
              <span className="text-sm font-semibold">곳</span>
            </p>
          )}
        </div>

        {/* 프로필이 있으면 "가능 3 · 확인 필요 3" 을 글자로. 예전엔 ok+cond 합을 "7 / 26" 으로만 적어
            "7 이 뭐예요?" 가 나왔고, 스크린리더만 "갈 수 있는 곳" 이라 읽어 확인 필요까지 가능으로
            부풀렸다(D 크리틱 #4). 보이는 말과 읽히는 말을 같게 둔다 — 목록 머리와도 같은 기준.
            끝의 "/ 26곳" 은 모수 — 20kg 아이에게 26곳 중 7곳뿐이라는 사실이 수 둘만으로는 안 드러났다(18 T1).
            "야외 N" 은 카드가 "야외 자리에서 갈 수 있어요" 인 곳 — 있을 때만(목록 머리와 같은 규칙, 14 W261007.5).
            **이름 밑 줄**에 둔다(14 W261007.10) — 오른쪽에 세우면 수 묶음이 폭을 먹어 390px 에서도 이름 칸이 50px,
            320px 에선 0px 이 돼 "식/당" 이 한 글자씩 내려왔다. 낱말 묶음(`whitespace-nowrap`) 사이에서만 꺾인다. */}
        {levelCounts && (
          <p
            className="mt-3 text-sm font-semibold text-secondary"
            aria-label={`${countByType[type]}곳 중 가능 ${levelCounts.ok}${levelCounts.outdoor > 0 ? ` · 야외 ${levelCounts.outdoor}` : ''} · 확인 필요 ${levelCounts.cond}`}
          >
            <span className="whitespace-nowrap">
              가능{' '}
              <span className="text-lg font-bold" style={{ color: TYPE_COLOR_DEEP[type] }}>
                {levelCounts.ok}
              </span>
              <span aria-hidden="true"> ·</span>
            </span>{' '}
            {levelCounts.outdoor > 0 && (
              <>
                <span className="whitespace-nowrap">
                  야외{' '}
                  <span className="text-lg font-bold" style={{ color: TYPE_COLOR_DEEP[type] }}>
                    {levelCounts.outdoor}
                  </span>
                  <span aria-hidden="true"> ·</span>
                </span>{' '}
              </>
            )}
            <span className="whitespace-nowrap">
              확인 필요{' '}
              <span className="text-lg font-bold" style={{ color: TYPE_COLOR_DEEP[type] }}>
                {levelCounts.cond}
              </span>
            </span>{' '}
            <span className="whitespace-nowrap text-sm font-normal text-tertiary">/ {countByType[type]}곳</span>
          </p>
        )}
      </Link>
    </div>
  );
}
