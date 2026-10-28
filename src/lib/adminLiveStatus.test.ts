import { describe, expect, it } from 'vitest';
import type { TOpsWorker, TPipelineRun } from './adminOps';
import { lastRunText, liveStatus, opsLiveStatus, type TLiveInput } from './adminLiveStatus';

const NOW = Date.parse('2026-10-09T03:00:00Z');
const ago = (sec: number) => new Date(NOW - sec * 1000).toISOString();

const worker = (over: Partial<TOpsWorker>): TOpsWorker => ({
  host: 'mac',
  last_seen_at: ago(10),
  phase: 'idle',
  run_id: null,
  started_at: null,
  version: null,
  ...over,
});

const run = (over: Partial<TPipelineRun>): TPipelineRun => ({
  id: 'r1',
  script: 'analyze',
  status: 'running',
  started_at: ago(120),
  ended_at: null,
  heartbeat_at: ago(5),
  args: null,
  stats: null,
  error: null,
  alert: null,
  progress: null,
  ...over,
});

const input = (over: Partial<TLiveInput>): TLiveInput => ({ workers: [], runsLatest: {}, requestsQueued: 0, remote: true, nowMs: NOW, ...over });

describe('liveStatus', () => {
  it('서버 워커가 돌면 그것이 먼저 — 진행 막대와 지금 읽는 글을 붙인다', () => {
    const status = liveStatus(
      input({
        workers: [worker({ host: 'vercel', phase: 'analyze', run_id: 'r1' }), worker({ phase: 'collect' })],
        runsLatest: { analyze: run({ progress: { done: 3, total: 10, current: '카페살레 글' } }) },
        requestsQueued: 1,
      }),
    );
    // 머리말은 일(분석 중)이고, 어디서 도는지는 꼬리말 한 마디다 — 일꾼 이름으로 말하지 않는다
    expect(status).toMatchObject({ tone: 'ok', headline: '분석 중', detail: '서버에서 · 요청 1건 대기', progress: { done: 3, total: 10 }, current: '카페살레 글' });
  });

  it('서버 행이 60초 넘게 조용하면 돌지 않는 것이다 — 시각만으로 바뀐다(이벤트가 없어도)', () => {
    const workers = [worker({ host: 'vercel', phase: 'analyze', last_seen_at: ago(30) })];
    expect(liveStatus(input({ workers })).headline).toBe('분석 중');
    expect(liveStatus(input({ workers, nowMs: NOW + 60_000 })).headline).toBe('쉬는 중');
  });

  it('PC 워커가 돌면 그렇게 말한다 — 끝난 실행 행의 진행은 붙이지 않는다', () => {
    const status = liveStatus(
      input({ workers: [worker({ phase: 'apply', run_id: 'r1' })], runsLatest: { apply: run({ script: 'apply', status: 'ok', progress: { done: 1, total: 2 } }) } }),
    );
    expect(status).toMatchObject({ tone: 'ok', headline: '반영 중', detail: 'PC에서', progress: null });
  });

  it('PC 워커가 로그인·한도로 기다리면 주의', () => {
    expect(liveStatus(input({ workers: [worker({ phase: 'login-needed' })] }))).toMatchObject({ tone: 'warn', headline: 'PC에서 로그인 필요' });
  });

  it('서버가 받는 빌드는 PC 워커가 꺼져 있어도 주의를 띄우지 않는다', () => {
    expect(liveStatus(input({ remote: true }))).toMatchObject({ tone: 'none', headline: '쉬는 중' });
    expect(liveStatus(input({ remote: false }))).toMatchObject({ tone: 'warn', headline: 'PC 워커 꺼짐' });
  });

  it('요청이 대기 중인데 아무도 안 돌면 누가 받을지 말한다', () => {
    expect(liveStatus(input({ requestsQueued: 2 }))).toMatchObject({ headline: '요청 2건 대기', detail: '서버에서 곧 받아요', tone: 'none' });
    expect(liveStatus(input({ requestsQueued: 2, remote: false }))).toMatchObject({ tone: 'warn', detail: '터미널에서 pnpm data 를 켜 주세요' });
  });

  it('요청이 2시간 넘게 그대로면 "곧 받아요" 가 아니라 아무도 안 가져갔다고 말한다 — 운영 현황 분석 칸과 같은 기준', () => {
    // 2026-10-28 원격: 10-08 요청 1건이 20일째 queued 인데 머리글은 "서버 워커가 곧 받아요" 였다
    const old = liveStatus(input({ requestsQueued: 1, oldestRequestAt: ago(20 * 86_400) }));
    expect(old).toMatchObject({ tone: 'warn', headline: '분석 요청이 20일 전부터 그대로예요', detail: '아무도 안 가져갔어요 · 분석을 다시 요청하면 서버가 받아요' });
    expect(liveStatus(input({ requestsQueued: 1, oldestRequestAt: ago(20 * 86_400), remote: false })).detail).toBe('아무도 안 가져갔어요 · 터미널에서 pnpm data 를 켜 주세요');
    // 이어 돌리기 줄이 버튼을 들고 있으면 그 줄에 맡긴다
    expect(liveStatus(input({ requestsQueued: 1, oldestRequestAt: ago(20 * 86_400), resumeShown: true })).detail).toBe('아무도 안 가져갔어요');
    // 막 들어온 요청은 그대로 "곧 받아요", 칸이 없는 옛 원격(undefined)은 나이를 보지 않는다
    expect(liveStatus(input({ requestsQueued: 1, oldestRequestAt: ago(60) })).detail).toBe('서버에서 곧 받아요');
    expect(liveStatus(input({ requestsQueued: 1 })).detail).toBe('서버에서 곧 받아요');
  });

  it('도는 일이 있으면 오래된 요청보다 그것이 먼저다', () => {
    const status = liveStatus(input({ workers: [worker({ host: 'vercel', phase: 'analyze' })], oldestRequestAt: ago(20 * 86_400) }));
    expect(status.headline).toBe('분석 중');
  });

  it('이어 돌리기 줄이 서버의 남은 일을 말하면 "곧 받아요" 를 붙이지 않는다 — 사슬이 쉬었으면 거짓이다(T10)', () => {
    expect(liveStatus(input({ requestsQueued: 1, resumeShown: true }))).toMatchObject({ headline: '요청 1건 대기', detail: null, tone: 'none' });
  });

  it('도는 일이 없으면 마지막 일이 어떻게 끝났는지가 머리말 — 실패·끊김은 주의', () => {
    expect(liveStatus(input({}))).toMatchObject({ tone: 'none', headline: '쉬는 중', detail: null });
    const ok = liveStatus(input({ runsLatest: { analyze: run({ status: 'ok', ended_at: ago(180) }) } }));
    expect(ok).toMatchObject({ tone: 'none', headline: '분석 끝', detail: '3분 전 · 지금 도는 일 없음' });
    const failed = liveStatus(input({ runsLatest: { apply: run({ script: 'apply', status: 'failed', ended_at: ago(60), error: 'DB 쓰기 실패' }) } }));
    expect(failed).toMatchObject({ tone: 'warn', headline: '반영 실패 — DB 쓰기 실패', detail: '1분 전 · 지금 도는 일 없음' });
  });

  it('사람이 Ctrl+C 로 멈춘 수집은 실패가 아니다 — 어디서 멈췄는지 말한다', () => {
    const stopped = run({ script: 'collect', status: 'failed', error: '중단(SIGINT)', ended_at: ago(600), progress: { done: 12, total: 53 } });
    expect(liveStatus(input({ runsLatest: { collect: stopped } }))).toMatchObject({ tone: 'none', headline: '수집 12/53에서 사람이 멈춤' });
  });
});

describe('lastRunText', () => {
  it('수집·분석·반영 중 가장 늦게 끝난 것 하나 — 승인·반려는 세지 않는다', () => {
    const text = lastRunText(
      {
        collect: run({ script: 'collect', status: 'ok', ended_at: ago(600) }),
        analyze: run({ status: 'partial', ended_at: ago(120) }),
        approve: run({ script: 'approve', status: 'ok', ended_at: ago(10) }),
      },
      NOW,
    );
    expect(text).toEqual({ text: '분석 끝(일부는 다음에)', ago: '2분 전', tone: 'none' });
  });

  it('심장이 멎은 running 은 마지막 심장에 끝난 것으로 치고, 어디서 끊겼는지 말한다', () => {
    const dead = run({ heartbeat_at: ago(3600), started_at: ago(4000), progress: { done: 12, total: 40 } });
    expect(lastRunText({ analyze: dead }, NOW)).toEqual({ text: '분석 12/40에서 끊김', ago: '1시간 전', tone: 'fail' });
  });
});

describe('opsLiveStatus — 운영 현황도 /admin 과 같은 줄', () => {
  const overview = (over: Partial<Parameters<typeof opsLiveStatus>[0]>) => ({ workers: [], runsLatest: {}, requestsQueued: 0, ...over });

  it('workers 키가 없으면(마이그레이션 전) 모르는 것이라 그리지 않는다', () => {
    expect(opsLiveStatus(overview({ workers: undefined }), { remote: true, nowMs: NOW })).toBeNull();
    expect(opsLiveStatus(overview({ workers: undefined }), { remote: false, nowMs: NOW })).toBeNull();
  });

  it('서버 빌드는 PC 워커가 없거나 꺼져 있어도 /admin 과 같이 쉬는 중 — remote 를 넘기지 않으면 깨진다', () => {
    const stale = [worker({ last_seen_at: ago(3600) })];
    for (const workers of [[], stale]) {
      const ops = opsLiveStatus(overview({ workers }), { remote: true, nowMs: NOW });
      expect(ops).toMatchObject({ tone: 'none', headline: '쉬는 중' });
      expect(ops).toEqual(liveStatus(input({ workers, remote: true })));
    }
  });

  it('로컬 빌드는 워커가 없거나 멎으면 지금처럼 경고', () => {
    expect(opsLiveStatus(overview({}), { remote: false, nowMs: NOW })).toMatchObject({ tone: 'warn', headline: 'PC 워커 꺼짐' });
    expect(opsLiveStatus(overview({ workers: [worker({ last_seen_at: ago(3600) })] }), { remote: false, nowMs: NOW })).toMatchObject({ headline: 'PC 워커 멎음' });
  });

  it('서버 워커가 도는 중이면 일이 머리말, 서버·요청 대기는 꼬리말, 진행이 붙는다', () => {
    const ops = opsLiveStatus(
      overview({
        workers: [worker({ host: 'vercel', phase: 'analyze', run_id: 'r1' })],
        runsLatest: { analyze: run({ progress: { done: 1, total: 4 } }) },
        requestsQueued: 2,
      }),
      { remote: true, nowMs: NOW },
    );
    expect(ops).toMatchObject({ tone: 'ok', headline: '분석 중', detail: '서버에서 · 요청 2건 대기', progress: { done: 1, total: 4 } });
  });
});
