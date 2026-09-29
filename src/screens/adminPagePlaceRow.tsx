'use client';

import { useState } from 'react';
import { Badge } from '../components/base/badges';
import { Button } from '../components/base/button';
import { Input } from '../components/base/input';
import {
  ARCHIVE_REASONS,
  lastNoteLine,
  noteLineText,
  PLACE_STATUS_COLOR,
  PLACE_STATUS_LABEL,
  type TArchiveReason,
} from '../lib/adminPlaces';
import type { TPlaceRow } from '../lib/adminCandidates';
import { TYPE_LABEL } from '../lib/adminCandidates';
import { isPlaceType, TYPE_COLOR, typeTint } from '../lib/places';
import { cx } from '../utils/cx';
import { ADMIN_PLACE_GRID } from './adminTable';

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
 * 장소 한 줄. `md` 이상에서는 머리글과 열이 맞는 **표의 한 줄**이다(`ADMIN_PLACE_GRID`) —
 * 이름·지역·상태·내린 사유·버튼이 각자의 열에 선다.
 *
 * 버튼을 줄 안에 두는 것이 요점이다. 예전에는 줄마다 아래에 버튼 줄이 하나씩 더 붙어 한 장소가
 * 두 줄을 먹었다 — 90곳을 훑는 화면에서 그 한 줄이 곧 화면 한 장이다.
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
  const why = archived ? noteLineText(lastNoteLine(place.archive_note)) : undefined;

  const typeTone = isPlaceType(place.type)
    ? { background: typeTint(place.type, 14), color: TYPE_COLOR[place.type] }
    : undefined;

  return (
    <li className="overflow-hidden rounded-xl border border-secondary bg-primary">
      <div className={cx('px-4 py-2', ADMIN_PLACE_GRID)}>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-bold text-primary">{place.name}</span>
          <span
            className={cx('rounded px-1.5 text-xs font-semibold', !typeTone && 'bg-secondary text-secondary')}
            style={typeTone}
          >
            {isPlaceType(place.type) ? TYPE_LABEL[place.type] : place.type}
          </span>
        </div>

        <p className="truncate text-xs text-tertiary">{place.region_raw || '(지역 없음)'}</p>

        <div>
          <Badge size="sm" color={PLACE_STATUS_COLOR[place.status]}>
            {PLACE_STATUS_LABEL[place.status]}
          </Badge>
        </div>

        {/* 내린 이유는 이 줄에서 상태 다음으로 중요하다 — 자기 열을 갖는다. 초안은 사유 대신 안내가 온다. */}
        <p className="min-w-0 text-xs text-tertiary">
          {why ??
            (place.status === 'draft'
              ? '아직 사이트에 안 올라간 곳이에요 — ‘확인할 장소’ 에서 이 가게의 후보를 승인하면 올라가요.'
              : '')}
        </p>

        {!state.archiving && (
          <div className="mt-2 md:mt-0 md:justify-self-end">
            {archived ? (
              <Button
                color="primary"
                size="sm"
                isDisabled={Boolean(busy)}
                isLoading={busy === 'restoring'}
                onClick={onRestore}
              >
                {busy === 'restoring' ? '되살리는 중…' : '되살리기'}
              </Button>
            ) : (
              /*
               * 초안에 '올리기' 버튼을 두지 않는다. `restorePlace` 를 그대로 쓰면 두 가지가 조용히 틀린다 —
               * 지역 형식 검사(`leadProblem` 의 `regionUsable`)를 건너뛰어 Studio 에서 만든 행이 '기타' 로 게시되고,
               * `archive_note` 에 내린 적 없는 행의 `되살림` 이 적힌다. 제대로 막으면 이 칸에는 지역을 고칠 자리가
               * 없어 막다른 패널이 된다 — 초안을 올리는 길은 '확인할 장소' 의 승인이다(→ docs/todo/06 「열린 것」 F).
               */
              <Button
                color="secondary-destructive"
                size="sm"
                isDisabled={Boolean(busy)}
                onClick={onStartArchive}
              >
                내리기
              </Button>
            )}
          </div>
        )}
      </div>

      {/* 결과·오류는 열에 끼우지 않는다 — 줄 전체 폭을 쓰는 편이 읽힌다(그리드 밖이라 열도 흔들지 않는다). */}
      {state.done && <p className="px-4 pb-2 text-xs text-success-primary">{state.done}</p>}
      {state.error && <p className="px-4 pb-2 text-xs text-error-primary">{state.error}</p>}

      {state.archiving && (
        <div className="border-t border-secondary px-4 py-3">
          <p className="text-xs font-semibold text-secondary">왜 내리나요?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {ARCHIVE_REASONS.map((candidate) => (
              <Button
                key={candidate}
                size="sm"
                color={reason === candidate ? 'primary' : 'secondary'}
                aria-pressed={reason === candidate}
                isDisabled={Boolean(busy)}
                onClick={() => setReason(candidate)}
              >
                {candidate}
              </Button>
            ))}
          </div>

          <div className="mt-2 max-w-md">
            <Input
              aria-label="내림 메모(선택)"
              placeholder="메모 (선택)"
              value={note}
              onChange={setNote}
              isDisabled={Boolean(busy)}
              size="sm"
            />
          </div>

          {/* 거짓말을 하지 않는 자리다 — DB 에서 내려도 사이트에서 사라지는 것은 다음 빌드부터다(ADR-015). */}
          <p className="mt-2 text-xs text-tertiary">
            {place.status === 'draft'
              ? '내리면 이 목록의 ‘내림’ 으로 옮겨져요. 사이트에는 원래 없던 곳이에요.'
              : '내리면 다음 빌드부터 사이트에서 사라져요. 되살리려면 위쪽 ‘내림’ 버튼으로 걸러서 찾으면 돼요.'}
          </p>

          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              color="primary-destructive"
              size="sm"
              isDisabled={Boolean(busy) || !reason}
              isLoading={busy === 'archiving'}
              onClick={() => reason && onArchive(reason, note)}
            >
              {busy === 'archiving' ? '내리고 있어요…' : '내리기'}
            </Button>
            <Button
              color="secondary"
              size="sm"
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
