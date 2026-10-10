'use client';

import Link from 'next/link';
import type { TLiveStatus } from '../lib/adminLiveStatus';
import type { THealth } from '../lib/adminOpsHealth';
import { cx } from '../utils/cx';

/** 상태점 — 운영 현황의 워커 칸(`adminOpsPageWorker`)과 같은 토큰. */
const DOT: Record<THealth, string> = {
  ok: 'bg-success-solid',
  warn: 'bg-warning-solid',
  fail: 'bg-error-solid',
  none: 'bg-quaternary',
};

/**
 * `/admin` 머리글의 **실시간 한 줄**(판정은 `adminLiveStatus.ts`). 전에는 배지 둘 · 경고 띠 둘이 열 때 한 번 읽혀 따로 섰다 — 이 줄 하나가 그 자리를 갖는다.
 *
 * 오른쪽 끝의 `실시간` 은 Realtime 구독이 붙었는지다. 끊겼으면 흐린 `새로 고쳐야 보여요` — 이 줄이 멈춘 그림인지 사람이 알 수 있어야 한다.
 * 분석이 끝나 검수 대기에 새 후보가 생겼을 수 있으면 `목록 새로 읽기` 를 띄운다 — 저절로 갈아 끼우지 않는다(보던 줄·고른 줄이 흔들린다).
 */
export function AdminPageLiveStatus({
  status,
  live,
  wakeLine,
  onReload,
}: {
  status: TLiveStatus;
  live: boolean;
  /** 서버 워커를 못 깨웠다는 한 줄(`wakeNotice`) — 요청은 남았다 */
  wakeLine: string | null;
  /** 있으면 `목록 새로 읽기` 를 띄운다 */
  onReload: (() => void) | null;
}) {
  const { progress } = status;
  return (
    <div className="mt-2 px-4 md:px-6" aria-live="polite">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-tertiary">
        <span aria-hidden="true" className={cx('size-2 shrink-0 rounded-full', DOT[status.tone], status.tone === 'ok' && 'animate-pulse')} />
        <span className={cx('font-semibold', status.tone === 'warn' || status.tone === 'fail' ? 'text-warning-primary' : 'text-primary')}>
          {status.headline}
        </span>
        {progress ? (
          <span className="flex items-center gap-1.5">
            <span className="block h-1.5 w-24 rounded-r-[4px] bg-tertiary" aria-hidden="true">
              <span className="block h-1.5 rounded-r-[4px] bg-brand-solid opacity-40" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
            </span>
            <span className="font-semibold text-primary tabular-nums">
              {progress.done.toLocaleString('ko-KR')} / {progress.total.toLocaleString('ko-KR')}
            </span>
          </span>
        ) : null}
        {status.detail ? <span>· {status.detail}</span> : null}
        {onReload ? (
          <button type="button" className="font-semibold text-brand-secondary underline underline-offset-2" onClick={onReload}>
            목록 새로 읽기
          </button>
        ) : null}
        <span className="ml-auto flex items-center gap-2 whitespace-nowrap">
          <span className={live ? 'text-tertiary' : 'text-quaternary'}>{live ? '실시간' : '새로 고쳐야 보여요'}</span>
          <Link href="/admin/ops/" className="font-semibold text-brand-secondary hover:text-brand-secondary_hover">
            운영 현황 →
          </Link>
        </span>
      </p>
      {status.current ? <p className="mt-0.5 truncate pl-4 text-xs text-quaternary">{status.current}</p> : null}
      {wakeLine ? <p className="mt-0.5 pl-4 text-xs font-semibold text-warning-primary">{wakeLine}</p> : null}
    </div>
  );
}
