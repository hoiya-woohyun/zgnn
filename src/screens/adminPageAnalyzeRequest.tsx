'use client';

import { useState } from 'react';
import { Button } from '../components/base/button';
import { Select } from '../components/base/select';
import type { TWorkerHealth } from '../lib/adminOpsHealth';
import { ANALYZE_LIMIT_CHOICES, analyzeRequestView, type TAnalyzeLimit, type TAnalyzeRequestResult } from '../lib/adminRequests';
import { cx } from '../utils/cx';

type TAdminPageAnalyzeRequestProps = {
  /** 머리글과 같은 판정. 모르면 null — 버튼은 켜 둔다(`analyzeRequestView`) */
  worker: TWorkerHealth | null;
  /** 미분석 글 수(`ops_overview.backlog.count`). 못 읽었으면 undefined */
  backlog: number | undefined;
  onRequest: (limit: TAnalyzeLimit) => Promise<TAnalyzeRequestResult>;
};

const RESULT_TEXT: Record<TAnalyzeRequestResult, string> = {
  queued: '요청했어요 — 워커가 곧 집어요',
  alreadyQueued: '이미 대기 중인 요청이 있어요',
};

/**
 * 검수 대기 칸의 **「저수지 N건 분석」 줄**(todo/17 T6) — 미분석 글 N건을 지금 읽게 로컬 워커에 요청한다(`adminRequests.ts`).
 *
 * 카드의 결정 줄(`추가 수집` 옆)이 아니라 **칸에 하나**다 — 저수지는 어느 후보에도 딸리지 않아 카드마다 서면 같은 버튼이 수십 번 반복된다.
 * 걸러 보기 줄과 달리 **목록이 비어도 선다**: 검수할 것이 없을 때가 저수지를 읽힐 때다.
 * 주 버튼(핑크)은 '올리기' 자리라 `secondary`. 요청은 후보·장소를 바꾸지 않아 `beginWrite` 직렬화 밖이다.
 */
export function AdminPageAnalyzeRequest({ worker, backlog, onRequest }: TAdminPageAnalyzeRequestProps) {
  const [limit, setLimit] = useState<TAnalyzeLimit>(10);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; error: boolean } | null>(null);
  const view = analyzeRequestView(worker, backlog, limit);

  const request = async () => {
    setBusy(true);
    setSaid(null);
    try {
      setSaid({ text: RESULT_TEXT[await onRequest(limit)], error: false });
    } catch (error) {
      setSaid({ text: error instanceof Error ? error.message : '분석을 요청하지 못했어요.', error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 px-4 md:px-6">
      <Select
        aria-label="분석할 글 수"
        size="sm"
        className="w-24"
        selectedKey={String(limit)}
        isDisabled={busy}
        onSelectionChange={(key) => key && setLimit(Number(key) as TAnalyzeLimit)}
      >
        {ANALYZE_LIMIT_CHOICES.map((choice) => (
          <Select.Item key={choice} id={String(choice)}>
            {`${choice}건`}
          </Select.Item>
        ))}
      </Select>
      <Button color="secondary" size="sm" isDisabled={view.disabled || busy} isLoading={busy} onClick={() => void request()}>
        {view.label}
      </Button>
      {said ? (
        <p className={cx('text-xs', said.error ? 'text-error-primary' : 'text-tertiary')}>{said.text}</p>
      ) : view.hint ? (
        <p className={cx('text-xs', view.disabled ? 'text-warning-primary' : 'text-tertiary')}>{view.hint}</p>
      ) : null}
    </div>
  );
}
