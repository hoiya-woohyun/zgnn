'use client';

import { ChevronDown } from '@untitledui/icons';
import { useEffect } from 'react';
import { flattenStats, laterSuccessAt, runAlertLabel, runDurationLabel, runSummaryLine, type TOpsOverview, type TPipelineRun, type TRunScript } from '../lib/adminOps';
import { nextStepText } from '../lib/adminNextStep';
import { runState } from '../lib/adminOpsHealth';
import { agoLabel } from '../lib/adminRebuild';
import { runOutcome, type TRunOutcomeKind } from '../lib/runOutcome';
import { cx } from '../utils/cx';
import { AdminFilterChip } from './adminFilterChip';
import { useAdminInfiniteScroll } from './adminInfiniteScroll';
import { ADMIN_PANEL_DIVIDER, ADMIN_ROW, ADMIN_ROW_CELLS, ADMIN_ROW_OPEN, AdminTable } from './adminTable';

/**
 * 시각 · 스크립트 · 상태 · 소요 · 요약 · 알림. 이 표 하나만 쓰는 트랙이라 여기 둔다(`adminTable.tsx` 의 둘은 두 표가 나눠 쓴다).
 * 요약 열이 남는 폭을 다 받는다 — 콘솔 한 줄을 그대로 싣는 칸이라 가장 길다.
 */
const ADMIN_OPS_RUN_TRACKS = 'md:grid-cols-[6.5rem_5.5rem_7rem_6.5rem_minmax(0,1fr)_5.5rem]';

/** 칩 — 스크립트 묶음. approve·reject 는 옛 `data:review`(ADR-024 로 지웠다)라 칩이 없다 — 옛 행은 `전체` 에서만 보인다. */
export const ADMIN_OPS_SCRIPT_CHIPS: readonly {
  label: string;
  scripts: readonly TRunScript[] | null;
}[] = [
  { label: '전체', scripts: null },
  { label: '수집', scripts: ['collect'] },
  { label: '분석', scripts: ['analyze'] },
  { label: '반영', scripts: ['apply'] },
];

export const sameScripts = (a: readonly TRunScript[] | null, b: readonly TRunScript[] | null): boolean => (a ?? []).join(',') === (b ?? []).join(',');

/**
 * 상태점 — ① 다섯 칸과 같은 토큰. 글자는 `runOutcome` 의 라벨(사람이 멈춤 · 한도로 멈춤 · 중간에 끊김 …)이다 — 저장된 status 넷으로는
 * Ctrl+C 와 크래시가 같은 "실패" 였다. 사람이 멈춘 것과 끝 무렵 기록 없이 멈춘 것은 회색이다(다음 실행이 남은 일을 잇는다).
 */
const OUTCOME_DOT: Record<TRunOutcomeKind, string> = {
  running: 'bg-success-solid',
  ok: 'bg-success-solid',
  unclosed: 'bg-quaternary',
  partial: 'bg-warning-solid',
  limit: 'bg-warning-solid',
  stopped: 'bg-quaternary',
  failed: 'bg-error-solid',
  lost: 'bg-error-solid',
};

const kst = (iso: string) => new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

export const runRowId = (id: string) => `run-${id}`;

function AdminOpsPageRunRow({
  run,
  nowMs,
  expanded,
  onToggle,
  pinned,
  lastOk,
}: {
  run: TPipelineRun;
  lastOk: TOpsOverview['runsLastOk'];
  nowMs: number;
  expanded: boolean;
  onToggle: () => void;
  pinned: boolean;
}) {
  const state = runState(run, nowMs);
  const outcome = runOutcome(run, nowMs);
  const summary = runSummaryLine(run);
  const alert = runAlertLabel(run.alert);
  // 실패·중단 줄에는 그 뒤 같은 단계가 다시 성공했는지 한 마디 — 안 그러면 며칠 전 실패가 아직 안 고쳐진 것처럼 읽힌다.
  const recovered = laterSuccessAt(run, lastOk);
  return (
    <li id={runRowId(run.id)} className={cx(ADMIN_ROW, expanded ? ADMIN_ROW_OPEN : 'hover:bg-primary_hover')}>
      <button type="button" onClick={onToggle} aria-expanded={expanded} className={cx('w-full px-4 py-2 text-left', ADMIN_ROW_CELLS)}>
        <span className="flex items-center gap-1 text-xs text-secondary tabular-nums" title={kst(run.started_at)}>
          <ChevronDown aria-hidden="true" className={cx('size-3.5 shrink-0 text-fg-quaternary transition-transform', expanded && 'rotate-180')} />
          {agoLabel(run.started_at, nowMs)}
          {pinned ? <span className="text-brand-secondary">· 링크</span> : null}
        </span>
        {/* 좁은 화면에선 스크립트·상태가 한 줄에 같이 선다(features 「모바일에서」 — 열 셋으로 접는다). */}
        <span className="mt-1 inline-flex items-start md:mt-0">
          <span className="rounded bg-secondary px-1.5 text-xs font-semibold text-tertiary">{run.script}</span>
        </span>
        <span className="ml-2 inline-flex items-center gap-1.5 text-xs text-secondary md:ml-0">
          <span aria-hidden="true" className={cx('size-2 shrink-0 rounded-full', OUTCOME_DOT[outcome.kind])} />
          {outcome.label}
        </span>
        <span className="hidden text-xs whitespace-nowrap text-tertiary tabular-nums md:block">{runDurationLabel(run, nowMs)}</span>
        <span className={cx('mt-1 block text-xs md:mt-0', summary ? 'text-secondary' : outcome.tone === 'fail' ? 'text-error-primary' : 'text-tertiary')}>
          {/* 요약이 없는 줄(죽었거나 멈춘 실행)은 어디까지 왔고 왜 끝났는지 — 분류 문구("중단(SIGINT)")를 그대로 내지 않는다 */}
          {summary ?? (state === 'running' ? '도는 중이에요' : outcome.text)}
          {recovered ? <span className="ml-1 font-semibold text-success-primary">· 이후 성공({agoLabel(recovered, nowMs)})</span> : null}
        </span>
        <span className={cx('hidden text-xs md:block', alert === 'Slack 실패' ? 'text-error-primary' : 'text-tertiary')}>{alert}</span>
      </button>

      {state === 'stalled' ? (
        outcome.kind === 'unclosed' ? (
          <p className="px-4 pb-2 text-xs text-tertiary">
            {outcome.text}({agoLabel(outcome.at, nowMs)}) — 진행은 끝까지 찼으니 다시 돌릴 일은 없어요. 다음 실행이 서면 이 줄을 닫아요.
          </p>
        ) : (
          <p className="px-4 pb-2 text-xs text-error-primary">
            {outcome.text} — 생존 신호(심장)가 {agoLabel(outcome.at, nowMs)} 끊겼어요. 프로그램이 죽었으면 그냥 다시 돌리면 돼요(죽은 실행의 잠금은 새 실행이
            이어받고, 이 줄은 30분 뒤 다음 실행이 「중간에 끊김」 으로 닫아요). 살아 있는데 멎어 있으면 그 프로그램을 끊고 다시 돌려 주세요.
          </p>
        )
      ) : null}

      {expanded ? (
        <div className={cx(ADMIN_PANEL_DIVIDER, 'px-4 py-3 text-xs')}>
          <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-0.5 md:grid-cols-[max-content_minmax(0,1fr)_max-content_minmax(0,1fr)]">
            {[
              ['시작', kst(run.started_at)],
              ['끝', run.ended_at ? kst(run.ended_at) : '—'],
              ['소요', runDurationLabel(run, nowMs)],
              ['심장', run.heartbeat_at ? kst(run.heartbeat_at) : '—'],
              ['실행 옵션', run.args === null || run.args === undefined ? '—' : JSON.stringify(run.args)],
              ['오류', run.error ?? '—'],
              ...flattenStats(run.stats).map(([key, value]) => [`집계 ${key}`, value]),
              ...flattenStats(run.alert).map(([key, value]) => [`알림 ${key}`, value]),
            ].map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="text-quaternary">{key}</dt>
                <dd className="min-w-0 break-words text-secondary tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-quaternary">기록은 화면에서 고치지 않아요 — {nextStepText('rerun')}.</p>
        </div>
      ) : null}
    </li>
  );
}

/**
 * ③ 실행 기록 — `pipeline_runs` 를 최신순으로(features/ops-dashboard.md ③). `adminTable` + `adminInfiniteScroll` 재사용.
 *
 * 줄을 누르면 stats 전부·args·error·알림이 키-값으로 펼쳐진다. Slack 링크의 `?run=<id>` 로 들어오면 그 행이 펼친 채 맨 위에
 * 서고(`pinned` — 첫 장에 없을 수 있다) 그 자리로 스크롤된다. **손으로 상태를 바꾸는 버튼은 없다**(중단된 행 닫기·재실행) —
 * 기록을 화면이 고치기 시작하면 정본이 둘이 된다. 펼친 행 아래의 "다시 돌릴 일"·빈 기록 문장은 빌드별이다(`nextStepText`).
 */
export function AdminOpsPageRunsTable({
  runs,
  pinned,
  nowMs,
  lastOk,
  scripts,
  failedOnly,
  onFilter,
  expandedId,
  onToggle,
  hasMore,
  onMore,
  error,
}: {
  runs: readonly TPipelineRun[];
  /** `?run=` 로 연 행. 목록에 이미 있으면 거기서 펼치고, 없으면 맨 위에 하나 더 세운다 */
  pinned: TPipelineRun | null;
  nowMs: number;
  /** 단계별 마지막 성공 — 실패 줄에 "이후 성공" 을 말하려고 */
  lastOk: TOpsOverview['runsLastOk'];
  scripts: readonly TRunScript[] | null;
  failedOnly: boolean;
  onFilter: (next: { scripts: readonly TRunScript[] | null; failedOnly: boolean }) => void;
  expandedId: string | null;
  onToggle: (id: string) => void;
  hasMore: boolean;
  onMore: () => void;
  error: string | null;
}) {
  const setSentinel = useAdminInfiniteScroll(hasMore, runs.length, onMore);
  const extra = pinned && !runs.some((run) => run.id === pinned.id) ? [pinned] : [];
  const shown = [...extra, ...runs];
  const pinnedId = pinned?.id ?? null;

  // 링크로 열었으면 그 행으로 한 번 내려간다. 펼친 뒤라야 높이가 맞으므로 그린 다음 프레임에.
  useEffect(() => {
    if (!pinnedId) return;
    const frame = requestAnimationFrame(() => document.getElementById(runRowId(pinnedId))?.scrollIntoView({ block: 'center' }));
    return () => cancelAnimationFrame(frame);
  }, [pinnedId]);

  return (
    <section className="mt-8" aria-label="실행 기록">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 md:px-6">
        <h2 className="text-sm font-semibold text-primary">실행 기록</h2>
        <div className="flex flex-wrap gap-1" role="group" aria-label="스크립트">
          {ADMIN_OPS_SCRIPT_CHIPS.map((entry) => (
            <AdminFilterChip
              key={entry.label}
              size="xs"
              pressed={sameScripts(entry.scripts, scripts)}
              onClick={() => onFilter({ scripts: entry.scripts, failedOnly })}
            >
              {entry.label}
            </AdminFilterChip>
          ))}
        </div>
        <AdminFilterChip size="xs" pressed={failedOnly} onClick={() => onFilter({ scripts, failedOnly: !failedOnly })}>
          실패만
        </AdminFilterChip>
      </div>

      <div className="mt-3">
        {shown.length === 0 && !error ? (
          <p className="px-4 text-xs text-tertiary md:px-6">
            {scripts || failedOnly ? '걸러 본 기록이 없어요.' : `아직 기록이 없어요 — ${nextStepText('noRuns')}.`}
          </p>
        ) : (
          <AdminTable grid={ADMIN_OPS_RUN_TRACKS} columns={['시각', '스크립트', '상태', '소요', '요약', '알림']}>
            {shown.map((run) => (
              <AdminOpsPageRunRow
                key={run.id}
                run={run}
                lastOk={lastOk}
                nowMs={nowMs}
                pinned={run.id === pinnedId}
                expanded={expandedId === run.id}
                onToggle={() => onToggle(run.id)}
              />
            ))}
          </AdminTable>
        )}
        {error ? <p className="px-4 pt-2 text-xs text-error-primary md:px-6">{error}</p> : null}
        {hasMore ? (
          <div ref={setSentinel} className="px-4 pt-3 text-xs text-tertiary md:px-6">
            더 불러오는 중…
          </div>
        ) : null}
      </div>
    </section>
  );
}
