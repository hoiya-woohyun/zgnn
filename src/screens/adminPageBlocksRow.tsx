'use client';

import { Button } from '../components/base/button';
import { BLOCK_CHOICE_LABEL, blockRowView, type TBlockChoice, type TBlockRow } from '../lib/adminBlocks';
import { cx } from '../utils/cx';
import { ADMIN_PANEL_DIVIDER, ADMIN_ROW, ADMIN_ROW_CELLS, ADMIN_ROW_OPEN } from './adminTable';

/** 블랙리스트 한 줄의 화면 상태. 소유자는 `adminPage` 고 여기는 받아서 그린다(장소 줄과 같은 모양). */
export type TAdminPageBlocksRowState = {
  busy?: 'lifting' | 'extending';
  done?: string;
  error?: string;
  /** '기간 바꾸기' 를 눌러 3개월·영구를 고르는 중. */
  picking?: boolean;
};

/** 기간 바꾸기의 선택지 — `none` 은 `풀기` 가 따로 있어 뺀다. */
const EXTEND_CHOICES = ['months3', 'forever'] as const satisfies readonly Exclude<TBlockChoice, 'none'>[];

/** 장소 줄의 액션 칸과 같은 규칙(`adminPagePlaceRow` 의 `ROW_ACTION`) — 줄바꿈 안 하는 폭이 `auto` 열의 폭이다. */
const ROW_ACTION = 'shrink-0 whitespace-nowrap';

type TAdminPageBlocksRowProps = {
  row: TBlockRow;
  state: TAdminPageBlocksRowState;
  now: Date;
  /** 그 장소가 있는 칸(등록 완료·등록 해제)으로 간다. 장소에서 건 행이 아니거나 장소 목록에 없으면 undefined. */
  onGoToPlace?: () => void;
  onLift: () => void;
  onStartExtend: () => void;
  onCancelExtend: () => void;
  onExtend: (choice: Exclude<TBlockChoice, 'none'>) => void;
};

/**
 * 블랙리스트 한 줄(09 T1.5). 표의 한 줄 꼴(`ADMIN_ROW` · `ADMIN_ROW_CELLS`)은 장소 표와 같다.
 *
 * **기간이 지난 줄은 회색으로 낮추되 지우지 않는다** — 분석은 이미 그 행을 안 보지만(`blockFor`), 그 가게가 다시 후보로 올라온
 * 까닭을 읽을 자리가 이 줄뿐이다. `기간 바꾸기` 가 그 줄을 다시 막는 손잡이이기도 하다(3개월은 지금부터).
 */
export function AdminPageBlocksRow({ row, state, now, onGoToPlace, onLift, onStartExtend, onCancelExtend, onExtend }: TAdminPageBlocksRowProps) {
  const view = blockRowView(row, now);
  const busy = state.busy;
  const current: Exclude<TBlockChoice, 'none'> | null = row.until === null ? 'forever' : null;

  return (
    <li className={cx(ADMIN_ROW, state.picking ? ADMIN_ROW_OPEN : 'hover:bg-primary_hover')}>
      {/* 칸 수는 고르는 중에도 그대로다 — 자식 하나가 빠지면 그 줄만 다른 열에서 시작한다(장소 줄과 같은 이유). */}
      <div className={cx('px-4 py-2', ADMIN_ROW_CELLS)}>
        <span className={cx('truncate text-sm font-bold', view.expired ? 'text-tertiary' : 'text-primary')}>{row.display_name}</span>

        <span className="truncate text-xs text-tertiary max-md:mt-0.5">{row.town ?? '—'}</span>

        <span className="min-w-0 text-xs max-md:mt-0.5">
          <span className="text-secondary">{row.reason}</span>
          {row.note ? <span className="block break-keep text-tertiary">{row.note}</span> : null}
        </span>

        <span className={cx('text-xs tabular-nums max-md:mt-0.5', view.expired ? 'text-quaternary' : 'font-semibold text-secondary')}>
          {view.remaining}
        </span>

        <span className="flex items-center text-xs text-tertiary max-md:mt-0.5">
          {view.origin === 'place' ? (
            onGoToPlace ? (
              <Button color="link-gray" size="sm" className={ROW_ACTION} onClick={onGoToPlace}>
                장소 보기
              </Button>
            ) : (
              '장소'
            )
          ) : view.origin === 'candidate' ? (
            '후보'
          ) : (
            '—'
          )}
        </span>

        <div className="flex items-center gap-2 max-md:mt-2 md:justify-end">
          <Button color="secondary" size="sm" className={ROW_ACTION} isDisabled={Boolean(busy)} isLoading={busy === 'lifting'} onClick={onLift}>
            풀기
          </Button>
          <Button
            color="secondary"
            size="sm"
            className={ROW_ACTION}
            isDisabled={Boolean(busy) || state.picking}
            onClick={onStartExtend}
          >
            기간 바꾸기
          </Button>
        </div>
      </div>

      {state.done && <p className="px-4 pb-2 text-xs text-success-primary">{state.done}</p>}
      {state.error && <p className="px-4 pb-2 text-xs text-error-primary">{state.error}</p>}

      {/* 등록 해제 칸의 블랙리스트 고르기(`adminPagePlaceRow`)와 같은 꼴 — 고르는 즉시 쓴다. 지금 기간은 눌린 모양으로. */}
      {state.picking && (
        <div className={cx(ADMIN_PANEL_DIVIDER, 'flex flex-wrap items-center gap-1.5 px-4 py-3')}>
          <span className="text-xs font-semibold text-secondary">기간을</span>
          {EXTEND_CHOICES.map((choice) => (
            <Button
              key={choice}
              size="sm"
              color={current === choice ? 'primary' : 'secondary'}
              aria-pressed={current === choice}
              isDisabled={Boolean(busy)}
              isLoading={busy === 'extending'}
              onClick={() => onExtend(choice)}
            >
              {BLOCK_CHOICE_LABEL[choice]}
            </Button>
          ))}
          <Button color="link-gray" size="sm" isDisabled={Boolean(busy)} onClick={onCancelExtend}>
            취소
          </Button>
          <span className="basis-full text-xs text-tertiary">3개월은 오늘부터 세요 — 기간이 지난 줄을 다시 막을 때도 이것을 눌러요.</span>
        </div>
      )}
    </li>
  );
}
