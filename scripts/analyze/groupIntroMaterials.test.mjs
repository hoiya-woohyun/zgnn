import { describe, expect, it } from 'vitest';
import { chooseGroupIntro, groupIntroInput, introTextReasons, isIntroGroup, materialsFingerprint, synthesisMaterials } from './groupIntroMaterials.mjs';
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

describe('chooseGroupIntro — 사이트에 나갈 소개를 한 함수가 정한다(13 §5.3 A3)', () => {
  const row = (url, features, over = {}) => ({ post_url: url, match_place_id: null, extracted: { name: '바다펜션', type: 'stay', features, visited: true, ...over } });
  const group = (rows, key = 'name:바다펜션') => ({ key, lead: rows[0], rows });
  const two = [row(blog('a/1'), '오션뷰 객실과 테라스가 있는 펜션이에요.'), row(blog('b/2'), '조식으로 전복죽을 내는 펜션이에요.')];
  const stored = (g, over = {}) => ({
    fingerprint: materialsFingerprint(synthesisMaterials(groupIntroInput(g).posts)),
    intro: '오션뷰 객실과 테라스가 있고 조식으로 전복죽을 내는 펜션이에요.',
    sentences: [{ text: '오션뷰 객실과 테라스가 있고 조식으로 전복죽을 내는 펜션이에요.', posts: [blog('a/1'), blog('b/2')] }],
    conflict: null,
    reasons: [],
    ...over,
  });

  it('지문이 같은 저장 줄이면 종합 소개와 문장별 출처', () => {
    const g = group(two);
    const out = chooseGroupIntro(g, stored(g));
    expect(out).toMatchObject({ source: 'synth', synth: 'fresh', text: '오션뷰 객실과 테라스가 있고 조식으로 전복죽을 내는 펜션이에요.' });
    expect(out.sentences[0].posts).toEqual([blog('a/1'), blog('b/2')]);
  });

  it('지문이 다르면(새 글이 붙었다) 낡은 종합을 쓰지 않고 대표 요약 — 종합 상태는 waiting', () => {
    const g = group(two);
    const old = stored(g);
    const grown = group([...two, row(blog('c/3'), '마당에 강아지 놀이터가 있는 펜션이에요.')]);
    expect(chooseGroupIntro(grown, old)).toMatchObject({ source: 'lead', synth: 'waiting', text: '오션뷰 객실과 테라스가 있는 펜션이에요.' });
    expect(chooseGroupIntro(g, null)).toMatchObject({ source: 'lead', synth: 'waiting' });
  });

  it('충돌이면 소개 없음 — 재료(글별 요약)를 함께 돌려준다', () => {
    const g = group(two);
    const out = chooseGroupIntro(g, stored(g, { intro: null, sentences: [], conflict: { reason: '업태가 갈려요', posts: [blog('a/1')] } }));
    expect(out).toMatchObject({ source: 'conflict', text: null, conflict: { reason: '업태가 갈려요' } });
    expect(out.materials).toHaveLength(2);
  });

  it('종합이 거부됐으면 대표 요약으로 물러나고 거부 이유를 싣는다', () => {
    const g = group(two);
    const out = chooseGroupIntro(g, stored(g, { intro: null, sentences: [], reasons: ['가리킨 요약에 없는 말이에요(수영장)'] }));
    expect(out).toMatchObject({ source: 'lead', synth: 'rejected', synthReasons: ['가리킨 요약에 없는 말이에요(수영장)'], text: '오션뷰 객실과 테라스가 있는 펜션이에요.' });
  });

  it('재료가 하나면 그 요약 그대로(부르지 않는 묶음) — 대표가 목록글이어도 다녀온 글의 요약', () => {
    const list = row(blog('list/9'), '식약처 명단에 일반음식점으로 등록된 곳이에요.', { visited: false });
    const out = chooseGroupIntro(group([list, two[1]]), null);
    expect(out).toMatchObject({ source: 'summary', synth: null, text: '조식으로 전복죽을 내는 펜션이에요.' });
    expect(out.sentences).toEqual([{ text: '조식으로 전복죽을 내는 펜션이에요.', posts: [blog('b/2')] }]);
  });

  it('대체값이 내용 규칙에 걸리면 소개 없음 — 엔젤하우스의 옛 요약("소형견 전용" · "블로그로 소개해요")', () => {
    const small = chooseGroupIntro(group([row(blog('a/1'), '소형견 전용 펜션이에요.')]), null);
    expect(small).toMatchObject({ text: null, droppedText: '소형견 전용 펜션이에요.' });
    expect(small.dropped.join(' ')).toContain('소형견');
    expect(chooseGroupIntro(group([row(blog('a/1'), '오름 산책 시리즈를 블로그로 소개해요.')]), null).text).toBeNull();
  });

  it('짝 장소가 있는 묶음(place:)은 대표 features 그대로 — 검사도 종합도 없다(사람이 쓴 소개를 덮지 않는다)', () => {
    const paired = group([row(blog('a/1'), '소형견 전용 펜션이에요.', {})], 'place:p-1');
    expect(chooseGroupIntro(paired, null)).toMatchObject({ source: 'lead', text: '소형견 전용 펜션이에요.', synth: null, dropped: [] });
  });

  it('소개 내용 규칙은 종합 문장과 같은 한 벌 — 판단 칸 주제 · 블로그 이야기', () => {
    expect(introTextReasons('잔디마당이 있는 펜션이에요.')).toEqual([]);
    expect(introTextReasons('대형견도 함께 머물 수 있는 펜션이에요.').join(' ')).toContain('대형견');
    expect(introTextReasons('건강 정보를 연재해요.')).toEqual(['소개에 쓰지 않는 말이에요(연재)']);
  });

  it('주제 낱말만으로는 걸지 않는다 — 강아지 없이 공간·메뉴만 말하는 문장은 통과(A4, 원격 대체 소개에서 옮긴 문장)', () => {
    for (const ok of [
      '입구 뒤편에 작은 정원과 야외 테라스가 있어요.',
      '높은 천장과 큰 창으로 햇살이 들고 실내가 넓어 테이블 사이 간격에 여유가 있어요.',
      '좌석이 야외에 있고 주차가 가능해요.',
      '야외 테이블과 강아지 밥그릇이 있어요.',
      '객실 전용 야외 인피니티 풀과 개별 바비큐가 있고 반려견 용품도 갖춰져 있어요.',
      '하루 한 팀만 받는 독채 펜션으로 야외 자쿠지와 바베큐 공간이 있어요.',
      '가게에 큰 강아지 두 마리가 있어요.',
      '오징어 한 마리 17,000원이고 계좌이체하면 2,000원 할인돼요.',
      '미리 전화하면 가게 옆에 차 1대를 댈 수 있어요.',
      '실내에 카펫이 깔려 있어 편히 쉴 수 있어요.',
    ]) {
      expect(introTextReasons(ok), ok).toEqual([]);
    }
  });

  it('문장 단위로 묶는다 — 앞 문장의 "애견 펜션" 이 뒤 문장의 "야외 잔디마당" 을 묶지 않는다', () => {
    expect(introTextReasons('애견 전문 펜션이에요. 야외 잔디마당이 있어요.')).toEqual([]);
    expect(introTextReasons('애견 전문 펜션이에요. 실내에 강아지와 함께 있을 수 있어요.')).toEqual(['판단 칸이 말하는 주제예요(실내)']);
  });

  it('강아지와 묶인 문장 · 조건 꼴은 그대로 건다 — 같은 주제가 두 문장에 나와도 이유는 한 번', () => {
    const cases = [
      ['강아지 전용 야외 수영장이 있어요.', '야외'],
      ['통창이 있는 조용하고 아늑한 실내에 강아지와 함께 머물 수 있어요.', '실내'],
      ['실내에서 함께 머물 수 있어요.', '실내'],
      ['반려동물 동반이 가능하고 실내 바(bar) 테이블이 있어요.', '실내'],
      ['실내는 안 되고 야외 테라스만 이용할 수 있어요.', '실내'],
      ['최대 두 마리까지 받아요.', '두 마리'],
      ['반려견은 1마리 2만원이 더해져요.', '금액'],
      ['애월에 있는 소형견 전문 애견펜션이에요.', '소형견'],
      ['매장 안팎에 리드줄 고리가 마련되어 있어요.', '리드줄'],
      ['등록 정보에는 7kg 미만 강아지만 받는다고 적혀 있어요.', '7kg'],
    ];
    for (const [body, word] of cases) expect(introTextReasons(body).join(' '), body).toContain(`(${word})`);
    expect(introTextReasons('실내에 강아지와 함께 앉을 수 있어요. 실내에 강아지와 함께 머물 수도 있어요.')).toEqual(['판단 칸이 말하는 주제예요(실내)']);
  });

  it('대체값의 시설 묘사는 이제 소개로 나간다 — "야외 테라스" 대표 요약', () => {
    const out = chooseGroupIntro(group([row(blog('a/1'), '바다가 보이는 오션뷰 카페예요. 야외 테라스석과 넓은 전용 주차장이 있어요.')]), null);
    expect(out).toMatchObject({ text: '바다가 보이는 오션뷰 카페예요. 야외 테라스석과 넓은 전용 주차장이 있어요.', dropped: [] });
  });
});
