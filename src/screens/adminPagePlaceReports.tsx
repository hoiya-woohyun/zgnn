'use client';

import { useState } from 'react';
import { Button } from '../components/base/button';
import { Input } from '../components/base/input';
import { CLOSURE_KINDS, reportDay, type TReportRow } from '../lib/adminReports';
import { REPORT_KIND_SHORT } from '../lib/placeReport';
import { cx } from '../utils/cx';
import { ADMIN_PANEL_DIVIDER } from './adminTable';

type TAdminPagePlaceReportsProps = {
  reports: TReportRow[];
  busy: boolean;
  /** 이 장소가 게시중이면 폐업 제보에서 등록 해제 폼을 열 수 있다. */
  canArchive: boolean;
  onHandle: (ids: string[], status: 'handled' | 'dismissed', note: string) => void;
  onArchive: () => void;
};

/**
 * 장소 한 줄의 펼친 판 안 **사용자 제보** 목록(10 T1.4 · ADR-021). 처리는 상태 한 칸이다 — `고쳤어요`(handled) · `무시`(dismissed).
 *
 * 폐업·다른 가게 제보에는 `등록 해제…` 가 선다. **여기서 내리지 않는다** — 줄의 등록 해제 폼을 `폐업` 을 미리 고른 채 연다(블랙리스트 영구가 기본).
 * 해제가 끝나면 그 장소의 열린 제보는 쓰는 쪽(`adminPage`)이 함께 닫는다. 두 번째 내리기 버튼이 생기면 한쪽만 `place_blocks` 를 쓴다(R4).
 *
 * 고친 것은 이 판 밖에서 한다(주소는 위 `주소·좌표 고치기`, 조건은 후보 재분석). 이 판은 "고쳤다" 를 적는 자리다.
 */
export function AdminPagePlaceReports({ reports, busy, canArchive, onHandle, onArchive }: TAdminPagePlaceReportsProps) {
  const [note, setNote] = useState('');
  const ids = reports.map((report) => report.id);
  const hasClosure = reports.some((report) => CLOSURE_KINDS.includes(report.kind));

  return (
    <div className={cx(ADMIN_PANEL_DIVIDER, 'px-4 py-3')}>
      <p className="text-xs font-semibold text-secondary">사용자 제보 {reports.length}건</p>
      <ul className="mt-1.5 flex flex-col gap-1 text-xs">
        {reports.map((report) => (
          <li key={report.id} className="flex flex-wrap items-baseline gap-x-2">
            <span
              className={cx(
                'rounded px-1.5 py-px font-medium',
                CLOSURE_KINDS.includes(report.kind) ? 'bg-error-primary text-error-primary' : 'bg-secondary text-secondary',
              )}
            >
              {REPORT_KIND_SHORT[report.kind]}
            </span>
            <span className="text-secondary">{report.note ?? '(한 줄 없음)'}</span>
            <span className="text-quaternary">
              {reportDay(report.created_at)} · 배포 {report.app_build ?? '?'}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-2 max-w-md">
        <Input aria-label="처리 메모(선택)" placeholder="처리 메모 (선택)" value={note} onChange={setNote} isDisabled={busy} size="sm" />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {hasClosure && canArchive && (
          <Button color="secondary-destructive" size="sm" isDisabled={busy} onClick={onArchive}>
            등록 해제… (폐업)
          </Button>
        )}
        <Button color="secondary" size="sm" isDisabled={busy} isLoading={busy} onClick={() => onHandle(ids, 'handled', note)}>
          고쳤어요 · 닫기
        </Button>
        <Button color="link-gray" size="sm" isDisabled={busy} onClick={() => onHandle(ids, 'dismissed', note)}>
          맞는 정보예요 · 무시
        </Button>
      </div>
      <p className="mt-2 text-xs text-tertiary">
        제보한 사람에게는 답장이 가지 않아요. 고친 내용은 다음 빌드부터 사이트에 보여요.
      </p>
    </div>
  );
}
