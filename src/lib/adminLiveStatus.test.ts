import { describe, expect, it } from 'vitest';
import type { TOpsWorker, TPipelineRun } from './adminOps';
import { lastRunText, liveStatus, type TLiveInput } from './adminLiveStatus';

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
    expect(status).toMatchObject({ tone: 'ok', headline: '서버 워커 · 분석 중', detail: '요청 1건 대기', progress: { done: 3, total: 10 }, current: '카페살레 글' });
  });

  it('서버 행이 60초 넘게 조용하면 돌지 않는 것이다 — 시각만으로 바뀐다(이벤트가 없어도)', () => {
    const workers = [worker({ host: 'vercel', phase: 'analyze', last_seen_at: ago(30) })];
    expect(liveStatus(input({ workers })).headline).toBe('서버 워커 · 분석 중');
    expect(liveStatus(input({ workers, nowMs: NOW + 60_000 })).headline).toBe('쉬는 중');
  });

  it('PC 워커가 돌면 그렇게 말한다 — 끝난 실행 행의 진행은 붙이지 않는다', () => {
    const status = liveStatus(
      input({ workers: [worker({ phase: 'apply', run_id: 'r1' })], runsLatest: { apply: run({ script: 'apply', status: 'ok', progress: { done: 1, total: 2 } }) } }),
    );
    expect(status).toMatchObject({ tone: 'ok', headline: 'PC 워커 · 반영 중', progress: null });
  });

  it('PC 워커가 로그인·한도로 기다리면 주의', () => {
    expect(liveStatus(input({ workers: [worker({ phase: 'login-needed' })] }))).toMatchObject({ tone: 'warn', headline: 'PC 워커 · 로그인 필요' });
  });

  it('서버가 받는 빌드는 PC 워커가 꺼져 있어도 주의를 띄우지 않는다', () => {
    expect(liveStatus(input({ remote: true }))).toMatchObject({ tone: 'none', headline: '쉬는 중' });
    expect(liveStatus(input({ remote: false }))).toMatchObject({ tone: 'warn', headline: 'PC 워커 꺼짐' });
  });

  it('요청이 대기 중인데 아무도 안 돌면 누가 받을지 말한다', () => {
    expect(liveStatus(input({ requestsQueued: 2 }))).toMatchObject({ headline: '요청 2건 대기', detail: '서버 워커가 곧 받아요', tone: 'none' });
    expect(liveStatus(input({ requestsQueued: 2, remote: false }))).toMatchObject({ tone: 'warn', detail: '워커를 켜 주세요(터미널에서 pnpm data)' });
  });

  it('쉬는 중이면 마지막 실행을 붙이고, 실패였으면 주의', () => {
    const ok = liveStatus(input({ runsLatest: { analyze: run({ status: 'ok', ended_at: ago(180) }) } }));
    expect(ok).toMatchObject({ tone: 'none', headline: '쉬는 중', detail: '분석 3분 전 끝' });
    const failed = liveStatus(input({ runsLatest: { apply: run({ script: 'apply', status: 'failed', ended_at: ago(60), error: '세션 만료' }) } }));
    expect(failed).toMatchObject({ tone: 'warn', detail: '반영 1분 전 실패 — 세션 만료' });
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
    expect(text).toEqual({ text: '분석 2분 전 끝(일부 실패)', failed: false });
  });

  it('심장이 멎은 running 은 끝난 것으로 치고 "멈춘 듯"', () => {
    expect(lastRunText({ analyze: run({ heartbeat_at: ago(3600), started_at: ago(4000) }) }, NOW)?.text).toMatch(/멈춘 듯$/);
  });
});
