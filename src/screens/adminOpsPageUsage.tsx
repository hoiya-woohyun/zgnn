'use client';

import type { TOpsOverview } from '../lib/adminOps';

/** 1.2M · 180K · 940 — 한 줄에 셋을 나란히 두는 자리라 짧게. 정확한 수는 `title` 에. */
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const full = (value: number) => value.toLocaleString('ko-KR');

function AdminOpsPageUsageCount({ label, value }: { label: string; value: number }) {
  return (
    <span title={`${label} ${full(value)}`}>
      {label} <span className="font-semibold text-primary">{compact.format(value)}</span>
    </span>
  );
}

/**
 * ④ 사용량 — 30일 합계 한 줄 세 묶음(features/ops-dashboard.md ④). **금액으로 바꾸지 않는다** — Claude 는 구독이라 한도 소모이지
 * 돈이 아니고, 네이버는 무료 구간이다. Claude 는 패스 셋(추출·교차점검·제안)의 계량기를 다 더한 값이다(`ops_overview.usage30d`).
 */
export function AdminOpsPageUsage({ usage }: { usage: TOpsOverview['usage30d'] }) {
  return (
    <section className="mt-8 px-4 md:px-6" aria-label="사용량">
      <h2 className="text-sm font-semibold text-primary">사용량 · 30일</h2>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-secondary tabular-nums">
        <span className="flex flex-wrap gap-x-2">
          <AdminOpsPageUsageCount label="Claude 호출" value={usage.claudeCalls} />
          <AdminOpsPageUsageCount label="입력" value={usage.input} />
          <AdminOpsPageUsageCount label="출력" value={usage.output} />
          <AdminOpsPageUsageCount label="캐시 읽기" value={usage.cacheRead} />
          <AdminOpsPageUsageCount label="캐시 쓰기" value={usage.cacheWrite} />
        </span>
        <span aria-hidden="true" className="text-quaternary">
          │
        </span>
        <AdminOpsPageUsageCount label="네이버 검색" value={usage.naverCalls} />
        <span aria-hidden="true" className="text-quaternary">
          │
        </span>
        <AdminOpsPageUsageCount label="재빌드" value={usage.rebuilds2xx} />
      </div>
      <p className="mt-1 text-xs text-quaternary">구독 5시간 한도는 토큰이 아니라 호출 패턴에 걸려요 — 참고값이에요.</p>
    </section>
  );
}
