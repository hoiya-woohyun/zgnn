'use client';

import type { ReactNode } from 'react';
import { factsLine, type TCandidateGroup, type TPolicyPreview } from '../lib/adminCandidates';

type TAdminPageGroupDetailProps = {
  group: TCandidateGroup;
  preview: TPolicyPreview;
};

/** 이름표 + 내용 한 줄. 값이 없으면 '—' 를 쓴다 — 줄이 사라지면 "AI 가 안 뽑은 것" 과 "내가 못 본 것" 이 구별되지 않는다. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="w-16 shrink-0 text-tertiary">{label}</span>
      <span className="min-w-0 flex-1 whitespace-pre-line text-secondary">{children}</span>
    </div>
  );
}

/**
 * 펼친 카드의 내용 — 사람이 "맞다/아니다" 를 정하는 데 필요한 것 전부.
 *
 * 원문(`petPolicyText`)과 본문 인용(`evidence`)을 **보여 준다**(브리프 결정 7). 운영자 화면의 런타임 표시일 뿐이고
 * 정적 HTML·번들·로그에는 들어가지 않는다 — 판단의 근거를 가린 채 버튼만 주면 검수가 아니라 추측이 된다.
 *
 * 조건 미리보기가 세 줄인 이유: 정규식이 뭘 읽었나 · AI 가 뭘 판단했나 · **앱이 실제로 쓰는 값**이 무엇인가.
 * 셋이 어긋나는 자리가 곧 "정규화가 잘 됐는가" 의 실측이다(reviewCandidates.mjs:68-69).
 */
export function AdminPageGroupDetail({ group, preview }: TAdminPageGroupDetailProps) {
  const extracted = group.lead.extracted;
  const matched = group.lead.places;
  const addressAi = extracted.addressAi && extracted.addressAi !== extracted.address ? extracted.addressAi : null;

  return (
    <div className="space-y-4 border-t border-secondary px-4 py-4">
      <div className="space-y-1.5">
        <Row label="주소">
          {extracted.address ?? '—'}
          {addressAi && <span className="text-tertiary"> (AI: {addressAi})</span>}
        </Row>
        {extracted.features && <Row label="소개">{extracted.features}</Row>}
        <Row label="원문">{extracted.petPolicyText ?? '조건 문장이 없어요'}</Row>
      </div>

      <div className="rounded-xl bg-secondary px-3 py-2.5 text-sm">
        <p className="font-semibold text-secondary">조건: {preview.level}</p>
        <ul className="mt-1 space-y-0.5 text-tertiary">
          <li>정규식 [{preview.regexBadges.join(', ') || '—'}]</li>
          <li>AI [{factsLine(preview.facts) ?? '—'}]</li>
          <li>앱 [{preview.mergedBadges.join(', ') || '—'}]</li>
        </ul>
      </div>

      {matched && (
        <div className="text-sm">
          <span className="text-tertiary">짝지은 기존 장소 </span>
          {matched.status === 'published' ? (
            <a className="font-semibold text-brand-secondary underline" href={`/place/${matched.id}/`}>
              {matched.name}
            </a>
          ) : (
            <span className="font-semibold text-secondary">
              {matched.name} ({matched.status})
            </span>
          )}
        </div>
      )}

      <div>
        <p className="text-sm font-semibold text-secondary">원글 {group.rows.length}건</p>
        <ul className="mt-2 space-y-3">
          {group.rows.map((row) => (
            <li key={row.id} className="text-sm">
              {row.post_url ? (
                <a
                  className="text-brand-secondary underline"
                  href={row.post_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {row.blog_posts?.title ?? row.post_url}
                </a>
              ) : (
                <span className="text-tertiary">글 링크가 없어요</span>
              )}
              {row.blog_posts && (
                <p className="mt-0.5 text-xs text-tertiary">
                  {row.blog_posts.posted_at} · 검색어 {row.blog_posts.keyword}
                </p>
              )}
              {(row.extracted.evidence ?? []).map((quote, index) => (
                <blockquote
                  key={index}
                  className="mt-1.5 border-l-2 border-secondary pl-2.5 text-xs whitespace-pre-line text-tertiary"
                >
                  {quote}
                </blockquote>
              ))}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
