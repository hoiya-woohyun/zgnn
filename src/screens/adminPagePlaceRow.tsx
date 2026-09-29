'use client';

import { useState } from 'react';
import { Badge } from '../components/base/badges';
import { Button } from '../components/base/button';
import { Input } from '../components/base/input';
import {
  ARCHIVE_REASONS,
  lastNoteLine,
  PLACE_STATUS_COLOR,
  PLACE_STATUS_LABEL,
  type TArchiveReason,
} from '../lib/adminPlaces';
import type { TPlaceRow } from '../lib/adminCandidates';
import { TYPE_LABEL } from '../lib/adminCandidates';
import { isPlaceType, TYPE_COLOR, typeTint } from '../lib/places';
import { cx } from '../utils/cx';

/** 장소 한 줄의 화면 상태. 소유자는 `adminPagePlaceList` 고 여기는 받아서 그린다(묶음 카드와 같은 모양). */
export type TAdminPagePlaceState = {
  busy?: 'archiving' | 'restoring';
  done?: string;
  error?: string;
  /** '내리기' 를 눌러 사유를 고르는 중. */
  archiving?: boolean;
};

type TAdminPagePlaceRowProps = {
  place: TPlaceRow;
  state: TAdminPagePlaceState;
  onStartArchive: () => void;
  onCancelArchive: () => void;
  onArchive: (reason: TArchiveReason, note: string) => void;
  onRestore: () => void;
};

/**
 * 장소 한 줄. 이름·종류·지역·상태가 한 줄에 있고, 내린 곳은 사유 한 줄이 아래 붙는다.
 *
 * 사유를 **고르게** 하는 이유는 후보 반려와 같다 — 자유 입력만 두면 매번 다른 말이 적혀 한 달 뒤에
 * "이 곳은 폐업인가 중복인가" 를 셀 수 없다(`adminPageRejectForm` 과 같은 어법).
 */
export function AdminPagePlaceRow({
  place,
  state,
  onStartArchive,
  onCancelArchive,
  onArchive,
  onRestore,
}: TAdminPagePlaceRowProps) {
  const [reason, setReason] = useState<TArchiveReason | null>(null);
  const [note, setNote] = useState('');
  const busy = state.busy;
  const archived = place.status === 'archived';
  const why = archived ? lastNoteLine(place.archive_note) : undefined;

  const typeTone = isPlaceType(place.type)
    ? { background: typeTint(place.type, 14), color: TYPE_COLOR[place.type] }
    : undefined;

  return (
    <li className="overflow-hidden rounded-2xl border border-secondary bg-primary">
      <div className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-md font-bold text-primary">{place.name}</span>
          <span
            className={cx('rounded-full px-2 py-0.5 text-xs font-semibold', !typeTone && 'bg-secondary text-secondary')}
            style={typeTone}
          >
            {isPlaceType(place.type) ? TYPE_LABEL[place.type] : place.type}
          </span>
          <Badge size="sm" color={PLACE_STATUS_COLOR[place.status]}>
            {PLACE_STATUS_LABEL[place.status]}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-tertiary">{place.region_raw || '(지역 없음)'}</p>
        {why && <p className="mt-1 text-xs text-tertiary">{why}</p>}

        {state.done && <p className="mt-2 text-sm text-success-primary">{state.done}</p>}
        {state.error && <p className="mt-2 text-sm text-error-primary">{state.error}</p>}

        {!state.archiving && (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            {archived ? (
              <Button
                color="primary"
                size="lg"
                className="sm:flex-1"
                isDisabled={Boolean(busy)}
                isLoading={busy === 'restoring'}
                onClick={onRestore}
              >
                {busy === 'restoring' ? '되살리고 있어요…' : '되살리기(게시중으로)'}
              </Button>
            ) : (
              <Button
                color="secondary-destructive"
                size="lg"
                className="sm:flex-1"
                isDisabled={Boolean(busy)}
                onClick={onStartArchive}
              >
                내리기
              </Button>
            )}
          </div>
        )}
      </div>

      {state.archiving && (
        <div className="border-t border-secondary px-4 py-4">
          <p className="text-sm font-semibold text-secondary">왜 내리나요?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {ARCHIVE_REASONS.map((candidate) => (
              <Button
                key={candidate}
                size="sm"
                color={reason === candidate ? 'primary' : 'secondary'}
                aria-pressed={reason === candidate}
                className="h-11"
                isDisabled={Boolean(busy)}
                onClick={() => setReason(candidate)}
              >
                {candidate}
              </Button>
            ))}
          </div>

          <div className="mt-3">
            <Input
              aria-label="내림 메모(선택)"
              placeholder="메모 (선택)"
              value={note}
              onChange={setNote}
              isDisabled={Boolean(busy)}
              size="lg"
            />
          </div>

          {/* 거짓말을 하지 않는 자리다 — DB 에서 내려도 사이트에서 사라지는 것은 다음 빌드부터다(ADR-015). */}
          <p className="mt-3 text-xs text-tertiary">
            내리면 다음 빌드부터 사이트에서 사라져요. 되살리는 길은 이 목록의 &lsquo;내림&rsquo; 칸에 있어요.
          </p>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button
              color="primary-destructive"
              size="lg"
              className="sm:flex-1"
              isDisabled={Boolean(busy) || !reason}
              isLoading={busy === 'archiving'}
              onClick={() => reason && onArchive(reason, note)}
            >
              {busy === 'archiving' ? '내리고 있어요…' : '내리기'}
            </Button>
            <Button
              color="secondary"
              size="lg"
              className="sm:flex-1"
              isDisabled={Boolean(busy)}
              onClick={onCancelArchive}
            >
              취소
            </Button>
          </div>
          {!reason && <p className="mt-2 text-xs text-tertiary">사유를 하나 골라 주세요.</p>}
        </div>
      )}
    </li>
  );
}
