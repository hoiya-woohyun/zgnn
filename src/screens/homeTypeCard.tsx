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

          {/* 프로필이 있으면 "가능 3 · 확인 필요 3" 을 글자로. 예전엔 ok+cond 합을 "7 / 26" 으로만 적어
              "7 이 뭐예요?" 가 나왔고, 스크린리더만 "갈 수 있는 곳" 이라 읽어 확인 필요까지 가능으로
              부풀렸다(D 크리틱 #4). 보이는 말과 읽히는 말을 같게 둔다 — 목록 머리와도 같은 기준.
              끝의 "/ 26곳" 은 모수 — 20kg 아이에게 26곳 중 7곳뿐이라는 사실이 수 둘만으로는 안 드러났다(18 T1).
              "야외 N" 은 카드가 "야외 자리에서 갈 수 있어요" 인 곳 — 있을 때만(목록 머리와 같은 규칙, 14 W261007.5). */}
          {levelCounts ? (
            <p
              className="shrink-0 text-right text-sm font-semibold text-secondary"
              aria-label={`${countByType[type]}곳 중 가능 ${levelCounts.ok}${levelCounts.outdoor > 0 ? ` · 야외 ${levelCounts.outdoor}` : ''} · 확인 필요 ${levelCounts.cond}`}
            >
              가능{' '}
              <span className="text-lg font-bold" style={{ color: TYPE_COLOR_DEEP[type] }}>
                {levelCounts.ok}
              </span>
              {levelCounts.outdoor > 0 && (
                <>
                  <span aria-hidden="true"> · </span>
                  야외{' '}
                  <span className="text-lg font-bold" style={{ color: TYPE_COLOR_DEEP[type] }}>
                    {levelCounts.outdoor}
                  </span>
                </>
              )}
              <span aria-hidden="true"> · </span>
              확인 필요{' '}
              <span className="text-lg font-bold" style={{ color: TYPE_COLOR_DEEP[type] }}>
                {levelCounts.cond}
              </span>
              <span className="text-sm font-normal text-tertiary"> / {countByType[type]}곳</span>
            </p>
          ) : (
            <p className="text-xl font-bold" style={{ color: TYPE_COLOR_DEEP[type] }}>
              {countByType[type]}
              <span className="text-sm font-semibold">곳</span>
            </p>
          )}
        </div>
      </Link>
    </div>
  );
}
