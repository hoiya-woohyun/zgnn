import Link from 'next/link';
import { Badge } from '../components/base/badges';
import { PLACE_TYPE_ICON } from '../components/icons/placeTypeIcon';
import { TYPE_COLOR, TYPE_COLOR_DEEP, TYPE_META, countByType, topTowns, typeTint } from '../lib/places';
import type { TPlaceType } from '../types';

/**
 * 홈의 종류별 진입 카드.
 * 사진 대신 타입 색과 아이콘, 건수, 장소가 많은 읍면 세 곳으로 구성한다.
 */
export function HomeTypeCard({ type }: { type: TPlaceType }) {
  const meta = TYPE_META[type];
  const towns = topTowns(type, 3);
  const Icon = PLACE_TYPE_ICON[type];

  return (
    <Link
      href={`/places/${type}`}
      className="block rounded-2xl p-4 transition-opacity active:opacity-85"
      style={{
        background: typeTint(type, 11),
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${TYPE_COLOR[type]} 22%, #fff)`,
      }}
    >
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

        <p className="text-xl font-bold" style={{ color: TYPE_COLOR_DEEP[type] }}>
          {countByType[type]}
          <span className="text-sm font-semibold">곳</span>
        </p>
      </div>

      {/* 읍면 칩은 색 대비보다 '어디에 많은지'가 정보라, 타입색 대신
          공용 Badge(gray) 로 통일한다 — 계약서가 명시한 컴포넌트다. */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {towns.map((entry) => (
          <Badge key={entry.town} size="sm" color="gray">
            {entry.town}
          </Badge>
        ))}
      </div>
    </Link>
  );
}
