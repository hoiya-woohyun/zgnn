'use client';

import { ChevronDown } from '@untitledui/icons';
import { useState, type MouseEvent } from 'react';
import { Badge } from '../components/base/badges';
import { Button } from '../components/base/button';
import { BLOCK_CHOICE_LABEL, blockChipText, type TBlockChoice, type TPlaceBlock } from '../lib/adminBlocks';
import {
  lastNoteLine,
  noteLineText,
  PLACE_GAP_LABEL,
  PLACE_STATUS_COLOR,
  PLACE_STATUS_LABEL,
  placeBadges,
  placeGaps,
  type TArchiveReason,
} from '../lib/adminPlaces';
import type { TPlaceRow } from '../lib/adminCandidates';
import type { TPlaceAddressPatch } from '../lib/adminPlaces';
import { cx } from '../utils/cx';
import { AdminPagePlaceAddressForm } from './adminPagePlaceAddressForm';
import { AdminPagePlaceArchiveForm } from './adminPagePlaceArchiveForm';
import { AdminPagePlaceDetail } from './adminPagePlaceDetail';
import { AdminPagePlaceReports } from './adminPagePlaceReports';
import type { TReportRow } from '../lib/adminReports';
import { ADMIN_PANEL_DIVIDER, ADMIN_PLACE_GRID, ADMIN_POLICY_TONE, ADMIN_ROW_OPEN } from './adminTable';
import { AdminTypeChip } from './adminTypeChip';

/** 장소 한 줄의 화면 상태. 소유자는 `adminPagePlaceList` 고 여기는 받아서 그린다(묶음 카드와 같은 모양). */
export type TAdminPagePlaceState = {
  busy?: 'archiving' | 'restoring' | 'savingAddress' | 'blocking' | 'reports';
  done?: string;
  error?: string;
  /** '내리기' 를 눌러 사유를 고르는 중. */
  archiving?: boolean;
  /** 해제 폼을 열 때 미리 고를 사유(폐업 제보에서 열면 `폐업`). */
  archiveReason?: TArchiveReason;
  /** 등록 해제 칸에서 '블랙리스트' 를 눌러 기간을 고르는 중. */
  pickingBlock?: boolean;
  /** 펼친 상세에서 '주소·좌표 고치기' 를 눌러 패널이 열려 있다. */
  editingAddress?: boolean;
};

/**
 * 줄 안의 동작 버튼은 **텍스트(링크형) 버튼**이다 — 테두리 있는 버튼은 마지막 칸 폭을 넘어 옆 '종류' 칸 위로 겹쳤다(1512px).
 * 링크형은 패딩이 없어 히트 영역이 글자 크기라, `min-h-11`(44px)로 바닥을 주고 `-my-1` 로 줄 높이는 그대로 둔다.
 * `whitespace-nowrap` — 칸 안에서 줄바꿈하지 않는다(칸 폭은 `ADMIN_PLACE_GRID` 의 마지막 열이 `되살리기(게시중으로)` 가 들어가게 잡혀 있다).
 */
const ROW_LINK = 'min-h-11 -my-1 shrink-0 whitespace-nowrap';

type TAdminPagePlaceRowProps = {
  place: TPlaceRow;
  state: TAdminPagePlaceState;
  /** 상세가 펼쳐져 있는가. 소유자는 `adminPagePlaceList` 다(검색·걸러 보기가 바뀌어도 펼친 줄이 남게). */
  expanded: boolean;
  onToggle: () => void;
  onStartArchive: () => void;
  onCancelArchive: () => void;
  onArchive: (reason: TArchiveReason, note: string, block: TBlockChoice) => void;
  /** 이 장소에서 건 열린 블랙리스트(등록 해제 칸의 칩). 표가 없으면 `blocksUnavailable`. */
  block?: TPlaceBlock;
  blocksUnavailable?: boolean;
  onStartBlock: () => void;
  onCancelBlock: () => void;
  onSetBlock: (choice: TBlockChoice) => void;
  /** 이 장소에 열린 사용자 제보(처리할 것만). 없거나 표가 없으면 빈 배열. */
  reports: TReportRow[];
  onHandleReports: (ids: string[], status: 'handled' | 'dismissed', note: string) => void;
  /** 폐업 제보에서 등록 해제 폼을 `폐업` 으로 연다. */
  onArchiveFromReport: () => void;
  onRestore: () => void;
  onStartEditAddress: () => void;
  onCancelEditAddress: () => void;
  onSaveAddress: (patch: TPlaceAddressPatch) => void;
};

/**
 * 장소 한 줄. `md` 이상에서는 머리글과 열이 맞는 **표의 한 줄**이다(`ADMIN_PLACE_GRID`) —
 * 이름·지역·동반 조건·소개·종류·버튼이 각자의 열에 선다. 앞의 다섯 열은 후보 표와 같은 자리다.
 *
 * **사이트에 지금 무엇이 나가 있는지가 접힌 줄에서 보여야 한다**(2026-09-30). 이름·지역·상태만 있던 동안 이 칸은
 * "내리기 버튼 목록" 이었고, 동반 조건이 틀렸거나 좌표가 빠져 지도에 없는 곳을 찾으려면 한 곳씩 사이트를 열어 봐야 했다.
 * 동반 조건 칸은 사이트와 같은 배지(`placeBadges`)이고, 빠진 정보(`placeGaps`)는 이름 옆 노란 뱃지다.
 * 나머지(원문·주소·링크·상태 이력)는 펼친 상세(`AdminPagePlaceDetail`)가 말한다.
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
  expanded,
  onToggle,
  onStartArchive,
  onCancelArchive,
  onArchive,
  onRestore,
  onStartEditAddress,
  onCancelEditAddress,
  onSaveAddress,
  block,
  blocksUnavailable,
  onStartBlock,
  onCancelBlock,
  onSetBlock,
  reports,
  onHandleReports,
  onArchiveFromReport,
}: TAdminPagePlaceRowProps) {
  /** '되살리기(게시중으로)' 를 눌러 한 번 더 묻는 중 — 되살리면 초안이었던 행도 게시가 된다. */
  const [askingRestore, setAskingRestore] = useState(false);
  const busy = state.busy;
  const archived = place.status === 'archived';
  const why = archived ? noteLineText(lastNoteLine(place.archive_note)) : undefined;
  const badges = placeBadges(place);
  /* 내린 곳의 빠진 정보는 조용히 둔다 — 사이트에 없는 곳이라 고칠 까닭이 없고, 뜨면 되살리기를 찾는 눈을 가린다. */
  const gaps = archived ? [] : placeGaps(place);

  /*
   * 줄의 빈 곳을 눌러도 펼친다(후보 표와 같은 손버릇). 다만 **줄 전체를 `<button>` 으로 만들 수 없다** —
   * 이름이 사이트 링크고 끝에 내리기 버튼이 있어서, 버튼 안의 링크·버튼이 된다. 그래서 상자는 div 로 두고
   * 클릭만 받으며, 안쪽의 링크·버튼에서 올라온 클릭은 흘려보낸다. 키보드·스크린리더는 이름 옆 화살표 버튼으로 연다.
   */
  const toggleFromRow = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('a, button, input')) return;
    onToggle();
  };

  return (
    /*
     * 줄은 테두리를 갖지 않는다 — 가르는 선은 `<ul>` 의 `divide-y` 한 줄이 긋는다.
     * 사유를 고르는 중이면 머리와 패널을 **한 색으로** 덮는다: 내리기 버튼이 그 패널에 있어서,
     * 어느 줄의 패널인지 눈으로 정하지 못하면 그것이 곧 다른 가게를 내리는 길이다.
     */
    <li className={cx(expanded || state.archiving ? ADMIN_ROW_OPEN : 'hover:bg-primary_hover')}>
      <div className={cx('cursor-pointer px-4 py-2', ADMIN_PLACE_GRID)} onClick={toggleFromRow}>
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
          {/* 종류 칩은 맨 뒤 자기 열로 갔다(2026-09-30) — 두 표가 같은 자리에 둔다. */}
          {/* 게시된 곳은 이름이 사이트 상세로 가는 링크다 — 내리기 전에 사이트에 무엇이 나가 있는지 한 번에 본다. */}
          {place.status === 'published' ? (
            <a
              href={`/place/${place.id}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-sm font-bold text-primary hover:underline"
            >
              {place.name}
            </a>
          ) : (
            <span className="truncate text-sm font-bold text-primary">{place.name}</span>
          )}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={`${place.name} 자세히 ${expanded ? '접기' : '보기'}`}
            className="-m-1 rounded p-1 hover:bg-tertiary"
          >
            <ChevronDown
              aria-hidden="true"
              className={cx('size-3.5 text-fg-quaternary transition-transform', expanded && 'rotate-180')}
            />
          </button>
          {/*
            * **정상은 안 보이고 이상만** — 후보 표와 같은 원칙이다. `게시중` 은 86줄 중 84줄의 값이라 쓰지 않고,
            * 게시 대기만 뱃지다(내림은 자기 칸 '등록 해제' 가 말한다). 빠진 정보도 노란 뱃지(사이트에서 무엇이 사라지는지의 이름).
            */}
          {place.status === 'draft' && (
            <Badge size="sm" color={PLACE_STATUS_COLOR[place.status]}>
              {PLACE_STATUS_LABEL[place.status]}
            </Badge>
          )}
          {/* 사용자 제보는 빠진 정보보다 앞 — 사람이 직접 "틀렸다" 고 한 것이 가장 센 신호다(10 T1.4). */}
          {reports.length > 0 && (
            <Badge type="color" size="sm" color="error">
              제보 {reports.length}
            </Badge>
          )}
          {gaps.map((gap) => (
            <Badge key={gap} type="color" size="sm" color="warning">
              {PLACE_GAP_LABEL[gap]}
            </Badge>
          ))}
          {/* 내린 이유는 상태 바로 뒤에 — 자기 열이던 동안 84줄에서 빈 칸이었다. 초안은 사유 대신 안내가 온다. */}
          {archived && !blocksUnavailable && (
            <Badge size="sm" color={block ? 'gray' : 'blue'}>
              {block ? `블랙리스트 ${blockChipText(block, new Date())}` : '블랙리스트 없음'}
            </Badge>
          )}
          {(why || place.status === 'draft') && (
            <span className="basis-full text-xs text-tertiary">
              {why ?? '아직 사이트에 안 올라간 곳이에요 — ‘검수 대기’ 에서 이 가게의 후보를 승인하면 올라가요.'}
            </span>
          )}
        </div>

        <p className="truncate text-xs text-tertiary max-md:mt-0.5">{place.region_raw || '(지역 없음)'}</p>

        {/* 사이트와 같은 배지·같은 순서(`placeBadges`). 후보 표의 동반 조건 칸과 같은 칩이다. */}
        <span className="flex min-w-0 flex-wrap content-start items-start gap-1 text-xs max-md:mt-0.5">
          {badges.map((badge) => (
            <span
              key={badge.label}
              className={cx('rounded px-1.5 py-px font-medium break-keep', ADMIN_POLICY_TONE[badge.tone])}
            >
              {badge.label}
            </span>
          ))}
        </span>

        {/* 사이트의 소개 문구 그대로. 자르지 않는다 — 후보 표의 AI 요약 칸과 같은 이유(읽는 것이 곧 나가 있는 글이다). */}
        <span className="block min-w-0 text-xs text-tertiary max-md:mt-0.5">{place.features || ''}</span>

        {/* 후보 표와 같은 자리, 같은 칩(`AdminTypeChip`). */}
        <div className="flex items-center max-md:mt-1">
          <AdminTypeChip type={place.type} />
        </div>

        {/*
          * 사유를 고르는 중이어도 **칸은 남긴다.** 자식 하나가 사라지면 grid 가 열을 하나 덜 세어
          * 그 줄만 다른 자리에서 시작한다 — 머리글과 어긋난 줄은 읽는 사람을 조용히 틀리게 만든다.
          */}
        <div className="flex items-center max-md:mt-2 md:justify-end">
          {state.archiving ? null : archived ? (
              askingRestore || busy === 'restoring' ? (
                <div className="flex flex-col gap-0.5 md:items-end">
                  <span className="text-xs text-tertiary md:text-right">사이트에 다시 보여요. 되살릴까요?</span>
                  <div className="flex items-center gap-3">
                  <Button
                    color="link-color"
                    size="sm"
                    className={ROW_LINK}
                    isDisabled={Boolean(busy)}
                    isLoading={busy === 'restoring'}
                    onClick={() => {
                      setAskingRestore(false);
                      onRestore();
                    }}
                  >
                    {busy === 'restoring' ? '되살리는 중…' : '되살리기'}
                  </Button>
                  <Button color="link-gray" size="sm" className={ROW_LINK} isDisabled={Boolean(busy)} onClick={() => setAskingRestore(false)}>
                    취소
                  </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  {!blocksUnavailable && (
                    <Button color="link-gray" size="sm" className={ROW_LINK} isDisabled={Boolean(busy)} onClick={onStartBlock}>
                      블랙리스트
                    </Button>
                  )}
                  <Button color="link-color" size="sm" className={ROW_LINK} isDisabled={Boolean(busy)} onClick={() => setAskingRestore(true)}>
                    되살리기(게시중으로)
                  </Button>
                </div>
              )
            ) : (
              /*
               * 초안에 '올리기' 버튼을 두지 않는다. `restorePlace` 를 그대로 쓰면 두 가지가 조용히 틀린다 —
               * 지역 형식 검사(`leadProblem` 의 `regionUsable`)를 건너뛰어 Studio 에서 만든 행이 '기타' 로 게시되고,
               * `archive_note` 에 내린 적 없는 행의 `되살림` 이 적힌다. 제대로 막으면 이 칸에는 지역을 고칠 자리가
               * 없어 막다른 패널이 된다 — 초안을 올리는 길은 '확인할 장소' 의 승인이다(→ docs/todo/06 「열린 것」 F).
               */
              /*
               * **회색 텍스트 버튼이다**(2026-09-30 v2 회색 보조 → 줄 안은 텍스트로). 86줄 전부에 빨간 테두리 `내리기` 가 서 있던 동안 표 전체가 경고처럼 보였다.
               * 되돌릴 수 없는 순간(사유를 고른 뒤의 확인 버튼)만 빨강이다.
               */
              <Button
                color="link-gray"
                size="sm"
                className={ROW_LINK}
                isDisabled={Boolean(busy)}
                onClick={onStartArchive}
            >
              내리기
            </Button>
          )}
        </div>
      </div>

      {/* 결과·오류는 열에 끼우지 않는다 — 줄 전체 폭을 쓰는 편이 읽힌다(그리드 밖이라 열도 흔들지 않는다). */}
      {state.done && <p className="px-4 pb-2 text-xs text-success-primary">{state.done}</p>}
      {expanded && (
        <AdminPagePlaceDetail
          place={place}
          badges={badges}
          onEditAddress={archived || state.editingAddress || busy ? undefined : onStartEditAddress}
        />
      )}
      {expanded && reports.length > 0 && (
        <AdminPagePlaceReports
          reports={reports}
          busy={busy === 'reports'}
          canArchive={!archived && !state.archiving && !busy}
          onHandle={onHandleReports}
          onArchive={onArchiveFromReport}
        />
      )}
      {expanded && state.editingAddress && (
        <AdminPagePlaceAddressForm
          place={place}
          busy={busy === 'savingAddress'}
          onSave={onSaveAddress}
          onCancel={onCancelEditAddress}
        />
      )}
      {state.error && <p className="px-4 pb-2 text-xs text-error-primary">{state.error}</p>}

      {state.archiving && (
        <AdminPagePlaceArchiveForm
          wasDraft={place.status === 'draft'}
          busy={busy === 'archiving'}
          initialReason={state.archiveReason}
          onCancel={onCancelArchive}
          onSubmit={onArchive}
        />
      )}

      {/*
        * 등록 해제 칸의 블랙리스트 넣기·바꾸기(09 T1.4 단계 4). 고르는 즉시 쓴다 — 기간 하나 고르는 일에 확인 버튼을 또 두지 않는다.
        * 바꾸면 열린 행을 풀고 새로 건다(`setPlaceBlock`).
        */}
      {archived && state.pickingBlock && (
        <div className={cx(ADMIN_PANEL_DIVIDER, 'flex flex-wrap items-center gap-1.5 px-4 py-3')}>
          <span className="text-xs font-semibold text-secondary">블랙리스트를</span>
          {(['none', 'months3', 'forever'] as const).map((choice) => (
            <Button
              key={choice}
              size="sm"
              color="secondary"
              isDisabled={Boolean(busy)}
              isLoading={busy === 'blocking'}
              onClick={() => onSetBlock(choice)}
            >
              {choice === 'none' ? (block ? '풀기' : '없음') : BLOCK_CHOICE_LABEL[choice]}
            </Button>
          ))}
          <Button color="link-gray" size="sm" isDisabled={Boolean(busy)} onClick={onCancelBlock}>
            취소
          </Button>
          <span className="basis-full text-xs text-tertiary">
            블랙리스트에 있는 동안 이 가게를 쓴 새 글은 후보가 되지 않아요. 없으면 새 글이 ‘등록 해제된 가게의 새 글’ 로 검수 대기에 올라와요.
          </span>
        </div>
      )}
    </li>
  );
}
