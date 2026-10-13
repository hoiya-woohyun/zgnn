import { describe, expect, it } from 'vitest';
import { introChooser } from './apply-approved.mjs';
import { groupIntroInput, materialsFingerprint, synthesisMaterials } from './analyze/groupIntroMaterials.mjs';

const row = (id, url, features, over = {}) => ({ id, post_url: url, match_place_id: null, extracted: { name: '바다펜션', type: 'stay', features, visited: true, confidence: 0.8, ...over } });

describe('introChooser — CLI 반영도 /admin 과 같은 묶음 · 같은 함수로 소개를 정한다(13 §5.3 A3)', () => {
  const approved = row('c-2', 'https://blog/2', '조식으로 전복죽을 내는 펜션이에요.');
  const pending = row('c-1', 'https://blog/1', '오션뷰 객실과 테라스가 있는 펜션이에요.', { confidence: 0.9 });
  const intro = '오션뷰 객실과 테라스가 있고 조식으로 전복죽을 내는 펜션이에요.';
  const storedFor = (rows) => {
    const fingerprint = materialsFingerprint(synthesisMaterials(groupIntroInput({ rows }).posts));
    return new Map([['name:바다펜션', { group_key: 'name:바다펜션', fingerprint, intro, sentences: [{ text: intro, posts: ['https://blog/1', 'https://blog/2'] }], conflict: null, reasons: [] }]]);
  };

  it('승인 행을 pending 형제와 다시 묶어 지문이 맞으면 저장 종합을 쓴다', () => {
    const choose = introChooser([pending, approved], storedFor([pending, approved]));
    expect(choose(approved)).toMatchObject({ source: 'synth', text: intro });
  });

  it('형제가 빠져 지문이 다르면 낡은 종합을 쓰지 않는다 — 대체값', () => {
    const choose = introChooser([approved], storedFor([pending, approved]));
    expect(choose(approved)).toMatchObject({ source: 'summary', synth: null, text: '조식으로 전복죽을 내는 펜션이에요.' });
  });

  it('묶음에 없는 후보는 null — 소개를 바꾸지 않는다', () => {
    expect(introChooser([pending], new Map())({ id: 'nope' })).toBeNull();
  });
});
