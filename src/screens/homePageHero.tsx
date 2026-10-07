'use client';

import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import Link from 'next/link';
import { ChevronRight } from '@untitledui/icons';
import { collapseProgress, collapseRange } from '../lib/stickyMorph';
import { morphModeOf, offsetInScroller, writeMorphMode, writeMorphRange } from '../components/layout/scrollDrivenMorph';
import { PawMark } from '../components/pawMark';
import { useReplay } from '../hooks/useReplay';
import { cx } from '../utils/cx';

/** 접힌 헤더의 높이 — 준비물·설정의 제목 줄(StickyMorphTitle)·하위 화면 뒤로가기 줄과 같은 14단. */
const BAR_HEIGHT = 'calc(var(--spacing) * 14)';

/**
 * 이스터에그 — 발바닥을 누르면 손을 흔들고, 짧은 사이(`PAW_TAP_WINDOW_MS`)에 다섯 번 누르면 발자국이 카드를 가로지른다.
 * 발자국은 발바닥 자리에서 출발해 왼발·오른발이 번갈아 위아래로 엇갈리며 오른쪽으로 간다(발끝이 진행 방향). 자리는 블록 위쪽 백분율이라
 * **카드가 펼쳐져 있을 때만 보인다** — 다 접히면 블록은 `top` 이 음수로 붙어 아래 헤더 줄만 화면에 남고, 발자국 자리는 화면 위로 나가 있다.
 */
const PAW_TAPS_FOR_TRAIL = 5;
const PAW_TAP_WINDOW_MS = 2000;
const PAW_TRAIL = [22, 33, 44, 55, 66, 77, 88].map((left, index) => ({
  left: `${left}%`,
  // 발바닥 옆 빈 띠(카드 위쪽)를 걷는다 — 아래쪽은 등록 버튼·갈 수 있는 곳 수가 있어 그 위를 밟으면 글자가 가린다.
  top: index % 2 ? '9%' : '17%',
  turn: index % 2 ? 78 : 102,
}));

/** 히어로 제목 → 헤더 제목의 크기 비. `display-sm`(7.5단) → `md`(4단). 둘 다 --spacing 배수라 브레이크포인트와 무관하다. */
const TITLE_SCALE_END = 4 / 7.5;

/** 발바닥 → 헤더 아이콘의 크기 비. `h-9`(9단) → 6단 — 헤더 제목(`md`) 글자 높이에 맞춘 크기다. */
const PAW_SCALE_END = 6 / 9;

/** 헤더에서 발바닥과 제목 사이 간격 = 줄어든 발바닥 폭의 1/3(6단 → 2단). --spacing 을 따로 재지 않으려고 폭에서 파생한다. */
const PAW_GAP_RATIO = 1 / 3;

/** 귀 조각이 카드 바깥으로 넘치는 폭(`corner` 주석). 커튼 폭(16px)보다 작기만 하면 된다. */
const CORNER_BLEED = '2px';

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
  /**
   * 우리 강아지 기준으로 **갈 수 있는**(판정 `ok`) 곳 수와 그 앞에 붙는 말("두부가 갈 수 있는 곳"). 프로필이 없으면 null — 그때는 숫자를 두지 않는다.
   * 예전의 종류별 전체 수 판(숙소 26 · 식당 34 · 카페 24)은 바로 아래 종류 카드가 같은 수를 말해 첫 화면에 기준이 다른 숫자 묶음이
   * 두 벌이었다(디자인 리뷰 ①). 이 앱만 말할 수 있는 숫자 하나만 남긴다. `cond` 를 더하지 않는 이유는 종류 카드가 "가능 · 확인" 을
   * 일부러 나눠 적는 이유와 같다 — 확인 필요까지 '갈 수 있다' 로 읽힌다.
   */
  reach: { label: string; count: number } | null;
  /**
   * 프로필이 없을 때 `reach` 자리에 서는 등록 버튼(18 T4). 둘 중 하나만 그린다 — 프로필이 있으면 `reach`, 없으면 `cta`.
   * 예전에는 히어로 **밑**에 핑크 면 카드로 따로 섰다. 첫 화면에 큰 덩어리가 둘(잉크 판 + 핑크 판)이라 히어로 위에 템플릿이
   * 얹힌 것처럼 읽혔고(디자인 리뷰 §10 ①), 그 화면에서 할 일은 등록 하나뿐이라 히어로가 곧 그 말이 된다.
   */
  cta?: { title: string; body: string; href: string };
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
 * - **면은 줄이지 않고 가린다.** 잉크·크림 두 장이 블록 전체에 가만히 깔려 있고(투명도만 서로 바뀐다), 그 가장자리를 크림 커튼 셋
 *   (왼·오른·위)이 덮는다. 커튼이 걷히는 만큼 카드가 넓어지고, 위 커튼이 내려오는 만큼 카드 윗변이 헤더 윗변까지 내려앉는다 —
 *   카드의 윗모서리가 화면 위로 먼저 사라지지 않고 헤더 쪽으로 내려앉는다. 모서리는 네 귀의 크림 조각이 만들고, 접히는 만큼 작아진다.
 *   여백·높이·모서리를 실제로 바꾸면 흐름이 다시 계산돼 아래 카드들이 스크롤과 다른 속도로 움직이고, 판 자체를 `scale` 로 누르면
 *   모서리가 납작한 타원이 되고 현무암 점이 가로줄로 늘어난다(실측) — 커튼·귀는 단색이라 늘여도 티가 안 난다.
 * - **제목은 제자리에서 헤더 자리로 옮겨 간다**(translate + scale, 색 흰색 → 본문색). 블록이 올라가는 동안 제목은 블록 안에서
 *   내려가므로, 화면에서는 제목이 제 위치에서 헤더 위치까지 곧게 올라간다.
 * - **발바닥도 제목과 같은 식으로 헤더 맨 앞에 들어간다**(6단 크기로 줄며, 제목은 그 뒤에 붙는다). 헤더에 남는 유일한 브랜드 표식이다.
 * - 부제·갈 수 있는 곳 수(등록 전엔 등록 버튼)는 먼저 사라진다(처음 25%). 헤더에 들어갈 자리가 없다.
 *
 * **접힘은 브라우저의 스크롤 구동 애니메이션이 돌린다**(`styles/scrollMorph.css`, 왜인지는 `scrollDrivenMorph.ts`). JS 는 크기가
 * 바뀔 때만 구간(`--morph-from`·`--morph-to`)과 기하(`--clip-top`·`--side`·`--tx`·`--ty`)를 적는다. 지원하지 않는 브라우저에서만
 * 예전처럼 `--morph` 를 스크롤 프레임마다 적고, 인라인 `calc(var(--morph))` 가 같은 모습을 낸다.
 * 인셋·헤더 높이·여백은 CSS(env·--spacing)가 정하는 값이라 JS 에 베껴 적지 않고 탐침으로 잰다.
 *
 * **모바일에서 버벅이던 원인이 둘이라 모양도 둘을 피해 짰다.** 움직이는 것은 `transform`·`opacity` 뿐이다.
 * - **글자·발바닥 색은 섞지 않고 두 벌을 겹쳐 투명도로 바꾼다.** `color-mix` 로 색을 매 프레임 바꾸면 크게 확대된 글자를
 *   프레임마다 새 크기로 다시 래스터해 폭이 떨렸다. 두 벌이면 각 층을 한 번 그린 뒤 GPU 가 줄이고 섞기만 한다.
 * - **면도 `clip-path` 가 아니라 커튼이다.** 예전의 `clip-path: inset(… round …)` 는 합성되지 않아, 층을 따로 올려도 매 프레임
 *   면 전체를 다시 그렸다(크롬 실측: 한 번 오르내리는 동안 다시 그린 층이 준비물 화면의 7배). 그중 현무암 무늬(radial-gradient
 *   네 겹)를 폰의 3배 화소로 그리는 것이 가장 비쌌다. 지금은 무늬 판은 가만히 있고, 단색 커튼·귀가 GPU 에서 늘고 줄기만 한다.
 *
 * 셸이 `<main>` 에 transform 을 거는 스와이프 중에도 `sticky` 는 스크롤 영역 기준이라 보정이 필요 없다(ADR-014 의
 * `--swipe-viewport-top` 은 `fixed` 용이다).
 */
export function HomePageHero({ subtitle, reach, cta }: THomePageHeroProps) {
  const sentinelRef = useRef<HTMLSpanElement>(null);
  const blockRef = useRef<HTMLDivElement>(null);
  const padRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const pawRef = useRef<HTMLDivElement>(null);
  const insetProbeRef = useRef<HTMLSpanElement>(null);
  const barProbeRef = useRef<HTMLSpanElement>(null);

  // 이스터에그(PAW_TRAIL). 누름에만 반응한다 — 홈은 마운트에 아무 일도 하지 않는 화면이다(스와이프 미리보기도 같은 컴포넌트를 그린다, ADR-014).
  const [wave, replayWave] = useReplay();
  const [trail, replayTrail] = useReplay();
  const pawTapsRef = useRef<number[]>([]);
  const tapPaw = () => {
    const now = Date.now();
    pawTapsRef.current = [...pawTapsRef.current.filter((at) => now - at < PAW_TAP_WINDOW_MS), now];
    replayWave();
    if (pawTapsRef.current.length < PAW_TAPS_FOR_TRAIL) return;
    pawTapsRef.current = [];
    replayTrail();
  };

  useBeforePaint(() => {
    const sentinel = sentinelRef.current;
    const block = blockRef.current;
    const pad = padRef.current;
    const title = titleRef.current;
    const paw = pawRef.current;
    const insetProbe = insetProbeRef.current;
    const barProbe = barProbeRef.current;
    if (!sentinel || !block || !pad || !title || !paw || !insetProbe || !barProbe) return;

    const mode = morphModeOf();
    const scrollDriven = mode === 'scroll';
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

      // 면: 위 커튼이 다 내려왔을 때의 높이(= 붙었을 때 화면 위로 나간 부분)와, 좌우 커튼의 폭(= 카드의 좌우 여백).
      block.style.setProperty('--clip-top', `${height - inset - bar}px`);
      block.style.setProperty('--side', `${side}px`);
      // 발바닥: 헤더의 글자 줄 맨 앞(좌우 여백)으로. `origin-left` 라 왼쪽 변·세로 중심이 축소의 고정점이다.
      block.style.setProperty('--ptx', `${side - pawAt.x}px`);
      block.style.setProperty('--pty', `${barMid - (pawAt.y + paw.offsetHeight / 2)}px`);
      // 제목: 발바닥 바로 뒤로, 세로 중심은 상태바 아래 헤더 한 줄의 가운데로.
      block.style.setProperty('--tx', `${side + pawEnd * (1 + PAW_GAP_RATIO) - at.x}px`);
      block.style.setProperty('--ty', `${barMid - (at.y + title.offsetHeight / 2)}px`);
      if (scrollDriven) writeMorphRange(block, collapseRange(offsetInScroller(sentinel), pinnedTop));
    };

    let frame = 0;
    let last = -1;
    const apply = () => {
      frame = 0;
      // snap: 블록이 붙는 순간 헤더로 접힌다. 그 전에는 카드 그대로 올라간다 — 붙기 전에 접으면 헤더 한 줄이 화면 가운데에 떠서 올라온다.
      const progress = collapseProgress(sentinel.getBoundingClientRect().top, restTop, pinnedTop) >= 1 ? 1 : 0;
      if (progress === last) return;
      last = progress;
      block.style.setProperty('--morph', String(progress));
      // snap 에서 다 접혔을 때 잉크 판을 `visibility` 로도 숨긴다(`scrollMorph.css`) — 아래 블록 배경 주석과 같은 이유.
      block.toggleAttribute('data-collapsed', progress === 1);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };

    measure();
    if (!scrollDriven) apply();
    const clearMode = writeMorphMode(block, mode);

    const resize = new ResizeObserver(() => {
      measure();
      last = -1;
      if (!scrollDriven) schedule();
    });
    resize.observe(block);
    const onResize = () => {
      measure();
      if (!scrollDriven) schedule();
    };
    if (!scrollDriven) window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      resize.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(frame);
      clearMode();
    };
  }, []);

  // 좌우 커튼: 카드 여백 폭에서 0 으로 걷힌다. 위 커튼: 0 에서 `--clip-top` 까지 내려온다(높이가 곧 그 값이라 배율만 바뀐다).
  const sideCurtain = { transform: 'scaleX(calc(1 - var(--morph)))' } satisfies CSSProperties;
  const topCurtain = { height: 'var(--clip-top, 0px)', transform: 'scaleY(var(--morph))' } satisfies CSSProperties;
  // 네 귀: 카드 모서리를 따라 옮겨 가며(좌우는 여백만큼 바깥으로, 위의 둘은 커튼과 같이 아래로) 16px → 0 으로 준다.
  // 귀는 카드 바깥(커튼 위)으로 `CORNER_BLEED` 만큼 넘친다. 귀 네모의 변이 카드 변과 딱 겹치면 두 층의 안티앨리어싱이 겹쳐
  // 잉크가 한 줄 비치고, 둥근 모서리 바깥에 네모 테두리가 옅게 남았다(실측). 축소 기준점은 넘친 만큼 안쪽 = 카드 모서리 그대로다.
  const corner = (x: -1 | 1, top: boolean) =>
    ({
      width: `calc(var(--radius-2xl) + ${CORNER_BLEED})`,
      height: `calc(var(--radius-2xl) + ${CORNER_BLEED})`,
      [x < 0 ? 'marginLeft' : 'marginRight']: `-${CORNER_BLEED}`,
      [top ? 'marginTop' : 'marginBottom']: `-${CORNER_BLEED}`,
      transformOrigin: `${x < 0 ? CORNER_BLEED : `calc(100% - ${CORNER_BLEED})`} ${top ? CORNER_BLEED : `calc(100% - ${CORNER_BLEED})`}`,
      transform: `translate(calc(${x} * var(--side, 0px) * var(--morph)), calc(${top ? 'var(--clip-top, 0px)' : '0px'} * var(--morph))) scale(calc(1 - var(--morph)))`,
      // 귀는 모서리 바깥만 크림이다 — 원의 중심이 카드 안쪽 귀퉁이에 있다.
      background: `radial-gradient(circle at ${x < 0 ? 100 : 0}% ${top ? 100 : 0}%, transparent calc(var(--radius-2xl) - 0.5px), var(--color-bg-secondary) var(--radius-2xl))`,
    }) satisfies CSSProperties;
  // 제목이 지나가기 전에 비켜야 한다 — 늦게 사라지면 올라오는 제목이 부제 위에 겹쳐 읽힌다(실측, 40% 에서 겹쳤다).
  const fadeEarly = { opacity: 'clamp(0, calc(1 - var(--morph) * 4), 1)' } satisfies CSSProperties;
  // 색 구간(`--tone`)의 두 벌 — 앞 벌이 빠지고 뒷 벌이 들어온다. 겹친 두 층의 투명도만 바뀐다.
  const toneOut = { opacity: 'calc(1 - var(--tone))' } satisfies CSSProperties;
  const toneIn = { opacity: 'var(--tone)' } satisfies CSSProperties;

  return (
    <>
      {/* 색이 바뀌는 구간(`--tone`). 잉크 → 크림과 흰 글자 → 본문색을 처음부터 같이 섞으면 중간이 회색 판 위 회색 글자가 돼
          제목이 안 읽혔다(실측). 카드가 거의 헤더 모양이 된 뒤(0.55 → 0.95)에만 바꾼다 — 그전까지는 잉크 판 위 흰 제목이다. */}
      {/* 제자리 = PageHeader 와 같은 첫 블록 높이(`pt-6`/`md:pt-10`). */}
      <div className="pt-6 md:pt-10" />
      <span ref={sentinelRef} aria-hidden="true" className="block h-0" />
      <div
        ref={blockRef}
        // 블록 자체를 크림으로 칠한다(카드 바깥은 원래 크림이라 보이는 것은 같다). iOS 26 은 화면 맨 위에 붙은 sticky 요소의
        // `background-color` 로 상태바 자리를 칠하는데(ADR-010) 투명도는 보지 않는다 — 블록에 색이 없으면 다 접힌 뒤에도 깔려 있는
        // 투명한 잉크 판(`basalt`)이 잡혀 상태바가 잉크로 바뀌었다(실기기). 그래서 잉크 판도 다 빠지면 `visibility` 로 숨긴다.
        className="sticky z-30 bg-secondary"
        style={{
          ['--morph' as string]: 0,
          ['--tone' as string]: 'clamp(0, calc((var(--morph) - 0.55) * 2.5), 1)',
          ['--title-scale' as string]: TITLE_SCALE_END,
          ['--mark-scale' as string]: PAW_SCALE_END,
        }}
      >
        {/* 판 두 장은 블록 전체에 가만히 깔려 투명도만 바뀐다. 카드 모양은 그 위의 크림 커튼·귀가 만든다 — 페이지 바탕과 같은 크림이라
            카드 바깥이 비어 보인다. 좌우 커튼의 폭 = 아래 padRef 의 좌우 여백(`px-4 md:px-6`). */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div data-scroll-morph="tone-out" className="basalt absolute inset-0" style={toneOut} />
          <div data-scroll-morph="tone-in" className="absolute inset-0 bg-secondary" style={toneIn} />
          {/* 헤더 밑줄은 크림 판과 따로 맨 끝에만 들어온다 — 같이 들어오면 아직 카드일 때 밑변에 테두리처럼 보였다(`morph-hero-rule`). */}
          <div data-scroll-morph="hero-rule" className="absolute inset-x-0 bottom-0 border-b border-secondary" style={{ opacity: 'var(--morph)' }} />
          <div data-scroll-morph="curtain-side" className="absolute inset-y-0 left-0 w-4 origin-left bg-secondary md:w-6" style={sideCurtain} />
          <div data-scroll-morph="curtain-side" className="absolute inset-y-0 right-0 w-4 origin-right bg-secondary md:w-6" style={sideCurtain} />
          <div data-scroll-morph="curtain-top" className="absolute inset-x-0 top-0 origin-top bg-secondary" style={topCurtain} />
          <div data-scroll-morph="corner-tl" className="absolute left-4 top-0 md:left-6" style={corner(-1, true)} />
          <div data-scroll-morph="corner-tr" className="absolute right-4 top-0 md:right-6" style={corner(1, true)} />
          <div data-scroll-morph="corner-bl" className="absolute bottom-0 left-4 md:left-6" style={corner(-1, false)} />
          <div data-scroll-morph="corner-br" className="absolute bottom-0 right-4 md:right-6" style={corner(1, false)} />
        </div>

        <div ref={padRef} className="relative px-4 md:px-6">
          <header className="p-6">
            {/* 발바닥은 사라지지 않고 제목과 함께 헤더로 들어간다 — 제목 앞의 작은 표식이 된다. 색은 제목과 같은 구간(`--tone`)에서
                잉크 위의 연한 brand-300 → 크림 위의 brand-secondary 로 바뀐다(연한 분홍은 크림 위에서 흐려진다). 두 벌을 겹쳐 바꾼다. */}
            <div
              ref={pawRef}
              data-scroll-morph="hero-mark"
              className="relative w-max origin-left will-change-transform"
              style={{
                transform: `translate(calc(var(--ptx, 0px) * var(--morph)), calc(var(--pty, 0px) * var(--morph))) scale(calc(1 - ${1 - PAW_SCALE_END} * var(--morph)))`,
              }}
              // 이스터에그라 버튼으로 내세우지 않는다(읽히는 이름도, 포커스도 없다) — 찾아낸 사람의 몫이다.
              onClick={tapPaw}
            >
              {/* 흔들기는 안쪽 한 겹에 — 바깥(`hero-mark`)의 transform 은 접힘이 쥐고 있다. */}
              <span key={wave} className={cx('relative block', wave > 0 && 'motion-wave')}>
                <span data-scroll-morph="tone-out" className="block" style={toneOut}>
                  <PawMark className="block h-9 w-9 text-brand-300" />
                </span>
                <span data-scroll-morph="tone-in" className="absolute inset-0" style={toneIn}>
                  <PawMark className="block h-9 w-9 text-brand-secondary" />
                </span>
              </span>
            </div>
            <h1
              ref={titleRef}
              data-scroll-morph="hero-title"
              className="relative mt-3 w-max origin-left text-display-sm font-bold will-change-transform"
              style={{
                transform: `translate(calc(var(--tx, 0px) * var(--morph)), calc(var(--ty, 0px) * var(--morph))) scale(calc(1 - ${1 - TITLE_SCALE_END} * var(--morph)))`,
              }}
            >
              {/* 흰 글자 → 본문색 글자. 읽히는 것은 앞 벌 하나다 — 뒷 벌은 같은 글자의 색 복사본이라 aria-hidden. */}
              <span data-scroll-morph="tone-out" className="block text-white" style={toneOut}>
                강아지랑 제주
              </span>
              <span aria-hidden="true" data-scroll-morph="tone-in" className="absolute inset-0 text-primary" style={toneIn}>
                강아지랑 제주
              </span>
            </h1>
            <div data-scroll-morph="fade-early" style={fadeEarly}>
              <p className="mt-1.5 text-sm text-white/65">{subtitle}</p>

              {/* 판·칸 없이 부제 밑 한 문장. 수는 발바닥과 같은 brand-300 — 잉크 위에서 이 앱의 답이라는 표시다. */}
              {reach ? (
                <p className="mt-4 text-sm text-white/65">
                  {reach.label} <strong className="text-lg font-bold text-brand-300">{reach.count}</strong>곳
                </p>
              ) : (
                // 등록 버튼은 부제와 같은 묶음이라 같이 먼저 사라진다 — 접힌 헤더엔 제목만. 다 접히면 `fade-early` 가 `visibility` 로
                // 숨으므로 상태바 자리에 걸린 투명한 버튼이 눌리지도 않는다.
                cta && (
                  <Link
                    href={cta.href}
                    className="mt-5 flex items-center gap-3 rounded-xl bg-brand-solid px-4 py-3.5 transition-colors hover:bg-brand-solid_hover"
                  >
                    <PawMark className="h-6 w-6 shrink-0 text-white" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-white">{cta.title}</span>
                      <span className="mt-0.5 block text-sm text-white/85">{cta.body}</span>
                    </span>
                    <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-white/85" />
                  </Link>
                )
              )}
            </div>
          </header>
          {trail > 0 && (
            <span key={trail} aria-hidden="true" className="motion-paw-trail pointer-events-none absolute inset-0 text-brand-300">
              {PAW_TRAIL.map((step, index) => (
                <span
                  key={step.left}
                  style={{ left: step.left, top: step.top, ['--i' as string]: index, ['--step' as string]: `rotate(${step.turn}deg)` }}
                >
                  <PawMark className="block size-5" />
                </span>
              ))}
            </span>
          )}
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
