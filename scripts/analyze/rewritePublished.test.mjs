import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { publicGuide } from '../../src/lib/petPolicyPublic';
import { policyFingerprint } from '../lib/petPolicyGuide.mjs';
import { fromPlaceRow } from '../lib/placeFields.mjs';
import { main, parseRewriteArgs } from '../rewrite-published.mjs';
import { PROMPT_FEATURES_RULE, PROMPT_GUIDE_RULE, SYSTEM_PROMPT } from './extractPlaces.mjs';
import {
  applyCheck,
  buildRewritePrompt,
  isRewriteTarget,
  planPatch,
  REWRITE_FIELDS,
  REWRITE_SYSTEM_PROMPT,
  rewriteNeeds,
} from './rewritePublished.mjs';

const petPolicy = {
  indoor: 'free', leash: false, largeDogOk: null, smallDogOnly: true, callFirst: false, vaccineRequired: false, petDays: null,
  feeFree: null, fees: [], weightLimitKg: null, maxDogs: null, notes: null,
};
const body = '사장님이 직접 맞이해 주셔서 체크인을 대면으로 진행했어요.\n마당 넓고 조용한 독채 펜션이에요 정말 좋았어요.\n실내 동반 가능하고 소형견만 받는대요.';
// 게시된 블로그 행 — 소개가 본문을 그대로 옮겼다.
const row = {
  id: 'p1',
  type: 'stay',
  name: '버니하우스',
  region_raw: '동쪽 (구좌읍)',
  address: '제주 제주시 구좌읍 1',
  features: '마당 넓고 조용한 독채 펜션이에요 정말 좋았어요.',
  pet_policy_text: '실내 동반 가능하고 소형견만 받는대요.',
  pet_policy: petPolicy,
  pet_policy_text_public: false,
  pet_policy_guide: null,
  status: 'published',
  source: 'blog',
};
const posts = [{ url: 'https://blog.naver.com/a/1', title: '버니하우스 후기', blog_id: 'a', log_no: '1', body }];
const out = { petPolicyGuide: '체크인·체크아웃은 사장님을 직접 만나서 해요.', features: '넓은 마당이 딸린 조용한 독채 숙소예요.' };

describe('지시 문장 — 추출과 같은 상수', () => {
  it('안내·소개 지시를 추출 프롬프트와 나눠 쓴다(둘이 갈리면 분석된 곳과 다시 쓴 곳의 규칙이 달라진다)', () => {
    expect(SYSTEM_PROMPT).toContain(`- petPolicyGuide: ${PROMPT_GUIDE_RULE}\n- features: ${PROMPT_FEATURES_RULE}\n`);
    expect(REWRITE_SYSTEM_PROMPT).toContain(`- petPolicyGuide: ${PROMPT_GUIDE_RULE}\n`);
    expect(REWRITE_SYSTEM_PROMPT).toContain(`- features: ${PROMPT_FEATURES_RULE}\n`);
  });

  it('프롬프트에 그 장소의 이름·주소와 저장된 판단, 글 본문이 실린다(목록글 안에서 그곳만 읽게)', () => {
    const prompt = buildRewritePrompt(row, posts);
    expect(prompt).toContain('장소: 버니하우스');
    expect(prompt).toContain('주소: 제주 제주시 구좌읍 1');
    expect(prompt).toContain(JSON.stringify(petPolicy));
    expect(prompt).toContain(body);
  });
});

describe('대상 — 게시 · 원문 비공개 · 안내 없음', () => {
  it('원문 공개 행 · 안내 있는 행 · 내린 행은 안 잡힌다', () => {
    expect(isRewriteTarget(row)).toBe(true);
    expect(isRewriteTarget({ ...row, pet_policy_text_public: true })).toBe(false);
    expect(isRewriteTarget({ ...row, pet_policy_guide: { text: '이미 있어요', basis: 'x' } })).toBe(false);
    expect(isRewriteTarget({ ...row, status: 'archived' })).toBe(false);
    expect(isRewriteTarget({ ...row, status: 'draft' })).toBe(false);
  });

  it('할 것이 없으면 Claude 를 부르지 않는다 — 조건 원문이 없고 소개가 베낌이 아니면', () => {
    expect(rewriteNeeds(row, posts)).toEqual({ guide: true, copied: expect.any(String) });
    expect(rewriteNeeds({ ...row, pet_policy_text: '', features: '운영자가 고친 소개예요.' }, posts)).toEqual({ guide: false, copied: null });
    expect(rewriteNeeds(row, [])).toEqual({ guide: false, copied: null });
  });
});

describe('planPatch — 안내와 베낀 소개만', () => {
  it('patch 키는 pet_policy_guide · features 뿐이고, 안내의 basis 는 저장된 판단의 지문이다', () => {
    const { patch } = planPatch(row, posts, out);
    expect(Object.keys(patch).sort()).toEqual([...REWRITE_FIELDS].sort());
    expect(patch.pet_policy_guide).toEqual({ text: out.petPolicyGuide, basis: policyFingerprint(petPolicy) });
    expect(patch.features).toBe(out.features);
  });

  it('왕복: patch 를 얹은 행 → 사이트 장소 → publicGuide 가 문장을 낸다(지문 일치)', () => {
    const { patch } = planPatch(row, posts, out);
    const place = fromPlaceRow({ ...row, ...patch });
    expect(publicGuide(place.petPolicyGuide, place.petPolicy)).toEqual({ text: out.petPolicyGuide, reasons: [] });
  });

  it('베낌이 아닌 소개(운영자가 고친 것)는 그대로 둔다', () => {
    const edited = { ...row, features: '운영자가 손으로 고친 소개예요.' };
    const plan = planPatch(edited, posts, out);
    expect(plan.patch.features).toBeUndefined();
    expect(plan.features.reasons[0]).toContain('그대로');
  });

  it('새 소개가 없거나 가드에 걸리면 지금 소개를 둔다 — 빈 값으로 덮지 않는다', () => {
    expect(planPatch(row, posts, { ...out, features: null }).patch.features).toBeUndefined();
    // 본문 베낌 · 판단 주제(소형견)
    expect(planPatch(row, posts, { ...out, features: '마당 넓고 조용한 독채 펜션이에요 정말 좋았어요.' }).patch.features).toBeUndefined();
    expect(planPatch(row, posts, { ...out, features: '소형견과 묵기 좋은 독채예요.' }).patch.features).toBeUndefined();
  });

  it('가드를 못 지난 안내는 싣지 않는다(베낌 · 판단 주제 · 없는 숫자) — 조건 원문이 없으면 안내 자체를 안 만든다', () => {
    for (const bad of ['사장님이 직접 맞이해 주셔서 체크인을 대면으로', '실내에서도 편하게 쉬어요', '3층 루프탑에서 바다가 보여요']) {
      expect(planPatch(row, posts, { ...out, petPolicyGuide: bad }).patch.pet_policy_guide).toBeUndefined();
    }
    const plan = planPatch({ ...row, pet_policy_text: '' }, posts, out);
    expect(plan.patch.pet_policy_guide).toBeUndefined();
    expect(plan.guide.reasons[0]).toContain('조건 원문');
  });
});

describe('applyCheck — 미리보기 때와 같은 행에만 쓴다', () => {
  const planned = { id: 'p1', name: '버니하우스', before: { features: row.features }, patch: planPatch(row, posts, out).patch };

  it('그대로면 쓴다', () => {
    expect(applyCheck(row, planned)).toBeNull();
  });

  it('판단이 바뀌었거나 · 소개가 바뀌었거나 · 대상이 아니게 됐거나 · 모르는 칸이면 건너뛴다', () => {
    expect(applyCheck({ ...row, pet_policy: { ...petPolicy, indoor: 'cage' } }, planned)).toContain('판단');
    expect(applyCheck({ ...row, features: '고친 소개' }, planned)).toContain('소개');
    expect(applyCheck({ ...row, pet_policy_text_public: true }, planned)).toContain('대상');
    expect(applyCheck({ ...row, status: 'archived' }, planned)).toContain('대상');
    expect(applyCheck(row, { ...planned, patch: { ...planned.patch, pet_policy: {} } })).toContain('pet_policy');
    expect(applyCheck(undefined, planned)).not.toBeNull();
  });
});

/** supabase-js 질의 빌더 흉내 — 체인은 기록만 하고, await 하면 표에서 거른 결과를 준다. */
function fakeSupabase(tables) {
  const updates = [];
  const from = (table) => {
    const filters = [];
    let patch = null;
    const builder = {
      select: () => builder,
      order: () => builder,
      eq: (col, v) => (filters.push((r) => r[col] === v), builder),
      is: (col, v) => (filters.push((r) => (r[col] ?? null) === v), builder),
      in: (col, vs) => (filters.push((r) => vs.includes(r[col])), builder),
      update: (p) => ((patch = p), builder),
      then: (resolve) => {
        const rows = tables[table].filter((r) => filters.every((f) => f(r)));
        if (patch) {
          updates.push({ table, patch, ids: rows.map((r) => r.id) });
          for (const r of rows) Object.assign(r, patch);
        }
        resolve({ data: rows.map((r) => ({ ...r })), error: null });
      },
    };
    return builder;
  };
  return { from, updates };
}

const cliResult = (structured) =>
  JSON.stringify({ type: 'result', subtype: 'success', is_error: false, structured_output: structured, usage: {} });

describe('pnpm data rewrite — 미리보기는 쓰지 않고, --apply 는 그 표를 그대로 쓴다', () => {
  const quiet = () => {
    const keep = [console.log, console.warn, console.error];
    console.log = console.warn = console.error = () => {};
    return () => ([console.log, console.warn, console.error] = keep);
  };

  it('미리보기 → 표·patch 파일, 원격 쓰기 0 · --apply → Claude 0회로 같은 patch', async () => {
    const tables = {
      places: [
        { ...row },
        { ...row, id: 'p2', name: '시드', pet_policy_text_public: true },
        { ...row, id: 'p3', name: '내린 곳', status: 'archived' },
      ],
      place_sources: [{ place_id: 'p1', post_url: posts[0].url }, { place_id: 'p2', post_url: posts[0].url }],
      blog_posts: [{ url: posts[0].url, title: posts[0].title, blog_id: 'a', log_no: '1' }],
    };
    const supabase = fakeSupabase(tables);
    const outDir = mkdtempSync(join(tmpdir(), 'rewrite-'));
    let calls = 0;
    const run = async () => ((calls += 1), cliResult(out));
    const restore = quiet();
    try {
      const now = new Date('2026-10-13T03:00:00Z');
      expect(await main([], { supabase, run, fetchPost: async () => body, now, outDir })).toBe(0);
      expect(calls).toBe(1);
      expect(supabase.updates).toEqual([]);
      const plan = JSON.parse(readFileSync(join(outDir, '2026-10-13.json'), 'utf8'));
      expect(plan.rows.map((r) => r.id)).toEqual(['p1']);
      expect(readFileSync(join(outDir, '2026-10-13.md'), 'utf8')).toContain('버니하우스');

      const never = async () => {
        throw new Error('apply 는 Claude 를 부르지 않는다');
      };
      expect(await main(['--apply'], { supabase, run: never, outDir })).toBe(0);
      expect(supabase.updates).toEqual([{ table: 'places', patch: plan.rows[0].patch, ids: ['p1'] }]);
      expect(Object.keys(supabase.updates[0].patch).every((k) => REWRITE_FIELDS.includes(k))).toBe(true);

      // 두 번째 apply 는 이미 안내가 있어 건너뛴다.
      expect(await main(['--apply'], { supabase, run: never, outDir })).toBe(0);
      expect(supabase.updates).toHaveLength(1);
    } finally {
      restore();
    }
  });

  it('미리보기를 --limit 으로 나눠 돌면 처리한 곳은 건너뛰고 한 plan 에 합친다 · apply 뒤엔 새 회차', async () => {
    const tables = {
      places: [{ ...row }, { ...row, id: 'p4', name: '둘째 곳' }],
      place_sources: [{ place_id: 'p1', post_url: posts[0].url }, { place_id: 'p4', post_url: posts[0].url }],
      blog_posts: [{ url: posts[0].url, title: posts[0].title, blog_id: 'a', log_no: '1' }],
    };
    const supabase = fakeSupabase(tables);
    const outDir = mkdtempSync(join(tmpdir(), 'rewrite-'));
    const seen = [];
    const run = async (_args, input) => (seen.push(input.match(/장소: (.+)/)[1]), cliResult(out));
    const deps = { supabase, run, fetchPost: async () => body, outDir };
    const restore = quiet();
    try {
      expect(await main(['--limit', '1'], { ...deps, now: new Date('2026-10-13T03:00:00Z') })).toBe(0);
      // 날짜가 바뀌어도 반영 안 된 plan 을 이어 받는다.
      expect(await main(['--limit', '1'], { ...deps, now: new Date('2026-10-14T03:00:00Z') })).toBe(0);
      expect(seen).toEqual(['버니하우스', '둘째 곳']);
      const plan = JSON.parse(readFileSync(join(outDir, '2026-10-13.json'), 'utf8'));
      expect(plan.rows.map((r) => r.id)).toEqual(['p1', 'p4']);
      expect(plan.entries.filter((e) => e.retry)).toEqual([]);

      expect(await main(['--apply'], { ...deps })).toBe(0);
      expect(JSON.parse(readFileSync(join(outDir, '2026-10-13.json'), 'utf8')).appliedAt).toBeTruthy();
      // 반영된 plan 은 이어 받지 않는다 — 대상이 다시 생기면 새 회차.
      tables.places.push({ ...row, id: 'p5', name: '셋째 곳' });
      tables.place_sources.push({ place_id: 'p5', post_url: posts[0].url });
      expect(await main([], { ...deps, now: new Date('2026-10-15T03:00:00Z') })).toBe(0);
      expect(seen.at(-1)).toBe('셋째 곳');
      expect(JSON.parse(readFileSync(join(outDir, '2026-10-15.json'), 'utf8')).rows.map((r) => r.id)).toEqual(['p5']);
    } finally {
      restore();
    }
  });

  it('미리보기 뒤 판단이 바뀐 행은 apply 가 건너뛴다', async () => {
    const tables = { places: [{ ...row }], place_sources: [], blog_posts: [] };
    const supabase = fakeSupabase(tables);
    const outDir = mkdtempSync(join(tmpdir(), 'rewrite-'));
    const planned = { id: 'p1', name: '버니하우스', before: { features: row.features }, patch: planPatch(row, posts, out).patch };
    writeFileSync(join(outDir, '2026-10-13.json'), JSON.stringify({ rows: [planned] }));
    tables.places[0].pet_policy = { ...petPolicy, indoor: 'cage' };
    const restore = quiet();
    try {
      expect(await main(['--apply'], { supabase, outDir })).toBe(0);
      expect(supabase.updates).toEqual([]);
    } finally {
      restore();
    }
  });

  it('모르는 인자는 거부한다(오타로 쓰기가 도는 일이 없게)', () => {
    expect(parseRewriteArgs(['--aply']).error).toBeTruthy();
    expect(parseRewriteArgs(['--apply', '--limit', '3']).error).toBeTruthy();
    expect(parseRewriteArgs(['--limit', '0']).error).toBeTruthy();
    expect(parseRewriteArgs(['--apply', 'x.json'])).toMatchObject({ apply: true, planPath: 'x.json' });
    expect(parseRewriteArgs(['--limit', '5'])).toMatchObject({ apply: false, limit: 5 });
  });
});
