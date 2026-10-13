import assert from 'node:assert/strict';
import test from 'node:test';
import { measureStayCopy } from './measure-stay-copy.mjs';

test('원문과 15자 이상 겹친 칸만 비율이 0 보다 크다', () => {
  const src = [
    { id: 'a', type: 'stay', name: '가', petPolicyText: '강아지 계단, 식기, 배변 패드, 수건을 모두 갖춰 놓았어요.', stay: { amenitiesText: '강아지 계단, 식기, 배변 패드, 수건', price: { text: '59,000원' } } },
    { id: 'b', type: 'stay', name: '나', petPolicyText: '전혀 다른 이야기를 길게 적은 원문입니다.', stay: { amenitiesText: '수영장, 바비큐장, 주차 가능' } },
    { id: 'c', type: 'stay', name: '공개', petPolicyTextPublic: true, petPolicyText: 'x', stay: { amenitiesText: 'x' } },
    { id: 'd', type: 'cafe', name: '카페', petPolicyText: 'x' },
  ];
  const r = measureStayCopy(src, []);
  const a = r.find((x) => x.name === '가' && x.field === 'amenitiesText');
  assert.ok(a.ratio === 1);
  assert.equal(r.find((x) => x.name === '나').ratio, 0);
  assert.ok(!r.some((x) => x.name === '공개' || x.name === '카페'));
});
