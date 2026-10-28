import { Fragment } from 'react';
import Link from 'next/link';
import { ChevronRight } from '@untitledui/icons';
import { PLACE_TYPE_ICON } from '../components/icons/placeTypeIcon';
import { TYPE_COLOR, TYPE_COLOR_DEEP, TYPE_META, countByType } from '../lib/places';
import type { TLevelCounts } from '../lib/eligibilityCounts';
import { homeTypeCardCountsLabel, homeTypeCardSegments } from '../lib/homePageCounts';
import type { TPlaceType } from '../types';
import { cx } from '../utils/cx';

type THomeTypeCardProps = {
  type: TPlaceType;
  /** 우리 강아지 기준 레벨별 곳 수(`countByLevel`). 없으면(undefined) 프로필이 없다는 뜻 —
   *  기존처럼 전체 건수만 보여준다. */
  levelCounts?: TLevelCounts;
};

/**
 * 홈의 종류별 진입 행 — 면 없이 크림 위에 선다(22 G2.3 · 면 0). 종류는 상자·틴트가 아니라 **행 앞의 종류색 선 아이콘**
 * 하나가 말한다 — 지도 핀과 같은 그림(`PLACE_TYPE_GLYPH`)이라 "침대 = 숙소" 를 따로 익힐 것이 없다.
 * 예전 틴트 카드 + 흰 아이콘 상자 + 색 제목 셋은 audit B-7 이 "AI 가 만든 둥근 네모" 로 짚었다. 행 사이 선은 부르는 쪽(`homePage`).
 * 읍면 칩은 18 T2 에서 뺐다 — 퍼시스트 `town` 을 걸어 다른 종류·다음 방문까지 남았다. 지역은 홈의
 * 「두부랑 갈 동네」(`HomePageAreaCards`)가 비퍼시스트 권역·검색어로 받는다.
 */
export function HomeTypeCard({ type, levelCounts }: THomeTypeCardProps) {
  const meta = TYPE_META[type];
  const Icon = PLACE_TYPE_ICON[type];

  return (
    <Link href={`/places/${type}`} className="-mx-2 block rounded-lg px-2 py-3.5 transition-colors active:bg-tertiary">
      <div className="flex items-start gap-3">
        <Icon size={24} aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: TYPE_COLOR[type] }} />

        <div className="min-w-0 flex-1">
          {/* 소개 한 줄(`TYPE_META.blurb`)은 홈에서 뺐다(18 §4) — 프로필이 있으면 밑의 수 줄이 그 자리를 받고, 없으면 이름만 선다. */}
          <p className="text-md font-semibold text-primary">{meta.label}</p>

        {/* 프로필이 있으면 "가능 3 · 확인 필요 3" 을 글자로. 예전엔 ok+cond 합을 "7 / 26" 으로만 적어
            "7 이 뭐예요?" 가 나왔고, 스크린리더만 "갈 수 있는 곳" 이라 읽어 확인 필요까지 가능으로
            부풀렸다(D 크리틱 #4). 보이는 말과 읽히는 말을 같게 둔다 — 목록 머리와도 같은 이름·순서(`homeTypeCardSegments`).
            앞의 "26곳 중" 은 모수 — 20kg 아이에게 26곳 중 7곳뿐이라는 사실이 수 둘만으로는 안 드러났다(18 T1).
            정보 없음 · 어려움도 작게 센다(14 W261013.2) — 빼면 "가능 10 · 확인 필요 4 / 31곳" 이 17곳을 말하지 않아 합이 안 맞았다.
            모수가 끝에 "/ 31곳" 으로 붙으면 마지막 칸의 분수("어려움 13 / 31")로도 읽혀 앞으로 옮겼다 — 행이 된 뒤(22 G2.3)엔
            모수가 행 오른쪽 '31곳 ›' 으로 서서 이 줄에선 뺐다(같은 수를 두 번 적지 않는다).
            **이름 밑 줄**에 둔다(14 W261007.10) — 오른쪽에 세우면 수 묶음이 폭을 먹어 390px 에서도 이름 칸이 50px,
            320px 에선 0px 이 돼 "식/당" 이 한 글자씩 내려왔다. 낱말 묶음(`whitespace-nowrap`) 사이에서만 꺾인다. */}
        {levelCounts && (
          <p
            className="mt-1 text-sm text-secondary"
            aria-label={homeTypeCardCountsLabel(levelCounts, countByType[type])}
          >
            {homeTypeCardSegments(levelCounts).map((segment, index, segments) => (
              <Fragment key={segment.level}>
                <span className={cx('whitespace-nowrap', !segment.strong && 'text-tertiary')}>
                  {segment.label}{' '}
                  {segment.strong ? (
                    <span className="text-md font-bold" style={{ color: TYPE_COLOR_DEEP[type] }}>
                      {segment.count}
                    </span>
                  ) : (
                    <span className="text-secondary">{segment.count}</span>
                  )}
                  {index < segments.length - 1 && <span aria-hidden="true"> ·</span>}
                </span>{' '}
              </Fragment>
            ))}
          </p>
        )}
        </div>

        <span className="flex shrink-0 items-center gap-0.5 self-center text-sm text-tertiary">
          {countByType[type]}곳
          <ChevronRight size={20} aria-hidden="true" className="text-quaternary" />
        </span>
      </div>
    </Link>
  );
}
