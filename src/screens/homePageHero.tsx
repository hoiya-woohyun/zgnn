'use client';

import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { collapseProgress } from '../lib/stickyMorph';
import { PLACE_TYPES, TYPE_META, countByType } from '../lib/places';

export function PawMark({ className = 'h-9 w-9 text-brand-300' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <ellipse cx="14.5" cy="15.5" rx="5" ry="6.4" fill="currentColor" />
      <ellipse cx="25.5" cy="11.5" rx="5" ry="6.8" fill="currentColor" />
      <ellipse cx="36" cy="16.5" rx="4.8" ry="6.2" fill="currentColor" />
      <path
        d="M25 24.5c6.4 0 11.4 4.4 11.4 9.4 0 4.2-3.4 6.6-7.6 6.6-2.2 0-3 -.9-5.1-.9-2.1 0-2.9.9-5.1.9-4.2 0-7.6-2.4-7.6-6.6 0-5 5.6-9.4 14-9.4Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** 접힌 헤더의 높이 — 준비물·설정의 제목 줄(StickyMorphTitle)·하위 화면 뒤로가기 줄과 같은 14단. */
const BAR_HEIGHT = 'calc(var(--spacing) * 14)';

/** 히어로 제목 → 헤더 제목의 크기 비. `display-sm`(7.5단) → `md`(4단). 둘 다 --spacing 배수라 브레이크포인트와 무관하다. */
const TITLE_SCALE_END = 4 / 7.5;

/** 발바닥 → 헤더 아이콘의 크기 비. `h-9`(9단) → 6단 — 헤더 제목(`md`) 글자 높이에 맞춘 크기다. */
const PAW_SCALE_END = 6 / 9;

/** 헤더에서 발바닥과 제목 사이 간격 = 줄어든 발바닥 폭의 1/3(6단 → 2단). --spacing 을 따로 재지 않으려고 폭에서 파생한다. */
const PAW_GAP_RATIO = 1 / 3;

const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** 부모 사슬을 따라 `ancestor` 기준 위치를 더한다. offset* 은 transform 을 무시하므로 접힌 중에 재도 **제자리**가 나온다. */
function offsetWithin(el: HTMLElement, ancestor: HTMLElement) {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== ancestor) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

type THomePageHeroProps = {
  /** 제목 아래 한 줄. 프로필이 있으면 강아지 이름이 들어간다. */
  subtitle: string;
};

/**
 * 홈 히어로 — 잉크 카드가 스크롤을 따라 **그대로 헤더가 된다.**
 *
 * 준비물·설정의 제목 줄(StickyMorphTitle)과 같은 약속이다: 진입하면 지금 모습, 스크롤하면 올라가고, 상단에 닿으면
 * 헤더로 붙고, 모든 것이 **스크롤 위치의 함수**라 되돌아가면 같은 길로 풀린다. 다른 것은 바뀌는 게 글자 하나가
 * 아니라 **면**이라는 점이다 — 좌우 여백 16px → 0, 모서리 16px → 0, 색 잉크 → 크림, 높이 카드 → 헤더 한 줄.
 *
 * 어떻게:
 * - **블록 전체가 `sticky` 이고 `top` 이 음수다**(`인셋 + 헤더 − 블록 높이`). 그래서 블록은 아래쪽 헤더 한 줄(+ 상태바
 *   자리)만 화면에 남을 때까지 올라가다 거기서 붙는다. 그 거리 전체에 걸쳐 0 → 1 로 접힌다 — 붙는 순간이 곧 다 접힌 순간이다.
 * - **면은 레이아웃이 아니라 `clip-path: inset()` 으로 줄인다.** 여백·높이·모서리를 실제로 바꾸면 흐름이 다시 계산돼 아래
 *   카드들이 스크롤과 다른 속도로 움직인다. 배경 두 장(잉크·크림)이 블록 전체를 덮고, 같은 클립 안에서 투명도만 서로 바뀐다.
 *   클립의 윗변은 블록이 붙을 때의 헤더 윗변까지 내려온다 — 카드의 윗모서리가 화면 위로 먼저 사라지지 않고, 헤더 쪽으로 내려앉는다.
 * - **제목은 제자리에서 헤더 자리로 옮겨 간다**(translate + scale, 색 흰색 → 본문색). 블록이 올라가는 동안 제목은 블록 안에서
 *   내려가므로, 화면에서는 제목이 제 위치에서 헤더 위치까지 곧게 올라간다.
 * - **발바닥도 제목과 같은 식으로 헤더 맨 앞에 들어간다**(6단 크기로 줄며, 제목은 그 뒤에 붙는다). 헤더에 남는 유일한 브랜드 표식이다.
 * - 부제·숫자판은 먼저 사라진다(처음 25%). 헤더에 들어갈 자리가 없다.
 *
 * 값은 CSS 변수로 흘린다 — `--morph` 는 스크롤 프레임마다, 기하(`--clip-top`·`--side`·`--tx`·`--ty`)는 크기가 바뀔 때만.
 * 인셋·헤더 높이·여백은 CSS(env·--spacing)가 정하는 값이라 JS 에 베껴 적지 않고 탐침으로 잰다.
 *
 * 셸이 `<main>` 에 transform 을 거는 스와이프 중에도 `sticky` 는 스크롤 영역 기준이라 보정이 필요 없다(ADR-014 의
 * `--swipe-viewport-top` 은 `fixed` 용이다).
 */
export function HomePageHero({ subtitle }: THomePageHeroProps) {
  const sentinelRef = useRef<HTMLSpanElement>(null);
  const blockRef = useRef<HTMLDivElement>(null);
  const padRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const pawRef = useRef<HTMLDivElement>(null);
  const insetProbeRef = useRef<HTMLSpanElement>(null);
  const barProbeRef = useRef<HTMLSpanElement>(null);

  useBeforePaint(() => {
    const sentinel = sentinelRef.current;
    const block = blockRef.current;
    const pad = padRef.current;
    const title = titleRef.current;
    const paw = pawRef.current;
    const insetProbe = insetProbeRef.current;
    const barProbe = barProbeRef.current;
    if (!sentinel || !block || !pad || !title || !paw || !insetProbe || !barProbe) return;

    let restTop = 0;
    let pinnedTop = 0;
    const measure = () => {
      const inset = insetProbe.offsetHeight;
      const bar = barProbe.offsetHeight;
      const height = block.offsetHeight;
      const side = parseFloat(getComputedStyle(pad).paddingLeft) || 0;
      const at = offsetWithin(title, block);
      const pawAt = offsetWithin(paw, block);
      const pawEnd = paw.offsetWidth * PAW_SCALE_END;
      // 헤더 한 줄의 세로 중심(블록 기준). 발바닥과 제목이 같은 선에 선다.
      const barMid = height - bar / 2;

      // 붙는 자리: 블록의 아래쪽 (인셋 + 헤더) 만 화면 맨 위에 남는다.
      const stickTop = inset + bar - height;
      block.style.top = `${stickTop}px`;
      restTop = sentinel.getBoundingClientRect().top + window.scrollY;
      pinnedTop = stickTop;

      block.style.setProperty('--clip-top', `${height - inset - bar}px`);
      block.style.setProperty('--side', `${side}px`);
      // 발바닥: 헤더의 글자 줄 맨 앞(좌우 여백)으로. `origin-left` 라 왼쪽 변·세로 중심이 축소의 고정점이다.
      block.style.setProperty('--ptx', `${side - pawAt.x}px`);
      block.style.setProperty('--pty', `${barMid - (pawAt.y + paw.offsetHeight / 2)}px`);
      // 제목: 발바닥 바로 뒤로, 세로 중심은 상태바 아래 헤더 한 줄의 가운데로.
      block.style.setProperty('--tx', `${side + pawEnd * (1 + PAW_GAP_RATIO) - at.x}px`);
      block.style.setProperty('--ty', `${barMid - (at.y + title.offsetHeight / 2)}px`);
    };

    let frame = 0;
    let last = -1;
    const apply = () => {
      frame = 0;
      const progress = collapseProgress(sentinel.getBoundingClientRect().top, restTop, pinnedTop);
      if (progress === last) return;
      last = progress;
      block.style.setProperty('--morph', String(progress));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };

    measure();
    apply();

    const resize = new ResizeObserver(() => {
      measure();
      last = -1;
      schedule();
    });
    resize.observe(block);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      resize.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      cancelAnimationFrame(frame);
    };
  }, []);

  /** 배경 두 장이 같은 클립을 쓴다 — 윗변은 헤더 윗변까지, 좌우는 여백 → 0, 모서리 16px → 0. 아랫변은 그대로다. */
  const clip = {
    clipPath:
      'inset(calc(var(--clip-top, 0px) * var(--morph)) calc(var(--side, 0px) * (1 - var(--morph))) 0 round calc(var(--radius-2xl, 16px) * (1 - var(--morph))))',
  } satisfies CSSProperties;
  // 제목이 지나가기 전에 비켜야 한다 — 늦게 사라지면 올라오는 제목이 부제 위에 겹쳐 읽힌다(실측, 40% 에서 겹쳤다).
  const fadeEarly = { opacity: 'clamp(0, calc(1 - var(--morph) * 4), 1)' } satisfies CSSProperties;

  return (
    <>
      {/* 색이 바뀌는 구간(`--tone`). 잉크 → 크림과 흰 글자 → 본문색을 처음부터 같이 섞으면 중간이 회색 판 위 회색 글자가 돼
          제목이 안 읽혔다(실측). 카드가 거의 헤더 모양이 된 뒤(0.55 → 0.95)에만 바꾼다 — 그전까지는 잉크 판 위 흰 제목이다. */}
      {/* 제자리 = PageHeader 와 같은 첫 블록 높이(`pt-6`/`md:pt-10`). */}
      <div className="pt-6 md:pt-10" />
      <span ref={sentinelRef} aria-hidden="true" className="block h-0" />
      <div
        ref={blockRef}
        className="sticky z-30"
        style={{
          ['--morph' as string]: 0,
          ['--tone' as string]: 'clamp(0, calc((var(--morph) - 0.55) * 2.5), 1)',
        }}
      >
        <div aria-hidden="true" className="basalt pointer-events-none absolute inset-0" style={{ ...clip, opacity: 'calc(1 - var(--tone))' }} />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 border-b border-secondary bg-secondary"
          style={{ ...clip, opacity: 'var(--tone)' }}
        />

        <div ref={padRef} className="relative px-4 md:px-6">
          <header className="p-6">
            {/* 발바닥은 사라지지 않고 제목과 함께 헤더로 들어간다 — 제목 앞의 작은 표식이 된다. 색은 제목과 같은 구간(`--tone`)에서
                잉크 위의 연한 brand-300 → 크림 위의 brand-secondary 로 바뀐다(연한 분홍은 크림 위에서 흐려진다). */}
            <div
              ref={pawRef}
              className="w-max origin-left will-change-transform"
              style={{
                transform: `translate(calc(var(--ptx, 0px) * var(--morph)), calc(var(--pty, 0px) * var(--morph))) scale(calc(1 - ${1 - PAW_SCALE_END} * var(--morph)))`,
                color:
                  'color-mix(in oklab, var(--color-brand-300) calc(100% - var(--tone) * 100%), var(--color-text-brand-secondary))',
              }}
            >
              <PawMark className="block h-9 w-9" />
            </div>
            <h1
              ref={titleRef}
              className="mt-3 w-max origin-left text-display-sm font-bold will-change-transform"
              style={{
                transform: `translate(calc(var(--tx, 0px) * var(--morph)), calc(var(--ty, 0px) * var(--morph))) scale(calc(1 - ${1 - TITLE_SCALE_END} * var(--morph)))`,
                color: 'color-mix(in oklab, white calc(100% - var(--tone) * 100%), var(--color-text-primary))',
              }}
            >
              강아지랑 제주
            </h1>
            <div style={fadeEarly}>
              <p className="mt-1.5 text-sm text-white/65">{subtitle}</p>

              <dl className="mt-6 flex overflow-hidden rounded-xl border border-white/12 bg-white/6">
                {PLACE_TYPES.map((type, index) => (
                  <div key={type} className={`flex-1 px-3 py-2.5 ${index > 0 ? 'border-l border-white/12' : ''}`}>
                    <dt className="text-xs text-white/55">{TYPE_META[type].label}</dt>
                    <dd className="text-lg font-bold text-white">
                      {countByType[type]}
                      <span className="text-sm font-normal text-white/55">곳</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </header>
        </div>
      </div>
      {/* 탐침 둘 — env() 와 --spacing 파생값은 JS 가 직접 못 읽는다. 높이로 읽는다. */}
      <span
        ref={insetProbeRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute left-0 top-0 w-0"
        style={{ height: 'env(safe-area-inset-top, 0px)' }}
      />
      <span
        ref={barProbeRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute left-0 top-0 w-0"
        style={{ height: BAR_HEIGHT }}
      />
    </>
  );
}
