import { describe, expect, it } from 'vitest';
import { agoLabel, rebuildHeadline, RESPONSE_WAIT_LIMIT_MS, type TRebuildEntry } from './adminRebuild';

const NOW = Date.parse('2026-09-29T13:00:00.000Z');

const entry = (patch: Partial<TRebuildEntry> = {}): TRebuildEntry => ({
  requested_at: '2026-09-29T12:58:00.000Z',
  op: 'UPDATE',
  place_name: '두부식당',
  place_status: 'published',
  hook: 'sent',
  note: null,
  response_status: 201,
  response_error: null,
  ...patch,
});

describe('agoLabel', () => {
  it('1분 미만은 "방금"', () => {
    expect(agoLabel('2026-09-29T12:59:30.000Z', NOW)).toBe('방금');
  });

  it('분·시간·일로 올라간다', () => {
    expect(agoLabel('2026-09-29T12:58:00.000Z', NOW)).toBe('2분 전');
    expect(agoLabel('2026-09-29T10:00:00.000Z', NOW)).toBe('3시간 전');
    expect(agoLabel('2026-09-27T13:00:00.000Z', NOW)).toBe('2일 전');
  });

  it('못 읽는 값은 빈 문자열 — 날짜 자리에 NaN 을 쓰지 않는다', () => {
    expect(agoLabel('언젠가', NOW)).toBe('');
  });
});

describe('rebuildHeadline', () => {
  it('기록이 없으면 그렇게 말한다', () => {
    expect(rebuildHeadline([], NOW)).toEqual({ tone: 'none', text: '아직 재빌드가 불린 적이 없어요.' });
  });

  /*
   * **이 화면이 만들어진 이유**다. 훅이 없으면 트리거는 조용히 아무 일도 하지 않고, 그때까지 화면은
   * "사이트에는 다음 빌드에서 보여요" 라고 똑같이 말했다 — 승인은 성공하고 사이트는 영원히 안 바뀌는데
   * 운영자가 그것을 알 방법이 없었다.
   */
  it('훅이 없으면 경고하고, 바꾼 것이 사이트에 안 간다고 말한다', () => {
    const headline = rebuildHeadline([entry({ hook: 'missing', response_status: null, note: 'Vault 에 …' })], NOW);
    expect(headline.tone).toBe('warn');
    // 결과가 앞, 원인이 뒤다 — 운영자가 읽는 것은 "내가 한 일이 어떻게 됐나" 지 훅의 상태가 아니다.
    expect(headline.text).toContain('사이트에 반영되지 않아요');
    expect(headline.text).toContain('vercel_deploy_hook');
  });

  /**
   * **주어가 승인으로 굳으면 거짓말이 된다.** 내리기·되살리기도 같은 트리거를 쓰고 이 머리글은 두 칸 위에 공용으로 뜬다 —
   * 폐업 가게를 내린 직후 훅이 404 면 머리글이 하지 않은 승인을 말하게 된다.
   */
  it('내린 것이면 주어가 내림이다 — 승인이라고 하지 않는다', () => {
    const archived = { place_status: 'archived' as const };
    for (const over of [
      { hook: 'missing' as const, response_status: null },
      { hook: 'sent' as const, response_status: 404 },
    ]) {
      const headline = rebuildHeadline([entry({ ...over, ...archived })], NOW);
      expect(headline.text).toContain('내린 것');
      expect(headline.text).not.toContain('승인');
    }
  });

  it('게시 쪽 변경이면 주어가 올림이다', () => {
    const headline = rebuildHeadline([entry({ hook: 'sent', response_status: 404, place_status: 'published' })], NOW);
    expect(headline.text).toContain('올린 것');
  });

  it('보내다 터진 것은 사유를 그대로 보여 준다', () => {
    const headline = rebuildHeadline([entry({ hook: 'error', response_status: null, note: '42883: no function' })], NOW);
    expect(headline.tone).toBe('warn');
    expect(headline.text).toContain('42883: no function');
  });

  it('2xx 면 걸렸다고 말한다', () => {
    const headline = rebuildHeadline([entry({ response_status: 201 })], NOW);
    expect(headline).toEqual({ tone: 'ok', text: '재빌드가 걸렸어요(2분 전) — 1~2분 뒤 사이트에 보여요' });
  });

  /** 하루 지난 기록에 "1~2분 뒤" 를 붙이면 지금도 기다려야 하는 것처럼 읽힌다. */
  it('2xx 뒤 충분히 지났으면 반영됐다고 과거로 말한다', () => {
    const headline = rebuildHeadline(
      [entry({ response_status: 201, requested_at: new Date(NOW - 24 * 60 * 60 * 1000).toISOString() })],
      NOW,
    );
    expect(headline).toEqual({ tone: 'ok', text: '사이트에 반영됐어요 · 마지막 재빌드 1일 전' });
  });

  /*
   * 회전 사고의 유일한 신호다 — 폐기된 Deploy Hook 은 요청이 가고 4xx 가 돌아온다.
   * 이것을 "보냈어요" 로 뭉개면 새 주소를 Vault 에 잘못 붙여 넣은 것을 아무도 모른다.
   */
  it('4xx·5xx 는 훅이 폐기됐을 수 있다고 짚고 Vault 를 가리킨다', () => {
    const headline = rebuildHeadline([entry({ response_status: 404 })], NOW);
    expect(headline.tone).toBe('warn');
    expect(headline.text).toContain('404');
    expect(headline.text).toContain('vercel_deploy_hook');
  });

  /*
   * 429 는 폐기가 아니라 시간당 60번 한도다(2026-10-02 일괄 고치기 뒤 6건 전부 429, 같은 훅이 10-06 엔 201).
   * 폐기와 같은 문장으로 말하면 운영자가 멀쩡한 훅을 회전한다 — 그래서 Vault 를 가리키지 않는다.
   */
  it('429 는 한도라고 말하고 Vault 를 가리키지 않는다', () => {
    const headline = rebuildHeadline([entry({ response_status: 429 })], NOW);
    expect(headline.tone).toBe('warn');
    expect(headline.text).toContain('429');
    expect(headline.text).toContain('60번');
    expect(headline.text).not.toContain('vercel_deploy_hook');
    expect(headline.text).not.toContain('폐기');
  });

  /** 응답이 아직 안 온 것은 고장이 아니라 대기다(실측 4.7초). 둘을 다른 말로 보여 준다. */
  it('응답 전은 대기, 한참 지나도 없으면 경고', () => {
    const waiting = rebuildHeadline([entry({ response_status: null })], NOW);
    expect(waiting.tone).toBe('waiting');
    expect(waiting.text).toContain('기다리고');

    const stale = rebuildHeadline(
      [entry({ response_status: null, requested_at: new Date(NOW - RESPONSE_WAIT_LIMIT_MS - 1000).toISOString() })],
      NOW,
    );
    expect(stale.tone).toBe('warn');
    expect(stale.text).toContain('응답을 못 받았어요');
  });

  /*
   * `skipped` 를 건너뛰는 이유: 초안을 고치면 빌드를 부르지 않는 것이 정상이고, 그 행이 맨 위에 있다고
   * 머리글이 바뀌면 방금 올린 장소가 반영 중인지를 가려 버린다.
   */
  it('건너뛴 기록은 넘기고 그 앞의 실제 호출을 말한다', () => {
    const headline = rebuildHeadline(
      [
        entry({ hook: 'skipped', place_status: 'draft', response_status: null, requested_at: '2026-09-29T12:59:00.000Z' }),
        entry({ response_status: 200 }),
      ],
      NOW,
    );
    expect(headline.tone).toBe('ok');
    expect(headline.text).toContain('재빌드가 걸렸어요');
  });

  it('건너뛴 기록만 있으면 왜 안 불렀는지 말한다', () => {
    const headline = rebuildHeadline([entry({ hook: 'skipped', place_status: 'draft', response_status: null })], NOW);
    expect(headline.tone).toBe('none');
    expect(headline.text).toContain('재빌드를 부르지 않았어요');
  });
});
