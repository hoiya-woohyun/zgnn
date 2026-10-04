import { describe, expect, it } from 'vitest';
import {
  buildVerifyCliArgs,
  buildVerifyPrompt,
  missingVerdict,
  needsDogCheck,
  parseVerification,
  quoteInBody,
  resolveVerifyModel,
  VERIFY_MODEL,
  VERIFY_PROMPT_VERSION,
  VERIFY_SCHEMA,
  VERIFY_SYSTEM_PROMPT,
  verifyLabel,
  verifyPlaces,
} from './verifyPlaces.mjs';
import { createUsageMeter } from './extractPlaces.mjs';

const usage = { input_tokens: 3000, output_tokens: 200, cache_read_input_tokens: 2800, cache_creation_input_tokens: 0 };
const fakeResult = (places, overrides = {}) => ({
  type: 'result',
  subtype: 'success',
  is_error: false,
  api_error_status: null,
  structured_output: { places },
  usage,
  ...overrides,
});
const fakeRun = (result) => async () => JSON.stringify(result);

const verdict = (over = {}) => ({
  name: '이름',
  petAllowedHere: 'unclear',
  dogWasThere: false,
  quote: null,
  why: '언급 없음',
  ...over,
});

describe('needsDogCheck — 언제 두 번째 호출을 하나', () => {
  it.each([null, undefined, '', '   '])('동반 조건 문장이 %o 면 점검한다', (petPolicyText) => {
    expect(needsDogCheck({ petPolicyText })).toBe(true);
  });

  it('조건 문장이 있으면 점검하지 않는다 — 그 문장 자체가 "이 가게는 강아지 얘기를 한다" 는 근거다', () => {
    expect(needsDogCheck({ petPolicyText: '실내외 모두 가능. (리드줄 착용 필수)' })).toBe(false);
  });
});

describe('인자·프롬프트 — 호출마다 같아야 캐시 prefix 가 산다', () => {
  it('고정 인자만 들어간다(두 번 불러도 같다)', () => {
    expect(buildVerifyCliArgs()).toEqual(buildVerifyCliArgs());
    expect(buildVerifyCliArgs()).toEqual([
      '-p',
      '--output-format', 'json',
      '--json-schema', JSON.stringify(VERIFY_SCHEMA),
      '--system-prompt', VERIFY_SYSTEM_PROMPT,
      '--model', VERIFY_MODEL,
      '--tools', '',
      '--no-session-persistence',
      '--strict-mcp-config',
      '--setting-sources', '',
      '--disable-slash-commands',
    ]);
  });

  /** 추출과 **다른** 지문이어야 한다 — 같으면 재분석 대상을 고를 때 두 패스를 구별할 수 없다. */
  it('프롬프트 지문은 8자이고 시스템 프롬프트가 바뀌면 함께 바뀐다', () => {
    expect(VERIFY_PROMPT_VERSION).toMatch(/^[0-9a-f]{8}$/);
  });

  it('확인할 장소 목록이 본문보다 앞에 온다 — 무엇을 찾을지 알고 읽어야 단락을 짝지을 수 있다', () => {
    const prompt = buildVerifyPrompt({ title: '제주 여행', url: 'https://x' }, '본문입니다', ['카페살레', '덕봉이네']);
    expect(prompt.indexOf('확인할 장소')).toBeLessThan(prompt.indexOf('본문'));
    expect(prompt).toContain('1. 카페살레');
    expect(prompt).toContain('2. 덕봉이네');
  });

  it('VERIFY_MODEL 로 추출과 다른 모델을 쓸 수 있다', () => {
    expect(resolveVerifyModel({ VERIFY_MODEL: 'claude-haiku-4-5' })).toBe('claude-haiku-4-5');
    expect(resolveVerifyModel({ ANALYZE_MODEL: 'claude-sonnet-5-5' })).toBe('claude-sonnet-5-5');
  });
});

describe('parseVerification — 판단을 안전한 모양으로', () => {
  it('물어본 이름 전부가 키로 들어온다 — 이름 표기가 달라도 정규화로 붙는다', () => {
    const map = parseVerification(fakeResult([verdict({ name: '카페 살레 제주점', petAllowedHere: 'yes', quote: '강아지 동반 가능해요' })]), ['카페살레']);
    expect([...map.keys()]).toEqual(['살레']);
    expect(map.get('살레')).toMatchObject({ petAllowedHere: 'yes', quote: '강아지 동반 가능해요' });
  });

  /**
   * 빠뜨린 장소를 **점검 안 함(null)으로 섞지 않는다.** 섞으면 화면이 그 후보에 아무 표식도 안 달아
   * 운영자가 "점검했고 괜찮았다" 로 읽는다.
   */
  it('모델이 빠뜨린 장소는 "결과에 없었다" 로 채운다', () => {
    const map = parseVerification(fakeResult([]), ['덕봉이네']);
    expect(map.get('덕봉이네')).toEqual(missingVerdict());
    expect(map.get('덕봉이네').why).toBe('교차점검 결과에 이 장소가 없었다');
  });

  it('물어보지 않은 장소는 버린다 — 유령 판단이 화면에 생기지 않게', () => {
    const map = parseVerification(fakeResult([verdict({ name: '지어낸카페', petAllowedHere: 'yes', quote: '있어요' })]), ['덕봉이네']);
    expect([...map.keys()]).toEqual(['덕봉이네']);
  });

  /** 프롬프트가 금지한 조합이다. 그래도 오면 모델이 규칙을 못 지킨 것이고, 통과시키면 지어낸 확인이 검수자에게 간다. */
  it('근거 문장 없는 "yes" 는 unclear 로 내린다', () => {
    const map = parseVerification(fakeResult([verdict({ name: '덕봉이네', petAllowedHere: 'yes', dogWasThere: true, quote: null })]), ['덕봉이네']);
    expect(map.get('덕봉이네')).toMatchObject({ petAllowedHere: 'unclear', dogWasThere: false });
  });

  /**
   * 인용이 있어도 **본문에 없으면** 근거가 아니다(ADR-019 결정 8-2 를 이 패스에도) — `quote` 의 null 여부만 보던 때는
   * 모델이 지어낸 한 문장이 확인 도장이 됐다. 띄어쓰기·문장부호·이모지 차이는 같은 문장으로 본다.
   */
  it('본문에 없는 인용으로 세운 "yes" 는 unclear 로 내리고 why 에 남긴다', () => {
    const body = '덕봉이네는 마당이 넓어요. 강아지는 차에 두고 다녀왔어요.';
    const map = parseVerification(
      fakeResult([verdict({ name: '덕봉이네', petAllowedHere: 'yes', dogWasThere: true, quote: '강아지와 함께 들어갈 수 있어요', why: '동반 문장' })]),
      ['덕봉이네'],
      body,
    );
    expect(map.get('덕봉이네')).toMatchObject({ petAllowedHere: 'unclear', dogWasThere: false, quote: null });
    expect(map.get('덕봉이네').why).toBe('동반 문장 · 인용 문장이 본문에 없어 근거로 치지 않았다');
  });

  it('띄어쓰기·문장부호·이모지가 달라도 본문에 있는 인용은 산다', () => {
    const body = '여기는 강아지 동반 가능해요!! 🐶 마당도 있어요';
    const map = parseVerification(fakeResult([verdict({ name: '덕봉이네', petAllowedHere: 'yes', quote: '강아지동반 가능해요' })]), ['덕봉이네'], body);
    expect(map.get('덕봉이네')).toMatchObject({ petAllowedHere: 'yes', quote: '강아지동반 가능해요' });
  });

  it('본문을 안 넘기면 인용을 대 보지 않는다 — "안 봤다" 는 "없었다" 가 아니다', () => {
    expect(quoteInBody('아무 문장', undefined)).toBe(true);
    expect(quoteInBody('아무 문장', '')).toBe(false);
    expect(quoteInBody('', '본문')).toBe(false);
  });

  /** '동반 불가' 는 근거 없이도 살린다 — 보수적인 쪽(승인을 망설이게 하는 쪽)이라 내릴 이유가 없다. */
  it('근거 없는 "no" 는 그대로 둔다', () => {
    const map = parseVerification(fakeResult([verdict({ name: '덕봉이네', petAllowedHere: 'no' })]), ['덕봉이네']);
    expect(map.get('덕봉이네').petAllowedHere).toBe('no');
  });

  it('모르는 값은 unclear 로 눕는다', () => {
    const map = parseVerification(fakeResult([{ name: '덕봉이네', petAllowedHere: '그럴듯함', dogWasThere: 'yes', quote: '', why: '' }]), ['덕봉이네']);
    expect(map.get('덕봉이네')).toMatchObject({ petAllowedHere: 'unclear', dogWasThere: false, quote: null, why: null });
  });

  it('structured_output 이 없으면 throw', () => {
    expect(() => parseVerification(fakeResult([], { structured_output: null }), ['x'])).toThrow(/structured_output/);
  });

  it('CLI 오류는 추출과 같은 분류기를 쓴다 — 인증 실패는 fatal', () => {
    expect(() => parseVerification(fakeResult([], { is_error: true, result: 'Not logged in', api_error_status: 401 }), ['x'])).toThrow(/인증 실패/);
  });
});

describe('verifyPlaces — 부를지 말지', () => {
  it('물어볼 장소가 없으면 CLI 를 부르지 않는다', async () => {
    let called = false;
    const map = await verifyPlaces(() => { called = true; }, {}, '본문', [], null);
    expect(called).toBe(false);
    expect(map.size).toBe(0);
  });

  it('usage 는 교차점검 계량기에 따로 쌓인다', async () => {
    const meter = createUsageMeter('교차점검');
    await verifyPlaces(fakeRun(fakeResult([verdict({ name: '덕봉이네' })])), {}, '본문', ['덕봉이네'], meter);
    expect(meter.totals()).toMatchObject({ calls: 1, input: 3000, output: 200 });
    expect(meter.summary()).toContain('교차점검 1회');
  });

  it('JSON 이 아니면 ClaudeCliError', async () => {
    await expect(verifyPlaces(async () => 'not json', {}, '본문', ['x'], null)).rejects.toThrow(/JSON 이 아님/);
  });
});

describe('verifyLabel — 네 표식 + 미점검', () => {
  it.each([
    [null, '미점검'],
    [{ petAllowedHere: 'no', dogWasThere: false }, '동반 불가 정황'],
    [{ petAllowedHere: 'no', dogWasThere: true }, '동반 불가 정황'],
    // 본문이 동반 가능이라 적었을 뿐 강아지가 있었다는 서술은 없다 — '동반 확인' 과 가른다(2026-10-04).
    [{ petAllowedHere: 'yes', dogWasThere: false }, '동반 표기만'],
    [{ petAllowedHere: 'yes', dogWasThere: true }, '동반 확인'],
    [{ petAllowedHere: 'unclear', dogWasThere: true }, '동반 확인'],
    [{ petAllowedHere: 'unclear', dogWasThere: false }, '동반 근거 없음'],
  ])('%o → %s', (verify, label) => {
    expect(verifyLabel(verify)).toBe(label);
  });
});
