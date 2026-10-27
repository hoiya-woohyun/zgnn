import type { Ref } from 'react';
import { Heart, Share01 } from '@untitledui/icons';
import { AppBarActionsSlot } from '../components/layout/appBarSlot';
import { SaveBurst, saveHeartMotion, useSaveToggle } from '../components/saveButton';
import type { TPlaceEntry } from '../lib/places';
import { cx } from '../utils/cx';
import { usePlaceShare } from './placeDetailShare';

const BUTTON =
  'relative grid size-11 shrink-0 place-items-center rounded-full text-fg-secondary transition-colors hover:bg-tertiary active:bg-tertiary outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2';

/**
 * 상세를 내려 읽으면 헤더 오른쪽에 남는 **저장·공유** 두 버튼(14 W261010.6 — 액션 줄이 화면 위 1/3 에서 스크롤로 사라져 엄지가 안 닿았다).
 *
 * 본문 액션 줄과 같은 동작·같은 이름표다(저장 `useSaveToggle`, 공유 `usePlaceShare`). 길찾기·플레이스·후기는 앱을 떠나는 칸이라 둘째 줄의 목적지 말이 필요해
 * 아이콘만 있는 헤더에는 올리지 않는다.
 *
 * **제목이 헤더로 날아 들어온 뒤에야 보이고 눌린다**(`hand-off-action` — 투명과 함께 `visibility`). 맨 위에서는 본문 줄이 같은 일을 하므로
 * 겹쳐 두면 안 되고, 투명만 하면 눌림은 남아 빗나간 탭이 저장을 켠다. 구간은 제목 줄과 같은 것을 헤더(`placeDetailHeader`)가 이 상자에도 적는다.
 */
export function PlaceDetailAppBarActions({ place, ref }: { place: TPlaceEntry; ref: Ref<HTMLDivElement> }) {
  const { saved, toggle, burst } = useSaveToggle(place.id);
  const share = usePlaceShare(place);
  const heartMotion = saveHeartMotion(burst);
  return (
    <AppBarActionsSlot>
      <div ref={ref} className="contents">
        <div data-scroll-morph="hand-off-action" className="flex items-center" style={{ opacity: 'var(--morph)' }}>
          {/* 이름표는 액션 줄과 같다 — 상태는 aria-pressed 만 말한다. 둘 다 화면에 있어도 스크린리더엔 헤더 쪽이 보이는 때만 읽힌다(visibility). */}
          <button
            type="button"
            onClick={toggle}
            aria-label={`${place.name} 저장`}
            aria-pressed={saved}
            data-ev="detail.bar-save"
            className={BUTTON}
          >
            <Heart key={heartMotion.key} size={22} className={cx(saved && 'fill-camellia text-camellia', heartMotion.className)} />
            <SaveBurst burst={burst} />
          </button>
          <button type="button" onClick={share} aria-label={`${place.name} 공유하기`} data-ev="detail.bar-share" className={BUTTON}>
            <Share01 size={22} />
          </button>
        </div>
      </div>
    </AppBarActionsSlot>
  );
}
