'use client';

import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { stickyMorphProgress, stickyMorphRange } from '../../lib/stickyMorph';
import { offsetInScroller, supportsScrollTimeline, writeMorphRange } from './scrollDrivenMorph';

/**
 * 스크롤을 따라 올라가다 상단에 붙고, **스크롤한 만큼** 큰 제목에서 헤더로 바뀌는 제목 줄.
 *
 * 옛 축약 줄(`collapsingTitleBar`, v22 에 이것과 홈 히어로로 대체돼 지웠다)과 목표는 같다 — 긴 화면에서 "지금 뭘 보고 있고 얼마나 했는지" 를
 * 위에 남긴다. 다른 것은 **방식**이다. 저쪽은 제목이 화면 밖으로 나가는 순간 별도의 줄이 위에서
 * 한 번에 미끄러져 내려오는 켜고 끄기이고, 이쪽은 **본문의 제목 그 자체**가 헤더가 된다(애플 제품
 * 페이지의 로컬 내비와 같은 인상). 그래서:
 *
 * - **진입했을 때는 지금과 같은 모습이다.** 큰 제목(`display-xs`)이 본문 첫 줄 자리에 있다.
 * - **스크롤하면 그대로 올라간다.** 이 줄은 흐름 안의 `sticky` 라 상태바에 닿기 전까지는 본문과 같이 움직인다.
 * - **상태바에 닿으면 붙고, 거기서부터 스크롤한 거리만큼 접힌다**(`--morph` 0 → 1). 글자는 `display-xs` → `md`
 *   크기로 줄고, 밑줄·오른쪽 요약·진행 막대가 같은 비율로 나타난다.
 * - **시간이 아니라 위치의 함수다.** 되돌아 스크롤하면 같은 길을 정확히 되짚는다 — 애니메이션을 "재생" 하지
 *   않으므로 방향을 바꿔도 끊기거나 튀지 않는다. 같은 이유로 `motion-reduce` 에서도 그대로 둔다: 손가락이
 *   움직인 만큼만 움직이는 것은 자동 재생 모션이 아니다.
 *
 * **줄의 높이는 접히는 동안 변하지 않는다.** 흐름 안의 요소라 높이가 줄면 그만큼 아래 본문이 끌려 올라와
 * 스크롤과 다른 속도로 움직인다(읽던 자리가 미끄러진다). 그래서 글자 크기는 `font-size` 가 아니라
 * `scale` 로 줄인다 — 레이아웃을 건드리지 않고 합성만 한다. 줄 높이는 접힌 헤더의 높이(14단, 하위 화면
 * 뒤로가기 줄과 같다)로 처음부터 고정이다.
 *
 * **큰 제목은 줄의 바닥에 앉아 있다가, 접히면서 가운데로 올라간다**(`translateY`, 2단). 처음부터 가운데에 두면
 * 제목 아래에 12px 이 남아 본문 첫 줄(소개 문장)이 PageHeader 때보다 멀어지고, 그걸 음수 여백으로 당기면 그 줄이
 * 이 줄의 불투명 배경 밑으로 들어가 **윗부분이 잘려 보인다**(실측). 바닥에 앉히면 소개 문장이 줄 바로 밑에서
 * 예전 간격(4px)으로 시작하고, 접힐 때 제목이 조금 더 올라가는 움직임이 "헤더로 들어간다" 는 인상을 더한다.
 *
 * **`fixed` 가 아니라 `sticky` 인 이유.** 셸이 화면을 옆으로 끌 때 `<main>` 에 transform 을 거는데, 그 안의
 * `fixed` 는 화면이 아니라 `<main>` 을 기준으로 잡혀 `--swipe-viewport-top` 으로 상쇄해야 했다
 * (ADR-014). `sticky` 는 스크롤 영역을 기준으로 잡히므로 그 보정이 필요 없다.
 *
 * **상태바 자리는 자기 배경으로 덮는다**(`bleed-top-0`, ADR-010). 붙은 동안 밑을 지나는 본문이 상태바 뒤로
 * 비치지 않게. 배경은 바탕과 같은 크림이라 접히기 전(0)에는 보이지 않고, 가르는 선만 접히는 만큼 짙어진다.
 *
 * **접힘은 브라우저의 스크롤 구동 애니메이션이 돌린다**(`styles/scrollMorph.css`). JS 는 크기가 바뀔 때 구간(스크롤 오프셋)만
 * 적는다 — 스크롤 이벤트로 `--morph` 를 적던 때는 모바일에서 제목이 스크롤보다 한 박자 늦고 크기가 떨렸다(`scrollDrivenMorph.ts`).
 * 지원하지 않는 브라우저에서만 예전처럼 `--morph` 를 스크롤마다 적는다 — React 상태가 아니라 CSS 변수라 목록은 다시 렌더되지 않는다.
 */

/** 접힌 헤더의 높이. 하위 화면의 뒤로가기 줄(appBar)·옛 축약 줄과 같은 14단이라 화면을 오갈 때 위쪽이 튀지 않는다. */
const BAR_HEIGHT = 'calc(var(--spacing) * 14)';

/**
 * 큰 제목 → 헤더 제목의 크기 비. `display-xs`(6단) → `md`(4단). 둘 다 `--spacing` 의 배수라 브레이크포인트가
 * 바뀌어도 비는 같다(ADR-006) — 그래서 상수로 둬도 된다.
 */
const TITLE_SCALE_END = 4 / 6;

/** 서버에서는 `useLayoutEffect` 가 경고만 낸다(모든 화면을 빌드 때 그린다). 브라우저에서만 그리기 전에 끼어든다. */
const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

type TStickyMorphTitleProps = {
  /** 제목. 진짜 `<h1>` 이다 — 접혀도 같은 요소라 스크린리더가 한 번만 읽는다. */
  title: string;
  /** 접혔을 때 오른쪽에 나타나는 짧은 요약(예: `4/12 준비됨`). 본문에 같은 말이 있으므로 장식이다. */
  trailing?: ReactNode;
  /** 0~100. 주면 접힌 헤더 아래에 얇은 진행 막대가 나타난다(장식). */
  percent?: number;
};

export function StickyMorphTitle({ title, trailing, percent }: TStickyMorphTitleProps) {
  const sentinelRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const insetProbeRef = useRef<HTMLSpanElement>(null);

  useBeforePaint(() => {
    const sentinel = sentinelRef.current;
    const bar = barRef.current;
    const probe = insetProbeRef.current;
    if (!sentinel || !bar || !probe) return;

    /*
     * 인셋·줄 높이는 CSS(env·--spacing)가 정하는 값이라 JS 에 베껴 적지 않고 **잰다**. 회전·브레이크포인트로
     * 바뀔 수 있으므로 크기가 바뀔 때마다 다시 잰다(ResizeObserver). 스크롤 프레임마다 재지는 않는다 —
     * 스크롤 중에 바뀌는 값이 아니고, 재면 레이아웃을 강제한다.
     */
    const scrollDriven = supportsScrollTimeline();
    let inset = 0;
    let distance = 0;
    const measure = () => {
      inset = probe.offsetHeight;
      // 접히는 거리 = 헤더 줄 높이(인셋 제외). 줄 하나만큼 스크롤하면 다 접힌다 — 짧으면 튀고, 길면 반쯤 접힌 채 오래 머문다.
      distance = bar.offsetHeight - inset;
      if (scrollDriven) writeMorphRange(bar, stickyMorphRange(offsetInScroller(sentinel), inset, distance));
    };

    let frame = 0;
    let last = -1;
    const apply = () => {
      frame = 0;
      const progress = stickyMorphProgress(sentinel.getBoundingClientRect().top, inset, distance);
      // 같은 값이면 쓰지 않는다 — 접히기 전·다 접힌 뒤의 긴 스크롤 동안 style 쓰기가 0 이 된다.
      if (progress === last) return;
      last = progress;
      bar.style.setProperty('--morph', String(progress));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };

    measure();
    // 그리기 전에 한 번 — 스크롤이 복원된 채로 들어온 경우 첫 프레임부터 맞는 모습이다.
    if (!scrollDriven) apply();

    const resize = new ResizeObserver(() => {
      measure();
      last = -1;
      if (!scrollDriven) schedule();
    });
    resize.observe(bar);
    // 스크롤 구동이면 스크롤은 브라우저 몫이다. 창 크기는 구간(센티넬 위치)을 바꿀 수 있어 양쪽 다 다시 잰다.
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
    };
  }, []);

  return (
    <>
      {/* 진입 때 제목의 자리를 PageHeader(`pt-6`/`md:pt-10`)와 맞추는 여백. 제목이 줄(14단) 바닥에서 1단 띄워
          앉아 있으므로(제목 줄 8단) 위로 5단이 이미 있다 — 그만큼 뺀 값이다. md 는 --spacing 이 4.5px 라 10단 - 5단. */}
      <div className="pt-1 md:pt-5" />
      <span ref={sentinelRef} aria-hidden="true" className="block h-0" />
      <div
        ref={barRef}
        className="bleed-top-0 sticky top-0 z-30 bg-secondary"
        style={{ ['--morph' as string]: 0, ['--title-scale' as string]: TITLE_SCALE_END }}
      >
        <div className="relative mx-auto flex items-end gap-3 px-4 pb-1 md:px-6" style={{ height: BAR_HEIGHT }}>
          <h1
            data-scroll-morph="title"
            className="min-w-0 flex-1 origin-left truncate text-display-xs font-bold text-primary will-change-transform"
            // 바닥(1단 띄움)의 제목 중심 → 줄의 가운데까지 2단. translate 를 scale 앞에 적어야 이동 거리가 줄어든 크기에 안 곱해진다.
            style={{
              transform: `translateY(calc(var(--spacing) * -2 * var(--morph))) scale(calc(1 - ${1 - TITLE_SCALE_END} * var(--morph)))`,
            }}
          >
            {title}
          </h1>
          {trailing && (
            <span
              aria-hidden="true"
              data-scroll-morph="title-trailing"
              className="shrink-0 self-center text-sm text-tertiary"
              // 제목이 반쯤 줄어든 뒤부터 나타난다 — 큰 제목 옆에 작은 요약이 같이 뜨면 두 크기가 한 줄에서 다툰다.
              style={{ opacity: 'clamp(0, calc(var(--morph) * 2 - 1), 1)' }}
            >
              {trailing}
            </span>
          )}
        </div>

        {/* 가르는 선과 진행 막대. 선은 접히는 만큼 짙어지고, 막대는 선 위에 겹쳐 같은 비율로 나타난다. */}
        <div aria-hidden="true" className="relative h-px">
          <div
            data-scroll-morph="fade-in"
            className="absolute inset-x-0 bottom-0 border-b border-secondary"
            style={{ opacity: 'var(--morph)' }}
          />
          {percent !== undefined && (
            <div
              data-scroll-morph="fade-in"
              className="absolute bottom-0 left-0 h-0.5 bg-brand-solid transition-[width] duration-300 ease-out"
              style={{ width: `${percent}%`, opacity: 'var(--morph)' }}
            />
          )}
        </div>
      </div>
      {/* 상태바 인셋을 재는 탐침. env() 는 JS 에서 직접 못 읽는다 — 높이로 읽는다. */}
      <span
        ref={insetProbeRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute left-0 top-0 w-0"
        style={{ height: 'env(safe-area-inset-top, 0px)' }}
      />
    </>
  );
}
