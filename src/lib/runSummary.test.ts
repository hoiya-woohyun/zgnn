import { describe, expect, it } from 'vitest';
import {
  formatAnalyzeSummary,
  formatApplySummary,
  formatCollectSummary,
  formatReviewSummary,
  formatUsageSummary,
  type TAnalyzeStats,
} from './runSummary';

/*
 * **글자까지 같다** — 아래 문자열은 옮기기 **전의** 코드가 같은 입력으로 찍은 줄이다(2026-10-06, docs/todo/15 T2.1).
 *   collect: scripts/collect/naverBlog.mjs 의 formatSummary · analyze: scripts/analyze/analyzeCandidates.mjs 의 formatSummary +
 *   extractPlaces.mjs 의 createUsageMeter().summary() · apply: apply-approved.mjs:199-203 의 인라인 템플릿 · review: review-candidates.mjs:135.
 * 이 테스트가 깨지면 터미널과 `/admin/ops` 의 요약 열이 다른 말을 하기 시작한 것이다 — fixture 를 고치기 전에 그게 의도인지 본다.
 * 입력은 **`pipeline_runs.stats` 에 들어가는 모양**으로 준다 — 화면은 stats 하나만 들고 이 함수를 부른다.
 */
const FIXTURE = {
  collect1: '수집 2874건 (신규 1200 · 기존 1674 · 1년 밖 제외 900 · 비네이버/비제주 제외 210) · 2분 3초',
  collect0: '수집 0건 (신규 0 · 기존 0 · 1년 밖 제외 0 · 비네이버/비제주 제외 0) · 0.8초',
  meterExtract: 'Claude 추출 2회 · 입력 2000 · 출력 500 · 캐시 읽기 18000 · 캐시 쓰기 4000 토큰',
  meterVerify0: 'Claude 교차점검 0회 · 입력 0 · 출력 0 · 캐시 읽기 0 · 캐시 쓰기 0 토큰',
  analyzeFull:
    '분석 47건 (후보 23 · 일치 9 · 확인요청 4 · 신규 10 · 갱신 5 · 보강 4 · 중복표시 3 · 건너뜀 2 · 분석불가 1 · 제외 25(other 3 · 제주밖 1 · 동반불가 2 · 같은 말 4 · 옛 글 1 · 근거 약함 6 · 차단 1 · 신규·동반 근거 없음 7) · 고침 유지 2 · 교차점검 12건(근거 없음 7 · 동반 불가 정황 1 · 실패 2) · 제안 2/3곳(실패 1)) · Claude 추출 2회 · 입력 2000 · 출력 500 · 캐시 읽기 18000 · 캐시 쓰기 4000 토큰',
  analyzeZero:
    '분석 0건 (후보 0 · 일치 0 · 확인요청 0 · 신규 0 · 건너뜀 0 · 제외 0(other 0 · 제주밖 0 · 동반불가 0) · 교차점검 0건(근거 없음 0 · 동반 불가 정황 0)) · Claude 추출 0회 · 입력 0 · 출력 0 · 캐시 읽기 0 · 캐시 쓰기 0 토큰',
  applyFull:
    '반영 7건 (보강 5 — published 4 · 신규 2 · 실패 1 · pending 되돌림 3) · published 대기 draft 6곳 — Studio 에서 status 를 올려야 화면에 뜬다(pnpm data:review status)',
  applyZero: '반영 0건 (보강 0 · 신규 0 · 실패 0) · published 대기 draft 0곳',
  applyUnknownDraft: '[dry-run] 반영 1건 (보강 1 · 신규 0 · 실패 0) · published 대기 draft ?곳',
  approve: 'approved 3건 — 반영은 pnpm data:apply',
  reject: 'rejected 2건',
};

const ZERO_METER = { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
const EXTRACT_METER = { calls: 2, input: 2000, output: 500, cacheRead: 18000, cacheWrite: 4000 };

/** 화면이 하는 일 그대로 — stats 하나에서 요약 줄을 다시 만든다. */
const analyzeLine = (stats: TAnalyzeStats, opts?: { dryRun?: boolean }) =>
  formatAnalyzeSummary(stats, formatUsageSummary('추출', stats.meters?.extract ?? ZERO_METER), opts);

describe('runSummary — 옮기기 전 콘솔 줄과 글자까지 같다', () => {
  it('collect', () => {
    expect(
      formatCollectSummary({ fetched: 2874, new: 1200, existing: 1674, excludedOld: 900, excludedOther: 210, durationMs: 123_456, naverCalls: 31, truncatedKeywords: 0 }),
    ).toBe(FIXTURE.collect1);
    expect(formatCollectSummary({ fetched: 0, new: 0, existing: 0, excludedOld: 0, excludedOther: 0, durationMs: 800 })).toBe(FIXTURE.collect0);
    // 추가 수집(/admin 요청)이 있던 실행만 한 칸이 더 선다 — 옛 행(키 없음)은 위 두 줄 그대로.
    expect(
      formatCollectSummary({ fetched: 40, new: 12, existing: 28, excludedOld: 0, excludedOther: 3, durationMs: 800, requests: 2, requestNew: 9 }),
    ).toBe('수집 40건 (신규 12 · 기존 28 · 1년 밖 제외 0 · 비네이버/비제주 제외 3) · 추가 수집 2건(새 글 9) · 0.8초');
  });

  it('Claude 계량기 한 줄', () => {
    expect(formatUsageSummary('추출', EXTRACT_METER)).toBe(FIXTURE.meterExtract);
    expect(formatUsageSummary('교차점검', ZERO_METER)).toBe(FIXTURE.meterVerify0);
  });

  it('analyze — stats 의 meters 에서 계량기 줄까지 다시 만든다', () => {
    const full: TAnalyzeStats = {
      analyzed: 47,
      skipped: 2,
      dropped: 1,
      candidates: 23,
      auto: 9,
      ask: 4,
      new: 10,
      dup: 3,
      edited: 2,
      update: 5,
      fill: 4,
      excluded: { other: 3, notJeju: 1, notAllowed: 2, sameAsSite: 4, stale: 1, weak: 6, blocked: 1, noPetEvidence: 7 },
      verify: { checked: 12, noEvidence: 7, notAllowed: 1, failed: 2 },
      propose: { places: 3, done: 2, failed: 1 },
      meters: { extract: EXTRACT_METER, verify: ZERO_METER, propose: ZERO_METER },
      naverCalls: 40,
    };
    expect(analyzeLine(full)).toBe(FIXTURE.analyzeFull);
    expect(analyzeLine(full, { dryRun: true })).toBe(`[dry-run] ${FIXTURE.analyzeFull}`);
    const zero: TAnalyzeStats = {
      analyzed: 0,
      skipped: 0,
      dropped: 0,
      candidates: 0,
      auto: 0,
      ask: 0,
      new: 0,
      dup: 0,
      edited: 0,
      update: 0,
      fill: 0,
      excluded: { other: 0, notJeju: 0, notAllowed: 0, sameAsSite: 0, stale: 0, weak: 0, blocked: 0, noPetEvidence: 0 },
      verify: { checked: 0, noEvidence: 0, notAllowed: 0, failed: 0 },
      propose: { places: 0, done: 0, failed: 0 },
      meters: { extract: ZERO_METER },
    };
    expect(analyzeLine(zero)).toBe(FIXTURE.analyzeZero);
  });

  it('apply — published 보강 · pending 되돌림 · draft 수를 못 셌을 때(?)', () => {
    expect(formatApplySummary({ applied: 7, patched: 5, patchedPublished: 4, inserted: 2, failed: 1, revertedToPending: 3, draftWaiting: 6 })).toBe(FIXTURE.applyFull);
    expect(formatApplySummary({ applied: 0, patched: 0, patchedPublished: 0, inserted: 0, failed: 0, revertedToPending: 0, draftWaiting: 0 })).toBe(FIXTURE.applyZero);
    expect(
      formatApplySummary({ applied: 1, patched: 1, patchedPublished: 0, inserted: 0, failed: 0, revertedToPending: 0, draftWaiting: null }, { dryRun: true }),
    ).toBe(FIXTURE.applyUnknownDraft);
  });

  it('approve · reject', () => {
    expect(formatReviewSummary('approve', { requested: 3, done: 3, failed: 0 })).toBe(FIXTURE.approve);
    expect(formatReviewSummary('reject', { requested: 2, done: 1, failed: 1 })).toBe(FIXTURE.reject);
  });

  it('옛 실행의 stats(나중에 생긴 칸이 없다)도 NaN 없이 한 줄이 된다', () => {
    const old = { analyzed: 3, skipped: 0, candidates: 1, auto: 1, ask: 0, new: 0, excluded: { other: 1, notJeju: 0, notAllowed: 0 } };
    const line = analyzeLine(old);
    expect(line).not.toContain('NaN');
    expect(line).toContain('제외 1(other 1 · 제주밖 0 · 동반불가 0)');
  });
});
