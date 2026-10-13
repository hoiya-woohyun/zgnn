import { describe, expect, it } from 'vitest';
import { groupIntroInput, isIntroGroup, materialsFingerprint, synthesisMaterials } from './groupIntroMaterials.mjs';
import { synthesisMaterials as reexported } from './synthesizeGroupIntro.mjs';

const blog = (path) => `https://blog.naver.com/${path}`;
const posts = [
  { id: blog('a/1'), visited: true, features: '오션뷰 객실과 테라스가 있는 펜션이에요.' },
  { id: blog('b/2'), visited: true, features: '조식으로 전복죽을 내는 펜션이에요.' },
  { id: blog('c/3'), visited: true, features: '오션뷰 객실과 테라스가 있는 펜션이에요.' },
];
const fp = (list) => materialsFingerprint(synthesisMaterials(list));

describe('materialsFingerprint — 재료(다녀온 글의 요약과 그 글)가 바뀔 때만 바뀐다', () => {
  it('같은 재료면 같은 값 · 16진 14자리 · 글 순서와 무관', () => {
    expect(fp(posts)).toMatch(/^[0-9a-f]{14}$/);
    expect(fp(posts)).toBe(fp([...posts].reverse()));
  });

  it('재료의 줄 순서와도 무관 — 해시 전에 코드 단위로 다시 세운다(브라우저·Node 의 localeCompare 가 갈려도 같은 값)', () => {
    const materials = synthesisMaterials([...posts, { id: blog('g/7'), visited: true, features: 'Cafe 7번지 옆 펜션이에요.' }]);
    expect(materialsFingerprint([...materials].reverse())).toBe(materialsFingerprint(materials));
    expect(materialsFingerprint(materials.map((m) => ({ ...m, posts: [...m.posts].reverse() })))).toBe(materialsFingerprint(materials));
  });

  it('목록글 · 빈 요약 · 같은 글 두 번은 재료가 아니라 지문을 안 바꾼다', () => {
    const noise = [
      { id: blog('list/9'), visited: false, features: '식약처 명단에 일반음식점으로 등록된 곳이에요.' },
      { id: blog('d/4'), visited: true, features: null },
      { id: blog('e/5'), visited: true, features: '   ' },
      { id: blog('a/1'), visited: true, features: '다른 말을 하는 같은 글' },
    ];
    expect(fp([...posts, ...noise])).toBe(fp(posts));
  });

  it('새 글이 붙으면(같은 요약이어도) · 요약이 바뀌면 바뀐다', () => {
    expect(fp([...posts, { id: blog('f/6'), visited: true, features: '조식으로 전복죽을 내는 펜션이에요.' }])).not.toBe(fp(posts));
    expect(fp([posts[0], posts[1], { ...posts[2], features: '바다가 보이는 펜션이에요.' }])).not.toBe(fp(posts));
  });

  it('재료가 없으면 빈 재료의 값(던지지 않는다)', () => {
    expect(materialsFingerprint([])).toBe(fp([]));
    expect(materialsFingerprint(undefined)).toBe(fp([]));
  });
});

describe('묶음 → 종합 입력', () => {
  it('synthesizeGroupIntro.mjs 가 같은 함수를 다시 내보낸다(두 쪽이 다른 식으로 재지 않게)', () => {
    expect(reexported).toBe(synthesisMaterials);
  });

  it('소개를 다는 묶음은 신규(name: 키)뿐 — 짝 장소가 있는 묶음(place:)은 사람이 쓴 소개다', () => {
    expect(isIntroGroup({ key: 'name:바다펜션' })).toBe(true);
    expect(isIntroGroup({ key: 'place:p-12' })).toBe(false);
    expect(isIntroGroup({})).toBe(false);
  });

  it('이름·종류는 대표의 것, 글은 행마다 { 글 주소, 요약, 방문 }', () => {
    const lead = { post_url: blog('a/1'), extracted: { name: '바다펜션', type: 'stay', features: '요약 가', visited: true } };
    const other = { post_url: blog('list/9'), extracted: { name: '바다 펜션', type: 'stay', features: '요약 나', visited: false } };
    expect(groupIntroInput({ lead, rows: [lead, other] })).toEqual({
      name: '바다펜션',
      type: 'stay',
      posts: [
        { id: blog('a/1'), features: '요약 가', visited: true },
        { id: blog('list/9'), features: '요약 나', visited: false },
      ],
    });
  });
});
