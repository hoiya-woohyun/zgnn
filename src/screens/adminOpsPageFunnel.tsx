'use client';

import type { TOpsFunnel } from '../lib/adminOps';
import { cx } from '../utils/cx';

export type TAdminOpsFunnelDays = 7 | 30;

/** 줄 하나의 막대 — 가장 큰 줄을 100% 로 둔 비율. 0 은 막대 없이 수만(features ②). */
function AdminOpsPageFunnelBar({
  value,
  max,
  tone = 'flow',
  thin = false,
}: {
  value: number;
  max: number;
  tone?: 'flow' | 'pending';
  /** 한 칸에 두 막대를 겹칠 때(승인·제외) */
  thin?: boolean;
}) {
  if (value <= 0 || max <= 0) return null;
  return (
    <span
      aria-hidden="true"
      // 끝만 4px 둥글게, 기준선(왼쪽)은 각지게 — 막대가 한 기준선에서 자란다(dataviz 「marks」). 색은 한 가지, 보류만 노랑.
      className={cx('block rounded-r-[4px]', thin ? 'h-1' : 'h-2.5', tone === 'pending' ? 'bg-warning-solid' : 'bg-brand-solid opacity-40')}
      style={{ width: `${Math.max(1, Math.round((value / max) * 100))}%` }}
    />
  );
}

function AdminOpsPageFunnelCell({ label, value, max, tone }: { label: string; value: number; max: number; tone?: 'flow' | 'pending' }) {
  return (
    <div className="grid min-w-0 grid-cols-[4.5rem_3.5rem_minmax(0,1fr)] items-center gap-2">
      <span className={cx('truncate text-xs', tone === 'pending' ? 'font-semibold text-warning-primary' : 'text-secondary')}>{label}</span>
      <span className="text-right text-xs font-semibold text-primary tabular-nums">{value.toLocaleString('ko-KR')}</span>
      <AdminOpsPageFunnelBar value={value} max={max} tone={tone} />
    </div>
  );
}

/**
 * ② 흐름 — 기간(7일·30일) 안에서 **각 단계를 지난 건수**(features/ops-dashboard.md ②).
 *
 * 줄들은 서로의 부분집합이 **아니다**(이번 주 분석된 글이 지난주 수집된 글일 수 있다) — 그래서 위에서 아래로 줄어드는 깔때기로 읽히면
 * 거짓말이다. 비율은 **가장 큰 줄을 100%** 로 둔다. 승인·제외는 한 줄에 나란히. **지금 보류**만 기간 흐름이 아니라 지금 쌓인 것이라
 * 따로 떼고, 노랑(사람이 할 일)이며, 기간 토글의 영향을 받지 않는다(① 검수 칸의 대기 수와 같은 값).
 *
 * 차트 라이브러리를 들이지 않는다 — `div` 너비 하나다. 수는 막대 색이 아니라 글자 색으로(dataviz: 글자는 데이터 색을 입지 않는다).
 */
export function AdminOpsPageFunnel({
  funnel,
  pendingNow,
  days,
  onDays,
  loading,
}: {
  /** 고른 기간의 집계. 30일을 처음 고르면 받는 동안 null */
  funnel: TOpsFunnel | null;
  /** 기간 무관 — 7일 집계에서 읽은 지금 보류 수 */
  pendingNow: number;
  days: TAdminOpsFunnelDays;
  onDays: (days: TAdminOpsFunnelDays) => void;
  loading?: boolean;
}) {
  const rows = funnel
    ? [funnel.newPosts, funnel.analyzed, funnel.candidates, funnel.approved, funnel.rejected, funnel.applied, funnel.rebuilds, pendingNow]
    : [pendingNow];
  const max = Math.max(...rows);
  const n = (value: number | undefined) => value ?? 0;

  return (
    <section className="mt-6 px-4 md:px-6" aria-label="흐름">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-semibold text-primary">흐름</h2>
        <div className="flex gap-1" role="group" aria-label="기간">
          {([7, 30] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={days === value}
              onClick={() => onDays(value)}
              className={cx(
                'rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                days === value ? 'border-brand bg-brand-primary text-brand-secondary' : 'border-secondary text-tertiary hover:text-secondary',
              )}
            >
              {value}일
            </button>
          ))}
        </div>
        {loading ? <span className="text-xs text-quaternary">읽는 중…</span> : null}
      </div>

      <div className={cx('mt-3 max-w-3xl space-y-1.5', loading && 'opacity-50')}>
        <AdminOpsPageFunnelCell label="신규 글" value={n(funnel?.newPosts)} max={max} />
        <AdminOpsPageFunnelCell label="분석" value={n(funnel?.analyzed)} max={max} />
        <AdminOpsPageFunnelCell label="후보" value={n(funnel?.candidates)} max={max} />
        {/*
          * 승인·제외는 한 줄에 둘(features ②). 반쪽 칸 둘로 나누면 막대 칸이 절반 폭이 되어 **같은 수가 절반 길이**로 보인다 —
          * 그래서 같은 막대 칸 안에 위(승인)·아래(제외)로 겹쳐 눈금을 다른 줄과 맞춘다. 어느 것이 어느 것인지는 색이 아니라 글자 순서가 말한다.
          */}
        <div className="grid min-w-0 grid-cols-[4.5rem_3.5rem_minmax(0,1fr)] items-center gap-2">
          <span className="truncate text-xs text-secondary">승인 · 제외</span>
          <span className="text-right text-xs font-semibold text-primary tabular-nums">
            {n(funnel?.approved).toLocaleString('ko-KR')} · {n(funnel?.rejected).toLocaleString('ko-KR')}
          </span>
          <span className="flex flex-col gap-0.5">
            <span title={`승인 ${n(funnel?.approved)}`} className="min-h-1">
              <AdminOpsPageFunnelBar value={n(funnel?.approved)} max={max} thin />
            </span>
            <span title={`제외 ${n(funnel?.rejected)}`} className="min-h-1">
              <AdminOpsPageFunnelBar value={n(funnel?.rejected)} max={max} thin />
            </span>
          </span>
        </div>
        <AdminOpsPageFunnelCell label="반영" value={n(funnel?.applied)} max={max} />
        <AdminOpsPageFunnelCell label="재빌드" value={n(funnel?.rebuilds)} max={max} />
        <div className="border-t border-secondary pt-1.5">
          <AdminOpsPageFunnelCell label="지금 보류" value={pendingNow} max={max} tone="pending" />
        </div>
      </div>
      <p className="mt-2 text-xs text-quaternary">
        줄마다 그 기간에 그 단계를 지난 수예요 — 서로의 일부가 아니라 막대는 가장 큰 줄 기준이에요. 지금 보류만 기간과 무관해요.
      </p>
    </section>
  );
}
