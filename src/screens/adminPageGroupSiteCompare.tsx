'use client';

import type { ReactNode } from 'react';
import { Badge } from '../components/base/badges';
import { Checkbox } from '../components/base/checkbox';
import type { TCandidateGroup, TPlaceRow } from '../lib/adminCandidates';
import { withProposal, type TProposal } from '../lib/adminProposal';
import { EMPTY_VALUE, type TEditChange } from '../lib/adminEdit';
import { siteCompareRows, type TFieldVoice } from '../lib/adminSiteCompare';
import { cx } from '../utils/cx';
import { SOURCE_TONE } from './adminSource';

/**
 * 갱신·보강 묶음의 **사이트 비교 분석**(docs/todo/11 T1.3) — 항목 · 블로그 · 짱구누나 → 바뀔 값 · AI 제안 근거.
 *
 * **한 줄이 한 칸의 변화다**(2026-10-04 v3). 그 전에는 `지금 사이트` 와 `AI 제안` 이 따로 선 칸이고 덮을 칸의 체크 목록은 또 다른 상자여서,
 * "무엇이 무엇으로 바뀌고 그중 무엇을 고르나" 를 세 자리를 오가며 맞춰야 했다(사용자 지적). 이제 지금 값 → 바뀔 값이 **한 칸에 화살표로** 서고,
 * 줄 머리의 체크가 그 줄을 바꿀지 정한다. AI 칸은 값이 아니라 **근거**(왜 바꾸자는가)만 말한다 — 값은 화살표 칸이 이미 말했다.
 *
 * 체크·전후 값은 `overwrite` 로 받는다(`latestPlan` 의 changes — 실제 쓰기와 같은 계산). 비교 줄에 없는 칸(이름·주소·홈페이지 …)이
 * 바뀌면 표 끝에 줄을 더 세운다 — 안 그러면 안 보인 채 덮인다. `overwrite` 가 없으면(덮어쓰기가 뜻이 없는 갈래) 체크 없이 읽기만 한다.
 * 글들이 말한 것은 **글마다 한 줄**(날짜 · 제목 · 값), 새 글이 위다. 같은 칸에 글들이 다른 말을 하면 줄 머리에 `글마다 달라요`.
 */
/** 비교표 줄 → 제안 칸(조건 원문·판단은 한 제안이다). */
const proposalFieldOf = (key: string) => (key === 'pet_policy' ? 'pet_policy_text' : key);

/** 빈 칸이면 체크와 무관하게 채워지는 칸 — `mergeIntoExisting`(scripts/analyze/applyApproved.mjs)이 채우는 칸의 화면 키. */
const FILLED_WHEN_BLANK = new Set(['address', 'geo', 'region_raw', 'features', 'pet_policy_text', 'category', 'stay_price_text', 'stay_amenities_text', 'homepage_url']);

const GRID_WITH_WHY = 'md:grid-cols-[7.5rem_minmax(0,1.2fr)_minmax(0,1.3fr)_minmax(0,1fr)]';
const GRID_PLAIN = 'md:grid-cols-[7.5rem_minmax(0,1.2fr)_minmax(0,1.3fr)]';
const AI_CELL = cx('md:border-l', SOURCE_TONE.ai.surface, SOURCE_TONE.ai.border);

export type TAdminPageGroupSiteCompareOverwrite = {
  /** 덮어쓰면 바뀌는 칸(`latestPlan(...).changes`). */
  changes: TEditChange[];
  picked: string[];
  disabled?: boolean;
  onToggle: (key: string) => void;
  /** 머리 한마디 — 완화라 조건 체크를 꺼 두었다는 안내. */
  note?: string;
  /** 표 발치 — 이 체크를 쓰는 버튼. 체크와 한 상자라야 "고른 칸이 이 버튼으로 나간다" 가 읽힌다. */
  footer: ReactNode;
};

type TLine = {
  key: string;
  label: string;
  conflict: boolean;
  voices: TFieldVoice[] | null;
  latestNote: string | null;
  before: string;
  /** 바뀔 값. 그대로면 null. */
  after: string | null;
  /** 체크로 고를 수 있는 줄인가(= 덮어쓰기 칸). */
  pickable: boolean;
  loosenHint: string | null;
};

export function AdminPageGroupSiteCompare({
  group,
  place,
  proposal = null,
  overwrite,
}: {
  group: TCandidateGroup;
  place: TPlaceRow;
  proposal?: TProposal | null;
  overwrite?: TAdminPageGroupSiteCompareOverwrite;
}) {
  // 제안이 있으면 나갈 값은 제안 값이다(11 T2.2) — 덮어쓰기의 전·후 목록·쓰기와 같은 `withProposal`.
  const lead = proposal ? { ...group.lead, extracted: withProposal(group.lead.extracted, proposal, place) } : group.lead;
  const rows = siteCompareRows(place, group.rows, lead);
  const changeOf = new Map((overwrite?.changes ?? []).map((change) => [change.key, change]));
  const lines: TLine[] = [
    ...rows.map((row) => {
      const change = changeOf.get(row.key);
      // 덮어쓰기 칸이 있으면 전·후는 **그 값**이다(쓰기와 같은 계산). 없으면 읽기 전용 — 비교 줄의 값으로 화살표만 그린다.
      const after = change ? change.after : !overwrite && row.changed ? row.next : null;
      return { ...row, before: change ? change.before : row.site, after, pickable: Boolean(change) };
    }),
    ...(overwrite?.changes ?? [])
      .filter((change) => !rows.some((row) => row.key === change.key))
      .map((change) => ({ ...change, conflict: false, voices: null, latestNote: null, pickable: true, loosenHint: null })),
  ];
  if (!lines.length) return null;
  const grid = proposal ? GRID_WITH_WHY : GRID_PLAIN;
  const blogChip = (
    <Badge type="color" size="sm" color={SOURCE_TONE.blog.badge}>
      블로그
    </Badge>
  );
  const whyChip = (
    <Badge type="color" size="sm" color={SOURCE_TONE.ai.badge}>
      AI 제안 근거
    </Badge>
  );
  return (
    <div className="overflow-hidden rounded-lg border border-secondary bg-secondary text-xs">
      <p className="px-3 py-1.5 font-semibold text-secondary">
        사이트 비교 분석
        {overwrite && <span className="font-normal text-tertiary"> · 바꿀 칸을 체크하세요</span>}
      </p>
      {/* 제안 한 줄 요약. 갱신 묶음인데 제안이 없으면 머리 칩(`제안 없음`)이 말한다 — 여기서 빈 자리를 초록으로 채우지 않는다. */}
      {proposal?.summary && <p className="px-3 pb-1.5 text-tertiary">제안: {proposal.summary}</p>}
      {overwrite?.note && <p className="px-3 pb-1.5 font-semibold text-warning-primary">{overwrite.note}</p>}
      <div className={cx('hidden border-t border-secondary text-[0.6875rem] font-semibold text-tertiary md:grid', grid)}>
        <span className="px-3 py-1.5">항목</span>
        <span className={cx('flex items-center border-l px-3 py-1.5', SOURCE_TONE.blog.surface, SOURCE_TONE.blog.border)}>{blogChip}</span>
        <span className="border-l border-secondary px-3 py-1.5">짱구누나 → 바뀔 값</span>
        {proposal && <span className={cx('flex items-center px-3 py-1.5', AI_CELL)}>{whyChip}</span>}
      </div>
      <div className="divide-y divide-secondary border-t border-secondary">
        {lines.map((line) => {
          const why = proposal?.fields[proposalFieldOf(line.key)]?.why;
          const picked = line.pickable && overwrite ? overwrite.picked.includes(line.key) : true;
          return (
            <div key={line.key} className={cx('grid', grid)}>
              <div className="px-3 py-2 font-semibold text-secondary">
                {line.pickable && overwrite ? (
                  <Checkbox
                    size="sm"
                    label={line.label}
                    isSelected={picked}
                    isDisabled={overwrite.disabled}
                    onChange={() => overwrite.onToggle(line.key)}
                  />
                ) : (
                  line.label
                )}
                {line.conflict && (
                  <Badge type="color" size="sm" color="warning" className="mt-1 block w-fit">
                    글마다 달라요
                  </Badge>
                )}
              </div>
              <div className={cx('min-w-0 px-3 py-2 md:border-l', SOURCE_TONE.blog.surface, SOURCE_TONE.blog.border)}>
                <span className="mb-1 block md:hidden">{blogChip}</span>
                {line.voices?.length ? (
                  <ul className="space-y-1.5">
                    {line.voices.map((voice) => (
                      <li key={voice.rowId}>
                        <span className="block text-tertiary">
                          {voice.postedAt ?? '날짜 모름'} ·{' '}
                          {voice.url ? (
                            <a className="text-brand-secondary underline" href={voice.url} target="_blank" rel="noopener noreferrer">
                              {voice.title}
                            </a>
                          ) : (
                            voice.title
                          )}
                        </span>
                        <span className="block whitespace-pre-line text-primary">{voice.value}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  // 글이 말하는 칸이 아닌 줄(이름·주소·홈페이지 …)은 대표 후보의 분석 값이라 글마다의 말이 없다.
                  <span className="text-quaternary">{line.voices ? '글에 없어요' : '—'}</span>
                )}
                {line.latestNote && <p className="mt-1 text-warning-primary">{line.latestNote}</p>}
              </div>
              {/* 지금 값 → 바뀔 값. 전후 표기는 `AdminChangeList` 와 같다(취소선·화살표 — 색만으로 가르지 않는다). */}
              <div className="min-w-0 px-3 py-2 md:border-l md:border-secondary">
                <span className="mb-1 block text-tertiary md:hidden">짱구누나 → 바뀔 값</span>
                {line.after === null ? (
                  <p className="whitespace-pre-line text-secondary">
                    {line.before} <span className="text-quaternary">· 그대로</span>
                  </p>
                ) : (
                  <>
                    <p className={cx('flex min-w-0 flex-wrap items-baseline gap-1.5', !picked && 'opacity-50')}>
                      <del className="rounded bg-error-primary px-1.5 py-px whitespace-pre-line text-error-primary">{line.before}</del>
                      <span aria-hidden="true" className="text-quaternary">
                        →
                      </span>
                      <ins className="rounded bg-success-primary px-1.5 py-px font-semibold whitespace-pre-line text-success-primary no-underline">
                        {line.after}
                      </ins>
                    </p>
                    {/*
                      * 체크를 꺼도 **빈 칸은 채워진다** — 덮어쓰기 뒤에 `fillBlanks` 가 돌고(`approveGroup`), 그쪽은 체크를 모른다.
                      * "안 바꿔요" 라고 적으면 본 것과 쓰는 것이 어긋난다. 동반 판단은 조건 원문과 짝이라 원문 줄이 말한다.
                      */}
                    {!picked && (
                      <p className="mt-1 text-tertiary">
                        {line.before === EMPTY_VALUE && FILLED_WHEN_BLANK.has(line.key) ? '체크를 꺼도 빈 칸이라 채워져요' : '체크를 꺼서 안 바꿔요 — 지금 값 그대로'}
                      </p>
                    )}
                  </>
                )}
                {/* 완화(더 쉬워짐)는 틀리면 손님이 거절당한다 — 기본 체크가 꺼지고 이 한마디가 선다(11 U6). */}
                {line.loosenHint && <p className="mt-1 font-semibold text-warning-primary">{line.loosenHint}</p>}
              </div>
              {proposal && (
                <div className={cx('min-w-0 px-3 py-2 whitespace-pre-line text-secondary', AI_CELL)}>
                  <span className="mb-1 block md:hidden">{whyChip}</span>
                  {why ?? <span className="text-quaternary">—</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {overwrite && <div className="flex flex-wrap items-center gap-2 border-t border-secondary px-3 py-2">{overwrite.footer}</div>}
    </div>
  );
}
