'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  PAW_KINDS,
  clearPawPrints,
  erasePawPrints,
  fadePawPrints,
  firstPawDelayMs,
  nextPawSeq,
  pawLifetimeMs,
  pawReachPx,
  pawPrintNear,
  pawPrintPosition,
  pawPrintsOf,
  pawRestDelayMs,
  pawStepDelayMs,
  pawWalkLength,
  planPawWalk,
  stampPawPrint,
  subscribePawPrints,
  type TPawArea,
  type TPawStep,
} from '../../lib/pawTrail';
import { cx } from '../../utils/cx';
import { AppShellPawPrintShape } from './appShellPawPrintShape';

/** 걸어도 되는 곳에서 빼는 자리(px) — 위는 붙은 헤더 줄, 아래는 탭바와 그 위 여유. 좌우는 화면 끝에서 발자국이 잘리지 않을 만큼. */
const HEADER_SPACE_PX = 72;
const BOTTOM_SPACE_PX = 80;
const SIDE_SPACE_PX = 9;
/** 이보다 좁게 보이면(아주 낮은 창) 찍지 않는다 — 한두 걸음에 화면을 벗어난다. */
const MIN_AREA_HEIGHT_PX = 120;
/** 누른 자리에서 이 거리 안의 발자국을 지운다 — 발자국(12~22px)보다 넉넉하게, 손가락 크기만큼. */
const TAP_REACH_PX = 22;

/** 흐려지는 시간 — microMotion.css 의 `.paw-print-fading` 전환 길이와 같은 값. */
const PAW_FADE_MS = 1_800;

/** 발자국을 얹지 않는 것 — 누르는 칸과 아이콘·그림. 얹히면 눌림·상태 표시처럼 보이거나 아이콘이 뭉개진다. (글·카드는 `isBlankAt` 이 따로 막는다) */
const CONTROL_SELECTOR = 'button, input, textarea, select, img, svg, [role="button"], [contenteditable="true"]';
/** 누름이 그쪽 일인 것 — 여기를 누른 것은 발자국을 지우려는 것이 아니다(카드 링크를 누르면 그 장소로 간다). */
const TAP_TARGET_SELECTOR = `${CONTROL_SELECTOR}, a, label`;

/** 발자국 넓이를 훑는 점들 — 가운데와 둘레 여덟 방향(반지름의 80% — 발바닥은 상자를 꽉 채우지 않는다). */
const REACH_SAMPLES: readonly (readonly [number, number])[] = [
  [0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7],
];
const REACH_RATIO = 0.8;
/** 글자·카드 가장자리에서 이만큼은 더 비킨다(px). */
const KEEPOUT_MARGIN_PX = 3;

type TRect = { left: number; top: number; right: number; bottom: number };

/**
 * 발자국이 안 얹혀야 하는 상자들(뷰포트 좌표) — `<main>` 안의 **글줄**(글자 마디마다의 줄 상자)과 **면**(배경색·그림·테두리·그림자가 있는 상자) · 누르는 칸·아이콘.
 * `elementFromPoint` 로는 못 찾는다: 홈 히어로의 어두운 카드는 `pointer-events: none` 판이라 그 점을 물어도 판이 안 나온다. 그래서 상자를 직접 모은다.
 * 이 화면을 감싸는 상자(층을 품은 조상)는 바탕이라 뺀다. 걸음 하나를 정할 때마다 한 번 모은다(수천 개 아래의 작은 일).
 */
function collectKeepouts(main: Element, layer: Element): TRect[] {
  const rects: TRect[] = [];
  const push = (rect: DOMRect) => {
    if (rect.width > 0 && rect.height > 0) rects.push({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom });
  };
  const range = document.createRange();
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.textContent?.trim() || layer.contains(node)) continue;
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) push(rect);
  }
  for (const element of main.querySelectorAll('*')) {
    if (element === layer || layer.contains(element) || element.contains(layer)) continue;
    const style = getComputedStyle(element);
    const filled =
      (style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent') ||
      style.backgroundImage !== 'none' ||
      style.boxShadow !== 'none' ||
      parseFloat(style.borderTopWidth) > 0 ||
      parseFloat(style.borderBottomWidth) > 0 ||
      parseFloat(style.borderLeftWidth) > 0 ||
      parseFloat(style.borderRightWidth) > 0;
    if (filled || element.matches(CONTROL_SELECTOR)) push(element.getBoundingClientRect());
  }
  return rects;
}

/** 이 점을 중심으로 반지름 `reach` 의 발자국이 어느 상자와도 안 겹치는가. */
const clearOf = (keepouts: readonly TRect[], x: number, y: number, reach: number) => {
  const half = reach * REACH_RATIO + KEEPOUT_MARGIN_PX;
  return !keepouts.some((rect) => x + half > rect.left && x - half < rect.right && y + half > rect.top && y - half < rect.bottom);
};

/**
 * 화면 바탕에 시간이 지나면 강아지 발자국이 하나씩 찍힌다(이스터에그, 걸음과 시간표는 `lib/pawTrail.ts`).
 *
 * **셸이 쥔다** — 화면(특히 홈)은 마운트에 아무 일도 하지 않는다(ADR-014: 엿보기도 같은 화면을 그린다). 셸은 `<main>` 맨 앞에 높이 0 인
 * 층을 하나 두고, 발자국은 그 층 기준 px 로 찍는다 — 본문과 함께 스크롤되고 스와이프에도 같이 끌려간다(`fixed` 가 아니다).
 *
 * **떠나면 지운다** — 다른 화면(하위 화면 포함)에 다녀오면 발자국은 없다. 셸이 화면마다 `key` 로 새로 붙이므로, 층이 내려갈 때(정리 함수)
 * 그 화면의 발자국을 지운다. 그래서 엿보기(`appShellSwipePeek`)에는 그릴 발자국이 없어 층을 두지 않는다 — 넘기는 동안 떠나는 화면의 발자국만
 * 본문과 함께 끌려간다.
 *
 * **빈 바탕에만 찍는다** — 찍기 전에 발자국이 차지할 넓이를 묻고(`isFreeAt` — 글줄·면·누르는 칸의 상자를 모아 견주고, 틀 밖 크롬은 `elementFromPoint`), 글자·카드(배경·테두리·그림자)·
 * 버튼·입력칸·아이콘 상자와 조금이라도 겹치면 안 찍는다. 옅은 색이어도 글 위를 지나면 얼룩으로 읽혔다(14 W261019.12 — 평가자 3/6이 "닦았다"). 걸음마다 찍는 순간 한 번 더 묻는다
 * (그 사이 스크롤해 글자 밑으로 간 자리에 찍지 않는다). 모바일 좌우 여백은 16px 이라 작은 발만 들어가고, 못 찾으면 이번 마리는 쉰다.
 *
 * **누르면 천천히 사라진다.** 층은 손가락을 받지 않으므로(`pointer-events: none` — 본문을 가로막으면 안 된다) 셸 표면에서 누름을 받아,
 * 누른 곳이 링크·버튼이 아니고 가까이 발자국이 있으면 그것을 흐린다. 수명이 다한 발자국도 같은 식으로 흐려진다.
 *
 * 탭이 가려져 있으면 찍지 않는다(아무도 못 본 사이에 쌓이면 "하나씩 찍힌다" 가 아니다).
 */
export function AppShellPawPrints({ route }: { route: string }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const prints = useSyncExternalStore(
    subscribePawPrints,
    () => pawPrintsOf(route),
    () => pawPrintsOf(route),
  );

  useEffect(() => {
    const layer = layerRef.current;
    const main = layer?.closest('main');
    const surface = main?.parentElement;
    if (!layer || !main || !surface) return;
    const screen = main;
    const paws = layer;

    // 이 화면의 것인가 — 셸의 틀(이 화면을 감싸는 상자들)이거나 `<main>` 안. 탭바처럼 `<main>` 밖에 떠 있는 것은 아니다.
    const inScreen = (element: Element) => element.contains(main) || main.contains(element);
    // 발자국 가운데 한 점만 본다 — 가장자리가 버튼에 조금 걸치는 것은 괜찮다(손가락은 안 받는다).
    let keepouts: TRect[] = [];
    const isFreeAt = (x: number, y: number, reachPx: number) => {
      const origin = layer.getBoundingClientRect();
      if (!clearOf(keepouts, origin.left + x, origin.top + y, reachPx)) return false;
      // 틀 밖(탭바·떠 있는 크롬)이 위에 있는 자리는 상자로 안 모인다 — 그건 점으로 묻는다.
      return REACH_SAMPLES.every(([dx, dy]) => {
        const element = document.elementFromPoint(origin.left + x + dx * reachPx * REACH_RATIO, origin.top + y + dy * reachPx * REACH_RATIO);
        return !!element && inScreen(element) && !element.closest(CONTROL_SELECTOR);
      });
    };

    // 지금 보이는 화면을 층 기준 좌표로. 좌우는 본문 밖 여백까지(넓은 화면에서 `max-w-3xl` 바깥이 통째로 빈 바탕이다).
    const visibleArea = (): TPawArea | null => {
      if (document.visibilityState !== 'visible') return null;
      const rect = layer.getBoundingClientRect();
      const outer = surface.getBoundingClientRect();
      const top = -rect.top + HEADER_SPACE_PX;
      const bottom = -rect.top + window.innerHeight - BOTTOM_SPACE_PX;
      if (bottom - top < MIN_AREA_HEIGHT_PX) return null;
      return { left: outer.left - rect.left + SIDE_SPACE_PX, right: outer.right - rect.left - SIDE_SPACE_PX, top, bottom };
    };

    let stepTimer = 0;
    // 지금 지나가는 마리 — 출발할 때 길 전체(3~6걸음)를 정해 두고 하나씩 찍는다. 수명은 마리에 하나라 꼬리부터 차례로 흐려진다.
    let walk: { steps: TPawStep[]; next: number; lifetimeMs: number } | null = null;
    const schedule = (delayMs: number) => {
      stepTimer = window.setTimeout(step, delayMs);
    };
    const rest = () => {
      walk = null;
      schedule(pawRestDelayMs(Math.random));
    };
    function step() {
      const area = visibleArea();
      if (!area) {
        schedule(pawStepDelayMs(Math.random));
        return;
      }
      keepouts = collectKeepouts(screen, paws);
      // 걸을 길을 못 찾으면(3걸음 안에 버튼·아이콘에 막히는 자리뿐) 이번엔 쉰다 — 한두 개만 찍고 끝나는 마리는 없다.
      walk ??= (() => {
        const steps = planPawWalk(area, Math.random, isFreeAt, pawWalkLength(Math.random));
        return steps && { steps, next: 0, lifetimeMs: pawLifetimeMs(Math.random) };
      })();
      if (!walk) {
        rest();
        return;
      }
      // 계획한 뒤 스크롤·갱신으로 글자 밑이 된 자리에는 찍지 않는다 — 거기서 이 마리는 끝.
      const planned = walk.steps[walk.next];
      const at = pawPrintPosition(planned);
      if (!isFreeAt(at.x, at.y, pawReachPx(planned.kind))) {
        rest();
        return;
      }
      const now = Date.now();
      stampPawPrint(route, { ...planned, seq: nextPawSeq(), fadeAt: now + walk.lifetimeMs });
      walk.next += 1;
      if (walk.next >= walk.steps.length) rest();
      else schedule(pawStepDelayMs(Math.random));
    }

    // 수명이 다한 발자국을 흐린다.
    const sweep = window.setInterval(() => {
      const now = Date.now();
      fadePawPrints(route, new Set(pawPrintsOf(route).filter((print) => print.fadeAt <= now).map((print) => print.seq)));
    }, 1_000);

    // 누르면 천천히 사라진다 — 링크·버튼을 누른 것은 그쪽 일이라 빼고, 바탕이나 글을 눌렀을 때.
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || !inScreen(target) || target.closest(TAP_TARGET_SELECTOR)) return;
      const origin = layer.getBoundingClientRect();
      const hit = pawPrintNear(pawPrintsOf(route), event.clientX - origin.left, event.clientY - origin.top, TAP_REACH_PX);
      if (hit) fadePawPrints(route, new Set([hit.seq]));
    };
    surface.addEventListener('click', onClick);

    schedule(firstPawDelayMs(Math.random));
    return () => {
      window.clearTimeout(stepTimer);
      window.clearInterval(sweep);
      surface.removeEventListener('click', onClick);
      clearPawPrints(route);
    };
  }, [route]);

  return (
    // 본문 **위**(`z-[1]`, 붙은 헤더 `z-30`·탭바 밑) — 글·카드 위에 옅게 얹힌다(밑에 깔면 흰 카드에 가려 안 보인다).
    // 손가락은 절대 받지 않는다(`pointer-events: none`) — 아래쪽 버튼 위에 발자국이 걸쳐도 누름은 그대로 버튼에 간다.
    <div ref={layerRef} aria-hidden="true" className="pointer-events-none relative z-[1] h-0 text-brand-secondary">
      {prints.map((print) => {
        const at = pawPrintPosition(print);
        // 크기는 강아지마다(`PAW_KINDS`) — 가운데가 그 점에 오게 절반만큼 당긴다.
        const size = `calc(var(--spacing) * ${PAW_KINDS[print.kind].size})`;
        return (
          <span
            key={print.seq}
            className="absolute block motion-paw-stamp"
            style={{ left: at.x, top: at.y, width: size, height: size, translate: '-50% -50%', rotate: `${print.heading}deg` }}
          >
            {/* 흐려지기는 안쪽 한 겹에 — 바깥의 "막 찍힘" 애니메이션이 투명도를 쥐고 있어 같은 칸에서는 전환이 안 먹는다. */}
            <AppShellPawPrintShape kind={print.kind} className={cx('paw-print-mark block size-full', print.fading && 'paw-print-fading')} />
            {print.fading && <PawPrintEraser route={route} seq={print.seq} />}
          </span>
        );
      })}
    </div>
  );
}

/**
 * 흐려지는 시간(`--paw-fade-ms`, microMotion.css)이 지나면 기억에서도 지운다. `transitionend` 대신 타이머인 이유: 모션을 줄인 사람·가려진 탭에서는
 * 전환이 아예 안 돌거나 끝 이벤트가 안 와, 흐린 발자국이 기억에 영영 남는다.
 */
function PawPrintEraser({ route, seq }: { route: string; seq: number }) {
  useEffect(() => {
    const timer = window.setTimeout(() => erasePawPrints(route, new Set([seq])), PAW_FADE_MS);
    return () => window.clearTimeout(timer);
  }, [route, seq]);
  return null;
}
