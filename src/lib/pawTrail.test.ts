import { beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_PAWS_PER_KIND,
  MAX_PAW_PRINTS,
  MIN_PAW_WALK,
  PAW_KINDS,
  clearPawPrints,
  erasePawPrints,
  fadePawPrints,
  forgetPawPrints,
  hasPawPrints,
  nextPawStep,
  pawPrintNear,
  pawPrintPosition,
  pawPrintsOf,
  pawLifetimeMs,
  pawWalkLength,
  pickPawKind,
  planPawWalk,
  startPawWalk,
  stampPawPrint,
  type TPawArea,
  type TPawPrint,
} from './pawTrail';

const AREA: TPawArea = { left: 0, right: 400, top: 0, bottom: 800 };
const fixed = (value: number) => () => value;
const free = () => true;
const print = (overrides: Partial<TPawPrint> = {}): TPawPrint => ({
  seq: 1,
  x: 200,
  y: 400,
  heading: 0,
  foot: 1,
  kind: 'classic',
  fadeAt: 0,
  ...overrides,
});

describe('pawTrail', () => {
  beforeEach(forgetPawPrints);

  it('메인 탭 넷(홈·둘러보기·준비물·설정)에만 찍히고 지도·하위 화면은 뺀다', () => {
    expect(['/', '/places/stay', '/checklist/', '/settings'].every(hasPawPrints)).toBe(true);
    expect(['/map', '/saved', '/place/abc', '/admin'].some(hasPawPrints)).toBe(false);
  });

  it('첫 발자국은 가장자리 띠(왼쪽 끝·오른쪽 끝·아래쪽)에서 출발한다', () => {
    // 첫 rand 가 어느 가장자리인지 고른다 — 0 왼쪽, 0.5 오른쪽, 0.9 아래쪽. 나머지는 0.5.
    const sequence = (first: number) => {
      let calls = 0;
      return () => (calls++ === 0 ? first : 0.5);
    };
    expect(startPawWalk(AREA, sequence(0), free)!.x).toBeLessThanOrEqual(14);
    expect(startPawWalk(AREA, sequence(0.5), free)!.x).toBeGreaterThanOrEqual(386);
    expect(startPawWalk(AREA, sequence(0.9), free)!.y).toBeGreaterThanOrEqual(736);
  });

  it('빈 곳을 끝내 못 찾으면 이번엔 출발하지 않는다', () => {
    expect(startPawWalk(AREA, Math.random, () => false)).toBeNull();
  });

  it('곧게 걸으면 보폭만큼 방향 쪽으로 나아가고 발이 바뀐다', () => {
    const next = nextPawStep(print(), AREA, fixed(0.5), free);
    expect(next).not.toBeNull();
    expect(next!.x).toBeCloseTo(200);
    expect(next!.y).toBeCloseTo(374);
    expect(next!.foot).toBe(-1);
  });

  it('카드에 닿으면 조금씩 더 틀어 벽을 타고(뒤로 돌지 않는다), 옆까지 다 막히면 멈춘다', () => {
    const blockedAbove = (_x: number, y: number) => y > 390;
    const turned = nextPawStep(print(), AREA, fixed(0.5), blockedAbove);
    const turn = Math.min(turned!.heading, 360 - turned!.heading);
    expect(turn).toBeGreaterThan(0);
    expect(turn).toBeLessThanOrEqual(90);
    expect(nextPawStep(print(), AREA, fixed(0.5), () => false)).toBeNull();
  });

  it('걸을 곳 밖으로는 나가지 않는다', () => {
    const next = nextPawStep(print({ y: 10 }), AREA, fixed(0.5), free);
    expect(next!.y).toBeGreaterThanOrEqual(AREA.top);
    expect([90, 270]).toContain(Math.round(next!.heading));
  });

  it('발은 진행선 양옆으로 비켜 선다', () => {
    expect(pawPrintPosition(print({ foot: 1 })).x).toBeGreaterThan(200);
    expect(pawPrintPosition(print({ foot: -1 })).x).toBeLessThan(200);
  });

  it('한 마리는 끝까지 같은 강아지로 걷고, 큰 개는 보폭도 발 사이도 넓다', () => {
    const big = nextPawStep(print({ kind: 'big' }), AREA, fixed(0.5), free);
    const puppy = nextPawStep(print({ kind: 'puppy' }), AREA, fixed(0.5), free);
    expect(big!.kind).toBe('big');
    expect(puppy!.kind).toBe('puppy');
    expect(400 - big!.y).toBeGreaterThan(400 - puppy!.y);
    expect(pawPrintPosition(print({ kind: 'big' })).x).toBeGreaterThan(pawPrintPosition(print({ kind: 'puppy' })).x);
  });

  it('강아지는 넷 다 나오고, 몫(weight)의 경계에서 다음 강아지로 넘어간다', () => {
    const total = Object.values(PAW_KINDS).reduce((sum, kind) => sum + kind.weight, 0);
    const kinds = new Set([0, 0.3, 0.7, 0.9, 0.999].map((roll) => pickPawKind(fixed(roll))));
    expect(kinds).toEqual(new Set(['puppy', 'classic', 'big', 'slim']));
    expect(pickPawKind(fixed(PAW_KINDS.puppy.weight / total - 0.001))).toBe('puppy');
    expect(pickPawKind(fixed(PAW_KINDS.puppy.weight / total + 0.001))).toBe('classic');
  });

  it('걸음 수는 3~6, 수명은 8~14초(사라지는 것이 보일 만큼)', () => {
    expect(pawWalkLength(fixed(0))).toBe(MIN_PAW_WALK);
    expect(pawWalkLength(fixed(0.999))).toBe(MAX_PAWS_PER_KIND);
    expect(pawLifetimeMs(fixed(0))).toBe(8_000);
    expect(pawLifetimeMs(fixed(1))).toBe(14_000);
  });

  it('길을 미리 정한다 — 한 강아지로 걷고, 3걸음 못 걸을 자리뿐이면 출발하지 않는다', () => {
    const walk = planPawWalk(AREA, fixed(0.5), free, 6);
    expect(walk).toHaveLength(6);
    expect(new Set(walk!.map((step) => step.kind)).size).toBe(1);
    // rand 0.9 면 아래쪽 띠 오른편(360, 794)에서 왼쪽 위로 걷는다. 둘레가 카드·버튼으로 막힌 작은 상자 안에서는 두 걸음뿐이다.
    const cramped = (x: number, y: number) => x > 320 && y > 770;
    expect(planPawWalk(AREA, fixed(0.9), cramped, 6)).toBeNull();
    // 막혀서 짧아져도 3걸음 이상이면 그 길로 간다.
    const roomy = (x: number, y: number) => x > 250 && y > 730;
    const short = planPawWalk(AREA, fixed(0.9), roomy, 6);
    expect(short!.length).toBeGreaterThanOrEqual(MIN_PAW_WALK);
    expect(short!.length).toBeLessThan(6);
  });

  it('누른 자리 가까이의, 흐려지지 않은 발자국을 고른다', () => {
    const prints = [print({ seq: 1, x: 100 }), print({ seq: 2, x: 140 }), print({ seq: 3, x: 300, fading: true })];
    expect(pawPrintNear(prints, 140, 400, 22)?.seq).toBe(2);
    expect(pawPrintNear(prints, 300, 400, 22)).toBeNull();
    expect(pawPrintNear(prints, 220, 400, 22)).toBeNull();
  });

  it('같은 강아지는 6개까지만 보이고, 넘으면 그 종류의 가장 오래된 것부터 흐린다(다른 종류는 그대로)', () => {
    stampPawPrint('/', print({ seq: 1, kind: 'big' }));
    for (let seq = 2; seq <= MAX_PAWS_PER_KIND + 3; seq += 1) stampPawPrint('/', print({ seq }));
    const prints = pawPrintsOf('/');
    const classic = prints.filter((p) => p.kind === 'classic');
    expect(classic.filter((p) => !p.fading)).toHaveLength(MAX_PAWS_PER_KIND);
    expect(classic.filter((p) => p.fading).map((p) => p.seq)).toEqual([2, 3]);
    expect(prints.find((p) => p.kind === 'big')!.fading).toBeFalsy();
  });

  it('화면마다 따로 기억하고, 전체 상한을 넘으면 오래된 것부터 지운다', () => {
    const kinds = Object.keys(PAW_KINDS) as TPawPrint['kind'][];
    for (let seq = 1; seq <= MAX_PAW_PRINTS + 5; seq += 1) stampPawPrint('/settings', print({ seq, kind: kinds[seq % kinds.length] }));
    const prints = pawPrintsOf('/settings/');
    expect(prints).toHaveLength(MAX_PAW_PRINTS);
    expect(prints[0].seq).toBe(6);
    expect(pawPrintsOf('/checklist')).toHaveLength(0);
  });

  it('떠날 때 그 화면의 발자국만 지운다(다른 화면 것은 그대로)', () => {
    stampPawPrint('/', print({ seq: 1 }));
    stampPawPrint('/settings', print({ seq: 2 }));
    clearPawPrints('/');
    expect(pawPrintsOf('/')).toHaveLength(0);
    expect(pawPrintsOf('/settings').map((p) => p.seq)).toEqual([2]);
  });

  it('흐리기 → 지우기. 바뀐 것이 없으면 같은 배열을 돌려준다(스냅샷이 흔들리지 않게)', () => {
    stampPawPrint('/', print({ seq: 1 }));
    stampPawPrint('/', print({ seq: 2 }));
    const before = pawPrintsOf('/');
    fadePawPrints('/', new Set([9]));
    expect(pawPrintsOf('/')).toBe(before);
    fadePawPrints('/', new Set([1]));
    expect(pawPrintsOf('/')[0].fading).toBe(true);
    erasePawPrints('/', new Set([1]));
    expect(pawPrintsOf('/').map((p) => p.seq)).toEqual([2]);
  });
});
