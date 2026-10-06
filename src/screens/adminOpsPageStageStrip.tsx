'use client';

import type { THealth, TStageHealth, TStageKey } from '../lib/adminOpsHealth';
import { cx } from '../utils/cx';

/** 상태점 — 칠한 점이라 `*-solid`. 원시 색값은 쓰지 않는다(CLAUDE.md 「색은 시맨틱 토큰으로만」). */
const DOT: Record<THealth, string> = {
  ok: 'bg-success-solid',
  warn: 'bg-warning-solid',
  fail: 'bg-error-solid',
  none: 'bg-quaternary',
};

/** 칸 바탕 — 정상·기록 없음은 흰 카드, 주의·실패만 띠와 같은 연한 바탕이다(초록 바탕은 매번 뜨는 칸에 쓰기에 센 색이다). */
const CARD: Record<THealth, string> = {
  ok: 'bg-primary',
  none: 'bg-primary',
  warn: 'bg-warning-primary',
  fail: 'bg-error-primary',
};

const REASON: Record<THealth, string> = {
  ok: 'text-tertiary',
  none: 'text-tertiary',
  warn: 'text-warning-primary',
  fail: 'text-error-primary',
};

/** 읽는 중에 자리를 잡는 이름 — `stageHealth` 의 순서와 같다. */
const LOADING_LABELS = ['수집', '분석', '검수', '반영', '재빌드'] as const;

/**
 * ① 파이프라인 다섯 칸(features/ops-dashboard.md ①) — 장치가 도는 순서(수집 → 분석 → 검수 → 반영 → 재빌드).
 * 칸마다 네 줄: 상태점+이름 · 첫째 수(마지막) · 둘째 수(쌓인 것) · 판정 이유(주의·실패일 때만, 할 명령이 있으면 함께).
 *
 * **높이를 못 박는다**(`h-32`) — 로딩 때 `…` 로 자리를 먼저 잡고, 이유 줄이 있는 칸과 없는 칸이 섞여도 줄이 뛰지 않게.
 * 넘치는 줄은 자른다(전부는 칸에 `title` 로).
 * 좁은 화면에서는 줄바꿈하지 않고 **가로로 민다**(칸 최소 폭 고정) — 다섯 칸이 두 줄로 접히면 "순서" 가 안 읽힌다.
 *
 * 칸을 누르면 ③ 실행 기록이 그 스크립트로 걸러진다(`STAGE_SCRIPTS`). 재빌드 칸은 `rebuild_log` 라 걸러 볼 실행 기록이 없어 누를 수 없다.
 * 검수 칸의 점은 **속이 빈 고리**다(○) — 사람 몫이라 장치의 상태와 같은 무게로 보이지 않게(features ① 표).
 */
export function AdminOpsPageStageStrip({
  stages,
  active,
  onSelect,
}: {
  /** null 이면 읽는 중 — 다섯 자리를 `…` 로 잡는다 */
  stages: readonly TStageHealth[] | null;
  /** 지금 실행 기록을 걸러 보고 있는 칸 */
  active: TStageKey | null;
  onSelect?: (key: TStageKey) => void;
}) {
  const shown: readonly (TStageHealth | null)[] = stages ?? [null, null, null, null, null];
  return (
    <ol className="flex gap-2 overflow-x-auto px-4 pb-1 md:px-6" aria-label="파이프라인 다섯 칸">
      {shown.map((stage, index) => {
        const key = stage?.key ?? (`loading-${index}` as const);
        const state: THealth = stage?.state ?? 'none';
        const clickable = Boolean(stage && onSelect && stage.key !== 'rebuild');
        const body = (
          <>
            <span className="flex items-center gap-1.5 text-sm font-semibold text-primary">
              <span
                aria-hidden="true"
                className={cx(
                  'size-2 shrink-0 rounded-full',
                  stage?.key === 'review' ? cx('border-2 bg-transparent', state === 'warn' ? 'border-fg-warning-primary' : 'border-fg-quaternary') : DOT[state],
                )}
              />
              {stage?.label ?? LOADING_LABELS[index]}
            </span>
            <span className="mt-1.5 block truncate text-xs text-secondary tabular-nums">{stage?.first ?? '…'}</span>
            <span className="block truncate text-xs text-tertiary tabular-nums">{stage?.second ?? ''}</span>
            {stage?.reason ? (
              <span className={cx('mt-1 line-clamp-2 text-xs font-semibold', REASON[state])}>
                {stage.reason}
                {stage.hint ? <code className="ml-1 font-normal">{stage.hint}</code> : null}
              </span>
            ) : null}
          </>
        );
        const card = cx(
          // 버튼은 내용을 세로 가운데로 띄운다 — 이유 줄이 없는 칸만 내려앉아 칸끼리 첫 줄이 어긋난다. 위로 붙인다.
          'flex h-32 w-full flex-col justify-start rounded-lg border border-secondary p-3 text-left',
          CARD[state],
          active === stage?.key && 'shadow-[inset_0_0_0_2px_var(--color-border-brand)]',
        );
        const title = stage ? [stage.label, stage.first, stage.second, stage.reason, stage.hint].filter(Boolean).join(' · ') : undefined;
        return (
          <li key={key} className="min-w-40 flex-1">
            {clickable ? (
              <button
                type="button"
                title={title}
                aria-pressed={active === stage?.key}
                onClick={() => stage && onSelect?.(stage.key)}
                className={cx(card, 'hover:border-tertiary')}
              >
                {body}
              </button>
            ) : (
              <div title={title} className={card}>
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
