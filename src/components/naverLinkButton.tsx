import type { ReactNode } from 'react';
import { cx } from '../utils/cx';

type TNaverLinkButtonProps = {
  href: string;
  children: ReactNode;
  className?: string;
};

/**
 * 네이버(지도·플레이스)로 나가는 링크 버튼. 네이버로 가는 버튼은 전부 이것을 쓴다.
 *
 * 색은 앱 팔레트가 아니라 **네이버 공식 초록**(`bg-naver`)이다 — 앱의 핑크 주 버튼과 모양이 같으면
 * "앱 안에서 뭔가 한다" 로 읽히는데, 누르면 앱을 떠난다. 초록 + N 표시가 그 신호다.
 *
 * 크기는 **보이는 것만 작다**: 알약 높이는 `h-9` 이고, 44px 터치 기준은 `before:` 로 넓힌
 * 투명 히트 영역이 지킨다(saveButton 과 같은 방식 — 하트는 작게, 누를 자리는 44px).
 * 폭은 글자만큼이다. 화면 폭을 꽉 채우면 판정 카드보다 무거워 보여서 뺐다.
 */
export function NaverLinkButton({ href, children, className }: TNaverLinkButtonProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cx(
        'relative inline-flex h-9 items-center gap-1.5 rounded-lg bg-naver pr-3 pl-2 text-sm font-bold text-white',
        'before:absolute before:inset-x-0 before:-inset-y-1 before:content-[""]',
        'transition duration-100 ease-linear hover:bg-naver-deep active:bg-naver-deep',
        'outline-naver focus-visible:outline-2 focus-visible:outline-offset-2',
        className,
      )}
    >
      {/* 네이버 N 표시. 글자 하나라 스크린리더에는 숨긴다 — 이름은 버튼 글자가 말한다. */}
      <span
        aria-hidden="true"
        className="flex size-5 items-center justify-center rounded-sm bg-white text-xs leading-none font-black text-naver"
      >
        N
      </span>
      {children}
    </a>
  );
}
