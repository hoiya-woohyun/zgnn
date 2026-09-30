import type { FC, SVGProps } from 'react';
import { cx } from '../utils/cx';

export type TActionTileIcon = FC<SVGProps<SVGSVGElement> & { size?: number }>;

type TActionTileTone = 'neutral' | 'naver' | 'active';

type TActionTileProps = {
  icon: TActionTileIcon;
  label: string;
  /** neutral: 앱 안 동작. naver: 네이버로 나간다(초록 원). active: 켜진 토글(저장함). */
  tone?: TActionTileTone;
  /** 있으면 새 창 링크, 없으면 버튼. */
  href?: string;
  onClick?: () => void;
  'aria-label'?: string;
  'aria-pressed'?: boolean;
};

const CIRCLE_TONE: Record<TActionTileTone, string> = {
  neutral: 'border border-secondary bg-primary text-secondary group-hover:bg-secondary',
  naver: 'bg-naver text-white group-hover:bg-naver-deep group-active:bg-naver-deep',
  active: 'border border-camellia bg-camellia-wash text-camellia',
};

/**
 * 액션 줄의 한 칸 — 44px 원 아이콘 위, 짧은 이름 아래(지도 앱 상세의 저장·공유·길찾기 줄과 같은 모양).
 *
 * 원 하나가 이미 44px 이라 터치 기준은 원이 지킨다. 이름은 **글자로 끝까지 말한다** — 네이버 초록 원은
 * 흰 아이콘 대비가 기준 미달이고(ADR-003 v13), 아이콘만으로는 "지도"와 "사진"이 어디로 가는지 모른다.
 */
export function ActionTile({ icon: Icon, label, tone = 'neutral', href, onClick, ...aria }: TActionTileProps) {
  const body = (
    <>
      <span
        className={cx(
          'grid size-11 place-items-center rounded-full transition duration-100 ease-linear',
          CIRCLE_TONE[tone],
        )}
      >
        <Icon size={20} className={tone === 'active' ? 'fill-camellia' : undefined} />
      </span>
      <span className="text-xs font-semibold text-secondary">{label}</span>
    </>
  );
  const className =
    'group flex min-w-0 flex-col items-center gap-1.5 rounded-xl py-1 outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2';

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
