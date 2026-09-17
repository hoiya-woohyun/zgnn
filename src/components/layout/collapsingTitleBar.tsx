'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
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
 * **배경은 불투명이어야 한다.** 이 줄은 `fixed top-0` 이고, 접히지 않은 동안 사라지는 게
 * 아니라 `opacity-0` 으로 **남아 있다.** iOS 26 Safari 는 가장자리에 붙은 fixed/sticky 요소의
 * `background-color` 를 읽어 자기 툴바를 칠하는데, 그 휴리스틱이 opacity 까지 보는지는 알 수
 * 없다 — 즉 **보이지 않는 이 줄이 브라우저 띠 색을 결정할 수 있다.** 반투명이면 흐려진 색이
 * 건너간다. 탭바를 불투명으로 바꾼 것과 같은 이유다(ADR-010). 맨 위 면이 전 화면 크림인
 * 지금은 이 줄이 주는 색도 크림이라, 어느 쪽을 샘플링하든 답이 같아진다(ADR-010 v3).
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
  const sentinelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    /*
      `isIntersecting` 만 보면 센티넬이 화면 **아래로** 벗어난 경우에도 접힌다 — 화면이
      길어 페이지 전체가 한눈에 들어오는 데스크톱에서 그런 일이 생긴다. 위로 나갔을 때만
      접도록 위치(top < 0)를 함께 본다.
    */
    const observer = new IntersectionObserver(
      ([entry]) => setCollapsed(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
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
          'fixed inset-x-0 top-0 z-30 border-b border-secondary bg-secondary transition-opacity duration-200 md:left-64',
          collapsed ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
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
