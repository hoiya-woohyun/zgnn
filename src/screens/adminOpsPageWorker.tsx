'use client';

import type { TPipelineRun } from '../lib/adminOps';
import { type THealth, type TWorkerHealth, WORKER_PHASE_LABEL } from '../lib/adminOpsHealth';
import { agoLabel } from '../lib/adminRebuild';
import { cx } from '../utils/cx';

/** 배지 점 — 다섯 칸의 상태점과 같은 토큰(`adminOpsPageStageStrip`). */
const DOT: Record<THealth, string> = {
  ok: 'bg-success-solid',
  warn: 'bg-warning-solid',
  fail: 'bg-error-solid',
  none: 'bg-quaternary',
};

const HINT: Record<THealth, string> = {
  ok: 'text-tertiary',
  none: 'text-tertiary',
  warn: 'text-warning-primary',
  fail: 'text-error-primary',
};

/**
 * 로컬 워커 칸(todo/17 T5.2) — 다섯 칸 위 한 줄. 배지 · 지금 단계 · 마지막 심장 · 대기 중인 요청 수, 그리고 도는 중이면
 * 진행 막대(`progress.done/total`)와 지금 읽는 글(`current`) 한 줄.
 *
 * 진행은 워커의 `run_id` 로 찾은 실행 행에서 읽는다(부르는 쪽이 `runsLatest` 에서 찾아 준다 — 실행 기록 목록은 걸러져 있어 그 행이 없을 수 있다).
 * 막대는 흐름(②)의 가는 막대와 같은 모양이다 — 한 기준선에서 자라고 끝만 둥글다.
 */
export function AdminOpsPageWorker({
  health,
  run,
  requestsQueued,
  nowMs,
}: {
  health: TWorkerHealth;
  /** 워커가 지금 붙든 실행 행. 없거나 다른 행이면 null */
  run: TPipelineRun | null;
  requestsQueued: number | undefined;
  nowMs: number;
}) {
  const busy = health.state === 'alive' && health.phase !== undefined && health.phase !== 'idle';
  const progress = busy && run?.status === 'running' ? run.progress : null;
  const done = typeof progress?.done === 'number' ? progress.done : null;
  const total = typeof progress?.total === 'number' && progress.total > 0 ? progress.total : null;
  const seen = health.ageSec === undefined ? null : agoLabel(new Date(nowMs - health.ageSec * 1000).toISOString(), nowMs);

  return (
    <section className="mt-4 px-4 md:px-6" aria-label="로컬 워커">
      <div className="rounded-lg border border-secondary bg-primary p-3">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-secondary">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-primary">
            <span aria-hidden="true" className={cx('size-2 shrink-0 rounded-full', DOT[health.tone])} />
            {health.label}
          </span>
          {health.phase && health.state !== 'stale' ? <span>{WORKER_PHASE_LABEL[health.phase]}</span> : null}
          {seen ? <span className="text-tertiary tabular-nums">심장 {seen}</span> : null}
          {health.host ? <span className="truncate text-tertiary">{health.host}{health.others > 0 ? ` 외 ${health.others}대` : ''}</span> : null}
          {requestsQueued ? <span className="font-semibold text-warning-primary">요청 {requestsQueued}건 대기</span> : null}
        </p>
        {health.hint ? <p className={cx('mt-1 text-xs font-semibold', HINT[health.tone])}>{health.hint}</p> : null}
        {busy && (total !== null || progress?.current) ? (
          <div className="mt-2">
            {total !== null ? (
              <div className="flex items-center gap-2">
                <span className="block h-1.5 min-w-0 flex-1 rounded-r-[4px] bg-tertiary" aria-hidden="true">
                  <span
                    className="block h-1.5 rounded-r-[4px] bg-brand-solid opacity-40"
                    style={{ width: `${Math.min(100, Math.round(((done ?? 0) / total) * 100))}%` }}
                  />
                </span>
                <span className="text-xs font-semibold text-primary tabular-nums">
                  {(done ?? 0).toLocaleString('ko-KR')} / {total.toLocaleString('ko-KR')}
                </span>
              </div>
            ) : null}
            {progress?.current ? <p className="mt-1 truncate text-xs text-tertiary">{progress.current}</p> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
