'use client';

import { Checkbox } from '../components/base/checkbox';
import type { TEditChange } from '../lib/adminEdit';
import { cx } from '../utils/cx';
import { AdminSourceChip, SOURCE_TONE, type TSource } from './adminSource';

/**
 * 고치기 전·후 목록 — **"무엇이었는데 → 무엇으로"** 를 한 줄씩. 펼친 상세(`AI 가 뽑은 값 → 지금 값`)와
 * 고치기 폼(`지금 값 → 저장하면`)이 같은 컴포넌트를 쓴다. 두 자리의 모양이 다르면 같은 손질이 저장 전후로
 * 다른 말처럼 읽힌다.
 *
 * 전 값은 취소선 + 붉은 바탕, 후 값은 굵게 + 초록 바탕이다. 색만으로 가르지 않는다(취소선·화살표가 같은 말을 한다) —
 * 이 화면의 운영자가 색을 못 가려도 "무엇이 지워졌나" 는 읽혀야 한다.
 */
export function AdminChangeList({
  title,
  changes,
  source,
  selectable,
  badges,
}: {
  title: string;
  changes: TEditChange[];
  /** 이 목록의 '후' 값이 누구의 말인가. 주면 그 목소리의 바탕과 칩을 쓴다(`adminSource.tsx`) — 새 분석 값이면 AI. */
  source?: TSource;
  /**
   * 줄마다 체크(11 T1.4 — 덮어쓰기의 칸 고르기). 주면 줄 앞에 체크가 서고, 꺼진 줄은 흐리게 그린다.
   * 짝 칸을 함께 켜고 끄는 것은 부르는 쪽(`toggleOverwritePick`)의 일이다.
   */
  selectable?: { picked: string[]; onToggle: (key: string) => void; disabled?: boolean };
  /**
   * 칸이 아니라 **칸의 결과**로 바뀌는 사이트 배지(`placeEditBadgeShift`, todo/14 W261010.25) — 목록 끝 한 줄로 선다. 칸 수에는 세지 않는다.
   * 원문 한 줄을 고치면 손대지 않은 배지가 함께 사라지는데, 그 변화가 미리보기 칩에만 있던 동안 저장 전 요약을 읽은 사람도 몰랐다.
   */
  badges?: { gone: string[]; added: string[] };
}) {
  if (!changes.length) return null;
  return (
    <div className={cx('rounded-lg border px-3 py-2 text-xs', source ? [SOURCE_TONE[source].surface, SOURCE_TONE[source].border] : 'border-secondary bg-primary')}>
      <p className="flex flex-wrap items-center gap-1.5 font-semibold text-secondary">
        {source && <AdminSourceChip source={source} />}
        {title} <span className="font-normal text-tertiary">{changes.length}칸</span>
      </p>
      <dl className="mt-1.5 space-y-1">
        {changes.map((change) => (
          <div
            key={change.key}
            className={cx('grid gap-x-2 gap-y-0.5 md:grid-cols-[7rem_minmax(0,1fr)]', selectable && !selectable.picked.includes(change.key) && 'opacity-50')}
          >
            <dt className="text-tertiary">
              {selectable ? (
                <Checkbox
                  size="sm"
                  label={change.label}
                  isSelected={selectable.picked.includes(change.key)}
                  isDisabled={selectable.disabled}
                  onChange={() => selectable.onToggle(change.key)}
                />
              ) : (
                change.label
              )}
            </dt>
            <dd className="flex min-w-0 flex-wrap items-baseline gap-1.5">
              <del className="rounded bg-error-primary px-1.5 py-px whitespace-pre-line text-error-primary">{change.before}</del>
              <span aria-hidden="true" className="text-quaternary">
                →
              </span>
              <ins className="rounded bg-success-primary px-1.5 py-px font-semibold whitespace-pre-line text-success-primary no-underline">
                {change.after}
              </ins>
            </dd>
          </div>
        ))}
        {badges && (badges.gone.length > 0 || badges.added.length > 0) && (
          <div className="grid gap-x-2 gap-y-0.5 border-t border-secondary pt-1 md:grid-cols-[7rem_minmax(0,1fr)]">
            <dt className="font-semibold text-warning-primary">사이트 배지</dt>
            <dd className="flex min-w-0 flex-wrap items-baseline gap-1.5">
              {badges.gone.length > 0 && <del className="rounded bg-error-primary px-1.5 py-px text-error-primary">{badges.gone.join(' · ')}</del>}
              {badges.gone.length > 0 && badges.added.length > 0 && (
                <span aria-hidden="true" className="text-quaternary">
                  →
                </span>
              )}
              {badges.added.length > 0 && (
                <ins className="rounded bg-success-primary px-1.5 py-px font-semibold text-success-primary no-underline">{badges.added.join(' · ')}</ins>
              )}
              {/* 한쪽뿐이면 화살표 대신 말로 — 빈 칸 표기('(비어 있음)')를 세우면 배지가 '비어 있음' 으로 바뀌는 것처럼 읽힌다. */}
              {badges.added.length === 0 && <span className="text-warning-primary">사라져요</span>}
              {badges.gone.length === 0 && <span className="text-tertiary">생겨요</span>}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
