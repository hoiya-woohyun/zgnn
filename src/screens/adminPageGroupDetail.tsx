'use client';

import type { ReactNode } from 'react';
import { Badge } from '../components/base/badges';
import { factsLine, FACTS_EMPTY, type TCandidateGroup, type TPolicyPreview } from '../lib/adminCandidates';
import { PLACE_STATUS_COLOR, PLACE_STATUS_LABEL } from '../lib/adminPlaces';
import { policyLine } from '../lib/adminPreview';

type TAdminPageGroupDetailProps = {
  group: TCandidateGroup;
  preview: TPolicyPreview;
};

/** 이름표 + 내용 한 줄. 값이 없으면 '—' 를 쓴다 — 줄이 사라지면 "AI 가 안 뽑은 것" 과 "내가 못 본 것" 이 구별되지 않는다. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="w-14 shrink-0 text-tertiary">{label}</span>
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
 * 조건 박스는 **결론이 먼저**다 — 사이트에 실제로 보일 조건 한 줄. 그것을 만든 재료(기본 규칙 / AI)는 접어 두고,
 * 둘이 어긋날 때만 펼친 채로 연다. 어긋나는 자리가 곧 "정규화가 잘 됐는가" 의 실측이라서다(reviewCandidates.mjs:68-69).
 */
export function AdminPageGroupDetail({ group, preview }: TAdminPageGroupDetailProps) {
  const extracted = group.lead.extracted;
  const matched = group.lead.places;
  const addressAi = extracted.addressAi && extracted.addressAi !== extracted.address ? extracted.addressAi : null;
  const facts = factsLine(preview.facts);
  // `AI [(판단 없음)]` 과 `AI [—]` 는 글자만 다르고 운영자가 읽는 뜻이 같다 — 한 문구로 합친다.
  // 센티넬을 리터럴로 적지 않는다(`adminCandidates.ts` 의 패리티 주석이 지배하는 값이다).
  const aiLine = !facts || facts === FACTS_EMPTY ? 'AI 가 읽은 조건이 없어요' : facts;

  return (
    <div className="space-y-3 border-t border-dashed border-tertiary px-4 py-3">
      <div className="space-y-1.5">
        <Row label="주소">
          {extracted.address ?? '—'}
          {addressAi && (
            <span className="mt-0.5 block text-xs text-tertiary">원글에는 다른 주소가 적혀 있어요 — {addressAi}</span>
          )}
        </Row>
        {/* 값이 없어도 줄을 지우지 않는다 — Row 의 규칙이고 이 줄만 어기고 있었다. `??` 가 아니라 `||` 다(AI 는 '' 로도 준다). */}
        <Row label="소개">{extracted.features || '소개 문장이 없어요'}</Row>
        <Row label="조건 원문">{extracted.petPolicyText ?? '조건 문장이 없어요'}</Row>
      </div>

      <div className="rounded-lg bg-secondary px-3 py-2 text-xs">
        <p className="font-semibold text-secondary">사이트에 보일 조건</p>
        <p className="mt-1 text-tertiary">{policyLine(preview, extracted.petPolicyText)}</p>
        {/*
          * 세 줄 중 결론은 `mergedBadges` 하나뿐이다 — `places.ts` 가 사용자 화면용 정책을 **같은 병합**으로 만든다.
          * 나머지 둘이 일을 하는 순간은 둘이 어긋날 때고, 그때 기본 펼침으로 연다.
          * 다만 **실내 조건이 갈릴 때만 열린다** — `previewPolicy` 가 그 표식을 `indoor` 에만 낸다
          * (`reviewCandidates.mjs:82`). 무게·리드줄·요금이 갈려도 접힌 채이므로, 그것까지 열려면 그 파일을 고쳐야 한다.
          * `includes('AI≠정규식')` 은 절대 안 맞는다 — 보간 문자열이라 `startsWith` 여야 한다(빌드·테스트는 초록인 채 기능만 죽는다).
          */}
        <details className="mt-2" open={preview.flags.some((flag) => flag.startsWith('AI≠정규식'))}>
          {/* 마우스로 누르는 화면이라 터치 바닥(44px)을 두지 않는다 — 검수 화면은 크기 축을 기준값에 못 박았다(styles/adminDensity.css). */}
          <summary className="flex min-h-6 cursor-pointer items-center text-xs text-tertiary">
            어떻게 읽었는지 보기
          </summary>
          <ul className="mt-1 space-y-0.5 text-xs text-tertiary">
            <li>기본 규칙이 읽은 것: {preview.regexBadges.join(' · ') || '—'}</li>
            <li>AI 가 읽은 것: {aiLine}</li>
          </ul>
        </details>
      </div>

      {matched && (
        <div className="text-xs">
          <span className="text-tertiary">합쳐질 기존 장소 </span>
          {matched.status === 'published' ? (
            <a className="font-semibold text-brand-secondary underline" href={`/place/${matched.id}/`}>
              {matched.name}
            </a>
          ) : (
            <>
              <span className="font-semibold text-secondary">{matched.name}</span>{' '}
              <Badge type="color" size="sm" color={PLACE_STATUS_COLOR[matched.status]}>
                {PLACE_STATUS_LABEL[matched.status]}
              </Badge>
              {/*
                * 병합 승인은 초안 대상을 **게시로 올린다**(`adminApply.ts:157`). '안 보여요' 만 적으면 그 줄과 승인 버튼이
                * 둘 다 "사이트는 안 바뀐다" 로 읽혀, 게시를 일으키는 버튼 앞에서 정반대를 말하게 된다.
                */}
              {matched.status === 'draft' && (
                <p className="mt-0.5 text-xs text-tertiary">아직 사이트에 없는 곳이에요 — 여기에 합치면 함께 게시돼요</p>
              )}
            </>
          )}
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-secondary">블로그 글 {group.rows.length}건</p>
        <ul className="mt-2 space-y-3">
          {group.rows.map((row) => (
            <li key={row.id} className="text-xs">
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
