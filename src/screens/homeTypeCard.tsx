import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PLACE_TYPE_ICON } from '../components/icons/placeTypeIcon';
import { TYPE_COLOR, TYPE_COLOR_DEEP, TYPE_META, countByType, topTowns, typeTint } from '../lib/places';
import { useAppStore } from '../store/useAppStore';
import type { TPlaceType } from '../types';

type THomeTypeCardProps = {
  type: TPlaceType;
  /** 우리 강아지 기준 "갈 수 있는 곳"(가능+조건부) 개수. 없으면(undefined) 프로필이 없다는 뜻 —
   *  기존처럼 전체 건수만 보여준다. */
  reachable?: number;
};

/**
 * 홈의 종류별 진입 카드.
 * 사진 대신 타입 색과 아이콘, 건수, 장소가 많은 읍면 세 곳으로 구성한다.
 */
export function HomeTypeCard({ type, reachable }: THomeTypeCardProps) {
  const router = useRouter();
  const setTown = useAppStore((state) => state.setTown);
  const meta = TYPE_META[type];
  const towns = topTowns(type, 3);
  const Icon = PLACE_TYPE_ICON[type];

  // 읍면은 스토어 값이라, 여기서 골라도 둘러보기 화면의 읍면 필터에 그대로 이어진다.
  const goToTown = (town: string) => {
    setTown(town);
    router.push(`/places/${type}`);
  };

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

          <p
            className="text-xl font-bold"
            style={{ color: TYPE_COLOR_DEEP[type] }}
            aria-label={
              reachable !== undefined
                ? `갈 수 있는 곳 ${reachable} / 전체 ${countByType[type]}곳`
                : undefined
            }
          >
            {reachable !== undefined ? (
              <>
                {reachable}
                <span className="text-sm font-semibold text-secondary"> / {countByType[type]}</span>
              </>
            ) : (
              <>
                {countByType[type]}
                <span className="text-sm font-semibold">곳</span>
              </>
            )}
          </p>
        </div>
      </Link>

      {/*
        읍면 칩을 누르면 그 읍면으로 둘러보기 필터를 걸고 바로 이동한다(2026-09-15 리뷰 P1 —
        예전엔 눌러도 반응이 없었다). 카드 전체가 이미 위 Link 라 버튼을 그 안에 중첩하지 않고
        별도 줄로 뺐다 — <a> 안에 <button> 을 넣으면 안 된다.
        색 대비보다 '어디에 많은지'가 정보라 타입색 대신 중립 배지 톤을 쓰되, 클릭 가능해졌으니
        높이는 다른 필터 칩과 같은 44px 로 맞춘다.
      */}
      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="읍면 바로가기">
        {towns.map((entry) => (
          <button
            key={entry.town}
            type="button"
            onClick={() => goToTown(entry.town)}
            aria-label={`${entry.town} ${meta.label} 보기`}
            className="flex h-11 items-center rounded-full bg-primary/80 px-2.5 text-xs font-medium text-secondary ring-1 ring-inset ring-primary transition-colors hover:bg-primary active:opacity-80"
          >
            {entry.town}
          </button>
        ))}
      </div>
    </div>
  );
}
