'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '../../utils/cx';

/**
 * 맨 위 제목이 화면 밖으로 나가면 대신 나타나는 축약 줄.
 *
 * 탭 화면은 하위 화면과 달리 뒤로가기 줄(appBar)이 없어서, 아래로 내려가면 상단에 아무것도
 * 남지 않는다. 준비물처럼 긴 화면에서는 "지금 뭘 보고 있고 얼마나 했는지" 가 통째로 사라진다.
 * 그래서 제목이 사라지는 그 순간에만 한 줄을 띄운다 — 위에 있을 때는 큰 제목이 이미 말하므로
 * 아무것도 하지 않는다(iOS 의 큰 제목 → 작은 제목 접힘과 같은 규칙).
 *
 * **`fixed` 다.** 나타났다 사라지는 줄이 흐름에 자리를 차지하면 나타나는 순간 아래 내용이
 * 통째로 밀린다 — 읽던 자리가 튄다. appBar 가 `sticky` 인 것과 이유가 갈리는 지점이다
 * (저쪽은 늘 있어서 자리를 잡아 두어야 하고, 이쪽은 없는 게 기본이다).
 *
 * 상태바 인셋은 스스로 칠한다(ADR-010). 셸은 `<main>` 에 인셋만큼 위 여백만 주므로, 화면
 * 위에 떠서 그 자리를 덮는 것은 자기 배경을 그만큼 위로 늘려야 한다 — 안 그러면 노치
 * 기기에서 이 줄 위로 내용이 스쳐 지나간다.
 *
 * **상태바 뒤에서 미끄러져 내려오고, 같은 길로 되올라간다.** 접히는 순간 `-translate-y-full`
 * → `0`, 풀리는 순간 그 반대다. 이 요소의 높이에는 상태바 인셋(`paddingTop`)이 들어 있어서,
 * 올라가 있는 동안에는 인셋까지 통째로 화면 밖이다 — 그래서 "노치 위에서 내려온다" 로 보인다.
 *
 * **오갈 때 투명도는 건드리지 않는다.** 미끄러짐과 페이드를 같이 걸면 이동하는 내내 줄이
 * 반쯤 비쳐, 어느 방향으로 움직이는지가 안 읽히고 제자리에서 얼룩지는 것처럼 보인다 — 페이드만
 * 하던 더 예전 판의 인상이 절반쯤 되살아난다. 페이드는 `motion-reduce` 에서만 쓴다(그쪽은
 * 미끄러짐을 지우는 게 목적이라 대신할 것이 필요하다). 들고 날 때 시간(`duration-300`)이 같은
 * 것도 같은 이유다 — 같은 길을 같은 속도로 되짚어야 한 동작의 앞뒤로 보인다.
 *
 * 배경색은 바탕과 같은 크림(`bg-secondary`)이다 — 상태바·홈 인디케이터 자리에 닿는 면은
 * 전부 바탕색이다(ADR-010 v4). 흰색이던 때는 접히는 순간 상태바 자리가 크림 → 흰색으로
 * 바뀌어, 같은 화면에서 맨 위 색이 스크롤 위치에 따라 달라졌다. 본문과는 `border-b` 로 가른다.
 *
 * **배경은 불투명이어야 한다.** 이 줄은 `fixed top-0` 이고, 접히지 않은 동안 사라지는 게
 * 아니라 화면 위로 물러난 채 **남아 있다.** iOS 26 Safari 는 가장자리에 붙은 fixed/sticky 요소의
 * `background-color` 를 읽어 자기 툴바를 칠하는데, 그 휴리스틱이 opacity 까지 보는지는 알 수
 * 없다 — 즉 **보이지 않는 이 줄이 브라우저 띠 색을 결정할 수 있다.** 반투명이면 흐려진 색이
 * 건너간다. 탭바를 불투명으로 바꾼 것과 같은 이유다(ADR-010). 색이 바탕과 같아진 v4 부터는
 * 무엇을 집어 가도 크림이다.
 * 오가는 동안에도 `opacity` 를 안 쓰게 된 지금은 이 줄이 늘 불투명이라 그 걱정이 한 겹
 * 줄었지만, `motion-reduce` 에서는 여전히 0↔1 로 오가므로 위 이야기가 그대로 적용된다.
 *
 * 통째로 `aria-hidden` 인 것은 장식이기 때문이다. 제목도 진행률도 본문에 이미 진짜가 있고,
 * 여기 것은 그 복사본이라 스크린리더가 두 번 읽으면 안 된다.
 */

/** 축약 줄의 높이. 하위 화면의 뒤로가기 줄(appBar)과 같은 14단이라 화면을 오갈 때 위쪽이 튀지 않는다. */
const BAR_HEIGHT = 'calc(var(--spacing) * 14)';

/**
 * 센티넬을 제목 블록 바닥에서 얼마나 띄울지 = 접힌 줄이 덮는 높이(인셋 + 줄 높이).
 *
 * 이 값이 곧 "언제 접히나" 의 정의다 — 제목 블록의 바닥이 이 줄의 아래 끝에 닿는 순간 바꾼다.
 * 더 일찍 바꾸면 아직 보이는 제목 위에 같은 제목이 겹치고, 더 늦게 바꾸면 제목이 사라진 뒤
 * 빈 상단이 한 구간 남는다.
 *
 * 노치 높이(env)도 반응형 스케일(--spacing)도 JS 로 재지 않는 것이 요점이다. 재려면 값이
 * 바뀔 때마다(기기 회전·브레이크포인트) 다시 재야 하고, 그 재계산을 한 번 빠뜨리면 그 상태에서만
 * 접히는 지점이 어긋난다. calc 으로 적어 두면 브라우저가 알아서 따라간다.
 */
const SENTINEL_OFFSET = `calc(env(safe-area-inset-top, 0px) + ${BAR_HEIGHT})`;

/**
 * 서버에서는 `useLayoutEffect` 가 아무 일도 못 하면서 경고만 낸다(이 앱은 모든 화면을 빌드 때
 * 미리 그린다). 브라우저에서만 그리기 전에 끼어들면 된다.
 */
const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

type TCollapsingTitleBarProps = {
  /** 접혔을 때 보일 제목. 본문의 큰 제목과 같은 말이어야 한다. */
  title: string;
  /** 제목 오른쪽의 짧은 요약(예: `4/12 준비됨`). 길면 제목이 먼저 줄어든다. */
  trailing?: ReactNode;
  /** 0~100. 주면 줄 아래에 얇은 진행 막대가 붙는다. */
  percent?: number;
  /** 접히기 전의 제목 블록. 이 블록의 바닥이 접히는 기준점이 된다. */
  children: ReactNode;
};

export function CollapsingTitleBar({ title, trailing, percent, children }: TCollapsingTitleBarProps) {
  const [collapsed, setCollapsed] = useState(false);
  /**
   * 첫 판정이 끝났는가. 그전까지는 전환을 걸지 않는다 — 마운트 직후에 정해지는 자리는
   * "움직임" 이 아니라 **처음 모습**이다.
   */
  const [decided, setDecided] = useState(false);
  const sentinelRef = useRef<HTMLSpanElement>(null);

  /*
   * 마운트하는 순간 이미 제목이 지나간 자리라면 **그리기 전에** 접힌 상태로 정해 둔다.
   * 딥링크로 들어와 브라우저가 스크롤을 복원한 경우가 그렇다.
   */
  useBeforePaint(() => {
    const sentinel = sentinelRef.current;
    if (sentinel) setCollapsed(sentinel.getBoundingClientRect().top < 0);
  }, []);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    /*
      `isIntersecting` 만 보면 센티넬이 화면 **아래로** 벗어난 경우에도 접힌다 — 화면이
      길어 페이지 전체가 한눈에 들어오는 데스크톱에서 그런 일이 생긴다. 위로 나갔을 때만
      접도록 위치(top < 0)를 함께 본다.
    */
    /*
      첫 판정까지는 전환을 끄는 이유. 셸이 화면마다 스크롤 자리를 되돌려 놓는데
      (`lib/appScroll.ts`), 그 복원은 **이 컴포넌트의 이펙트보다 늦게** 돈다 — 리액트는
      자식의 이펙트를 먼저 돌리고 셸은 조상이다. 그래서 위의 `useBeforePaint` 가 잴 때는 아직
      스크롤이 0 이고, 접혀야 한다는 답은 복원 뒤 이 관찰자에게서 처음 온다. 그때 전환이
      걸려 있으면 옆에서 밀려 들어올 때 엿보기에 이미 내려와 있던 줄이, 도착하고 나서 위에서
      300ms 동안 다시 내려온다 — 한 동작이 두 번 일어나는 것처럼 보인다(실측).

      전환을 되살리는 것은 한 프레임 뒤다. 같은 렌더에서 되살리면 자리 변화와 전환이 함께
      적용돼 그대로 애니메이션된다 — 끄나 마나가 된다.
    */
    let raf = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setCollapsed(!entry.isIntersecting && entry.boundingClientRect.top < 0);
        if (!raf) raf = requestAnimationFrame(() => setDecided(true));
      },
      { threshold: 0 },
    );
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      {/* 센티넬의 기준 상자. 배경도 여백도 없어, 안에 든 제목 블록의 여백·마진을 가로막지 않는다. */}
      <div className="relative">
        {children}
        <span
          ref={sentinelRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 h-px"
          style={{ bottom: SENTINEL_OFFSET }}
        />
      </div>

      <div
        aria-hidden="true"
        className={cx(
          'fixed inset-x-0 z-30 border-b border-secondary bg-secondary md:left-64',
          // 첫 판정 전에는 전환을 걸지 않는다(아래 관찰자 주석). 자리·투명도 자체는 그대로 둔다 —
          // 여기까지 같이 끄면 모션 줄임에서 첫 판정 때 줄이 제자리에서 사라지는 것이 보인다.
          decided
            ? 'transition-transform duration-300 will-change-transform motion-reduce:transition-opacity motion-reduce:duration-300'
            : 'transition-none',
          collapsed ? 'translate-y-0 ease-out' : 'pointer-events-none -translate-y-full ease-in',
          // 모션을 줄이기로 한 사용자에게는 미끄러짐 없이 페이드만. 도착점은 같다(appTabBar 와 같은 규칙).
          // 투명도는 **여기서만** 쓴다 — 평소에도 같이 페이드하면 미끄러지는 동안 줄이 반쯤 비쳐,
          // 방향이 읽히지 않고 제자리에서 얼룩지는 것처럼 보인다.
          'motion-reduce:translate-y-0',
          collapsed ? 'motion-reduce:opacity-100' : 'motion-reduce:opacity-0',
        )}
        /*
         * 맨 위는 `top-0` 이 아니라 변수를 거친다. 손가락으로 화면을 넘기는 동안 셸이
         * `<main>` 에 transform 을 거는데(appShellSwipe), transform 이 걸린 조상이 있으면
         * `fixed` 는 화면이 아니라 **그 조상**을 기준으로 잡힌다 — `top: 0` 이 문서 맨 위를
         * 가리키게 되어, 내려 본 상태에서 끌기 시작하면 이 줄이 화면 위로 사라진다.
         * 그래서 셸이 잠기는 순간 지금 스크롤 값을 이 변수에 적어 그만큼을 상쇄한다.
         * 끌지 않는 동안에는 변수가 없어 `0px` 로 읽히고, 원래대로 화면 맨 위다.
         */
        style={{ top: 'var(--swipe-viewport-top, 0px)', paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        {/* 셸이 본문에 주는 폭·좌우 여백과 같게 맞춘다 — 배경만 화면 끝까지, 글자는 본문 줄에. */}
        <div
          className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 md:px-6"
          style={{ height: BAR_HEIGHT }}
        >
          <p className="clamp-1 min-w-0 flex-1 text-md font-bold text-primary">{title}</p>
          {trailing && <span className="shrink-0 text-sm text-tertiary">{trailing}</span>}
        </div>

        {percent !== undefined && (
          <div className="h-0.5 bg-tertiary">
            <div
              className="h-full bg-brand-solid transition-[width] duration-300 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
        )}
      </div>
    </>
  );
}
