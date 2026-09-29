'use client';

import { ChevronDown } from '@untitledui/icons';
import { Badge } from '../components/base/badges';
import { Button } from '../components/base/button';
import { Select } from '../components/base/select';
import {
  regionUsable,
  REGION_OPTIONS,
  TIER_LABEL,
  TYPE_LABEL,
  type TCandidateGroup,
  type TPolicyPreview,
  type TRejectReason,
} from '../lib/adminCandidates';
import type { TSimilarPlace } from '../lib/adminApply';
import { isPlaceType, TYPE_COLOR, typeTint } from '../lib/places';
import { cx } from '../utils/cx';
import { AdminPageGroupDetail } from './adminPageGroupDetail';
import { AdminPageRejectForm } from './adminPageRejectForm';

/** 묶음 하나의 화면 상태. 소유자는 `adminPage.tsx` 고 여기는 받아서 그린다. */
export type TAdminPageGroupState = {
  busy?: 'approving' | 'rejecting' | 'savingRegion';
  /** 끝난 묶음의 초록 한 줄. 이 값이 있으면 카드는 접힌 한 줄만 남는다. */
  done?: string;
  error?: string;
  /** 0.4~0.85 구간 — 사람이 합칠지 새로 만들지 고른다. */
  similar?: TSimilarPlace;
  rejecting?: boolean;
  /** '지역 고르기' 셀렉트의 현재 선택. */
  regionDraft?: string;
};

export type TApproveChoice = { asNew?: boolean; mergeInto?: string };

type TAdminPageGroupCardProps = {
  group: TCandidateGroup;
  preview: TPolicyPreview;
  flags: string[];
  state: TAdminPageGroupState;
  expanded: boolean;
  onToggle: () => void;
  onApprove: (choice?: TApproveChoice) => void;
  onStartReject: () => void;
  onCancelReject: () => void;
  onReject: (reason: TRejectReason, note: string) => void;
  onPickRegion: (regionRaw: string) => void;
  onSaveRegion: (regionRaw: string) => void;
};

/** 표식마다 색을 다르게. 회색이 기본이고, **반영을 막거나 뜻을 뒤집는** 것만 눈에 띄게 한다. */
const FLAG_COLOR: Record<string, 'gray' | 'warning' | 'error'> = {
  '지역 없음': 'warning',
  '짝 없음': 'warning',
  '동반불가 문장': 'error',
};

const TIER_COLOR: Record<string, 'success' | 'warning' | 'blue'> = {
  auto: 'success',
  ask: 'warning',
  new: 'blue',
};

const BUSY_LABEL: Record<NonNullable<TAdminPageGroupState['busy']>, string> = {
  approving: '올리고 있어요…',
  rejecting: '반려하고 있어요…',
  savingRegion: '저장하고 있어요…',
};

/**
 * 후보 묶음 한 장. 접힌 줄만으로 "올릴지 말지" 의 대부분이 판단되게 한다 —
 * 이름·종류·구간·지역·표식·조건 수준이 그 줄에 있고, 근거(원문·인용·원글)는 펼쳐야 나온다.
 */
export function AdminPageGroupCard({
  group,
  preview,
  flags,
  state,
  expanded,
  onToggle,
  onApprove,
  onStartReject,
  onCancelReject,
  onReject,
  onPickRegion,
  onSaveRegion,
}: TAdminPageGroupCardProps) {
  const extracted = group.lead.extracted;
  const matchedName = group.lead.places?.name;
  const busy = state.busy;

  // 끝난 묶음은 초록 한 줄로 접힌다. 3초 뒤 목록에서 사라지므로 그 사이의 확인용이다.
  if (state.done) {
    return (
      <li className="rounded-2xl border border-secondary bg-success-primary px-4 py-3 text-sm text-success-primary">
        {state.done}
      </li>
    );
  }

  const typeTone = isPlaceType(extracted.type)
    ? { background: typeTint(extracted.type, 14), color: TYPE_COLOR[extracted.type] }
    : undefined;

  const regionOk = regionUsable(extracted.regionRaw);

  return (
    <li className="overflow-hidden rounded-2xl border border-secondary bg-primary">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex min-h-11 w-full items-start gap-2 px-4 py-3 text-left hover:bg-primary_hover"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-md font-bold text-primary">{extracted.name || '(이름 없음)'}</span>
            <span
              className={cx(
                'rounded-md px-1.5 py-0.5 text-xs font-medium',
                !typeTone && 'bg-secondary text-tertiary',
              )}
              style={typeTone}
            >
              {TYPE_LABEL[extracted.type] ?? extracted.type}
            </span>
            <Badge type="color" size="sm" color={TIER_COLOR[group.tier] ?? 'gray'}>
              {TIER_LABEL[group.tier] ?? group.tier}
              {group.tier !== 'new' && matchedName ? ` → ${matchedName}` : ''}
            </Badge>
            {flags.map((flag) => (
              <Badge key={flag} type="color" size="sm" color={FLAG_COLOR[flag] ?? 'gray'}>
                {flag}
              </Badge>
            ))}
          </span>
          <span className="mt-1 block text-xs text-tertiary">
            {extracted.regionRaw ?? '지역?'} · 조건: {preview.level} · 앱 [{preview.mergedBadges.join(', ') || '—'}] · 글{' '}
            {group.rows.length}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cx('mt-0.5 size-5 shrink-0 text-fg-quaternary transition-transform', expanded && 'rotate-180')}
        />
      </button>

      {expanded && <AdminPageGroupDetail group={group} preview={preview} />}

      {expanded && state.rejecting ? (
        <AdminPageRejectForm busy={busy === 'rejecting'} onCancel={onCancelReject} onSubmit={onReject} />
      ) : (
        expanded && (
          <div className="border-t border-secondary px-4 py-4">
            {state.similar ? (
              /*
               * 0.4~0.85 구간. 코드가 정하면 어느 쪽이든 조용히 틀린다 — 합치면 오병합, 새로 만들면 이웃 가게의 중복이다.
               * 그래서 닮은 이유(reason)를 그대로 보여 주고 사람이 고른다.
               */
              <div>
                <p className="text-sm text-secondary">
                  비슷한 기존 장소가 있어요: <span className="font-semibold">{state.similar.name}</span> (
                  {state.similar.confidence.toFixed(2)})
                </p>
                <p className="mt-0.5 text-xs text-tertiary">{state.similar.reason}</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Button
                    color="primary"
                    size="lg"
                    className="sm:flex-1"
                    isDisabled={Boolean(busy)}
                    isLoading={busy === 'approving'}
                    onClick={() => onApprove({ mergeInto: state.similar?.id })}
                  >
                    여기에 합치기
                  </Button>
                  <Button
                    color="secondary"
                    size="lg"
                    className="sm:flex-1"
                    isDisabled={Boolean(busy)}
                    onClick={() => onApprove({ asNew: true })}
                  >
                    새 장소로
                  </Button>
                </div>
                {/*
                 * 이 갈래에도 '아니에요' 가 있어야 한다. 0.4~0.85 는 애매한 것이 모이는 구간이라 목록글·홍보글이 그대로 여기 오는데,
                 * 둘 중 하나를 고르는 길만 두면 **반려하려면 새로고침**해야 한다 — `similar` 를 지우는 길이 성공한 승인뿐이어서다.
                 */}
                <Button
                  color="secondary"
                  size="lg"
                  className="mt-2 w-full"
                  isDisabled={Boolean(busy)}
                  onClick={onStartReject}
                >
                  아니에요
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {regionOk ? (
                  <Button
                    color="primary"
                    size="lg"
                    className="w-full"
                    isDisabled={Boolean(busy)}
                    isLoading={busy === 'approving'}
                    onClick={() => onApprove()}
                  >
                    맞아요, 장소로 올리기
                  </Button>
                ) : (
                  /*
                   * 지역이 없으면 반영을 막는다 — 읍·면 칩이 비고 상세 헤더가 '기타' 가 되기 때문이다.
                   * 선택지는 기존 86곳이 쓰는 표기뿐이다(새 표기를 만들면 그 장소 혼자 다른 칩을 단다).
                   */
                  <div className="rounded-xl bg-secondary px-3 py-3">
                    <p className="text-sm text-secondary">지역이 없어 아직 올릴 수 없어요. 하나 골라 주세요.</p>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <Select
                        aria-label="지역 고르기"
                        /* `sm` 만 `min-h-11` 을 갖는다(select-shared.tsx) — 옆의 h-11 '저장' 과 높이를 맞추고 터치 타깃을 지킨다. */
                        size="sm"
                        placeholder="지역 고르기"
                        selectedKey={state.regionDraft ?? null}
                        onSelectionChange={(key) => key && onPickRegion(String(key))}
                        isDisabled={Boolean(busy)}
                        className="sm:flex-1"
                      >
                        {REGION_OPTIONS.map((option) => (
                          <Select.Item key={option} id={option}>
                            {option}
                          </Select.Item>
                        ))}
                      </Select>
                      <Button
                        color="primary"
                        size="lg"
                        isDisabled={Boolean(busy) || !state.regionDraft}
                        isLoading={busy === 'savingRegion'}
                        onClick={() => state.regionDraft && onSaveRegion(state.regionDraft)}
                      >
                        저장
                      </Button>
                    </div>
                  </div>
                )}

                <Button
                  color="secondary"
                  size="lg"
                  className="w-full"
                  isDisabled={Boolean(busy)}
                  onClick={onStartReject}
                >
                  아니에요
                </Button>

                {group.tier !== 'new' && regionOk && (
                  /* 짝이 잘못 붙은 경우 — 사람이 짝을 비우는 대신 여기서 신규로 보낸다(CLI 의 match_place_id 비우기와 같은 뜻). */
                  <Button
                    color="link-color"
                    size="md"
                    className="h-11"
                    isDisabled={Boolean(busy)}
                    onClick={() => onApprove({ asNew: true })}
                  >
                    새 장소로 올리기
                  </Button>
                )}
              </div>
            )}

            {busy && <p className="mt-2 text-sm text-tertiary">{BUSY_LABEL[busy]}</p>}
            {state.error && <p className="mt-2 text-sm text-error-primary">{state.error}</p>}
          </div>
        )
      )}

      {/* 접힌 상태에서도 방금 실패한 것은 보여야 한다 — 펼치지 않으면 왜 안 됐는지 알 수 없다. */}
      {!expanded && state.error && <p className="px-4 pb-3 text-sm text-error-primary">{state.error}</p>}
    </li>
  );
}
