import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import { firstOverlap, overlapRatio, privateNeedles, squash } from './lib/bundleLeak.mjs';

const rows = [
  { name: '공개집', petPolicyTextPublic: true, petPolicyText: '공개 원문은 그대로 나가도 되는 긴 문장이에요 정말로.' },
  { name: '비공개집', petPolicyText: '소형견만 가능하고 체중 7kg 이하여야 해요.\n짧은줄', petPolicy: { feeLines: ['추가 요금은 마리당 만원이에요 예약 시 확인'] } },
];

test('비공개 행만, 15자 미만 줄은 뺀다', () => {
  const n = privateNeedles(rows);
  assert.equal(n.length, 1);
  assert.equal(n[0].name, '비공개집');
  assert.ok(n[0].segments.every((s) => s.length >= 15));
  assert.equal(n[0].segments.length, 2);
});

test('공백·줄바꿈이 달라도 이음을 잡는다', () => {
  const seg = privateNeedles(rows)[0].segments[0];
  assert.ok(firstOverlap(seg, squash('앞 소형견만 가능하고   체중 7kg 이하여야 뒤')));
  assert.equal(firstOverlap(seg, squash('전혀 다른 글')), null);
});

test('overlapRatio', () => {
  const t = '가나다라마바사아자차카타파하가나다라';
  assert.equal(overlapRatio(t, squash(t)), 1);
  assert.equal(overlapRatio(t, 'x'), 0);
});

function run(out, cache) {
  return spawnSync('node', [new URL('./check-bundle.mjs', import.meta.url).pathname], {
    env: { ...process.env, CHECK_BUNDLE_OUT: `file://${out}/`, CHECK_BUNDLE_SOURCE: `file://${cache}` },
    encoding: 'utf8',
  });
}

test('check-bundle: 유출은 경고(exit 0) · 캐시가 없으면 조용히 통과', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cb-'));
  const out = join(dir, 'out');
  mkdirSync(out);
  writeFileSync(join(out, 'a.html'), '<p>소형견만 가능하고 체중 7kg 이하여야 해요.</p>');
  const cache = join(dir, 'src.json');
  writeFileSync(cache, JSON.stringify(rows));
  const warned = run(out, cache);
  assert.equal(warned.status, 0);
  assert.match(warned.stderr, /번들 원문 경고.*1곳/s);
  const quiet = run(out, join(dir, 'none.json'));
  assert.equal(quiet.status, 0);
  assert.doesNotMatch(quiet.stderr, /원문 경고/);
  writeFileSync(join(out, 'b.js'), 'x');
  writeFileSync(cache, JSON.stringify([{ name: 'q', petPolicyText: '전혀 겹치지 않는 비공개 원문 문장입니다 정말.' }]));
  assert.doesNotMatch(run(out, cache).stderr, /원문 경고/);
});
