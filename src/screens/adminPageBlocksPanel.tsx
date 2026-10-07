'use client';

import { SlashCircle01 } from '@untitledui/icons';
import { EmptyState } from '../components/layout/emptyState';
import type { TBlockChoice, TBlockRow, TBlocksLoad } from '../lib/adminBlocks';
import { AdminPageBlocksRow, type TAdminPageBlocksRowState } from './adminPageBlocksRow';
import { ADMIN_BLOCK_TRACKS, AdminTable } from './adminTable';

const COLUMNS = ['이름', '읍·면', '사유', '남은 기간', '어디서', ''];

type TAdminPageBlocksPanelProps = {
  /** undefined = 아직 못 읽었다. 건수는 머리글(`PageHeader`)이 말한다. */
  load?: TBlocksLoad;
  states: Record<string, TAdminPageBlocksRowState>;
  /** 방금 푼 줄의 한 줄 — 푼 줄은 목록에서 빠져 줄 안에 설 자리가 없다. */
  notice?: string;
  /** 장소 id → 그 장소가 있는 칸으로 가는 손잡이. 장소 목록에 없으면 undefined(링크를 안 그린다). */
  goToPlace: (placeId: string) => (() => void) | undefined;
  onLift: (row: TBlockRow) => void;
  onStartExtend: (row: TBlockRow) => void;
  onCancelExtend: (row: TBlockRow) => void;
  onExtend: (row: TBlockRow, choice: Exclude<TBlockChoice, 'none'>) => void;
};

/**
 * 블랙리스트 칸(`place_blocks`, 09 D6 · T1.5) — 막고 있는 가게의 목록과 풀기·기간 바꾸기.
 * 표가 원격에 없으면 "0건" 이 아니라 적용이 안 됐다고 말한다(09 「실행 규약」).
 *
 * 비운영자는 이 칸까지 오지 않는다 — `adminPage` 가 운영자 확인(`isOperator`)에서 먼저 "검수 권한이 없어요" 로 멈춘다.
 * RLS(`is_operator()`)는 비운영자의 select 에 에러가 아니라 빈 배열을 주므로, 빈 목록을 "권한 없음" 으로 읽으면 진짜 빈 상태를 틀리게 말한다.
 */
export function AdminPageBlocksPanel({ load, states, notice, goToPlace, onLift, onStartExtend, onCancelExtend, onExtend }: TAdminPageBlocksPanelProps) {
  if (!load) return <p className="px-4 pt-6 text-sm text-tertiary md:px-6">블랙리스트를 읽고 있어요</p>;
  if (load.kind === 'unavailable') {
    return (
      <p className="px-4 pt-6 text-sm text-tertiary md:px-6">
        블랙리스트 표가 아직 적용되지 않았어요 — DB 마이그레이션이 적용되면 여기 보여요.
      </p>
    );
  }
  if (load.kind === 'error') {
    return <p className="px-4 pt-6 text-sm text-error-primary md:px-6">블랙리스트를 읽지 못했어요 ({load.message})</p>;
  }

  const noticeLine = notice ? <p className="mt-3 px-4 text-xs text-success-primary md:px-6">{notice}</p> : null;
  if (load.rows.length === 0) {
    return (
      <div>
        {noticeLine}
        <div className="px-4 pt-6 md:px-6">
          <EmptyState
            Icon={SlashCircle01}
            title="막고 있는 가게가 없어요"
            description="검수 대기에서 제외하거나 등록 해제할 때 기간을 고르면 여기 쌓여요."
          />
        </div>
      </div>
    );
  }

  // 한 번 그릴 때 한 시각으로 잰다 — 줄마다 `new Date()` 를 부르면 경계의 두 줄이 다른 시각으로 판정될 수 있다.
  const now = new Date();
  return (
    <div>
      {noticeLine}
      <div className="mt-3">
        <AdminTable grid={ADMIN_BLOCK_TRACKS} columns={COLUMNS}>
          {load.rows.map((row) => (
            <AdminPageBlocksRow
              key={row.id}
              row={row}
              state={states[row.id] ?? {}}
              now={now}
              onGoToPlace={row.place_id ? goToPlace(row.place_id) : undefined}
              onLift={() => onLift(row)}
              onStartExtend={() => onStartExtend(row)}
              onCancelExtend={() => onCancelExtend(row)}
              onExtend={(choice) => onExtend(row, choice)}
            />
          ))}
        </AdminTable>
      </div>
      <p className="px-4 pt-3 text-xs text-tertiary md:px-6">
        블랙리스트에 있는 동안 그 가게를 쓴 새 글은 후보가 되지 않아요. 기간이 지난 줄(회색)은 더 막지 않아요.
      </p>
    </div>
  );
}
