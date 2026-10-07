import { isRootRoute, normalizeRoute } from './appRoutes';

/**
 * 화면 바탕에 시간이 지나면 강아지 발자국이 하나씩 찍힌다(이스터에그) — 걸음과 시간표를 정하는 순수 함수와, 화면별로 찍힌 발자국을 기억하는 곳.
 *
 * 한 마리가 지나가는 모양이다: **가장자리**(왼쪽 끝·오른쪽 끝·아래쪽)에서 출발해(`startPawWalk`), 한 걸음씩 방향을 조금씩 틀며
 * 그 가장자리를 따라 걷다가(`nextPawStep` — 왼발·오른발이 진행선 양옆으로 번갈아) 몇 걸음 뒤 멈춘다. 잠깐 쉬었다 다른 데서 또 걷는다.
 * 어느 가장자리인지·출발점·방향·걸음 수·간격, 그리고 **어떤 강아지인지**(`TPawKind` — 발 크기·모양·보폭이 다르다)가 전부 운이다.
 * 한 마리는 끝까지 같은 발로 걷는다 — 발자국마다 모양이 바뀌면 "한 마리가 지나갔다" 가 아니라 무늬가 된다. 한 마리는 **3~6걸음**이고(`planPawWalk` 가 출발 전에 길을 다 정해 하한을 지킨다),
 * 한 화면에는 **30개까지**만 보인다(`stampPawPrint` — 넘으면 가장 오래된 것부터 흐린다). 찍힌 발자국은 마리 단위 수명(`pawLifetimeMs`, 8~14초)이
 * 다하면 꼬리부터 차례로, 또는 누르면 천천히 흐려져 사라진다.
 *
 * 발자국은 30% 옅은 색이라 **글·카드 위에는 얹혀도 된다.** 다만 누르는 칸(버튼·입력칸)과 아이콘 위는 피한다 — 찍기 전에 그 자리에 찍어도 되는지
 * 묻는다(`isFree` — 화면이 DOM 으로 판단해 넘긴다). 안 되면 출발점을 다시 뽑고, 걷다가 닿으면 몸을 돌리거나 멈춘다.
 *
 * 기억은 **그 화면에 있는 동안만**이다 — 다른 화면(하위 화면 포함)에 다녀오면 깨끗하다(떠날 때 셸이 `clearPawPrints`). 화면별로 나눠 두는 것은
 * 떠나는 화면과 도착한 화면의 층이 잠깐 함께 있기 때문이다.
 * 타이머는 셸이 쥔다(`components/layout/appShellPawPrints.tsx`) — 화면(특히 홈)은 마운트에 아무 일도 하지 않는다(ADR-014).
 */

/** 지나가는 강아지 — 꼬마(작고 둥근 발)·보통(앱의 발바닥 표식)·큰 개(넓은 발에 발톱 자국)·길쭉이(좁고 긴 토끼발). */
export type TPawKind = 'puppy' | 'classic' | 'big' | 'slim';

/**
 * 강아지마다의 발 — 그릴 크기(`size`, `--spacing` 배수라 화면 축을 따라 커진다), 한 걸음의 길이(`stridePx`), 진행선에서 발까지(`spreadPx`),
 * 그리고 나올 몫(`weight`). 큰 발일수록 보폭·발 사이가 넓다 — 꼬마 발로 큰 개 보폭을 걸으면 띄엄띄엄 찍혀 걷는 것으로 안 읽힌다.
 */
export const PAW_KINDS: Record<TPawKind, { size: number; stridePx: number; spreadPx: number; weight: number }> = {
  puppy: { size: 3, stridePx: 18, spreadPx: 3, weight: 0.25 },
  classic: { size: 4, stridePx: 26, spreadPx: 4, weight: 0.35 },
  big: { size: 5.5, stridePx: 34, spreadPx: 6, weight: 0.2 },
  slim: { size: 4, stridePx: 30, spreadPx: 3, weight: 0.2 },
};
const PAW_KIND_ORDER = Object.keys(PAW_KINDS) as TPawKind[];

/**
 * 진행선 위의 한 점(`x`·`y`, 발자국 층 기준 px)과 그 걸음의 방향(도, 0 = 위, 시계 방향), 어느 발인지, 어떤 강아지인지,
 * 그리고 언제 흐려지기 시작하는지(`fadeAt`, ms)·흐려지는 중인지.
 */
export type TPawPrint = {
  seq: number;
  x: number;
  y: number;
  heading: number;
  foot: -1 | 1;
  kind: TPawKind;
  fadeAt: number;
  fading?: boolean;
};

/** 아직 안 찍힌 한 걸음 — 자리·방향·발·강아지만. 번호와 수명은 찍는 순간에 붙는다(`planPawWalk` 가 미리 정한 길). */
export type TPawStep = Omit<TPawPrint, 'seq' | 'fadeAt' | 'fading'>;

/** 걸어도 되는 사각형(발자국 층 기준 px) — 지금 보이는 화면에서 위 헤더·아래 탭바 자리를 뺀 곳. 좌우는 본문 밖 여백까지 넓힌다. */
export type TPawArea = { left: number; right: number; top: number; bottom: number };

export type TRandom = () => number;
/** 그 자리(층 기준 px)에 찍어도 되는가 — 버튼·입력칸·아이콘 위거나 화면 밖(탭바)이면 false. 글·카드는 true. */
export type TIsFree = (x: number, y: number) => boolean;

/** 한 걸음에 틀 수 있는 각도 — 가장자리를 따라 걸으니 덜 꺾는다. 보폭·발 사이는 강아지마다(`PAW_KINDS`). */
const TURN_DEG = 14;
/** 막혔을 때 차례로 시도하는 꺾음(도) — 작은 것부터. 뒤로(180°)는 없다. */
const WALL_TURNS_DEG = [0, 18, 36, 60, 90];
/** 가장자리 띠의 두께(px) — 좌우 끝에서 이만큼 안쪽, 아래쪽은 걸을 곳의 바닥에서 이만큼 위까지에서 출발한다. */
const EDGE_BAND_PX = 14;
const BOTTOM_BAND_PX = 64;
/** 빈 출발점을 찾으려고 다시 뽑는 횟수. 다 실패하면 이번엔 쉬고 다음 차례에 다시 한다. */
const START_TRIES = 12;

/** 한 화면에 보이는(흐려지지 않은) 발자국 수의 상한 — 넘으면 가장 오래된 것부터 흐린다. 종류는 가리지 않는다. */
export const MAX_PAW_PRINTS = 30;
/** 한 마리가 찍는 걸음의 하한 — 한두 개면 "지나갔다" 가 아니라 얼룩이다. 이만큼 걸을 자리가 없으면 그 마리는 아예 출발하지 않는다. */
export const MIN_PAW_WALK = 3;
/** 한 마리가 찍는 걸음의 상한 — 길게 걸으면 한 마리가 화면을 다 차지한다. */
export const MAX_PAW_WALK = 6;

const between = (rand: TRandom, min: number, max: number) => min + rand() * (max - min);
const radians = (deg: number) => (deg * Math.PI) / 180;
const normalizeHeading = (deg: number) => ((deg % 360) + 360) % 360;
const insideOf = (area: TPawArea, x: number, y: number) =>
  x >= area.left && x <= area.right && y >= area.top && y <= area.bottom;

/** 처음 발자국까지(2~5초) — 들어오자마자는 아니고, 금방 보인다. */
export const firstPawDelayMs = (rand: TRandom) => between(rand, 2_000, 5_000);
/** 걸음 사이(0.6~1.8초) — 한 마리가 지나가는 것이 보일 만큼, 하나씩 찍히는 것이 보일 만큼. */
export const pawStepDelayMs = (rand: TRandom) => between(rand, 600, 1_800);
/** 한 마리가 지나간 뒤 다음 마리까지(1.5~4초) — 3~8초이던 때는 앞 마리가 거의 다 사라진 뒤에야 다음이 와 화면이 자주 비었다. */
export const pawRestDelayMs = (rand: TRandom) => between(rand, 1_500, 4_000);
/** 이번에 지나갈 강아지 — `weight` 몫대로. */
export function pickPawKind(rand: TRandom): TPawKind {
  let roll = rand() * PAW_KIND_ORDER.reduce((sum, kind) => sum + PAW_KINDS[kind].weight, 0);
  for (const kind of PAW_KIND_ORDER) {
    roll -= PAW_KINDS[kind].weight;
    if (roll < 0) return kind;
  }
  return 'classic';
}
/** 한 번에 걷는 걸음 수(3~6) — 막히면 이보다 짧아질 수 있지만 `MIN_PAW_WALK` 밑으로는 안 내려간다(`planPawWalk`). */
export const pawWalkLength = (rand: TRandom) => MIN_PAW_WALK + Math.floor(rand() * (MAX_PAW_WALK - MIN_PAW_WALK + 1));
/**
 * 찍힌 뒤 흐려지기 시작할 때까지(8~14초) — **한 마리에 한 번** 뽑아 그 걸음 전부에 같은 길이를 준다. 그러면 먼저 찍힌 꼬리부터 차례로
 * 흐려져 길이 걸어온 순서대로 증발한다(발자국마다 뽑으면 중간이 먼저 빠져 구멍 난 길이 된다). 25~60초이던 때는 사라지는 것을 볼 일이 없어
 * 쌓이기만 하는 무늬였다.
 */
export const pawLifetimeMs = (rand: TRandom) => between(rand, 8_000, 14_000);

/** 발자국이 찍히는 화면 — 탭바의 메인 화면(홈·둘러보기·준비물·설정). 지도는 캔버스라 뺀다. */
export const hasPawPrints = (pathname: string) => isRootRoute(pathname) && !normalizeRoute(pathname).startsWith('/map');

/** 새 걸음의 첫 발자국 — 왼쪽 끝·오른쪽 끝(위아래로 걷는다)·아래쪽(옆으로 걷는다) 중 하나에서. 찍을 자리를 못 찾으면 null. */
export function startPawWalk(area: TPawArea, rand: TRandom, isFree: TIsFree): TPawStep | null {
  for (let tryIndex = 0; tryIndex < START_TRIES; tryIndex += 1) {
    const edge = rand();
    const along = (base: number) => normalizeHeading(base + between(rand, -TURN_DEG, TURN_DEG));
    const start =
      edge < 0.35
        ? { x: between(rand, area.left, area.left + EDGE_BAND_PX), y: between(rand, area.top, area.bottom), heading: along(rand() < 0.5 ? 0 : 180) }
        : edge < 0.7
          ? { x: between(rand, area.right - EDGE_BAND_PX, area.right), y: between(rand, area.top, area.bottom), heading: along(rand() < 0.5 ? 0 : 180) }
          : { x: between(rand, area.left, area.right), y: between(rand, area.bottom - BOTTOM_BAND_PX, area.bottom), heading: along(rand() < 0.5 ? 90 : 270) };
    const print: TPawStep = { ...start, foot: rand() < 0.5 ? -1 : 1, kind: pickPawKind(rand) };
    const at = pawPrintPosition(print);
    if (isFree(at.x, at.y)) return print;
  }
  return null;
}

/**
 * 다음 한 걸음. 같은 강아지가(`kind` 를 물려받는다) 방향을 조금 틀고 제 보폭만큼 나아간다. 걸을 곳 밖이거나 뭔가(카드·글)에 닿으면 **조금씩 더 틀어**(`WALL_TURNS_DEG`, 어느 쪽이
 * 먼저인지는 운) 벽을 타고, 옆(90°)까지 다 막히면 `null` — 그 마리는 거기서 멈춘다. 모바일 좌우 여백은 16px 이라 곧게만 가면 한두 걸음에
 * 카드에 닿는다 — 바로 90° 꺾던 때는 걸음이 한두 개로 끝나 발자국이 드물었다(실측). 뒤로(180°) 돌지 않는 것은 일부러다: 막힌 띠에서 제 발자국 위를
 * 왕복하며 한 자리에 뭉쳤다(실측).
 */
export function nextPawStep(prev: TPawStep, area: TPawArea, rand: TRandom, isFree: TIsFree): TPawStep | null {
  const foot: -1 | 1 = prev.foot === 1 ? -1 : 1;
  const { kind } = prev;
  const stride = PAW_KINDS[kind].stridePx;
  const attempt = (heading: number): TPawStep | null => {
    const print: TPawStep = {
      heading: normalizeHeading(heading),
      x: prev.x + Math.sin(radians(heading)) * stride,
      y: prev.y - Math.cos(radians(heading)) * stride,
      foot,
      kind,
    };
    const at = pawPrintPosition(print);
    return insideOf(area, print.x, print.y) && isFree(at.x, at.y) ? print : null;
  };
  const heading = prev.heading + between(rand, -TURN_DEG, TURN_DEG);
  const side = rand() < 0.5 ? 1 : -1;
  for (const turn of WALL_TURNS_DEG) {
    const print = attempt(heading + side * turn) ?? (turn === 0 ? null : attempt(heading - side * turn));
    if (print) return print;
  }
  return null;
}

/** 출발점을 다시 고르는 횟수 — 출발은 했는데 `MIN_PAW_WALK` 걸음을 못 채우면(곧 카드·버튼에 막힘) 다른 데서 다시. */
const PLAN_TRIES = 6;

/**
 * 한 마리가 걸을 길 전체(`length` 걸음, 막히면 그보다 짧게) — **`MIN_PAW_WALK` 걸음 이상 걸을 수 있는 길만** 돌려준다. 못 찾으면 null(이번엔 쉰다).
 * 한 걸음씩 그 자리에서 정하던 때는 출발하자마자 막혀 발자국 한두 개로 끝나는 마리가 많았다 — 미리 다 정해 두면 하한이 "무조건" 이 된다.
 * 길은 층 기준 px 라 사용자가 걷는 도중에 스크롤해도 본문과 함께 움직인다.
 */
export function planPawWalk(area: TPawArea, rand: TRandom, isFree: TIsFree, length: number): TPawStep[] | null {
  for (let tryIndex = 0; tryIndex < PLAN_TRIES; tryIndex += 1) {
    const first = startPawWalk(area, rand, isFree);
    if (!first) return null;
    const walk = [first];
    while (walk.length < length) {
      const next = nextPawStep(walk[walk.length - 1], area, rand, isFree);
      if (!next) break;
      walk.push(next);
    }
    if (walk.length >= MIN_PAW_WALK) return walk;
  }
  return null;
}

/** 그릴 자리 — 진행선에서 발 쪽으로 비켜선 점. 발끝은 `heading` 쪽을 본다. */
export const pawPrintPosition = (print: Pick<TPawPrint, 'x' | 'y' | 'heading' | 'foot' | 'kind'>) => {
  const spread = PAW_KINDS[print.kind].spreadPx * print.foot;
  return {
    x: print.x + Math.cos(radians(print.heading)) * spread,
    y: print.y + Math.sin(radians(print.heading)) * spread,
  };
};

/** 누른 자리(층 기준 px)에서 가장 가까운, 아직 흐려지지 않은 발자국 — `reach` 안에 없으면 null. */
export function pawPrintNear(prints: readonly TPawPrint[], x: number, y: number, reach: number): TPawPrint | null {
  let best: TPawPrint | null = null;
  let bestDistance = reach;
  for (const print of prints) {
    if (print.fading) continue;
    const at = pawPrintPosition(print);
    const distance = Math.hypot(at.x - x, at.y - y);
    if (distance <= bestDistance) {
      best = print;
      bestDistance = distance;
    }
  }
  return best;
}

// ── 화면별 기억 (그 화면에 있는 동안) ──

const EMPTY: readonly TPawPrint[] = [];
const trails = new Map<string, readonly TPawPrint[]>();
const listeners = new Set<() => void>();
let lastSeq = 0;

const write = (route: string, next: readonly TPawPrint[]) => {
  trails.set(normalizeRoute(route), next);
  listeners.forEach((listener) => listener());
};

/** 그 화면에 찍힌 발자국. 바뀔 때만 새 배열이라 `useSyncExternalStore` 의 스냅샷으로 그대로 쓴다. */
export const pawPrintsOf = (route: string): readonly TPawPrint[] => trails.get(normalizeRoute(route)) ?? EMPTY;

export const subscribePawPrints = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const nextPawSeq = () => lastSeq + 1;

/**
 * 찍는다. (흐려지지 않은) 발자국이 `MAX_PAW_PRINTS` 를 넘으면 가장 오래된 것부터 **흐린다** — 툭 없애지 않고, 새 발이 찍히는 만큼
 * 가장 먼저 찍힌 것이 증발한다. 흐려지는 것은 `erasePawPrints` 가 1.8초 뒤 기억에서 지운다.
 */
export function stampPawPrint(route: string, print: TPawPrint) {
  lastSeq = Math.max(lastSeq, print.seq);
  const next = [...pawPrintsOf(route), print];
  const visible = next.filter((each) => !each.fading);
  const over = new Set(visible.slice(0, Math.max(0, visible.length - MAX_PAW_PRINTS)).map((each) => each.seq));
  write(route, over.size > 0 ? next.map((each) => (over.has(each.seq) ? { ...each, fading: true } : each)) : next);
}

/** 흐려지기 시작한다 — 화면이 천천히 지우고 다 지워지면 `erasePawPrint` 를 부른다. */
export function fadePawPrints(route: string, seqs: ReadonlySet<number>) {
  const prints = pawPrintsOf(route);
  if (!prints.some((print) => seqs.has(print.seq) && !print.fading)) return;
  write(route, prints.map((print) => (seqs.has(print.seq) ? { ...print, fading: true } : print)));
}

export function erasePawPrints(route: string, seqs: ReadonlySet<number>) {
  const prints = pawPrintsOf(route);
  if (!prints.some((print) => seqs.has(print.seq))) return;
  write(route, prints.filter((print) => !seqs.has(print.seq)));
}

/** 그 화면을 떠날 때 — 찍힌 발자국을 전부 지운다. 다른 화면에 다녀오면 깨끗하다. */
export function clearPawPrints(route: string) {
  if (pawPrintsOf(route).length > 0) write(route, EMPTY);
}

/** 테스트용. */
export function forgetPawPrints() {
  trails.clear();
  lastSeq = 0;
}
