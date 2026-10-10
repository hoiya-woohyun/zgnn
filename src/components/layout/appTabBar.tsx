import { useEffect, useRef, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isNavActive, NAV_ITEMS, navHref } from './navItems';
import { useNavHighlightPath } from './useNavHighlightPath';
import { STUCK_MS } from './appShellSwipe';
import { cx } from '../../utils/cx';

/** 주소 끝의 `/` 를 떼어 비교를 한 가지 모양으로 맞춘다(정적 내보내기라 `/map/` 로도 들어온다). */
const normalize = (pathname: string) => pathname.replace(/\/+$/, '') || '/';

/**
 * 모바일 하단 탭바. 데스크톱(md 이상)에서는 사이드바가 대신하므로 숨는다.
 *
 * 높이는 `--tab-bar-h`(globals.css) 하나다 — 지도 상자·스와이프 대역·본문 아래 여백이 같은 변수를 본다.
 * 가운데 원이 솟는 높이(`RISE_PX`)를 바꾸면 `appShellSurface.ts` 의 CONTENT_BOTTOM_SPACE · STICKY_ACTION_BOTTOM 도 같이 바꾼다.
 *
 * **이미 있는 탭을 다시 누르면 맨 위로 부드럽게 돌아간다** — 네이티브 탭바의 관례다.
 * 조건으로 "불이 들어와 있나" 를 쓰면 안 된다. 하위 화면(상세 등)에서도 들어온 탭에 불이 들어와 있으므로,
 * 상세에서 그 탭을 누르면 목록으로 가지 못하고 제자리에서 스크롤만 한다. 여기서 묻는 것은
 * "어느 탭에 불이 들어오나" 가 아니라 "지금 이 주소에 서 있나" 다.
 *
 * 다른 탭으로 옮길 때는 스크롤에 손대지 않는다 — 셸이 경로가 바뀌면 그 화면의 자리로
 * 스크롤을 되돌리는데(`lib/appScroll.ts`), 여기서 부드러운 스크롤을 같이 걸면 둘이 경쟁한다.
 * 전역 `scroll-behavior: smooth` 를 쓰지 않는 이유도 같다(그 복원까지 애니메이션된다).
 * 대신 **셸에 목적지를 건넨다**(`onNavigate`) — 손가락으로 밀 때와 같은 미끄러짐으로 옮기고 주소는 셸이 바꾼다
 * (ADR-014 v5). 셸이 못 받겠다고 하면(하위 화면·모션 줄임) 보통 링크처럼 간다.
 * 셸이 맡았으면 **불은 누른 순간 옮긴다**(`pendingTo`) — 주소는 미끄러짐이 끝나야 바뀌는데(300ms), 그때까지 옛 탭에
 * 불이 남아 있으면 손가락과 화면이 같이 가는데 탭바만 늦다. 아이콘 모션도 그 순간에 난다. 주소가 바뀌면 지우고,
 * 안 바뀌면(끊긴 망 — 셸이 `STUCK_MS` 뒤 되돌린다) 같은 시간 뒤 지워 옛 탭으로 돌아간다.
 *
 * **탭바는 손가락으로 화면을 넘길 때도 움직이지 않는다**(ADR-014) — 화면들을 담는 틀이지
 * 화면이 아니다. 스와이프로 옮겨도 여기 하이라이트는 `isActive` 가 새 주소로 다시 계산한다.
 *
 * **가운데 한 칸(`prominent`, 지도)은 솟은 원형 버튼이다.** 다섯 칸이 같은 모양이면 밋밋하고, 여행 중
 * 가장 자주 여는 화면이 어느 것인지도 안 보인다. 원은 탭바 윗선 위로 `RISE_PX` 만큼만 살짝 솟고, `border-t` 선은
 * 원을 만나면 **원의 가장자리를 타고 넘는다** — 원과 같은 크기의 테두리만 있는 원 하나를 위에 겹치고, 바 위로
 * 솟은 부분만 남도록 잘라 낸다(`overflow-hidden`). 원 둘레에 크림 띠를 두르지 않는다 — 선이 분홍 가장자리에
 * 바로 붙어야 "선이 원을 넘는다" 로 읽힌다(띠를 두르면 원이 구멍에 떠 있는 것처럼 보였다).
 * 라벨은 없다 — 지도 모양 아이콘 하나로 충분하고, 원 밑에 글자가 서면 원이 솟을 자리가 없다(`aria-label` 로만 남긴다).
 * 솟은 만큼은 본문 위에 떠 있어 `appShellSurface` 의 아래 여백이 그만큼 더 크다.
 * 원은 늘 브랜드색이고 불이 들어왔는지는 말하지 않는다 — 원의 색을 바꾸면 "지도에 있을 때만 버튼이 있다" 로 읽힌다.
 *
 * **눌림 효과는 없고, 불이 들어오는 순간에만 아이콘이 움직인다.** 탭은 버튼이지 그림이 아니라 길게 누를 때 뜨는
 * 링크 시트·끌기 고스트를 끄고(`styles/appTabBar.css`), 대신 비활성 → 활성으로 **바뀐** 칸의 아이콘 하나만 제 모양대로
 * 한 번 움직인다(`item.motion`). 처음 그릴 때 이미 활성인 칸은 가만히 있다 — 누가 누른 게 아니다. 활성 칸은
 * 주소에서 계산하므로 탭을 눌러서든 스와이프로든 같은 모션이 난다. 클래스는 animationend 에 떼어 다음에 또 움직인다.
 */

/**
 * 원의 지름과 탭바 윗선 위로 솟는 높이(px). 반(26px)을 내놓으니 너무 튀어 보여 16px 로 들였다.
 * 탭바 높이(`--tab-bar-h`)처럼 픽셀로 못 박는다 — 선이 원을 넘는 자리는 1px 단위로 맞아야 해서 `--spacing` 축에
 * 태우면 테두리 덮개와 원이 서로 어긋난다(탭바는 768px 미만에만 있어 축이 커질 일도 없다).
 */
const CIRCLE_PX = 52;
const RISE_PX = 16;

type TAppTabBarProps = {
  /** 목적지로 미끄러뜨릴 수 있으면 맡아서 true — 그러면 링크의 기본 이동을 막는다. */
  onNavigate?: (route: string) => boolean;
};

export function AppTabBar({ onNavigate }: TAppTabBarProps) {
  const pathname = usePathname();
  const routeHighlightPath = useNavHighlightPath();

  // 셸이 미끄러뜨리는 동안 미리 불을 옮겨 둔 목적지. 떠난 주소와 함께 적어 두어 주소가 바뀌면(도착) 저절로 무효가 된다 —
  // 그 뒤로는 주소가 말한다. 주소가 안 바뀌면 셸이 되돌리는 시간(STUCK_MS) 뒤에 비운다.
  const [pending, setPending] = useState<{ to: string; from: string } | null>(null);
  useEffect(() => {
    if (pending === null) return;
    const timer = window.setTimeout(() => setPending(null), STUCK_MS);
    return () => window.clearTimeout(timer);
  }, [pending]);
  const pendingTo = pending !== null && pending.from === pathname ? pending.to : null;
  const highlightPath = pendingTo ?? routeHighlightPath;
  const activeTo = NAV_ITEMS.find((item) => isNavActive(item, highlightPath))?.to ?? null;

  // 비활성 → 활성으로 **바뀐** 칸만 움직인다. 첫 렌더의 활성 칸은 ref 초기값과 같아 건너뛴다.
  const lastActiveTo = useRef(activeTo);
  const [popTo, setPopTo] = useState<string | null>(null);
  useEffect(() => {
    if (lastActiveTo.current === activeTo) return;
    lastActiveTo.current = activeTo;
    setPopTo(activeTo);
  }, [activeTo]);
  const iconMotionProps = (to: string, motion: string) => ({
    'data-motion': motion,
    onAnimationEnd: () => setPopTo((current) => (current === to ? null : current)),
  });

  const handleTabClick = (event: MouseEvent<HTMLAnchorElement>, to: string) => {
    if (normalize(pathname) !== normalize(to)) {
      if (onNavigate?.(to)) {
        event.preventDefault();
        setPending({ to, from: pathname });
      }
      return;
    }

    event.preventDefault();
    window.scrollTo({
      top: 0,
      // 모션을 줄이기로 한 사용자에게는 즉시 이동. 도착점은 같다.
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  };

  return (
    <nav
      aria-label="주요 화면"
      // 배경은 **바탕과 같은 크림, 불투명**이다(ADR-010 v4 — 가장자리 면은 바탕색). 흰색이면
      // 홈 인디케이터 자리(pb-safe)만 흰 띠가 되어 위쪽 상태바 자리(크림)와 짝이 안 맞는다.
      // 반투명 + backdrop-blur 로 두면 그 자리에 밑을 지나는 내용이 비치고, Safari 26 은 이 요소의
      // background-color 를 읽어 자기 툴바를 칠하므로 흐린 색이 그대로 툴바로 번진다.
      // 본문과 가르는 것은 색이 아니라 `border-t` 한 줄이다.
      className="app-tab-bar pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-secondary bg-secondary md:hidden"
    >
      <ul className="mx-auto flex h-(--tab-bar-h) w-full max-w-lg">
        {NAV_ITEMS.map((item) => {
          const active = isNavActive(item, highlightPath);
          const href = navHref(item, pathname);
          if (item.prominent) {
            return (
              <li key={item.to} className="relative flex-1">
                <Link
                  href={href}
                  onClick={(event) => handleTabClick(event, href)}
                  aria-current={active ? 'page' : undefined}
                  aria-label={item.label}
                  draggable={false}
                  className="relative flex h-full justify-center"
                >
                  <span
                    aria-hidden
                    style={{ top: -RISE_PX, width: CIRCLE_PX, height: CIRCLE_PX }}
                    className="absolute flex items-center justify-center rounded-full bg-brand-solid text-primary_on-brand shadow-lg"
                  >
                    <item.Icon
                      size={26}
                      {...iconMotionProps(item.to, item.motion)}
                      className={cx(popTo === item.to && 'tab-icon-pop')}
                    />
                  </span>
                  {/* 선이 원을 타고 넘는 부분 — 분홍 **바깥**에 1px 붙는 테두리(`box-content`)를 솟은 높이만큼만 보인다(그 밑은 바 안이라 선이 없어야 한다). */}
                  <span
                    aria-hidden
                    style={{ top: -RISE_PX - 1, height: RISE_PX + 1, width: CIRCLE_PX + 2 }}
                    className="pointer-events-none absolute overflow-hidden"
                  >
                    <span
                      style={{ width: CIRCLE_PX, height: CIRCLE_PX }}
                      className="box-content block rounded-full border border-secondary"
                    />
                  </span>
                </Link>
              </li>
            );
          }

          return (
            <li key={item.to} className="flex-1">
              <Link
                href={href}
                onClick={(event) => handleTabClick(event, href)}
                aria-current={active ? 'page' : undefined}
                draggable={false}
                className={cx(
                  // 위에만 6px — `--tab-bar-h` 가 늘린 만큼이다(globals.css). 솟은 원은 윗선 기준이라 영향이 없다.
                  'relative flex h-full flex-col items-center justify-center gap-0.5 pt-[6px] text-xs font-semibold',
                  active ? 'text-brand-secondary' : 'text-tertiary',
                )}
              >
                <item.Icon
                  size={24}
                  {...iconMotionProps(item.to, item.motion)}
                  className={cx(active ? 'text-brand-secondary' : 'text-quaternary', popTo === item.to && 'tab-icon-pop')}
                />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
