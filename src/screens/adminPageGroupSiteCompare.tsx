'use client';

import { Badge } from '../components/base/badges';
import type { TCandidateGroup, TPlaceRow } from '../lib/adminCandidates';
import { withProposal, type TProposal } from '../lib/adminProposal';
import { siteCompareRows } from '../lib/adminSiteCompare';
import { cx } from '../utils/cx';
import { AdminSourceChip, SOURCE_TONE } from './adminSource';

/**
 * 갱신·보강 묶음의 **세 칸 비교**(docs/todo/11 T1.3) — 항목 · 지금 사이트 · 글들이 말한 것 · 나갈 값.
 *
 * 신규 묶음의 비교표(`AdminPageGroupDetail`)는 건드리지 않고 **그 위에 따로** 선다 — 그 표는 `원문 ↔ 나갈 값` 이고 이쪽은
 * "사이트에 이미 있는 것" 이 기준이라 읽는 방향이 다르다. 한 표에 칸을 하나 더 꽂으면 신규 묶음에서는 그 칸이 늘 비어 있다.
 * 글들이 말한 것은 **글마다 한 줄**(날짜 · 제목 · 값), 새 글이 위다. 같은 칸에 글들이 다른 말을 하면 줄 머리에 `글마다 달라요`.
 */
/** 비교표 줄 → 제안 칸(조건 원문·판단은 한 제안이다). */
const proposalFieldOf = (key: string) => (key === 'pet_policy' ? 'pet_policy_text' : key);

export function AdminPageGroupSiteCompare({ group, place, proposal = null }: { group: TCandidateGroup; place: TPlaceRow; proposal?: TProposal | null }) {
  // 제안이 있으면 나갈 값은 제안 값이다(11 T2.2) — 덮어쓰기의 전·후 목록·쓰기와 같은 `withProposal`.
  const lead = proposal ? { ...group.lead, extracted: withProposal(group.lead.extracted, proposal, place) } : group.lead;
  const rows = siteCompareRows(place, group.rows, lead);
  if (!rows.length) return null;
  return (
    <div className="overflow-hidden rounded-lg border border-secondary bg-secondary text-xs">
      <p className="px-3 py-1.5 font-semibold text-secondary">
        사이트와 대 보기 — 지금 사이트 · 글들이 말한 것 · {proposal ? '제안' : '승인하면 나갈 값'}
      </p>
      {/* 제안 한 줄 요약. 갱신 묶음인데 제안이 없으면 머리 칩(`제안 없음`)이 말한다 — 여기서 빈 자리를 초록으로 채우지 않는다. */}
      {proposal?.summary && <p className="px-3 pb-1.5 text-tertiary">제안: {proposal.summary}</p>}
      <div className="hidden border-t border-secondary text-[0.6875rem] font-semibold text-tertiary md:grid md:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)]">
        <span className="px-3 py-1.5">항목</span>
        <span className="border-l border-secondary bg-primary px-3 py-1.5">지금 사이트</span>
        <span className={cx('flex items-center gap-1.5 border-l px-3 py-1.5', SOURCE_TONE.blog.surface, SOURCE_TONE.blog.border)}>
          <AdminSourceChip source="blog" /> 글들이 말한 것
        </span>
        <span className={cx('flex items-center gap-1.5 border-l px-3 py-1.5', SOURCE_TONE.ai.surface, SOURCE_TONE.ai.border)}>
          <AdminSourceChip source="ai" /> {proposal ? '제안' : '나갈 값'}
        </span>
      </div>
      <div className="divide-y divide-secondary border-t border-secondary">
        {rows.map((row) => (
          <div key={row.key} className="grid md:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="px-3 py-2 font-semibold text-secondary">
              {row.label}
              {row.conflict && (
                <Badge type="color" size="sm" color="warning" className="mt-1 block w-fit">
                  글마다 달라요
                </Badge>
              )}
            </div>
            <div className="min-w-0 bg-primary px-3 py-2 whitespace-pre-line text-secondary md:border-l md:border-secondary">
              <span className="mb-1 block text-tertiary md:hidden">지금 사이트</span>
              {row.site}
            </div>
            <div className={cx('min-w-0 px-3 py-2 md:border-l', SOURCE_TONE.blog.surface, SOURCE_TONE.blog.border)}>
              <span className="mb-1 block md:hidden">
                <AdminSourceChip source="blog" suffix="글들이 말한 것" />
              </span>
              {row.voices.length ? (
                <ul className="space-y-1.5">
                  {row.voices.map((voice) => (
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
                <span className="text-quaternary">글에 없어요</span>
              )}
              {row.latestNote && <p className="mt-1 text-warning-primary">{row.latestNote}</p>}
            </div>
            <div className={cx('min-w-0 px-3 py-2 whitespace-pre-line md:border-l', SOURCE_TONE.ai.surface, SOURCE_TONE.ai.border)}>
              <span className="mb-1 block md:hidden">
                <AdminSourceChip source="ai" suffix="나갈 값" />
              </span>
              <span className={row.changed ? 'font-semibold text-primary' : 'text-tertiary'}>{row.changed ? row.next : '그대로'}</span>
              {proposal?.fields[proposalFieldOf(row.key)]?.why && (
                <p className="mt-1 text-tertiary">{proposal.fields[proposalFieldOf(row.key)]?.why}</p>
              )}
              {/* 완화(더 쉬워짐)는 틀리면 손님이 거절당한다 — 기본 체크가 꺼지고 이 한마디가 선다(11 U6). */}
              {row.loosenHint && <p className="mt-1 font-semibold text-warning-primary">{row.loosenHint}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
