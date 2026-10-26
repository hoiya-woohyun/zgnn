import type { FC, Key, ReactNode, SVGProps } from 'react';
import { cx } from '../utils/cx';

export type TActionTileIcon = FC<SVGProps<SVGSVGElement> & { size?: number }>;

type TActionTileTone = 'neutral' | 'active';

type TActionTileProps = {
  icon: TActionTileIcon;
  label: string;
  /** active: 켜진 토글(저장함) — 원은 그대로, 하트만 채운다. 원 색으로 칸을 가르지 않는다(22 D-15). */
  tone?: TActionTileTone;
  /**
   * 앱 밖으로 나가는 칸의 둘째 줄 — 어디로 가는지('네이버 지도' · '네이버' · '블로그'). 떠난다는 신호는 색이 아니라 이 글자다(22 D-15).
   * 없으면 그 줄을 빈 채로 둔다 — 다섯 칸의 이름이 같은 높이에 서야 한 줄로 읽힌다.
   */
  destination?: string;
  /** 있으면 새 창 링크, 없으면 버튼. */
  href?: string;
  onClick?: () => void;
  /**
   * 누른 순간의 모션(저장 하트 — `SaveButton` 의 `saveHeartMotion`). key 가 바뀌면 아이콘이 새로 붙어 한 번 움직인다.
   * `effect` 는 원 안 가운데에 겹쳐 그릴 조각(`SaveBurst`). 원이 `relative` 라 조각은 원 가운데에서 출발한다.
   */
  iconMotion?: { key: Key; className?: string };
  effect?: ReactNode;
  'aria-label'?: string;
  'aria-pressed'?: boolean;
  /** 실사용 이벤트의 이름표(ADR-029) — 없으면 버튼·링크 종류로 적힌다. */
  'data-ev'?: string;
};

const ICON_TONE: Record<TActionTileTone, string> = {
  neutral: 'text-fg-secondary',
  active: 'fill-camellia text-camellia',
};

/**
 * 액션 줄의 한 칸 — 44px 원 아이콘 위, 짧은 이름 아래(지도 앱 상세의 저장·공유·길찾기 줄과 같은 모양).
 *
 * 원 하나가 이미 44px 이라 터치 기준은 원이 지킨다. 원은 **다섯 칸 다 같은 모양**이다(흰 면 · 회색 1px · 회색 아이콘) — 예전엔 네이버로
 * 나가는 칸만 초록 원이었는데, 흰 아이콘 대비가 기준 미달이었고(ADR-003 v13) "초록 = 앱을 떠난다" 는 따로 배워야 하는 규칙이었다.
 * 이름은 **글자로 끝까지 말한다** — 아이콘만으로는 어디로 가는지 모르고, 앱 밖으로 가는 칸은 둘째 줄이 목적지를 말한다(ADR-003 v19).
 */
export function ActionTile({ icon: Icon, label, tone = 'neutral', destination, href, onClick, iconMotion, effect, ...aria }: TActionTileProps) {
  const body = (
    <>
      <span
        className={cx(
          'relative grid size-11 place-items-center rounded-full border border-secondary bg-primary transition duration-100 ease-linear',
          'group-hover:bg-secondary group-active:bg-tertiary',
        )}
      >
        <Icon key={iconMotion?.key} size={20} className={cx(ICON_TONE[tone], iconMotion?.className)} />
        {effect}
      </span>
      <span className="flex flex-col items-center text-center">
        <span className="text-sm font-medium text-secondary">{label}</span>
        {/* 빈 줄도 같은 줄 높이로 세운다(aria-hidden — 읽을 것이 없다). 목적지가 칸 폭(320 에서 약 54px)을 넘으면 공백에서 꺾인다(keep-all). */}
        <span aria-hidden={destination ? undefined : true} className="min-h-4.5 text-xs text-quaternary">
          {destination}
        </span>
      </span>
    </>
  );
  const className =
    'group flex min-w-0 flex-col items-center gap-1.5 rounded-lg py-1 outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2';

  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className} {...aria}>
        {body}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className} {...aria}>
      {body}
    </button>
  );
}
