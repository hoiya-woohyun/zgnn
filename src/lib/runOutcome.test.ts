import { describe, expect, it } from 'vitest';
import type { TPipelineRun } from './adminOps';
import { runOutcome } from './runOutcome';

const NOW = Date.parse('2026-10-28T03:00:00Z');
const MIN = 60_000;
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const run = (over: Partial<TPipelineRun>): TPipelineRun => ({
  id: 'r1',
  script: 'analyze',
  status: 'ok',
  started_at: ago(30 * MIN),
  ended_at: ago(20 * MIN),
  heartbeat_at: ago(20 * MIN),
  args: null,
  stats: null,
  error: null,
  alert: null,
  progress: null,
  ...over,
});

describe('runOutcome — 저장된 status 넷을 "어떻게 끝났나" 여덟으로', () => {
  it('도는 중 · 끝 · 일부는 다음에(분석은 건너뛴 글 수, 반영은 실패 수)', () => {
    expect(runOutcome(run({ status: 'running', ended_at: null, heartbeat_at: ago(MIN), progress: { done: 3, total: 10 } }), NOW)).toMatchObject({
      kind: 'running',
      text: '3/10 하는 중',
    });
    expect(runOutcome(run({}), NOW)).toMatchObject({ kind: 'ok', tone: 'none', text: '끝', at: ago(20 * MIN) });
    expect(runOutcome(run({ status: 'partial', stats: { skipped: 9 } }), NOW).text).toBe('끝 · 9건은 다음 실행에 다시');
    expect(runOutcome(run({ script: 'apply', status: 'partial', stats: { failed: 2 } }), NOW).text).toBe('끝 · 2건 실패');
  });

  it('분류 문구로 가른다 — Ctrl+C 는 사람이 멈춤(실패 아님), 한도는 주의, 그 밖은 실패', () => {
    const progress = { done: 12, total: 53 };
    expect(runOutcome(run({ script: 'collect', status: 'failed', error: '중단(SIGINT)', progress }), NOW)).toMatchObject({
      kind: 'stopped',
      tone: 'none',
      label: '사람이 멈춤',
      text: '12/53에서 사람이 멈춤',
      where: '12/53',
    });
    expect(runOutcome(run({ status: 'failed', error: 'Claude 한도' }), NOW)).toMatchObject({ kind: 'limit', tone: 'warn' });
    expect(runOutcome(run({ status: 'failed', error: 'DB 쓰기 실패', progress }), NOW)).toMatchObject({ kind: 'failed', tone: 'fail', text: '12/53에서 실패 — DB 쓰기 실패' });
    // '알 수 없음' 은 원인 대신 어디를 보면 되는지
    expect(runOutcome(run({ status: 'failed', error: '알 수 없음' }), NOW).text).toBe('실패 — 원인은 터미널·함수 로그에');
  });

  it('끝 기록 없이 멎은 실행 — 진행이 덜 찼으면 끊김(실패), 끝까지 찼으면 끝 무렵 멈춤(할 일 없음). 끝 시각은 마지막 심장', () => {
    const beat = ago(2 * 24 * 60 * MIN);
    const lost = runOutcome(run({ status: 'running', ended_at: null, heartbeat_at: beat, progress: { done: 12, total: 40 } }), NOW);
    expect(lost).toMatchObject({ kind: 'lost', tone: 'fail', text: '12/40에서 끊김', at: beat });
    // 2026-10-10 서버 워커 6e3179fa: 5/5 인데 running 으로 남았다
    const unclosed = runOutcome(run({ status: 'running', ended_at: null, heartbeat_at: beat, progress: { done: 5, total: 5 } }), NOW);
    expect(unclosed).toMatchObject({ kind: 'unclosed', tone: 'none', label: '끝 무렵 멈춤' });
    // 다음 실행이 닫은 행(`closeLostRuns`)도 같은 말이다 — status 가 failed 여도 실패로 읽지 않는다
    expect(runOutcome(run({ status: 'failed', error: '기록 없이 끝남', progress: { done: 5, total: 5 } }), NOW).kind).toBe('unclosed');
    expect(runOutcome(run({ status: 'failed', error: '기록 없이 끝남' }), NOW)).toMatchObject({ kind: 'lost', text: '중간에 끊김' });
  });

  it('진행은 모양을 믿지 않는다 — total 이 없거나 0 이면 위치를 말하지 않는다', () => {
    expect(runOutcome(run({ status: 'failed', error: '중단(SIGINT)', progress: { done: 3, total: 0 } }), NOW).where).toBeNull();
    expect(runOutcome(run({ status: 'failed', error: '중단(SIGINT)', progress: { done: 99, total: 10 } }), NOW).where).toBe('10/10');
  });
});
