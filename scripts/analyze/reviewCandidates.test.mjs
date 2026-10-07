import { describe, expect, it } from 'vitest';
import { parsePetPolicy, toPetBadges, withPolicyFacts } from '../../src/lib/petPolicy';
import { groupCandidates, groupFlags, independentPostCount, kindOfRow, mergeSameSpotGroups, postClusters, previewPolicy } from './reviewCandidates.mjs';

const parsers = { parsePetPolicy, toPetBadges, withPolicyFacts };
const row = (id, name, over = {}, top = {}) => ({
  id,
  post_url: `https://blog.naver.com/x/${id}`,
  match_place_id: null,
  match_confidence: 0,
  status: 'pending',
  reviewer_note: null,
  extracted: { name, type: 'cafe', regionRaw: '동쪽 (구좌읍)', geo: null, petPolicyText: null, petPolicy: null, evidence: ['인용문'], confidence: 0.6, visited: true, match: { tier: 'new', confidence: 0, reason: '없음' }, ...over },
  ...top,
});

describe('kindOfRow · 묶음의 종류 — 갱신이 하나라도 있으면 갱신(11 U2)', () => {
  const auto = (kind) => ({ tier: 'auto', confidence: 0.9, reason: '', ...(kind ? { kind } : {}) });
  it('옛 후보(match.kind 없음)는 tier 로 — auto 는 보강', () => {
    expect(kindOfRow(row('o', 'x', { match: auto() }))).toBe('fill');
    expect(kindOfRow(row('o', 'x'))).toBe('new');
    expect(kindOfRow(row('o', 'x', { match: { tier: 'ask', confidence: 0.6, reason: '' } }))).toBe('ask');
    expect(kindOfRow({ extracted: {} })).toBe('new');
  });
  it('묶음에 갱신 한 줄이 있으면 묶음이 갱신 · 갱신이 맨 앞에 선다', () => {
    const rows = [
      row('f1', '보강카페', { match: auto('fill') }, { match_place_id: 'p1' }),
      row('u1', '갱신카페', { match: auto('fill') }, { match_place_id: 'p2' }),
      row('u2', '갱신카페', { match: auto('update'), confidence: 0.1 }, { match_place_id: 'p2' }),
      row('n1', '신규카페'),
    ];
    const groups = groupCandidates(rows);
    expect(groups.map((g) => [g.lead.extracted.name, g.kind])).toEqual([
      ['갱신카페', 'update'],
      ['보강카페', 'fill'],
      ['신규카페', 'new'],
    ]);
  });
});

describe('groupCandidates — 같은 가게 묶기와 검수 순서', () => {
  it('nameKey(또는 이름)로 묶고, 기존 장소에 붙은 것은 match_place_id 로 묶는다', () => {
    const rows = [row('a1', '올드패션제주'), row('a2', '올드패션 제주점', { confidence: 0.9 }), row('b1', '엔젤하우스', {}, { match_place_id: 'p1' }), row('b2', '제주애견전문 엔젤하우스', { match: { tier: 'auto', confidence: 1, reason: '' } }, { match_place_id: 'p1' })];
    const groups = groupCandidates(rows);
    expect(groups).toHaveLength(2);
    const old = groups.find((g) => g.key.startsWith('name:'));
    expect(old.rows.map((r) => r.id)).toEqual(['a2', 'a1']); // confidence 높은 것이 대표
    expect(old.posts).toHaveLength(2);
    expect(groups.find((g) => g.key === 'place:p1').tier).toBe('auto');
  });

  it('순서: 일치 → 확인요청 → 신규, 방문 글이 목록 글보다, 조건문 있는 것이 먼저', () => {
    const rows = [
      row('n1', '목록카페', { visited: false }),
      row('n2', '조건있는카페', { petPolicyText: '리드줄 필수', confidence: 0.5 }),
      row('n3', '조건없는카페', { confidence: 0.99 }),
      row('k1', '기존카페', { match: { tier: 'ask', confidence: 0.7, reason: '' } }, { match_place_id: 'p9', match_confidence: 0.7 }),
    ];
    expect(groupCandidates(rows).map((g) => g.lead.extracted.name)).toEqual(['기존카페', '조건있는카페', '조건없는카페', '목록카페']);
  });
});

describe('previewPolicy — 앱이 문장을 어떻게 읽을지', () => {
  it('조건문이 없으면 "조건문 없음", 정규식이 못 읽으면 "정규식 못읽음", AI 판단이 없으면 "AI 판단 없음"', () => {
    expect(previewPolicy({ petPolicyText: null }, parsers).flags).toEqual(['조건문 없음']);
    const p = previewPolicy({ petPolicyText: '애견동반 가능해요!' }, parsers);
    expect(p.flags).toEqual(['정규식 못읽음', 'AI 판단 없음']);
    expect(p.level).toBe('자유');
  });
  it('AI 판단이 있으면 앱 배지가 그것을 따르고, 정규식과 어긋나면 표식이 붙는다', () => {
    const facts = { indoor: 'outdoorOnly', leash: true, largeDogOk: null, smallDogOnly: false, callFirst: false, feeFree: null, feeText: null, weightLimitKg: null, maxDogs: null, notes: null };
    const p = previewPolicy({ petPolicyText: '케이지 필수, 테라스에서는 목줄', petPolicy: facts }, parsers);
    expect(p.regexBadges).toEqual(['케이지 필요', '리드줄']);
    expect(p.mergedBadges).toEqual(['야외만', '리드줄']);
    expect(p.flags).toEqual(['AI≠정규식(실내 outdoorOnly/cage)']);
    expect(p.corrections).toEqual([]);
  });
  it('원문에 없는 AI 판단은 앱이 빼고, 뺀 것을 표식과 한 줄로 남긴다', () => {
    const facts = { indoor: 'unknown', leash: false, largeDogOk: null, smallDogOnly: false, callFirst: false, feeFree: null, feeText: null, weightLimitKg: 10, maxDogs: null, notes: null };
    const p = previewPolicy({ petPolicyText: '애견동반 가능해요!', petPolicy: facts }, parsers);
    expect(p.mergedBadges).toEqual([]);
    expect(p.flags).toContain('AI 판단 보정');
    expect(p.corrections).toEqual(['무게 상한 10kg 이 원문에 없어 뺐어요']);
  });
  it('원문은 있는데 아무도 못 읽으면 level 이 못읽음이고 앱 배지가 원문 확인을 말한다', () => {
    const p = previewPolicy({ petPolicyText: '사장님 강아지랑 같이 놀아요' }, parsers);
    expect(p.level).toBe('못읽음');
    expect(p.mergedBadges).toEqual(['원문 확인 필요']);
  });
  it('동반 불가 문장은 level 이 동반불가', () => {
    expect(previewPolicy({ petPolicyText: '애견동반은 아쉽게도 안됩니다' }, parsers).level).toBe('동반불가');
  });
});

describe('표식', () => {
  it('groupFlags — 지역·좌표 없음, 목록글, 중복표시', () => {
    const g = groupCandidates([row('a', '카페', { regionRaw: null, visited: false, dupOf: 'x' })])[0];
    expect(groupFlags(g)).toEqual(['지역 없음', '좌표 없음', '목록글', '중복표시']);
  });
});

describe('같은 자리의 신규 묶음 합치기 — "본카페" ↔ "애월본카페" (2026-10-04)', () => {
  const geo = { lat: 33.4627, lng: 126.3094 };
  const near = { lat: 33.4628, lng: 126.3095 };
  const bon = (id, over = {}, top = {}) => row(id, '본카페', { address: '제주 제주시 애월읍 애월해안로 179 본카페', geo, ...over }, top);
  const aewol = (id, over = {}, top = {}) => row(id, '애월본카페', { address: '제주 제주시 애월읍 애월해안로 179', geo: near, confidence: 0.9, ...over }, top);

  it('이름 키가 달라도 주소가 같은 자리면 한 묶음 — 대표는 confidence 가 높은 쪽, 키는 원래 키 중 정렬 앞의 것', () => {
    const groups = groupCandidates([bon('b1'), aewol('a1'), row('x1', '다른카페', { address: '제주 제주시 애월읍 애월해안로 300' })]);
    expect(groups).toHaveLength(2);
    const merged = groups.find((g) => g.rows.length === 2);
    expect(merged.rows.map((r) => r.id)).toEqual(['a1', 'b1']);
    expect(merged.lead.id).toBe('a1');
    expect(merged.key).toBe(['name:본', 'name:애월본'].sort()[0]);
    expect(merged.posts).toHaveLength(2);
    expect(merged.tier).toBe('new');
  });

  it('좌표가 한쪽이라도 없으면 주소만으로 · 두 좌표가 100m 밖이면 합치지 않는다', () => {
    expect(groupCandidates([bon('b1', { geo: null }), aewol('a1')])).toHaveLength(1);
    expect(groupCandidates([bon('b1'), aewol('a1', { geo: { lat: 33.47, lng: 126.32 } })])).toHaveLength(2);
  });

  it("주소가 'unknown'(지번↔도로명·주소 없음)이거나 'different' 면 합치지 않는다", () => {
    expect(groupCandidates([bon('b1', { geo: null }), aewol('a1', { geo: null, address: '제주 제주시 애월읍 애월리 2510' })])).toHaveLength(2);
    expect(groupCandidates([bon('b1', { geo: null }), aewol('a1', { geo: null, address: null })])).toHaveLength(2);
    expect(groupCandidates([bon('b1'), aewol('a1', { address: '제주 제주시 애월읍 애월해안로 180' })])).toHaveLength(2);
  });

  it('기존 장소에 붙은 묶음은 대상이 아니다 — 주소가 같아도 그대로 둔다', () => {
    const rows = [bon('b1'), aewol('a1', { match: { tier: 'ask', confidence: 0.5, reason: '' } }, { match_place_id: 'p1' })];
    const groups = groupCandidates(rows);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.key).sort()).toEqual(['name:본', 'place:p1']);
  });

  it('같은 자리여도 종류가 다르면 다른 가게다 — 1층 카페 "모루티" ↔ 위층 숙소 "스테이모루티"', () => {
    const groups = groupCandidates([bon('b1', { type: 'cafe' }), aewol('a1', { type: 'stay' })]);
    expect(groups).toHaveLength(2);
    // 종류를 한쪽이라도 모르면 예전대로 묶는다
    expect(groupCandidates([bon('b1', { type: 'cafe' }), aewol('a1', { type: null })])).toHaveLength(1);
  });

  it('합칠 것이 없으면 입력 그대로다', () => {
    const groups = [{ key: 'name:a', tier: 'new', rows: [row('a', 'a')] }];
    expect(mergeSameSpotGroups(groups)).toBe(groups);
  });
});

describe('독립 글 — 같은 블로그·같은 제목 틀의 글은 하나로 센다 (2026-10-04)', () => {
  const day = (d) => `2026-09-${String(d).padStart(2, '0')}T10:00:00Z`;
  // 실측: 한 식당 후보의 글 5건, 이틀 사이, 블로그는 전부 다르다(블로그 규칙으로는 못 잡는다).
  const ads = [
    ['u1', '제주공항 근처 애견동반식당 추천 서린 제주 고기국수 본점', 1],
    ['u2', '제주공항 근처 애견동반식당 정말 추천할 만한 곳이에요', 1],
    ['u3', '제주공항 근처 애견동반식당 여행 전 한 끼의 힐링', 2],
    ['u4', '제주공항 근처 애견동반식당 추천 현지인 맛집 탐방', 2],
    ['u5', '제주공항 근처 애견동반식당 추천 서린 제주 고기국수 본점', 2],
  ].map(([url, title, d], i) => ({ url, title, postedAt: day(d), blogId: `ad${i}` }));
  // 서로 다른 블로거의 평범한 후기 — 날짜를 **같은 창 안에** 둬서 제목 규칙만 시험한다.
  const reviews = [
    ['r1', '서귀포 카페 추천 포레스트정방 반려견동반가능', 3],
    ['r2', '제주 정방폭포 카페 맛집 포레스트 정방 애견동반 추천', 3],
    ['r3', '서귀포 카페 추천 제주 정방폭포 서귀포 애견동반 카페 다녀온 후기', 4],
  ].map(([url, title, d], i) => ({ url, title, postedAt: day(d), blogId: `b${i}` }));

  it('광고성 복제 글 5건은 한 덩어리다', () => {
    expect(postClusters(ads, ['서린 제주 고기국수'])).toEqual([['u1', 'u2', 'u3', 'u4', 'u5']]);
  });

  it('가게 이름·지역명이 겹치는 평범한 후기는 합치지 않는다', () => {
    expect(postClusters(reviews, ['포레스트정방'])).toHaveLength(3);
  });

  it('알려진 갈래 — 검색어를 그대로 제목에 쓴 서로 다른 블로거의 글은 며칠 안이면 묶인다(적게 세는 쪽으로 틀린다)', () => {
    const keyword = [
      { url: 'k1', title: '제주 애견동반 카페 추천 포레스트정방', postedAt: day(3), blogId: 'x' },
      { url: 'k2', title: '제주 애견동반 카페 추천 포레스트정방 후기', postedAt: day(4), blogId: 'y' },
    ];
    expect(postClusters(keyword, ['포레스트정방'])).toHaveLength(1);
    // 제목의 짜임이 다르면 같은 말이 섞여도 묶이지 않는다
    const own = [
      { url: 'o1', title: '서귀포 애견동반 카페 포레스트정방 후기', postedAt: day(3), blogId: 'x' },
      { url: 'o2', title: '포레스트정방 애견동반 카페 다녀왔어요', postedAt: day(4), blogId: 'y' },
    ];
    expect(postClusters(own, ['포레스트정방'])).toHaveLength(2);
  });

  it('같은 블로그의 글은 제목·날짜와 무관하게 하나다', () => {
    const posts = [
      { url: 'a', title: '첫 방문', postedAt: day(1), blogId: 'same' },
      { url: 'b', title: '두 번째 방문 완전 다른 제목', postedAt: '2026-01-01T00:00:00Z', blogId: 'same' },
    ];
    expect(postClusters(posts)).toHaveLength(1);
  });

  it('제목 틀이 같아도 며칠 넘게 떨어졌거나 날짜를 모르면 묶지 않는다', () => {
    const far = ads.slice(0, 2).map((post, i) => ({ ...post, postedAt: i === 0 ? day(1) : day(20) }));
    expect(postClusters(far, ['서린 제주 고기국수'])).toHaveLength(2);
    const unknown = ads.slice(0, 2).map((post) => ({ ...post, postedAt: null }));
    expect(postClusters(unknown, ['서린 제주 고기국수'])).toHaveLength(2);
  });

  it('글 정보가 없는 옛 행(blog_posts 없음)은 url 하나가 한 덩어리 — 지금까지의 셈과 같다', () => {
    const rows = [row('o1', '카페'), row('o2', '카페')];
    expect(independentPostCount(rows)).toBe(2);
  });

  it('묶음의 independentPosts 가 검수 순서에 쓰인다 — 복제 글 5건은 독립 글 2건짜리보다 뒤다', () => {
    const adRows = ads.map((post) => row(post.url, '서린 제주 고기국수', {}, { post_url: post.url, blog_posts: { title: post.title, posted_at: post.postedAt, blog_id: post.blogId, keyword: 'k' } }));
    const twoRows = reviews.slice(0, 2).map((post) => row(post.url, '포레스트정방', {}, { post_url: post.url, blog_posts: { title: post.title, posted_at: post.postedAt, blog_id: post.blogId, keyword: 'k' } }));
    const groups = groupCandidates([...adRows, ...twoRows]);
    expect(groups.map((g) => [g.lead.extracted.name, g.posts.length, g.independentPosts])).toEqual([
      ['포레스트정방', 2, 2],
      ['서린 제주 고기국수', 5, 1],
    ]);
  });

  it('고른 url(제안의 근거 글)만 셀 수 있다 — 행에 없는 url 도 하나씩 센다', () => {
    const adRows = ads.map((post) => row(post.url, '서린 제주 고기국수', {}, { post_url: post.url, blog_posts: { title: post.title, posted_at: post.postedAt, blog_id: post.blogId, keyword: 'k' } }));
    expect(independentPostCount(adRows, ['u1', 'u2'])).toBe(1);
    expect(independentPostCount(adRows, ['u1', 'zz'])).toBe(2);
  });
});
