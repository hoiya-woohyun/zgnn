import { describe, expect, it } from 'vitest';
import {
  CLI_TIMEOUT_MS,
  ClaudeCliError,
  EXTRACT_SCHEMA,
  ExtractionError,
  MODEL,
  SYSTEM_PROMPT,
  buildCliArgs,
  buildPrompt,
  createUsageMeter,
  extractPlaces,
  isFatal,
  isRetryable,
  parseExtraction,
  resolveModel,
  runClaudeCli,
} from './extractPlaces.mjs';

// 실제 claude 는 부르지 않는다. `claude -p --output-format json` 이 stdout 에 쓰는 result 객체 모양만 흉내 낸 가짜
// (2026-09-21 CLI 2.1.278 실측: 성공이면 stop_reason 이 'tool_use', structured_output 에 파싱된 객체).
const usage = { input_tokens: 4000, output_tokens: 500, cache_read_input_tokens: 3500, cache_creation_input_tokens: 0 };
const fakeResult = (overrides = {}) => ({
  type: 'result',
  subtype: 'success',
  is_error: false,
  stop_reason: 'tool_use',
  terminal_reason: 'completed',
  api_error_status: null,
  num_turns: 2,
  result: JSON.stringify({ places: [] }),
  structured_output: { places: [] },
  usage,
  ...overrides,
});
const fakeRun = (result) => {
  const calls = [];
  const run = async (args, input) => {
    calls.push({ args, input });
    const r = typeof result === 'function' ? result() : result;
    return typeof r === 'string' ? r : JSON.stringify(r);
  };
  run.calls = calls;
  return run;
};
const goodPlace = {
  name: '카페살레',
  type: 'cafe',
  regionRaw: '동쪽 (구좌읍)',
  address: '제주 제주시 구좌읍 세화리 1',
  petPolicyText: '소형견만 실내 가능, 대형견은 테라스',
  features: '바다 보이는 카페',
  isJeju: true,
  evidence: ['소형견만 실내 가능하고 대형견은 테라스에서만 된다고 하네요.'],
  confidence: 0.9,
};
const withPlaces = (places) => fakeResult({ result: JSON.stringify({ places }), structured_output: { places } });
const post = { title: '제주 동쪽 강아지 카페', keyword: '제주 강아지 동반 카페', url: 'https://blog.naver.com/dogjeju/223456789' };

describe('resolveModel / MODEL', () => {
  it('기본은 claude-opus-5, ANALYZE_MODEL 이 있으면 그것', () => {
    expect(resolveModel({})).toBe('claude-opus-5');
    expect(resolveModel({ ANALYZE_MODEL: 'claude-haiku-4-5' })).toBe('claude-haiku-4-5');
    expect(resolveModel({ ANALYZE_MODEL: '' })).toBe('claude-opus-5');
    expect(MODEL).toBe(resolveModel(process.env));
  });
});

describe('EXTRACT_SCHEMA — 구조화 출력이 받아들이는 모양', () => {
  const walk = (node, visit) => {
    if (!node || typeof node !== 'object') return;
    visit(node);
    for (const v of Object.values(node)) {
      if (Array.isArray(v)) v.forEach((x) => walk(x, visit));
      else walk(v, visit);
    }
  };

  it('모든 object 는 additionalProperties:false 이고 required 가 properties 전부를 덮는다', () => {
    walk(EXTRACT_SCHEMA, (node) => {
      if (node.type !== 'object') return;
      expect(node.additionalProperties).toBe(false);
      expect([...(node.required ?? [])].sort()).toEqual(Object.keys(node.properties ?? {}).sort());
    });
  });

  it('minimum/maximum/minLength 같은 제약이 없다', () => {
    walk(EXTRACT_SCHEMA, (node) => {
      for (const banned of ['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems', 'pattern']) {
        expect(node).not.toHaveProperty(banned);
      }
    });
  });

  it('optional 은 anyOf string|null 이고 type 은 네 종류 enum', () => {
    const props = EXTRACT_SCHEMA.properties.places.items.properties;
    for (const key of ['regionRaw', 'address', 'petPolicyText', 'features']) {
      expect(props[key]).toEqual({ anyOf: [{ type: 'string' }, { type: 'null' }] });
    }
    expect(props.type.enum).toEqual(['stay', 'restaurant', 'cafe', 'other']);
  });
});

describe('buildCliArgs — claude -p 인자', () => {
  const args = buildCliArgs();
  const valueAfter = (flag) => args[args.indexOf(flag) + 1];

  it('헤드리스 + JSON 결과 + 스키마 + 시스템 프롬프트 대체 + 모델', () => {
    expect(args[0]).toBe('-p');
    expect(valueAfter('--output-format')).toBe('json');
    expect(JSON.parse(valueAfter('--json-schema'))).toEqual(EXTRACT_SCHEMA);
    expect(valueAfter('--system-prompt')).toBe(SYSTEM_PROMPT);
    expect(valueAfter('--model')).toBe(MODEL);
  });

  it('도구·MCP·설정·스킬·세션 저장을 전부 끈다 — 프롬프트에 레포 컨텍스트가 실리지 않게', () => {
    expect(valueAfter('--tools')).toBe('');
    expect(valueAfter('--setting-sources')).toBe('');
    expect(args).toContain('--strict-mcp-config');
    expect(args).toContain('--disable-slash-commands');
    expect(args).toContain('--no-session-persistence');
  });

  it('--bare 는 없다(구독 OAuth·키체인을 못 읽는다) · 프롬프트는 인자에 없다(stdin)', () => {
    expect(args).not.toContain('--bare');
    expect(args).not.toContain('--append-system-prompt');
    expect(args.some((a) => a.includes('--- 본문 ---'))).toBe(false);
  });

  it('호출마다 같은 인자(캐시 prefix)', () => {
    expect(buildCliArgs()).toEqual(args);
  });
});

describe('buildPrompt — stdin 으로 넘기는 user 프롬프트', () => {
  it('메타 → 본문 순서', () => {
    const text = buildPrompt(post, '본문입니다. 소형견만 실내 가능.');
    expect(text.indexOf(post.title)).toBeGreaterThanOrEqual(0);
    expect(text.indexOf(post.url)).toBeLessThan(text.indexOf('본문입니다'));
    expect(text).toContain(post.keyword);
    expect(text).toContain('--- 본문 ---');
  });

  it('메타가 비어도 깨지지 않는다', () => {
    expect(() => buildPrompt({}, '')).not.toThrow();
    expect(() => buildPrompt(undefined, undefined)).not.toThrow();
  });
});

describe('parseExtraction — result 객체 → places', () => {
  it('정상 결과를 TExtractedPlace[] 로 (structured_output 을 읽고 result 문자열은 안 본다)', () => {
    const r = withPlaces([goodPlace]);
    r.result = 'result 문자열은 무시';
    expect(parseExtraction(r)).toEqual({ places: [goodPlace] });
  });

  it('빈 문자열은 null, evidence 는 string[] 보장, confidence 는 0..1 clamp, 모르는 type 은 other', () => {
    const raw = {
      ...goodPlace,
      regionRaw: '',
      address: '  ',
      petPolicyText: null,
      features: 42,
      evidence: ['ok', '', null, 7, '  둘째  '],
      confidence: 1.7,
      type: 'bar',
      isJeju: 'true',
    };
    const [p] = parseExtraction(withPlaces([raw])).places;
    expect(p.regionRaw).toBeNull();
    expect(p.address).toBeNull();
    expect(p.petPolicyText).toBeNull();
    expect(p.features).toBeNull();
    expect(p.evidence).toEqual(['ok', '둘째']);
    expect(p.confidence).toBe(1);
    expect(p.type).toBe('other');
    expect(p.isJeju).toBe(false);
  });

  it('confidence 가 숫자가 아니면 0, 음수면 0', () => {
    const mk = (confidence) => parseExtraction(withPlaces([{ ...goodPlace, confidence }])).places[0].confidence;
    expect(mk('high')).toBe(0);
    expect(mk(-0.3)).toBe(0);
  });

  it('이름 없는 항목은 버린다', () => {
    expect(parseExtraction(withPlaces([{ ...goodPlace, name: ' ' }, goodPlace])).places).toHaveLength(1);
  });

  it('result 객체가 아니면 not_result', () => {
    for (const bad of [undefined, null, 'x', { type: 'assistant' }]) {
      try {
        parseExtraction(bad);
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(ExtractionError);
        expect(e.code).toBe('not_result');
      }
    }
  });

  it('is_error + 로그인 문구 → ClaudeCliError(auth, fatal)', () => {
    const r = fakeResult({ is_error: true, subtype: 'success', result: 'Not logged in · Please run /login', structured_output: undefined });
    try {
      parseExtraction(r);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ClaudeCliError);
      expect(e.code).toBe('auth');
      expect(isFatal(e)).toBe(true);
      expect(isRetryable(e)).toBe(false);
      expect(e.message).toContain('CLAUDE_CODE_OAUTH_TOKEN');
    }
  });

  it('is_error + 세션 한도 문구 → ClaudeCliError(limit, retryable) — 2026-09-21 실제로 본 문구', () => {
    const r = fakeResult({ is_error: true, result: "You've hit your session limit · resets 2:30am (Asia/Seoul)", structured_output: undefined });
    try {
      parseExtraction(r);
      expect.unreachable();
    } catch (e) {
      expect(e.code).toBe('limit');
      expect(isRetryable(e)).toBe(true);
      expect(isFatal(e)).toBe(false);
    }
  });

  it('is_error + api_error_status 로도 가른다: 401 → auth, 429/529 → limit, 400 → api_error(fatal)', () => {
    const code = (status) => {
      try {
        parseExtraction(fakeResult({ is_error: true, api_error_status: status, result: 'x', structured_output: undefined }));
        return 'none';
      } catch (e) {
        return e.code;
      }
    };
    expect(code(401)).toBe('auth');
    expect(code(429)).toBe('limit');
    expect(code(529)).toBe('limit');
    expect(code(400)).toBe('api_error');
  });

  it('is_error 메시지는 앞 160자만 싣는다', () => {
    const long = 'x'.repeat(1000);
    try {
      parseExtraction(fakeResult({ is_error: true, result: long, structured_output: undefined }));
      expect.unreachable();
    } catch (e) {
      expect(e.message.length).toBeLessThan(300);
    }
  });

  it('error_* subtype(실제 CLI 모양: is_error + errors[], result 없음) — 스키마 재시도 소진·턴 초과는 permanent(그 글을 닫는다)', () => {
    for (const subtype of ['error_max_structured_output_retries', 'error_max_turns']) {
      const r = { type: 'result', subtype, is_error: true, errors: ['Failed to provide valid structured output after maximum retries'], api_error_status: null, usage: {} };
      try {
        parseExtraction(r);
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(ClaudeCliError);
        expect(e.code).toBe('model_failed');
        expect(e.permanent).toBe(true);
        expect(isRetryable(e)).toBe(false);
        expect(isFatal(e)).toBe(false);
        expect(e.message).toContain(subtype);
        expect(e.message).toContain('valid structured output');
      }
    }
  });

  it('error_during_execution · error_max_budget_usd 는 retryable(다음 실행)', () => {
    for (const subtype of ['error_during_execution', 'error_max_budget_usd']) {
      try {
        parseExtraction({ type: 'result', subtype, is_error: true, errors: ['boom'], api_error_status: null });
        expect.unreachable();
      } catch (e) {
        expect(e.code).toBe('api_error');
        expect(isRetryable(e)).toBe(true);
        expect(e.permanent).toBe(false);
      }
    }
  });

  it('API 4xx(400 잘못된 모델명 등)는 설정 문제 — fatal', () => {
    try {
      parseExtraction(fakeResult({ is_error: true, api_error_status: 400, result: 'model not found', structured_output: undefined }));
      expect.unreachable();
    } catch (e) {
      expect(e.code).toBe('api_error');
      expect(isFatal(e)).toBe(true);
    }
  });

  it("LIMIT_RE 는 구 단위 — 'generated'·'separate' 같은 단어는 한도가 아니다", () => {
    const code = (text) => {
      try {
        parseExtraction(fakeResult({ is_error: true, result: text, structured_output: undefined }));
        return 'none';
      } catch (e) {
        return e.code;
      }
    };
    expect(code('output could not be generated; separate issue')).not.toBe('limit');
    expect(code('Rate limit exceeded')).toBe('limit');
    expect(code("You've hit your usage limit")).toBe('limit');
    expect(code('API is overloaded')).toBe('limit');
  });

  it('structured_output 이 없으면 no_structured_output — result 문자열이 JSON 이어도 쓰지 않는다', () => {
    try {
      parseExtraction(fakeResult({ structured_output: undefined }));
      expect.unreachable();
    } catch (e) {
      expect(e.code).toBe('no_structured_output');
    }
  });

  it('places 가 배열이 아니면 invalid_shape', () => {
    try {
      parseExtraction(fakeResult({ structured_output: { places: 'x' } }));
      expect.unreachable();
    } catch (e) {
      expect(e.code).toBe('invalid_shape');
    }
  });
});

describe('extractPlaces — 가짜 run', () => {
  it('정상: buildCliArgs/buildPrompt 로 한 번 부르고 장소 배열을 돌려준다', async () => {
    const run = fakeRun(withPlaces([goodPlace]));
    const places = await extractPlaces(run, post, '본문');
    expect(places).toEqual([goodPlace]);
    expect(run.calls).toHaveLength(1);
    expect(run.calls[0].args).toEqual(buildCliArgs());
    expect(run.calls[0].input).toBe(buildPrompt(post, '본문'));
  });

  it('stdout 이 JSON 이 아니면 ClaudeCliError(invalid_json), 내용은 메시지에 싣지 않는다', async () => {
    const run = fakeRun('비밀스러운 출력 not json');
    await expect(extractPlaces(run, post, '본문')).rejects.toMatchObject({ code: 'invalid_json', name: 'ClaudeCliError' });
    await expect(extractPlaces(run, post, '본문')).rejects.not.toThrow(/비밀스러운/);
  });

  it('is_error 결과는 ClaudeCliError 로, 스키마 미달은 ExtractionError 로 reject', async () => {
    await expect(extractPlaces(fakeRun(fakeResult({ is_error: true, result: 'rate limited', structured_output: undefined })), post, '본문'))
      .rejects.toMatchObject({ code: 'limit' });
    await expect(extractPlaces(fakeRun(fakeResult({ structured_output: undefined })), post, '본문'))
      .rejects.toMatchObject({ code: 'no_structured_output' });
  });

  it('run 이 던지는 에러(프로세스 실패)는 그대로 전파', async () => {
    const err = new ClaudeCliError('timeout', 'x', { retryable: true });
    const run = async () => { throw err; };
    await expect(extractPlaces(run, post, '본문')).rejects.toBe(err);
  });

  it('meter 를 주면 호출마다 usage 를 더한다 — 파싱에 실패해도 usage 는 센다', async () => {
    const meter = createUsageMeter();
    const run = fakeRun(fakeResult());
    await extractPlaces(run, post, '본문 1', meter);
    await extractPlaces(run, post, '본문 2', meter);
    const bad = fakeRun(fakeResult({ structured_output: undefined }));
    await expect(extractPlaces(bad, post, '본문 3', meter)).rejects.toMatchObject({ code: 'no_structured_output' });
    expect(meter.totals()).toEqual({ calls: 3, input: 12000, output: 1500, cacheRead: 10500, cacheWrite: 0 });
  });
});

// node 를 claude 대신 세워 프로세스 경로만 검증한다 — 실제 claude 는 인증·한도가 얽혀 테스트에서 부르지 않는다.
describe('runClaudeCli — 자식 프로세스', () => {
  const nodeScript = (js) => ['-e', js];

  it('stdout 의 JSON 을 그대로 돌려준다 — exit 1 이어도(CLI 는 실패해도 result JSON 을 쓴다)', async () => {
    const out = await runClaudeCli(nodeScript('process.stdout.write(JSON.stringify({type:"result",is_error:true,result:"x"})); process.exit(1)'), '', { bin: 'node' });
    expect(JSON.parse(out)).toMatchObject({ type: 'result', is_error: true });
  });

  it('stdin 으로 넘긴 프롬프트가 자식에 도착한다', async () => {
    const echo = 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>process.stdout.write(JSON.stringify({got:s})))';
    const out = await runClaudeCli(nodeScript(echo), '프롬프트 본문', { bin: 'node' });
    expect(JSON.parse(out)).toEqual({ got: '프롬프트 본문' });
  });

  it('JSON 이 아닌 출력 + 종료 코드 ≠ 0 → exit(retryable), stderr 는 앞부분만', async () => {
    const js = 'process.stderr.write("boom ".repeat(100)); process.exit(3)';
    try {
      await runClaudeCli(nodeScript(js), '', { bin: 'node' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ClaudeCliError);
      expect(e.code).toBe('exit');
      expect(e.retryable).toBe(true);
      expect(e.message.length).toBeLessThan(260);
    }
  });

  it('JSON 앞에 다른 줄(경고)이 섞여도 첫 { 부터 돌려준다', async () => {
    const js = 'process.stdout.write("warn: something\\n" + JSON.stringify({type:"result"}))';
    const out = await runClaudeCli(nodeScript(js), '', { bin: 'node' });
    expect(JSON.parse(out)).toEqual({ type: 'result' });
  });

  it('실행 파일이 없으면 not_found(fatal) 이고 타이머가 남지 않는다 — 5분을 기다리지 않는다', async () => {
    const t0 = Date.now();
    try {
      await runClaudeCli([], '', { bin: 'claude-does-not-exist-zgnn', timeoutMs: 60_000 });
      expect.unreachable();
    } catch (e) {
      expect(e.code).toBe('not_found');
      expect(isFatal(e)).toBe(true);
      expect(e.message).toContain('@anthropic-ai/claude-code');
    }
    // 타이머가 살아 있으면 이벤트 루프가 안 끝나지만 여기서 잴 수는 없다 — 대신 즉시 reject 됐는지만 본다
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('실행 파일이 없으면 not_found(fatal) — 설치 안내를 담는다', async () => {
    try {
      await runClaudeCli([], '', { bin: 'claude-does-not-exist-zgnn' });
      expect.unreachable();
    } catch (e) {
      expect(e.code).toBe('not_found');
      expect(isFatal(e)).toBe(true);
      expect(e.message).toContain('@anthropic-ai/claude-code');
    }
  });

  it('타임아웃이면 timeout(retryable)', async () => {
    try {
      await runClaudeCli(nodeScript('setTimeout(()=>{}, 10000)'), '', { bin: 'node', timeoutMs: 200 });
      expect.unreachable();
    } catch (e) {
      expect(e.code).toBe('timeout');
      expect(e.retryable).toBe(true);
    }
  });

  it('CLAUDECODE 는 자식 env 에서 뺀다(대화형 세션 안에서 돌려도 중첩 표시가 안 넘어간다)', async () => {
    const out = await runClaudeCli(nodeScript('process.stdout.write(JSON.stringify({nested: "CLAUDECODE" in process.env}))'), '', {
      bin: 'node',
      env: { ...process.env, CLAUDECODE: '1' },
    });
    expect(JSON.parse(out)).toEqual({ nested: false });
  });

  it('기본 타임아웃은 5분', () => {
    expect(CLI_TIMEOUT_MS).toBe(300000);
  });
});

describe('isRetryable / isFatal', () => {
  it('ClaudeCliError 의 플래그를 그대로 읽는다', () => {
    expect(isRetryable(new ClaudeCliError('limit', 'x', { retryable: true }))).toBe(true);
    expect(isRetryable(new ClaudeCliError('auth', 'x', { fatal: true }))).toBe(false);
    expect(isFatal(new ClaudeCliError('auth', 'x', { fatal: true }))).toBe(true);
    expect(isFatal(new ClaudeCliError('limit', 'x', { retryable: true }))).toBe(false);
  });

  it('내용 오류 · 일반 Error · undefined 는 둘 다 false', () => {
    for (const e of [new ExtractionError('invalid_shape', 'x'), new Error('x'), undefined]) {
      expect(isRetryable(e)).toBe(false);
      expect(isFatal(e)).toBe(false);
    }
  });
});

describe('createUsageMeter', () => {
  it('null 인 캐시 필드는 0 으로, 합산과 summary', () => {
    const meter = createUsageMeter();
    meter.add({ input_tokens: 100, output_tokens: 10, cache_read_input_tokens: null, cache_creation_input_tokens: 90 });
    meter.add({ input_tokens: 50, output_tokens: 5, cache_read_input_tokens: 90, cache_creation_input_tokens: null });
    expect(meter.totals()).toEqual({ calls: 2, input: 150, output: 15, cacheRead: 90, cacheWrite: 90 });
    expect(meter.summary()).toBe('Claude 2회 · 입력 150 · 출력 15 · 캐시 읽기 90 · 캐시 쓰기 90 토큰');
  });

  it('usage 가 없어도(undefined) 호출 수만 센다', () => {
    const meter = createUsageMeter();
    meter.add(undefined);
    expect(meter.totals()).toEqual({ calls: 1, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  });

  it('totals() 는 복사본이라 밖에서 바꿔도 안 샌다', () => {
    const meter = createUsageMeter();
    meter.totals().calls = 99;
    expect(meter.totals().calls).toBe(0);
  });
});
