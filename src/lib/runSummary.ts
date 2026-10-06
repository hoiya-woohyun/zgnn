/*
 * 파이프라인 스크립트의 **콘솔 요약 줄** — 터미널(`pnpm data:collect`·`data:analyze`·`data:apply`·`data:review approve|reject`)과
 * 운영 현황 화면(`/admin/ops` 의 실행 기록 요약 열)이 같은 문장을 쓰는 한 자리다(docs/todo/15 T2.1, ADR-023).
 *
 * 새로 만든 문장이 아니다 — 원래 `scripts/collect/naverBlog.mjs`·`scripts/analyze/analyzeCandidates.mjs` 의 `formatSummary` 와
 * `apply-approved.mjs`·`review-candidates.mjs` 의 인라인 템플릿이던 것을 글자 하나 바꾸지 않고 옮겼다(runSummary.test.ts 의 fixture).
 * 스크립트는 이 함수로 찍고, 같은 입력 객체를 `pipeline_runs.stats` 에 넣는다 — 그래서 **함수가 읽는 수는 전부 stats 에 있다.**
 * 한 함수를 두 곳이 쓰게 한 이유는 하나다: `stats` 키가 바뀌는데 화면 문장이 안 바뀌어 틀린 수를 말하는 일을 테스트가 막게.
 *
 * ⚠️ 스크립트가 `node`(--experimental-strip-types)로 이 파일을 **직접** 읽는다(`review-candidates.mjs` 가 `petPolicy.ts` 를 읽는 선례).
 *   그래서: import 를 두지 않는다(`@/` 별칭은 vitest·Next 전용이고, 확장자 없는 상대 경로는 node 가 못 찾는다) ·
 *   enum·namespace·parameter property 같은 **지울 수 없는** TS 문법을 쓰지 않는다(타입 표기만 — 지우면 그대로 JS 다).
 * 옛 실행의 stats 에는 나중에 생긴 칸이 없다 — 읽을 때 `?? 0` 으로 받아 요약 한 줄이 NaN 으로 깨지지 않게 한다.
 */

/** `createUsageMeter`(scripts/analyze/extractPlaces.mjs)의 합계. 이름은 그 계량기의 것 그대로다. */
export type TUsageTotals = { calls: number; input: number; output: number; cacheRead: number; cacheWrite: number };

/** 12.4초 · 2분 3초. 초를 먼저 반올림해 "1분 60초" 가 나오지 않게 한다. */
export function formatElapsed(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${(ms / 1000).toFixed(1)}초`;
  return `${Math.floor(seconds / 60)}분 ${seconds % 60}초`;
}

/**
 * Claude 계량기 한 줄. `label` 은 패스 이름(추출 · 교차점검 · 제안) — 계량기를 패스마다 따로 드는 이유는
 * 구독 5시간 한도를 무엇이 태웠는지 가리려는 것이다(extractPlaces.mjs 의 createUsageMeter 주석).
 */
export function formatUsageSummary(label: string, totals: TUsageTotals): string {
  return `Claude ${label} ${totals.calls}회 · 입력 ${totals.input} · 출력 ${totals.output} · 캐시 읽기 ${totals.cacheRead} · 캐시 쓰기 ${totals.cacheWrite} 토큰`;
}

/** `collect` 의 stats — `pipeline_runs.stats` 에 그대로 들어간다(docs/todo/15 T2.1 표). */
export type TCollectStats = {
  /** 이번 실행이 받은 글(키워드 사이 중복 제거 뒤) */
  fetched: number;
  /** 그중 DB 에 없던 글 */
  new: number;
  existing: number;
  excludedOld: number;
  excludedOther: number;
  durationMs: number;
  naverCalls?: number;
  truncatedKeywords?: number;
};

/** 수집의 마지막 한 줄. 터미널에서 이 줄만 보면 된다. */
export function formatCollectSummary(stats: TCollectStats): string {
  return (
    `수집 ${stats.fetched}건 (신규 ${stats.new} · 기존 ${stats.existing} · ` +
    `1년 밖 제외 ${stats.excludedOld} · 비네이버/비제주 제외 ${stats.excludedOther}) · ${formatElapsed(stats.durationMs)}`
  );
}

/** `analyze` 의 stats — 스크립트가 세는 객체 그대로다(키 이름이 곧 이 함수가 읽는 이름). */
export type TAnalyzeStats = {
  analyzed: number;
  skipped: number;
  dropped?: number;
  candidates: number;
  auto: number;
  ask: number;
  new: number;
  dup?: number;
  edited?: number;
  update?: number;
  fill?: number;
  excluded?: {
    other: number;
    notJeju: number;
    notAllowed: number;
    alreadyHave?: number;
    sameAsSite?: number;
    stale?: number;
    weak?: number;
    blocked?: number;
    noPetEvidence?: number;
  };
  verify?: { checked: number; noEvidence: number; notAllowed: number; failed?: number };
  propose?: { places: number; done: number; failed?: number };
  /** 패스별 Claude 계량기 합계 — 요약 줄의 `Claude 추출 …` 이 extract 에서 나온다 */
  meters?: { extract?: TUsageTotals; verify?: TUsageTotals; propose?: TUsageTotals };
  naverCalls?: number;
};

/** 분석의 마지막 한 줄. `meterSummary` 는 추출 계량기 한 줄(`formatUsageSummary('추출', stats.meters.extract)`). */
export function formatAnalyzeSummary(stats: TAnalyzeStats, meterSummary: string, { dryRun }: { dryRun?: boolean } = {}): string {
  const prefix = dryRun ? '[dry-run] ' : '';
  const dropped = stats.dropped ? ` · 분석불가 ${stats.dropped}` : '';
  const ex = stats.excluded;
  /*
   * 짝짓기 뒤에 걸리는 셋(같은 말 · 옛 글 · 근거 약함 — `kindOf`)은 추출 직후에 걸리는 셋(exclusionReason)과 **단계가 다르다**.
   * 그래도 한 괄호에 넣는다: 운영자가 읽는 뜻은 "후보로 안 들어간 수" 하나이고, 자리를 나누면 그 합을 사람이 더해야 한다.
   * `alreadyHave` 는 차이 게이트 전의 이름(같은 말 + 다른 말 전부)이라 옛 stats 에만 있다.
   * 옛 실행의 stats 에는 칸이 없으므로 `?? 0` — 없다고 NaN 이 되면 요약 한 줄이 통째로 못 읽히게 된다.
   */
  const already = ex?.alreadyHave ?? 0;
  const same = ex?.sameAsSite ?? 0;
  const stale = ex?.stale ?? 0;
  const weak = ex?.weak ?? 0;
  const blocked = ex?.blocked ?? 0;
  const noEvidence = ex?.noPetEvidence ?? 0;
  const tail = [
    already && `이미 있음 ${already}`,
    same && `같은 말 ${same}`,
    stale && `옛 글 ${stale}`,
    weak && `근거 약함 ${weak}`,
    blocked && `차단 ${blocked}`,
    noEvidence && `신규·동반 근거 없음 ${noEvidence}`,
  ]
    .filter(Boolean)
    .map((part) => ` · ${part}`)
    .join('');
  const excluded = ex
    ? ` · 제외 ${ex.other + ex.notJeju + ex.notAllowed + already + same + stale + weak + blocked + noEvidence}(other ${ex.other} · 제주밖 ${ex.notJeju} · 동반불가 ${ex.notAllowed}${tail})`
    : '';
  // 짝이 게시된 장소인 후보의 종류 — 이 두 수가 차이 게이트를 지나 올라온 것이다. 옛 stats 엔 칸이 없다.
  const kinds = stats.update || stats.fill ? ` · 갱신 ${stats.update ?? 0} · 보강 ${stats.fill ?? 0}` : '';
  const dup = stats.dup ? ` · 중복표시 ${stats.dup}` : '';
  // 사람이 고친 후보가 있는 (글, 가게) 는 새로 만들지 않았다 — 제외 합계와 단계가 달라(추출 뒤·짝짓기 전) 따로 적는다. 옛 stats 엔 칸이 없다.
  const edited = stats.edited ? ` · 고침 유지 ${stats.edited}` : '';
  /*
   * 교차점검은 **점검한 수와 근거를 못 찾은 수를 같이** 적는다. 하나만 적으면 0 을 두 가지로 읽을 수 있다 —
   * "전부 근거가 있었다" 와 "패스가 안 돌았다" 는 운영자가 해야 할 일이 정반대다(⚠️ 판정 불가에 속지 말 것과 같은 자리).
   */
  const v = stats.verify;
  const verify = v ? ` · 교차점검 ${v.checked}건(근거 없음 ${v.noEvidence} · 동반 불가 정황 ${v.notAllowed}${v.failed ? ` · 실패 ${v.failed}` : ''})` : '';
  // 제안(셋째 패스) — 갱신이 생긴 장소 수와 제안을 실은 수를 같이(교차점검과 같은 이유: 0 이 "안 돌았다" 인지 "실패했다" 인지 갈라야 한다).
  const p = stats.propose;
  const propose = p && p.places ? ` · 제안 ${p.done}/${p.places}곳${p.failed ? `(실패 ${p.failed})` : ''}` : '';
  return `${prefix}분석 ${stats.analyzed}건 (후보 ${stats.candidates} · 일치 ${stats.auto} · 확인요청 ${stats.ask} · 신규 ${stats.new}${kinds}${dup} · 건너뜀 ${stats.skipped}${dropped}${excluded}${edited}${verify}${propose}) · ${meterSummary}`;
}

/** `apply` 의 stats(docs/todo/15 T2.1 표). */
export type TApplyStats = {
  /** 보강 + 신규 */
  applied: number;
  /** 기존 장소의 빈 칸을 채운 수(보강) */
  patched: number;
  /** 그중 published 장소 — 다음 pull 에서 사람 재확인 없이 화면에 나간다(설계 검토 RP-3) */
  patchedPublished: number;
  /** 신규 draft */
  inserted: number;
  failed: number;
  /** 영구 실패 → pending 으로 되돌린 수 */
  revertedToPending: number;
  /** published 로 올라가길 기다리는 draft 수. 세지 못했으면 null(줄에는 `?`) */
  draftWaiting: number | null;
};

/** 반영의 마지막 한 줄. */
export function formatApplySummary(stats: TApplyStats, { dryRun }: { dryRun?: boolean } = {}): string {
  const prefix = dryRun ? '[dry-run] ' : '';
  const draft = stats.draftWaiting;
  return (
    `${prefix}반영 ${stats.applied}건 (보강 ${stats.patched}${stats.patchedPublished ? ` — published ${stats.patchedPublished}` : ''} · 신규 ${stats.inserted} · 실패 ${stats.failed}${stats.revertedToPending ? ` · pending 되돌림 ${stats.revertedToPending}` : ''})` +
    ` · published 대기 draft ${draft ?? '?'}곳${(draft ?? 0) > 0 ? ' — Studio 에서 status 를 올려야 화면에 뜬다(pnpm data:review status)' : ''}`
  );
}

/** `data:review approve|reject` 의 stats. `requested` 는 대상으로 고른 후보 수다(성공 수가 아니다 — 줄이 원래 그 수를 말했다). */
export type TReviewStats = { requested: number; done: number; failed: number };

/** 승인·반려의 마지막 한 줄. */
export function formatReviewSummary(script: 'approve' | 'reject', stats: TReviewStats): string {
  const status = script === 'approve' ? 'approved' : 'rejected';
  return `${status} ${stats.requested}건${status === 'approved' ? ' — 반영은 pnpm data:apply' : ''}`;
}
