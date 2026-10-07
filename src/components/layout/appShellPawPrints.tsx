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

/** 발자국을 얹지 않는 것 — 누르는 칸과 아이콘·그림. 얹히면 눌림·상태 표시처럼 보이거나 아이콘이 뭉개진다. 글·카드 면은 괜찮다. */
const CONTROL_SELECTOR = 'button, input, textarea, select, img, svg, [role="button"], [contenteditable="true"]';
/** 누름이 그쪽 일인 것 — 여기를 누른 것은 발자국을 지우려는 것이 아니다(카드 링크를 누르면 그 장소로 간다). */
const TAP_TARGET_SELECTOR = `${CONTROL_SELECTOR}, a, label`;

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
 * **글·카드 위에는 찍어도 되고, 누르는 칸 위에는 안 찍는다** — 찍기 전에 그 자리에 무엇이 있는지 `document.elementFromPoint` 로 묻는다
 * (`isFreeAt`). 발자국은 30% 옅은 브랜드색이라 글자 위에 얹혀도 읽힌다 — 빈 바탕에만 찍던 때는 모바일 16px 여백밖에 설 곳이 없어 드물고 단조로웠다.
 * 버튼·입력칸·아이콘은 피한다(얹히면 눌림·상태 표시로 읽힌다). 손가락은 받지 않으므로 걸쳐도 누름을 막지 않는다.
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

    // 이 화면의 것인가 — 셸의 틀(이 화면을 감싸는 상자들)이거나 `<main>` 안. 탭바처럼 `<main>` 밖에 떠 있는 것은 아니다.
    const inScreen = (element: Element) => element.contains(main) || main.contains(element);
    // 발자국 가운데 한 점만 본다 — 가장자리가 버튼에 조금 걸치는 것은 괜찮다(손가락은 안 받는다).
    const isFreeAt = (x: number, y: number) => {
      const origin = layer.getBoundingClientRect();
      const element = document.elementFromPoint(origin.left + x, origin.top + y);
      return !!element && inScreen(element) && !element.closest(CONTROL_SELECTOR);
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
      // 걸을 길을 못 찾으면(3걸음 안에 버튼·아이콘에 막히는 자리뿐) 이번엔 쉰다 — 한두 개만 찍고 끝나는 마리는 없다.
      walk ??= (() => {
        const steps = planPawWalk(area, Math.random, isFreeAt, pawWalkLength(Math.random));
        return steps && { steps, next: 0, lifetimeMs: pawLifetimeMs(Math.random) };
      })();
      if (!walk) {
        rest();
        return;
      }
      const now = Date.now();
      stampPawPrint(route, { ...walk.steps[walk.next], seq: nextPawSeq(), fadeAt: now + walk.lifetimeMs });
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
