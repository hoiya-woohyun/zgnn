'use client';

import { ChevronDown } from '@untitledui/icons';
import { useEffect } from 'react';
import {
  flattenStats,
  runAlertLabel,
  runDurationLabel,
  runSummaryLine,
  type TPipelineRun,
  type TRunScript,
} from '../lib/adminOps';
import { runState, type TRunState } from '../lib/adminOpsHealth';
import { agoLabel } from '../lib/adminRebuild';
import { cx } from '../utils/cx';
import { useAdminInfiniteScroll } from './adminInfiniteScroll';
import { ADMIN_PANEL_DIVIDER, ADMIN_ROW, ADMIN_ROW_CELLS, ADMIN_ROW_OPEN, AdminTable } from './adminTable';

/**
 * 시각 · 스크립트 · 상태 · 소요 · 요약 · 알림. 이 표 하나만 쓰는 트랙이라 여기 둔다(`adminTable.tsx` 의 둘은 두 표가 나눠 쓴다).
 * 요약 열이 남는 폭을 다 받는다 — 콘솔 한 줄을 그대로 싣는 칸이라 가장 길다.
 */
const ADMIN_OPS_RUN_TRACKS = 'md:grid-cols-[6.5rem_5.5rem_7rem_6.5rem_minmax(0,1fr)_5.5rem]';

/** 칩 — 스크립트 묶음. `승인` 은 approve·reject 둘이다(둘 다 옛 `data:review` — ADR-024 로 지웠다). */
export const ADMIN_OPS_SCRIPT_CHIPS: readonly { label: string; scripts: readonly TRunScript[] | null }[] = [
  { label: '전체', scripts: null },
  { label: '수집', scripts: ['collect'] },
  { label: '분석', scripts: ['analyze'] },
  { label: '반영', scripts: ['apply'] },
  { label: '승인', scripts: ['approve', 'reject'] },
];

export const sameScripts = (a: readonly TRunScript[] | null, b: readonly TRunScript[] | null): boolean =>
  (a ?? []).join(',') === (b ?? []).join(',');

const STATE_LABEL: Record<TRunState, string> = {
  ok: '끝남',
  partial: '일부 실패',
  failed: '실패',
  running: '돌고 있음',
  stalled: '중단된 듯',
};

/** 상태점 — ① 다섯 칸과 같은 토큰. 돌고 있음은 정상(초록)이다. */
const STATE_DOT: Record<TRunState, string> = {
  ok: 'bg-success-solid',
  running: 'bg-success-solid',
  partial: 'bg-warning-solid',
  failed: 'bg-error-solid',
  stalled: 'bg-error-solid',
};

const kst = (iso: string) => new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

export const runRowId = (id: string) => `run-${id}`;

function AdminOpsPageRunRow({
  run,
  nowMs,
  expanded,
  onToggle,
  pinned,
}: {
  run: TPipelineRun;
  nowMs: number;
  expanded: boolean;
  onToggle: () => void;
  pinned: boolean;
}) {
  const state = runState(run, nowMs);
  const summary = runSummaryLine(run);
  const alert = runAlertLabel(run.alert);
  return (
    <li id={runRowId(run.id)} className={cx(ADMIN_ROW, expanded ? ADMIN_ROW_OPEN : 'hover:bg-primary_hover')}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={cx('w-full px-4 py-2 text-left', ADMIN_ROW_CELLS)}
      >
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
          <span aria-hidden="true" className={cx('size-2 shrink-0 rounded-full', STATE_DOT[state])} />
          {STATE_LABEL[state]}
        </span>
        <span className="hidden text-xs whitespace-nowrap text-tertiary tabular-nums md:block">{runDurationLabel(run, nowMs)}</span>
        <span className={cx('mt-1 block text-xs md:mt-0', summary ? 'text-secondary' : run.error ? 'text-error-primary' : 'text-quaternary')}>
          {summary ?? run.error ?? (state === 'running' ? '도는 중이에요' : '요약할 수가 없어요')}
        </span>
        <span className={cx('hidden text-xs md:block', alert === 'Slack 실패' ? 'text-error-primary' : 'text-tertiary')}>{alert}</span>
      </button>

      {state === 'stalled' ? (
        <p className="px-4 pb-2 text-xs text-error-primary">
          심장이 {agoLabel(run.heartbeat_at ?? run.started_at, nowMs)} 멎었어요. 프로세스가 죽었으면 그냥 다시 돌리면 돼요(runLock 이 죽은 pid 의 잠금을 이어받아요). 살아 있는데 멎어 있으면 그 프로세스를 끊고 다시 돌려 주세요.
        </p>
      ) : null}

      {expanded ? (
        <div className={cx(ADMIN_PANEL_DIVIDER, 'px-4 py-3 text-xs')}>
          <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-0.5 md:grid-cols-[max-content_minmax(0,1fr)_max-content_minmax(0,1fr)]">
            {[
              ['시작', kst(run.started_at)],
              ['끝', run.ended_at ? kst(run.ended_at) : '—'],
              ['소요', runDurationLabel(run, nowMs)],
              ['심장', run.heartbeat_at ? kst(run.heartbeat_at) : '—'],
              ['args', run.args === null || run.args === undefined ? '—' : JSON.stringify(run.args)],
              ['error', run.error ?? '—'],
              ...flattenStats(run.stats).map(([key, value]) => [`stats.${key}`, value]),
              ...flattenStats(run.alert).map(([key, value]) => [`alert.${key}`, value]),
            ].map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="text-quaternary">{key}</dt>
                <dd className="min-w-0 break-words text-secondary tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-quaternary">기록은 화면에서 고치지 않아요 — 다시 돌릴 일은 터미널에서 해요.</p>
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
 * 기록을 화면이 고치기 시작하면 정본이 둘이 된다. 중단된 듯 행 아래에는 터미널에서 할 일을 한 줄 적는다.
 */
export function AdminOpsPageRunsTable({
  runs,
  pinned,
  nowMs,
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

  const chip = (active: boolean) =>
    cx(
      'rounded-full border px-2.5 py-0.5 text-xs font-semibold',
      active ? 'border-brand bg-brand-primary text-brand-secondary' : 'border-secondary text-tertiary hover:text-secondary',
    );

  return (
    <section className="mt-8" aria-label="실행 기록">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 md:px-6">
        <h2 className="text-sm font-semibold text-primary">실행 기록</h2>
        <div className="flex flex-wrap gap-1" role="group" aria-label="스크립트">
          {ADMIN_OPS_SCRIPT_CHIPS.map((entry) => (
            <button
              key={entry.label}
              type="button"
              aria-pressed={sameScripts(entry.scripts, scripts)}
              onClick={() => onFilter({ scripts: entry.scripts, failedOnly })}
              className={chip(sameScripts(entry.scripts, scripts))}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <button type="button" aria-pressed={failedOnly} onClick={() => onFilter({ scripts, failedOnly: !failedOnly })} className={chip(failedOnly)}>
          실패만
        </button>
      </div>

      <div className="mt-3">
        {shown.length === 0 && !error ? (
          <p className="px-4 text-xs text-tertiary md:px-6">
            {scripts || failedOnly ? '걸러 본 기록이 없어요.' : '아직 기록이 없어요 — 다음 pnpm data collect 부터 쌓여요.'}
          </p>
        ) : (
          <AdminTable grid={ADMIN_OPS_RUN_TRACKS} columns={['시각', '스크립트', '상태', '소요', '요약', '알림']}>
            {shown.map((run) => (
              <AdminOpsPageRunRow
                key={run.id}
                run={run}
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
