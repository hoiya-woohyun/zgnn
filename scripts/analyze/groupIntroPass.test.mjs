import { describe, expect, it } from 'vitest';
import { ClaudeCliError } from './extractPlaces.mjs';
import { introGroupsOf, pickSynthTargets, runSynthPass, SYNTH_ESTIMATE_MS, toGroupIntroRow } from './groupIntroPass.mjs';

/*
 * 묶음 소개 패스(13 §5.3 A2) — 어느 묶음을 부르고 무엇을 저장하나. 모델은 부르지 않는다: 가짜 run 이 받은 재료의 1번 요약을 그대로 소개로 돌려준다
 * (문장 검사 `checkSynthesis` 를 그대로 통과하는 응답). 저장은 가짜 save 가 모은다.
 */
const blog = (path) => `https://blog.naver.com/${path}`;
const row = (url, { name, type = 'stay', features, visited = true, place = null, confidence = 0.8 }) => ({
  post_url: url,
  match_place_id: place,
  extracted: { name, type, features, visited, confidence, match: { tier: place ? 'auto' : 'new' } },
});

const OCEAN = '오션뷰 객실과 테라스가 있는 펜션이에요.';
const BREAKFAST = '조식으로 전복죽을 내는 펜션이에요.';
const rows = [
  // 바다펜션 — 다녀온 글 둘, 요약 둘 → 부를 묶음
  row(blog('a/1'), { name: '바다펜션', features: OCEAN }),
  row(blog('b/2'), { name: '바다펜션', features: BREAKFAST, confidence: 0.9 }),
  // 통나무집 — 다녀온 글 하나 + 목록글 → 재료 하나(부르지 않는다)
  row(blog('c/3'), { name: '통나무집', type: 'cafe', features: '숲속에 있는 통나무 카페예요.' }),
  row(blog('list/9'), { name: '통나무집', type: 'cafe', features: '식약처 명단에 등록된 곳이에요.', visited: false }),
  // 기존 장소에 붙은 묶음 — 대상이 아니다
  row(blog('d/4'), { name: '등대식당', type: 'restaurant', features: '갈치조림 식당이에요.', place: 'p-1' }),
  row(blog('e/5'), { name: '등대식당', type: 'restaurant', features: '바다 앞 식당이에요.', place: 'p-1' }),
  // 오름민박 — 다녀온 글 셋, 요약 셋 → 재료가 더 많다
  row(blog('f/6'), { name: '오름민박', features: '오름 아래 민박이에요.' }),
  row(blog('g/7'), { name: '오름민박', features: '마당에 평상이 있는 민박이에요.' }),
  row(blog('h/8'), { name: '오름민박', features: '조식으로 전복죽을 내는 민박이에요.' }),
];

describe('introGroupsOf — 신규 묶음만, 재료와 지문까지', () => {
  const groups = introGroupsOf(rows);
  it('짝 장소가 있는 묶음(place:)은 빠지고 키는 /admin 과 같은 groupCandidates 의 것', () => {
    expect(groups.map((g) => g.key).sort()).toEqual(['name:바다펜션', 'name:오름민박', 'name:통나무집']);
  });
  it('이름·종류는 대표(confidence 가장 높은 행) · 재료는 다녀온 글의 요약 · 지문이 붙는다', () => {
    const sea = groups.find((g) => g.key === 'name:바다펜션');
    expect(sea).toMatchObject({ name: '바다펜션', type: 'stay', postUrls: [blog('b/2'), blog('a/1')] });
    expect(sea.materials.map((m) => m.text).sort()).toEqual([BREAKFAST, OCEAN].sort());
    expect(sea.fingerprint).toMatch(/^[0-9a-f]{14}$/);
    expect(groups.find((g) => g.key === 'name:통나무집').materials).toHaveLength(1);
  });
});

describe('pickSynthTargets — 기본은 이번 실행 묶음 + 낡은 줄, 밀린 것은 --synth-only 만', () => {
  const groups = introGroupsOf(rows);
  const fpOf = (key) => groups.find((g) => g.key === key).fingerprint;

  it('표가 비고 이번 실행이 아무것도 안 넣었으면 부르지 않는다 — 재료 둘 이상인 묶음은 밀린 채 남는다', () => {
    const plan = pickSynthTargets(groups, new Map());
    expect(plan).toMatchObject({ fresh: 0, single: 1, waiting: 2 });
    expect(plan.targets).toEqual([]);
  });

  it('이번 실행에 후보가 붙은 묶음은 저장된 줄이 없어도 부른다', () => {
    const plan = pickSynthTargets(groups, new Map(), { touchedUrls: new Set([blog('a/1')]) });
    expect(plan.targets.map((t) => [t.key, t.why])).toEqual([['name:바다펜션', 'touched']]);
    expect(plan.waiting).toBe(1);
  });

  it('저장된 지문이 다르면(제외·재분석으로 요약이 바뀜) 부르고, 같으면 그대로 둔다', () => {
    const stored = new Map([
      ['name:바다펜션', fpOf('name:바다펜션')],
      ['name:오름민박', 'old-fingerprint'],
    ]);
    const plan = pickSynthTargets(groups, stored);
    expect(plan.targets.map((t) => [t.key, t.why])).toEqual([['name:오름민박', 'stale']]);
    expect(plan).toMatchObject({ fresh: 1, waiting: 0 });
  });

  it('--synth-only(backlog)는 밀린 것까지 — 이번 실행 → 낡은 줄 → 밀린 것, 같은 자리면 재료 많은 묶음 먼저', () => {
    const extra = introGroupsOf([...rows, row(blog('i/9'), { name: '돌집', features: '돌담 독채예요.' }), row(blog('j/10'), { name: '돌집', features: '귤밭 옆 독채예요.' })]);
    const stored = new Map([['name:돌집', 'old-fingerprint']]);
    const plan = pickSynthTargets(extra, stored, { touchedUrls: new Set([blog('b/2')]), backlog: true });
    expect(plan.targets.map((t) => [t.key, t.why])).toEqual([
      ['name:바다펜션', 'touched'],
      ['name:돌집', 'stale'],
      ['name:오름민박', 'backlog'],
    ]);
    expect(plan.waiting).toBe(0);
  });

  it('재료가 하나 이하인 묶음은 이번 실행 묶음이어도 부르지 않는다(그 요약 그대로 — 화면이 같은 함수로 낸다)', () => {
    const plan = pickSynthTargets(groups, new Map(), { touchedUrls: new Set([blog('c/3')]), backlog: true });
    expect(plan.targets.map((t) => t.key)).not.toContain('name:통나무집');
    expect(plan.single).toBe(1);
  });
});

describe('toGroupIntroRow — 거부·충돌도 지문과 함께 한 줄', () => {
  const group = { key: 'name:바다펜션', fingerprint: 'abc' };
  const meta = { model: 'claude-x', promptVersion: 'deadbeef' };
  const at = new Date('2026-10-13T00:00:00Z');
  it('소개', () => {
    const sentences = [{ text: OCEAN, posts: [blog('a/1')] }];
    expect(toGroupIntroRow(group, { intro: OCEAN, sentences, conflict: null, reasons: [] }, meta, at)).toEqual({
      group_key: 'name:바다펜션',
      fingerprint: 'abc',
      intro: OCEAN,
      sentences,
      conflict: null,
      reasons: [],
      model: 'claude-x',
      prompt_version: 'deadbeef',
      updated_at: '2026-10-13T00:00:00.000Z',
    });
  });
  it('충돌 · 거부 — intro 는 null, 까닭이 남는다', () => {
    const conflict = { reason: '카페 ↔ 식당', posts: [blog('a/1'), blog('b/2')] };
    expect(toGroupIntroRow(group, { intro: null, sentences: [], conflict, reasons: [] }, meta, at)).toMatchObject({ intro: null, conflict, fingerprint: 'abc' });
    expect(toGroupIntroRow(group, { intro: null, sentences: [], conflict: null, reasons: ['가리킨 요약에 없는 말이에요(수영장)'] }, meta, at)).toMatchObject({
      intro: null,
      conflict: null,
      reasons: ['가리킨 요약에 없는 말이에요(수영장)'],
    });
  });
});

describe('runSynthPass — 부르고 저장하기', () => {
  const meta = { model: 'claude-x', promptVersion: 'deadbeef' };
  const cliResult = (structured) =>
    JSON.stringify({ type: 'result', subtype: 'success', is_error: false, structured_output: structured, usage: { input_tokens: 10, output_tokens: 5 } });
  /** 1번 요약을 그대로 소개로 — 문장 검사를 통과하는 응답. `reply` 로 바꿔 끼운다. */
  const echoFirst = (input) => ({ conflict: null, sentences: [{ text: input.match(/요약 1(?: \(글 \d+편\))?: (.+)/)[1], summaries: [1] }] });
  const setup = ({ reply = echoFirst, fail = null, saveError = null } = {}) => {
    const calls = [];
    const saved = [];
    const run = async (args, input) => {
      calls.push(input);
      if (fail) throw fail;
      return cliResult(reply(input));
    };
    const save = async (r) => {
      if (saveError) throw saveError;
      saved.push(r);
    };
    return { calls, saved, run, save, log: () => {} };
  };
  const targets = pickSynthTargets(introGroupsOf(rows), new Map(), { backlog: true }).targets; // 오름민박(재료 3) → 바다펜션(재료 2)

  it('묶음마다 한 번 부르고 지문과 함께 저장한다', async () => {
    const t = setup();
    const out = await runSynthPass({ targets, run: t.run, save: t.save, meta, log: t.log });
    expect(t.calls).toHaveLength(2);
    expect(out).toMatchObject({ done: 2, conflict: 0, rejected: 0, failed: 0, left: 0, rateLimited: null });
    expect(t.saved.map((r) => r.group_key)).toEqual(['name:오름민박', 'name:바다펜션']);
    expect(t.saved[1]).toMatchObject({ fingerprint: targets[1].fingerprint, model: 'claude-x', prompt_version: 'deadbeef' });
    expect(t.saved[1].intro).toBeTruthy();
    expect(t.saved[1].sentences[0].posts.length).toBeGreaterThan(0);
  });

  it('충돌·거부도 저장한다(다음 실행이 다시 부르지 않게)', async () => {
    const conflict = setup({ reply: () => ({ conflict: { reason: '업태가 갈려요', summaries: [1, 2] }, sentences: [] }) });
    const c = await runSynthPass({ targets, run: conflict.run, save: conflict.save, meta, log: conflict.log });
    expect(c).toMatchObject({ done: 2, conflict: 2 });
    expect(conflict.saved.every((r) => r.intro === null && r.conflict)).toBe(true);

    const rejected = setup({ reply: () => ({ conflict: null, sentences: [{ text: '수영장이 딸린 펜션이에요.', summaries: [1] }] }) });
    const r = await runSynthPass({ targets, run: rejected.run, save: rejected.save, meta, log: rejected.log });
    expect(r).toMatchObject({ done: 2, rejected: 2 });
    expect(rejected.saved.every((s) => s.intro === null && s.reasons.length > 0)).toBe(true);
  });

  it('dry-run 은 부르지도 저장하지도 않고 센다', async () => {
    const t = setup();
    const out = await runSynthPass({ targets, run: t.run, save: t.save, meta, dryRun: true, log: t.log });
    expect(t.calls).toHaveLength(0);
    expect(t.saved).toHaveLength(0);
    expect(out.left).toBe(2);
  });

  it('상한(--synth-limit) · 서버 마감(--deadline) 에서 멈추고 남긴 수를 센다', async () => {
    const limited = setup();
    expect(await runSynthPass({ targets, run: limited.run, save: limited.save, meta, limit: 1, log: limited.log })).toMatchObject({ done: 1, left: 1 });
    expect(limited.calls).toHaveLength(1);

    const late = setup();
    const now = () => 1_000_000;
    const out = await runSynthPass({ targets, run: late.run, save: late.save, meta, deadline: 1_000_000 + SYNTH_ESTIMATE_MS - 1, now, log: late.log });
    expect(out).toMatchObject({ done: 0, left: 2 });
    expect(late.calls).toHaveLength(0);
    // 마감이 넉넉하면 다 부른다
    const early = setup();
    expect(await runSynthPass({ targets, run: early.run, save: early.save, meta, deadline: 1_000_000 + SYNTH_ESTIMATE_MS, now, log: early.log })).toMatchObject({ done: 2 });
  });

  it('실패 하나면 저장하지 않고 멈춘다 — 한도면 알린다(rateLimited)', async () => {
    const quota = setup({ fail: new ClaudeCliError('limit', 'Claude AI usage limit reached', { status: 429 }) });
    const out = await runSynthPass({ targets, run: quota.run, save: quota.save, meta, log: quota.log });
    expect(out).toMatchObject({ done: 0, failed: 1, left: 1 });
    expect(out.rateLimited).toBeInstanceOf(ClaudeCliError);
    expect(quota.calls).toHaveLength(1);
    expect(quota.saved).toHaveLength(0);

    const timeout = setup({ fail: new ClaudeCliError('timeout', '시간 초과', { retryable: true }) });
    expect(await runSynthPass({ targets, run: timeout.run, save: timeout.save, meta, log: timeout.log })).toMatchObject({ failed: 1, rateLimited: null });
  });

  it('저장이 실패해도(권한·표 없음) 멈춘다', async () => {
    const t = setup({ saveError: new Error('group_intros 저장 실패: permission denied') });
    const out = await runSynthPass({ targets, run: t.run, save: t.save, meta, log: t.log });
    expect(out).toMatchObject({ done: 0, failed: 1, left: 1 });
    expect(t.calls).toHaveLength(1);
  });
});
