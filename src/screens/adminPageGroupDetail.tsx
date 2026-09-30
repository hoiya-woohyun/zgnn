'use client';

import type { ReactNode } from 'react';
import { Badge } from '../components/base/badges';
import { addressView } from '../lib/adminAddress';
import { factsLine, FACTS_EMPTY, type TCandidateGroup, type TPolicyPreview } from '../lib/adminCandidates';
import { PLACE_STATUS_COLOR, PLACE_STATUS_LABEL } from '../lib/adminPlaces';
import { policyLine } from '../lib/adminPreview';
import { verifyView } from '../lib/adminVerify';
import { AdminAddressLine } from './adminAddressLine';

type TAdminPageGroupDetailProps = {
  group: TCandidateGroup;
  preview: TPolicyPreview;
  /**
   * 고치기 폼이 열려 있는가. 열려 있으면 **그 폼이 소유한 칸을 여기서 지운다** — 주소·홈페이지·소개·조건 원문·동반 조건이
   * 그것이다. 지우는 이유는 자리가 아니라 뜻이다: 같은 값이 한 화면에 두 번 있으면(위는 저장된 값, 아래는 초안)
   * 어느 쪽이 지금 값인지 화면이 말해 주지 않는다. 남는 것은 폼에 없는 **근거**뿐이다 —
   * 교차점검 · 합쳐질 기존 장소 · 블로그 글과 인용.
   */
  editing?: boolean;
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
 * 동반 조건 박스는 **결론이 먼저**다 — 사이트에 실제로 보일 동반 조건 한 줄. 그것을 만든 재료(기본 규칙 / AI)는 접어 두고,
 * 둘이 어긋날 때만 펼친 채로 연다. 어긋나는 자리가 곧 "정규화가 잘 됐는가" 의 실측이라서다(reviewCandidates.mjs:68-69).
 */
export function AdminPageGroupDetail({ group, preview, editing = false }: TAdminPageGroupDetailProps) {
  const extracted = group.lead.extracted;
  const matched = group.lead.places;
  /*
   * 주소 한 줄은 **어디서 온 주소인지**부터 말한다(`adminAddress.ts`). 예전에는 네이버가 준 주소와 원글 주소를
   * 견주기만 했는데, 그 대조는 축에 따라 순환이다 — 주소→좌표 축의 주소는 원글 주소에서 나온 것이라
   * '같다' 가 나와도 확인한 것이 없다. 검증은 상호 검색 축 하나뿐이고, 화면이 그것을 구별해 적는다.
   */
  const address = addressView(extracted);
  const verify = verifyView(extracted.verify);
  const facts = factsLine(preview.facts);
  // `AI [(판단 없음)]` 과 `AI [—]` 는 글자만 다르고 운영자가 읽는 뜻이 같다 — 한 문구로 합친다.
  // 센티넬을 리터럴로 적지 않는다(`adminCandidates.ts` 의 패리티 주석이 지배하는 값이다).
  const aiLine = !facts || facts === FACTS_EMPTY ? 'AI 가 읽은 동반 조건이 없어요' : facts;

  return (
    <div className="space-y-3 border-t border-dashed border-tertiary px-4 py-3">
      <div className="space-y-1.5">
        {!editing && (
          <>
            <Row label="주소">
              <AdminAddressLine view={address} />
            </Row>
            {/*
              * 홈페이지 카드 — 승인하면 사이트 상세에 그대로 나간다. 사진을 **작게라도 보여 주는** 이유: 업체 사이트의 og:image 는
              * 로고·배너일 때가 많아 사람이 보고 빼야 한다('고치기' 의 홈페이지 사진 칸을 비운다). 못 받으면 접는다.
              */}
            <Row label="홈페이지">
              {extracted.homepage ? (
                <span className="flex items-start gap-2">
                  {extracted.homepage.image && (
                    <img
                      src={extracted.homepage.image}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={(event) => event.currentTarget.remove()}
                      className="h-12 w-[5.75rem] shrink-0 rounded bg-secondary object-cover"
                    />
                  )}
                  <span className="min-w-0">
                    <a className="break-all text-brand-secondary underline" href={extracted.homepage.url} target="_blank" rel="noopener noreferrer">
                      {extracted.homepage.siteName ?? extracted.homepage.url}
                    </a>
                    {!extracted.homepage.image && <span className="block text-tertiary">사진 없음 — 사진 없는 카드로 나가요</span>}
                  </span>
                </span>
              ) : (
                '—'
              )}
            </Row>
            {/* 값이 없어도 줄을 지우지 않는다 — Row 의 규칙이고 이 줄만 어기고 있었다. `??` 가 아니라 `||` 다(AI 는 '' 로도 준다). */}
            <Row label="소개">{extracted.features || '소개 문장이 없어요'}</Row>
            <Row label="조건 원문">{extracted.petPolicyText ?? '동반 조건 문장이 없어요'}</Row>
          </>
        )}
        {/*
          * 교차점검 줄은 **점검했을 때만** 그린다 — 미점검에 '—' 를 적으면 `Row` 의 규칙(값이 없어도 줄을 지우지 않는다)과
          * 어긋나 보이지만, 여기서 지켜야 할 것은 그 규칙이 아니라 "안 본 것을 봤다고 하지 않는다" 다.
          * 조건 문장이 있는 후보는 애초에 점검 대상이 아니므로(`needsDogCheck`) 줄이 없는 것이 정상이다.
          */}
        {verify && (
          <Row label="교차점검">
            {verify.label}
            {extracted.verify?.why && <span className="mt-0.5 block text-tertiary">{extracted.verify.why}</span>}
            {extracted.verify?.quote && (
              <span className="mt-1 block border-l-2 border-secondary pl-2.5 text-tertiary">
                {extracted.verify.quote}
              </span>
            )}
          </Row>
        )}
      </div>

      {/* 동반 조건 상자도 폼이 소유한다 — 폼의 '사이트에 이렇게 나가요' 가 **초안**으로 같은 것을 그린다. */}
      {!editing && (
        <div className="rounded-lg bg-secondary px-3 py-2 text-xs">
          <p className="font-semibold text-secondary">사이트에 보일 동반 조건</p>
          <p className="mt-1 text-tertiary">{policyLine(preview, extracted.petPolicyText)}</p>
          {/*
            * 세 줄 중 결론은 `mergedBadges` 하나뿐이다 — `places.ts` 가 사용자 화면용 정책을 **같은 병합**으로 만든다.
            * 나머지 둘이 일을 하는 순간은 둘이 어긋날 때고, 그때 기본 펼침으로 연다.
            * 다만 **실내 조건이 갈릴 때만 열린다** — `previewPolicy` 가 그 표식을 `indoor` 에만 낸다
            * (`reviewCandidates.mjs:82`). 무게·리드줄·요금이 갈려도 접힌 채이므로, 그것까지 열려면 그 파일을 고쳐야 한다.
            * `includes('AI≠정규식')` 은 절대 안 맞는다 — 보간 문자열이라 `startsWith` 여야 한다(빌드·테스트는 초록인 채 기능만 죽는다).
            */}
          <details
            className="mt-2"
            open={preview.flags.some((flag) => flag.startsWith('AI≠정규식')) || preview.corrections.length > 0}
          >
            {/* 마우스로 누르는 화면이라 터치 바닥(44px)을 두지 않는다 — 검수 화면은 크기 축을 기준값에 못 박았다(styles/adminDensity.css). */}
            <summary className="flex min-h-6 cursor-pointer items-center text-xs text-tertiary">
              어떻게 읽었는지 보기
            </summary>
            <ul className="mt-1 space-y-0.5 text-xs text-tertiary">
              <li>기본 규칙이 읽은 것: {preview.regexBadges.join(' · ') || '—'}</li>
              <li>AI 가 읽은 것: {aiLine}</li>
              {preview.corrections.map((note) => (
                <li key={note}>원문에 없어 뺀 것: {note}</li>
              ))}
            </ul>
          </details>
        </div>
      )}

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
