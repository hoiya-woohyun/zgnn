import { describe, expect, it } from 'vitest';
import { PROMPT_FEATURES_RULE } from './extractPlaces.mjs';
import {
  buildSynthesisCliArgs,
  buildSynthesisPrompt,
  checkSynthesis,
  SYNTH_SCHEMA,
  SYNTH_SYSTEM_PROMPT,
  synthesisMaterials,
  synthesizeGroupIntro,
} from './synthesizeGroupIntro.mjs';

/*
 * 고정 입력 세 묶음 — 원격 검수 대기 후보의 `extracted.features` 를 읽기 조회로 옮겼다(2026-10-13). 묶음 전체가 아니라 성질이 드러나는 몇 편.
 * 모델은 부르지 않는다 — 가짜 run 이 무엇을 받았는지와, 돌려준 응답을 코드가 어떻게 거르는지만 본다. 실제 응답의 품질은 13 §5.3 A3 의 첫 회 실행이 본다.
 */
const blog = (path) => `https://blog.naver.com/${path}`;

// 친봉산장 — 다녀온 글 다섯은 모두 카페, '일반음식점' 은 식약처 명단글(목록글 · visited false)에서만 나온다.
const chinbong = {
  name: '친봉산장',
  type: 'cafe',
  posts: [
    { id: blog('cjuhee1004/224419556970'), visited: true, features: '산장 컨셉의 이색 카페로 아이리쉬커피와 구운커피가 유명하고, 맞춤모자 작업대와 판매 소품도 있어요. 창밖으로 푸른 잔디가 보이고 반려견들이 노는 공간과 주차장, 오토바이 주차장이 있어요.' },
    { id: blog('cnr3045/224422453480'), visited: true, features: '일반적인 카페와는 다른 자연스럽고 편안한 분위기의 카페로, 내부가 넓고 테이블 간격도 여유로워요. 카페 앞에 마당과 주차 공간이 있어요.' },
    { id: blog('requiemfor/224416548926'), visited: true, features: '미국 산장 느낌의 대형 카페로 구운 우유와 구운 초코, 피자, 비프스튜를 팔아요. 키즈케어존과 영어 메뉴판이 있어요.' },
    { id: blog('zadf/224430908778'), visited: true, features: '빈티지한 산장 컨셉의 카페로 구운우유커피 같은 커피 음료와 떡볶이·피자 같은 브런치 메뉴를 팔아요. 카페 앞에 넓은 마당이 있고 모자 제작 공간과 빈티지샵도 함께 있어요.' },
    { id: blog('mialove89/224432654418'), visited: false, features: '식약처 반려동물 동반출입 가능 현황에 일반음식점으로 등록된 곳이에요.' },
    { id: blog('mialove89/224432673069'), visited: false, features: '식약처 반려동물 동반 가능 업소 현황에 서귀포시 일반음식점으로 올라 있는 식당이에요.' },
    { id: blog('kiwitrust/224415520315'), visited: false, features: '남원 하례리 쪽에 있는 식당이에요. 동백포레스트와 함께 둘러보기 좋은 위치예요.' },
    { id: blog('hiel_joon/224422356671'), visited: false, features: null },
  ],
};

// 엔젤하우스 — 펜션 자기 블로그라 "건강 정보를 연재해요" 류가 소개에 섞인다. 다녀온 글 중에도 하나("블로그로 소개해요")가 남는다.
const angel = {
  name: '엔젤하우스',
  type: 'stay',
  posts: [
    { id: blog('jejuangelhouse/224403262938'), visited: true, features: '애월에 있는 애견동반 전문 펜션이에요.' },
    { id: blog('jejuangelhouse/224428702551'), visited: true, features: '애월에 있는 애견동반 전문 펜션이에요.' },
    { id: blog('jejuangelhouse/224428706142'), visited: true, features: '애월에 있는 애견동반 전문 펜션이에요.' },
    { id: blog('jejuangelhouse/224428783774'), visited: true, features: '애견 전문 펜션이에요. 넓은 잔디마당에 미끄럼틀·허들·링 같은 어질리티 도구와 포토존이 있고, 입구 앞에 반려견 배변봉투 스테이션이 있어요.' },
    { id: blog('parkha_23/224395849436'), visited: true, features: '바다가 보이는 넓은 창과 객실마다 프라이빗 테라스를 갖춘 오션뷰 펜션이에요. 넓은 잔디밭이 있고 배변 패드와 물그릇 같은 반려견 용품도 구비되어 있어요.' },
    { id: blog('jejuangelhouse/224427556599'), visited: true, features: '애견 동반 전문 펜션이에요. 시니어견 케어 정보를 블로그로 소개해요.' },
    { id: blog('jejuangelhouse/224418808336'), visited: false, features: '반려견 동반을 전문으로 하는 펜션이에요. 강아지 건강 정보를 꾸준히 소개하고 있어요.' },
    { id: blog('jejuangelhouse/224418818495'), visited: false, features: '제주 애월에 있는 반려견 동반 전문 펜션이에요. 블로그에 강아지 건강 정보를 연재하고 있어요.' },
  ],
};

// 이춘옥원조고등어쌈밥 — 셀프리필바·충전스테이션(1편) · 발렛파킹(1편) · 무선인터넷(1편)처럼 시설이 글마다 흩어져 있다.
const ichunok = {
  name: '이춘옥원조고등어쌈밥 제주애월본점',
  type: 'restaurant',
  posts: [
    { id: blog('sungsin_dang/224431310364'), visited: true, features: '고등어묵은지쌈밥과 옥두어구이를 내는 바다 전망 쌈밥 식당이에요. 셀프리필바에서 반찬과 쌈채소, 된장국을 가져올 수 있고 충전스테이션과 유아의자도 있어요.' },
    { id: blog('yu0i0sn6ejct6bg4/224412085989'), visited: true, features: '고등어 묵은지찜과 고등어쌈밥을 내는 식당이에요. 바다가 보이는 창가 좌석과 테라스가 있고 매장 앞 주차장과 제2·제3주차장, 발렛파킹을 이용할 수 있어요.' },
    { id: blog('laundry-847642/224420546532'), visited: true, features: '바다가 보이는 창가 자리에서 고등어쌈밥과 고등어 묵은지찜, 2인 가성비세트를 내는 식당이에요. 매장 앞 주차장과 맞은편·옆 건물 주차장, 대기공간, 무선인터넷, 유아의자가 있어요.' },
    { id: blog('es25303/224412069660'), visited: true, features: '고등어쌈밥과 고등어 묵은지찜을 파는 식당이에요. 창가 자리에서 바다가 보이고 매장 앞 주차장이 있어요.' },
    { id: blog('yerumming/224433139176'), visited: false, features: '고등어 쌈밥을 내는 식당이에요.' },
  ],
};

const cliResult = (structured) =>
  JSON.stringify({ type: 'result', subtype: 'success', is_error: false, structured_output: structured, usage: { input_tokens: 10, output_tokens: 5 } });

/** 가짜 run — 받은 것을 남기고 정해 둔 응답을 돌려준다. */
const fakeRun = (structured) => {
  const calls = [];
  const run = async (args, input) => (calls.push({ args, input }), cliResult(structured));
  return { run, calls };
};

/** 재료 번호 — 테스트가 응답을 쓸 때 "이 문장이 든 요약" 을 번호로 찾는다(정렬 순서에 기대지 않게). */
const refOf = (materials, needle) => {
  const i = materials.findIndex((m) => m.text.includes(needle));
  if (i < 0) throw new Error(`재료에 없음: ${needle}`);
  return i + 1;
};

describe('프롬프트 — 소개 지시는 추출과 같은 상수', () => {
  it('시스템 프롬프트가 추출의 소개 지시를 그대로 싣고, 그 지시의 "본문" 이 여기선 요약이라고 잇는다', () => {
    expect(SYNTH_SYSTEM_PROMPT).toContain(`- features: ${PROMPT_FEATURES_RULE}\n`);
    expect(SYNTH_SYSTEM_PROMPT).toContain("'본문' 은 여기서는 주어진 요약들");
  });

  it('CLI 인자는 고정 — 스키마·시스템 프롬프트·도구 끔', () => {
    const args = buildSynthesisCliArgs();
    expect(args).toEqual(buildSynthesisCliArgs());
    expect(args[args.indexOf('--json-schema') + 1]).toBe(JSON.stringify(SYNTH_SCHEMA));
    expect(args[args.indexOf('--system-prompt') + 1]).toBe(SYNTH_SYSTEM_PROMPT);
    expect(args[args.indexOf('--tools') + 1]).toBe('');
    expect(args).toContain('--no-session-persistence');
  });
});

describe('재료 — 다녀온 글의 요약만, 같은 요약은 하나로', () => {
  it('목록글·요약 없는 글은 빼고, 같은 요약은 편수로 합친다(번호는 편수 많은 순)', () => {
    const materials = synthesisMaterials(angel.posts);
    expect(materials).toHaveLength(4);
    expect(materials[0]).toEqual({
      text: '애월에 있는 애견동반 전문 펜션이에요.',
      posts: [blog('jejuangelhouse/224403262938'), blog('jejuangelhouse/224428702551'), blog('jejuangelhouse/224428706142')],
    });
    expect(materials.some((m) => m.text.includes('연재'))).toBe(false);
  });

  it('프롬프트엔 장소·종류와 번호 붙인 요약만 — 글 URL 은 싣지 않는다', () => {
    const materials = synthesisMaterials(angel.posts);
    const prompt = buildSynthesisPrompt(angel, materials);
    expect(prompt).toContain('장소: 엔젤하우스');
    expect(prompt).toContain('종류: stay');
    expect(prompt).toContain('요약 1 (글 3편): 애월에 있는 애견동반 전문 펜션이에요.');
    materials.forEach((m, i) => expect(prompt).toContain(`요약 ${i + 1}`));
    expect(prompt).not.toContain('blog.naver.com');
    expect(prompt).not.toContain('연재');
  });

  it('같은 글이 두 번 오면 앞의 것만 센다', () => {
    const id = blog('a/1');
    expect(synthesisMaterials([{ id, features: '첫 요약이에요.' }, { id, features: '다시 뽑은 요약이에요.' }])).toEqual([{ text: '첫 요약이에요.', posts: [id] }]);
  });
});

describe('부르지 않는 묶음 — 재료가 하나 이하', () => {
  const never = async () => {
    throw new Error('부르면 안 된다');
  };

  it('글 1편 묶음은 그 글의 요약 그대로', async () => {
    const [post] = ichunok.posts;
    expect(await synthesizeGroupIntro(never, { ...ichunok, posts: [post] })).toEqual({
      intro: post.features,
      sentences: [{ text: post.features, posts: [post.id] }],
      conflict: null,
      reasons: [],
      called: false,
    });
  });

  it('다녀온 글이 하나뿐이거나 모든 글이 같은 요약이면 부르지 않는다', async () => {
    const one = await synthesizeGroupIntro(never, { ...ichunok, posts: [ichunok.posts[0], ichunok.posts[4]] });
    expect(one.called).toBe(false);
    expect(one.intro).toBe(ichunok.posts[0].features);
    const same = await synthesizeGroupIntro(never, { ...angel, posts: angel.posts.slice(0, 3) });
    expect(same.called).toBe(false);
    expect(same.sentences[0].posts).toHaveLength(3);
  });

  it('다녀온 글의 요약이 없으면 소개 없음', async () => {
    const none = await synthesizeGroupIntro(never, { ...chinbong, posts: chinbong.posts.filter((p) => p.visited === false) });
    expect(none).toMatchObject({ intro: null, called: false });
  });
});

describe('친봉산장 — 업태가 갈리면 합치지 않는다', () => {
  it('실데이터에선 갈림이 목록글에서 왔다 — 목록글을 빼면 모델은 카페 요약만 본다', () => {
    const prompt = buildSynthesisPrompt(chinbong, synthesisMaterials(chinbong.posts));
    expect(prompt).not.toContain('일반음식점');
    expect(prompt).not.toContain('식약처');
    expect(prompt.match(/^요약 \d+/gm)).toHaveLength(4);
  });

  // 13 §5.3 이 본 모양(목록글 규칙 전) — 명단글 하나를 다녀온 글로 두면 다녀온 글끼리 업태가 갈린다.
  const split = { ...chinbong, posts: chinbong.posts.map((p) => (p.id === blog('mialove89/224432654418') ? { ...p, visited: true } : p)) };

  it('충돌이면 소개 없이 충돌 이유와 갈린 글을 넘긴다 — 같이 온 문장은 버린다', async () => {
    const materials = synthesisMaterials(split.posts);
    const cafe = refOf(materials, '산장 컨셉의 이색 카페');
    const diner = refOf(materials, '일반음식점');
    const { run, calls } = fakeRun({
      conflict: { reason: '카페라는 글과 일반음식점이라는 글이 갈려요', summaries: [cafe, diner, 99] },
      sentences: [{ text: '산장 컨셉의 카페예요.', summaries: [cafe] }],
    });
    const out = await synthesizeGroupIntro(run, split);
    expect(calls).toHaveLength(1);
    expect(calls[0].input).toContain('일반음식점');
    expect(out).toEqual({
      intro: null,
      sentences: [],
      conflict: { reason: '카페라는 글과 일반음식점이라는 글이 갈려요', posts: [blog('cjuhee1004/224419556970'), blog('mialove89/224432654418')].sort() },
      reasons: [],
      called: true,
    });
  });
});

describe('엔젤하우스 — 블로그 운영 이야기는 소개가 아니다', () => {
  const materials = synthesisMaterials(angel.posts);
  const base = refOf(materials, '애월에 있는 애견동반 전문 펜션');
  const agility = refOf(materials, '어질리티');
  const ocean = refOf(materials, '오션뷰');
  const blogTalk = refOf(materials, '블로그로 소개해요');

  it('운영 이야기를 빼고 쓴 소개는 통과하고, 문장마다 근거 글이 붙는다', async () => {
    const { run, calls } = fakeRun({
      conflict: null,
      sentences: [
        { text: '애월에 있는 애견동반 전문 펜션이에요.', summaries: [base] },
        { text: '넓은 잔디마당에 어질리티 도구와 포토존이 있고 배변 패드와 물그릇 같은 반려견 용품도 있어요.', summaries: [agility, ocean] },
      ],
    });
    const out = await synthesizeGroupIntro(run, angel);
    expect(calls).toHaveLength(1);
    expect(out.reasons).toEqual([]);
    expect(out.intro).toBe('애월에 있는 애견동반 전문 펜션이에요. 넓은 잔디마당에 어질리티 도구와 포토존이 있고 배변 패드와 물그릇 같은 반려견 용품도 있어요.');
    expect(out.sentences[0].posts).toHaveLength(3);
    expect(out.sentences[1].posts).toEqual([blog('jejuangelhouse/224428783774'), blog('parkha_23/224395849436')]);
    expect(out.intro).not.toMatch(/연재|블로그|정보/);
  });

  it('요약에 있어도 블로그 이야기를 실은 소개는 버린다', () => {
    const out = checkSynthesis(
      { conflict: null, sentences: [{ text: '애견 동반 전문 펜션이에요. 시니어견 케어 정보를 블로그로 소개해요.', summaries: [blogTalk] }] },
      materials,
      angel,
    );
    expect(out.intro).toBeNull();
    expect(out.reasons.join(' ')).toContain('블로그');
    // 같은 묶음의 다녀온 글(jejuangelhouse/224382691512) — '블로그' 라는 말 없이도 글이 하는 말이다.
    const series = '제주 애월에 있는 애견전문 펜션이에요. 펜션지기가 키우는 강아지 은구·은동과 함께 오름 산책 시리즈를 소개해요.';
    const mats = synthesisMaterials([{ id: blog('jejuangelhouse/224382691512'), visited: true, features: series }, ...angel.posts]);
    const walk = checkSynthesis({ conflict: null, sentences: [{ text: '오름 산책 시리즈를 소개해요.', summaries: [refOf(mats, '시리즈')] }] }, mats, angel);
    expect(walk.reasons.join(' ')).toContain('시리즈');
  });

  it('판단 칸의 주제(소형견·야외)는 요약에 있어도 소개에 쓰지 않는다', () => {
    // 같은 묶음의 다른 다녀온 글(jejuangelhouse/224379294004)이 이렇게 요약했다 — 판정의 smallDogOnly 가 말할 것이다.
    const mats = synthesisMaterials([{ id: blog('jejuangelhouse/224379294004'), visited: true, features: '애월에 있는 소형견 전문 애견펜션이에요.' }, ...angel.posts]);
    const small = checkSynthesis({ conflict: null, sentences: [{ text: '애월에 있는 소형견 전문 애견펜션이에요.', summaries: [refOf(mats, '소형견 전문')] }] }, mats, angel);
    expect(small.intro).toBeNull();
    expect(small.reasons.join(' ')).toContain('소형견');
    // 같은 묶음의 다녀온 글(ohroselog/224389974603) — '야외' 가 강아지 전용과 한 문장이라 판단 칸 주제다(A4 뒤에도 걸린다).
    const poolSummary = '애월 바다와 가까운 독채형 애견 전문 펜션이에요. 안전 펜스가 둘러싼 천연 잔디 운동장과 어질리티 기구, 강아지 전용 야외 수영장, 무료 음료·라면이 있는 공용 휴게실을 갖췄어요.';
    const poolMats = synthesisMaterials([{ id: blog('ohroselog/224389974603'), visited: true, features: poolSummary }, ...angel.posts]);
    const pool = checkSynthesis({ conflict: null, sentences: [{ text: '강아지 전용 야외 수영장이 있어요.', summaries: [refOf(poolMats, '강아지 전용 야외 수영장')] }] }, poolMats, angel);
    expect(pool.intro).toBeNull();
    expect(pool.reasons).toEqual(['판단 칸이 말하는 주제예요(야외)']);
  });

  it('강아지 없이 공간만 말하는 시설 묘사는 요약에 있으면 통과한다(A4) — "야외" 낱말만으로는 걸지 않는다', () => {
    const lawn = '바다가 보이는 독채 펜션이에요. 넓은 야외 잔디마당과 바비큐장이 있어요.';
    const mats = synthesisMaterials([{ id: blog('a/lawn'), visited: true, features: lawn }, ...angel.posts]);
    const out = checkSynthesis({ conflict: null, sentences: [{ text: '넓은 야외 잔디마당과 바비큐장이 있어요.', summaries: [refOf(mats, '야외 잔디마당')] }] }, mats, angel);
    expect(out.reasons).toEqual([]);
    expect(out.intro).toBe('넓은 야외 잔디마당과 바비큐장이 있어요.');
  });
});

describe('이춘옥 — 흩어진 시설이 모이되 어느 요약에도 없는 말은 없다', () => {
  const materials = synthesisMaterials(ichunok.posts);
  const refill = refOf(materials, '셀프리필바');
  const valet = refOf(materials, '발렛파킹');
  const wifi = refOf(materials, '무선인터넷');
  const plain = refOf(materials, '창가 자리에서 바다가 보이고 매장 앞 주차장');
  const good = {
    conflict: null,
    sentences: [
      { text: '고등어쌈밥과 고등어 묵은지찜을 내는 식당이에요.', summaries: [valet, wifi, plain] },
      { text: '창가 자리에서 바다가 보이고 셀프리필바와 충전스테이션, 무선인터넷, 대기공간, 발렛파킹이 있어요.', summaries: [refill, valet, wifi, plain] },
    ],
  };

  it('목록글은 빠지고 네 편의 요약이 번호로 실린다', async () => {
    const { run, calls } = fakeRun(good);
    const out = await synthesizeGroupIntro(run, ichunok);
    expect(calls[0].input.match(/^요약 \d+/gm)).toHaveLength(4);
    expect(calls[0].input).not.toContain('고등어 쌈밥을 내는 식당이에요.');
    expect(out.reasons).toEqual([]);
    // 세 편에 흩어진 시설이 한 문장에 모였고, 그 문장의 근거가 세 편을 다 가리킨다.
    for (const word of ['셀프리필바', '발렛파킹', '무선인터넷']) expect(out.intro).toContain(word);
    expect(out.sentences[1].posts).toEqual(
      expect.arrayContaining([blog('sungsin_dang/224431310364'), blog('yu0i0sn6ejct6bg4/224412085989'), blog('laundry-847642/224420546532')]),
    );
  });

  it('어느 요약에도 없는 말·숫자가 끼면 소개를 통째로 버린다', () => {
    const add = (extra) => ({ ...good, sentences: [good.sentences[0], { ...good.sentences[1], text: good.sentences[1].text.replace('있어요.', extra) }] });
    const roof = checkSynthesis(add('있고 루프탑도 있어요.'), materials, ichunok);
    expect(roof.intro).toBeNull();
    expect(roof.reasons.join(' ')).toContain('루프탑');
    const lots = checkSynthesis(add('있고 주차장이 30곳 있어요.'), materials, ichunok);
    expect(lots.intro).toBeNull();
    expect(lots.reasons.join(' ')).toContain('30');
  });

  it('근거 번호가 틀리면 버린다 — 시설이 가리킨 요약에 없을 때도', () => {
    const wrongRef = { ...good, sentences: [good.sentences[0], { ...good.sentences[1], summaries: [plain] }] };
    expect(checkSynthesis(wrongRef, materials, ichunok).reasons.join(' ')).toContain('셀프리필바');
    const missing = { ...good, sentences: [good.sentences[0], { ...good.sentences[1], summaries: [refill, 9] }] };
    expect(checkSynthesis(missing, materials, ichunok).reasons.join(' ')).toContain('없는 요약을 가리켜요(9)');
    const none = { ...good, sentences: [good.sentences[0], { ...good.sentences[1], summaries: [] }] };
    expect(checkSynthesis(none, materials, ichunok).reasons.join(' ')).toContain('근거 요약 번호가 없어요');
    const fraction = { ...good, sentences: [{ ...good.sentences[0], summaries: [1.5] }] };
    expect(checkSynthesis(fraction, materials, ichunok).intro).toBeNull();
  });

  it('세 문장 이상 · 120자 넘음 · 빈 응답은 버린다', () => {
    expect(checkSynthesis({ ...good, sentences: [...good.sentences, good.sentences[0]] }, materials, ichunok).intro).toBeNull();
    const long = { conflict: null, sentences: [{ text: `${'고등어쌈밥과 고등어 묵은지찜을 내는 식당이에요. '.repeat(5).trim()}`, summaries: [plain] }] };
    expect(checkSynthesis(long, materials, ichunok).reasons.join(' ')).toContain('120자');
    expect(checkSynthesis({ conflict: null, sentences: [] }, materials, ichunok)).toEqual({ intro: null, sentences: [], conflict: null, reasons: ['모델이 쓸 소개가 없다고 했어요'] });
  });
});

describe('응답 형식 — 추출과 같은 분류로 던진다', () => {
  it('JSON 이 아니면 · 오류 결과면 · sentences 가 없으면', async () => {
    await expect(synthesizeGroupIntro(async () => 'not json', ichunok)).rejects.toMatchObject({ code: 'invalid_json' });
    const err = JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'Not logged in · Please run /login' });
    await expect(synthesizeGroupIntro(async () => err, ichunok)).rejects.toMatchObject({ code: 'auth' });
    await expect(synthesizeGroupIntro(async () => cliResult({ conflict: null }), ichunok)).rejects.toMatchObject({ code: 'invalid_shape' });
  });

  it('계량기는 호출마다 usage 를 센다', async () => {
    const seen = [];
    const { run } = fakeRun({ conflict: null, sentences: [] });
    await synthesizeGroupIntro(run, ichunok, { add: (u) => seen.push(u) });
    expect(seen).toEqual([{ input_tokens: 10, output_tokens: 5 }]);
  });
});
