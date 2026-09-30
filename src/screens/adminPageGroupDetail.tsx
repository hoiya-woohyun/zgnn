'use client';

import type { ReactNode } from 'react';
import { Badge } from '../components/base/badges';
import { sameAddress } from '../lib/addressMatch';
import { factsLine, FACTS_EMPTY, type TCandidateGroup, type TPolicyPreview } from '../lib/adminCandidates';
import { aiEdits } from '../lib/adminEdit';
import { PLACE_STATUS_COLOR, PLACE_STATUS_LABEL } from '../lib/adminPlaces';
import { policySplit } from '../lib/adminPreview';
import { verifyView } from '../lib/adminVerify';
import type { TBadgeTone, TPetBadge } from '../lib/petPolicy';
import { cx } from '../utils/cx';
import { AdminChangeList } from './adminChangeList';

type TAdminPageGroupDetailProps = {
  group: TCandidateGroup;
  preview: TPolicyPreview;
};

const POLICY_TONE: Record<TBadgeTone, string> = {
  ok: 'bg-secondary text-secondary',
  cond: 'bg-secondary text-secondary',
  warn: 'bg-warning-primary text-warning-primary',
};

function Chips({ label, items }: { label: string; items: TPetBadge[] }) {
  if (!items.length) return null;
  return (
    <span className="flex flex-wrap items-center gap-1">
      <span className="w-14 shrink-0 text-tertiary">{label}</span>
      {items.map((item) => (
        <span key={item.label} className={cx('rounded px-1.5 py-px font-medium', POLICY_TONE[item.tone])}>
          {item.label}
        </span>
      ))}
    </span>
  );
}

/** 원문 칸의 인용 모양. 비었으면 **왜 비었는지** 말한다 — 줄이 사라지면 "AI 가 안 뽑은 것" 과 "내가 못 본 것" 이 구별되지 않는다. */
function Quote({ text, empty }: { text: string | null | undefined; empty: string }) {
  return text?.trim() ? (
    <blockquote className="border-l-2 border-brand pl-2.5 whitespace-pre-line text-secondary">{text}</blockquote>
  ) : (
    <span className="text-quaternary">{empty}</span>
  );
}

/**
 * 비교표 한 줄 — **항목 · 원문(블로그에 적힌 것) · 사이트에 나갈 값.** 운영자가 한 줄에서 "원문이 이런데 이렇게 나간다" 를 읽는다.
 * `edited` 면 나갈 값 쪽에 `고침` 표시가 붙는다 — AI 가 뽑은 값이 무엇이었는지는 표 위의 「고친 내용」 이 말한다.
 */
function CompareRow({
  label,
  source,
  result,
  edited = false,
}: {
  label: string;
  source: ReactNode;
  result: ReactNode;
  edited?: boolean;
}) {
  return (
    <div className="grid gap-1 py-2 md:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)] md:gap-0 md:py-0 md:[&>*]:py-2 md:[&>*+*]:border-l md:[&>*+*]:border-secondary md:[&>*+*]:px-3">
      <div className="font-semibold text-secondary">{label}</div>
      <div className="min-w-0">
        <span className="mb-0.5 block text-[0.6875rem] text-quaternary md:hidden">원문</span>
        {source}
      </div>
      <div className="min-w-0">
        <span className="mb-0.5 block text-[0.6875rem] text-quaternary md:hidden">사이트에 나갈 값</span>
        {edited && (
          <Badge type="color" size="sm" color="brand" className="mb-1">
            고침
          </Badge>
        )}
        {result}
      </div>
    </div>
  );
}

/**
 * 펼친 카드의 내용 — 사람이 "맞다/아니다" 를 정하는 데 필요한 것 전부.
 *
 * **모양은 비교표다**(2026-09-30). 그 전에는 `주소 · 소개 · 조건 원문` 이 이름표 한 줄씩 쌓이고 `사이트에 보일 동반 조건`
 * 이 아래 따로 떠 있어서, "원문에는 무엇이 적혀 있고 사이트에는 무엇으로 나가나" 를 운영자가 두 자리를 오가며 맞춰야 했다
 * (사용자 지적: 원문과 바꾸려는 것이 일목요연하지 않다). 이제 한 줄이 한 항목이고 왼쪽이 원문, 오른쪽이 나갈 값이다.
 * 사람이 고친 후보면 표 위에 **AI 가 뽑은 값 → 지금 값** 목록이 붙는다(`aiEdits` — 처음 고칠 때 떠 둔 스냅샷).
 *
 * 원문(`petPolicyText`)과 본문 인용(`evidence`)을 **보여 준다**(브리프 결정 7). 운영자 화면의 런타임 표시일 뿐이고
 * 정적 HTML·번들·로그에는 들어가지 않는다 — 판단의 근거를 가린 채 버튼만 주면 검수가 아니라 추측이 된다.
 *
 * 동반 조건 줄의 나갈 값은 **결론이 먼저**다 — 사이트에 실제로 보일 칩. 그것을 만든 재료(기본 규칙 / AI)는 접어 두고,
 * 둘이 어긋날 때만 펼친 채로 연다. 어긋나는 자리가 곧 "정규화가 잘 됐는가" 의 실측이라서다(reviewCandidates.mjs:68-69).
 */
export function AdminPageGroupDetail({ group, preview }: TAdminPageGroupDetailProps) {
  const extracted = group.lead.extracted;
  const matched = group.lead.places;
  /*
   * 두 주소를 **문자열로** 비교하던 자리다. 실측 43쌍 중 40쌍이 표기 차이뿐이어서(`addressMatch.ts`) 경보가
   * 늘 켜져 있었고, 그래서 정말 다른 1쌍을 아무도 보지 않았다. 이제 갈래가 셋이다 —
   * 같으면 조용히 두고, 비교 불가(지번↔도로명)는 참고로 적고, **다를 때만** 경보로 적는다.
   */
  const addressAi = extracted.addressAi?.trim() ? extracted.addressAi : null;
  const addressVerdict = addressAi ? sameAddress(extracted.address, addressAi) : 'same';
  const verify = verifyView(extracted.verify);
  const facts = factsLine(preview.facts);
  // `AI [(판단 없음)]` 과 `AI [—]` 는 글자만 다르고 운영자가 읽는 뜻이 같다 — 한 문구로 합친다.
  // 센티넬을 리터럴로 적지 않는다(`adminCandidates.ts` 의 패리티 주석이 지배하는 값이다).
  const aiLine = !facts || facts === FACTS_EMPTY ? 'AI 가 읽은 동반 조건이 없어요' : facts;
  const policy = policySplit(preview, extracted.petPolicyText);
  const edits = aiEdits(extracted);
  const editedKeys = new Set(edits.map((change) => change.key));
  const policyEdited = edits.some((change) => change.policy || change.key === 'petPolicyText');
  const regionAi = extracted.regionRawAi?.trim() ? extracted.regionRawAi : null;

  return (
    <div className="space-y-3 border-t border-dashed border-tertiary px-4 py-3 text-xs">
      <AdminChangeList title="고친 내용 — AI 가 뽑은 값 → 지금 값" changes={edits} />

      <div className="rounded-lg border border-secondary bg-primary px-3">
        <div className="hidden text-[0.6875rem] font-semibold text-tertiary md:grid md:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)] md:[&>*]:py-1.5 md:[&>*+*]:border-l md:[&>*+*]:border-secondary md:[&>*+*]:px-3">
          <span>항목</span>
          <span>원문 — 블로그에 적힌 것</span>
          <span>사이트에 나갈 값</span>
        </div>
        <div className="divide-y divide-secondary md:border-t md:border-secondary">
          <CompareRow
            label="동반 조건"
            edited={policyEdited}
            source={<Quote text={extracted.petPolicyText} empty="본문에 동반 조건 문장이 없어요" />}
            result={
              <div className="space-y-1">
                {policy.message ? (
                  <p className="text-tertiary">{policy.message}</p>
                ) : (
                  <>
                    <Chips label="조건" items={policy.condition} />
                    <Chips label="요금" items={policy.fee} />
                    <Chips label="장비" items={policy.gear} />
                  </>
                )}
                {preview.corrections.map((note) => (
                  <p key={note} className="text-warning-primary">
                    원문에 없어 뺀 것: {note}
                  </p>
                ))}
                {/*
                  * 결론은 `mergedBadges` 하나뿐이다 — `places.ts` 가 사용자 화면용 정책을 **같은 병합**으로 만든다.
                  * 재료 둘이 일을 하는 순간은 둘이 어긋날 때고, 그때 기본 펼침으로 연다.
                  * 다만 **실내 조건이 갈릴 때만 열린다** — `previewPolicy` 가 그 표식을 `indoor` 에만 낸다
                  * (`reviewCandidates.mjs:82`). 무게·리드줄·요금이 갈려도 접힌 채이므로, 그것까지 열려면 그 파일을 고쳐야 한다.
                  * `includes('AI≠정규식')` 은 절대 안 맞는다 — 보간 문자열이라 `startsWith` 여야 한다(빌드·테스트는 초록인 채 기능만 죽는다).
                  */}
                <details open={preview.flags.some((flag) => flag.startsWith('AI≠정규식'))}>
                  {/* 마우스로 누르는 화면이라 터치 바닥(44px)을 두지 않는다 — 검수 화면은 크기 축을 기준값에 못 박았다(styles/adminDensity.css). */}
                  <summary className="flex min-h-6 cursor-pointer items-center text-tertiary">어떻게 읽었는지 보기</summary>
                  <ul className="mt-1 space-y-0.5 text-tertiary">
                    <li>기본 규칙이 읽은 것: {preview.regexBadges.join(' · ') || '—'}</li>
                    <li>AI 가 읽은 것: {aiLine}</li>
                  </ul>
                </details>
              </div>
            }
          />
          <CompareRow
            label="주소"
            edited={editedKeys.has('address') || editedKeys.has('geo')}
            source={<Quote text={addressAi} empty="원글에 주소가 없어요" />}
            result={
              <>
                <p className="text-secondary">{extracted.address ?? '주소가 없어요'}</p>
                <p className="mt-0.5 text-quaternary">네이버 검색 결과{extracted.geo ? '' : ' · 좌표 없음(지도에 안 보여요)'}</p>
                {addressVerdict === 'different' && (
                  <p className="mt-0.5 font-semibold text-warning-primary">
                    원글과 다른 주소예요 — 검색이 동명의 다른 가게를 집었을 수 있어요
                  </p>
                )}
                {/* 지번↔도로명이라 코드가 답할 수 없다. 색도 굵기도 주지 않는다 — 여기서 경보를 울리면 옛 상태로 돌아간다. */}
                {addressVerdict === 'unknown' && <p className="mt-0.5 text-tertiary">표기 방식이 달라 같은 곳인지 비교할 수 없어요</p>}
              </>
            }
          />
          <CompareRow
            label="지역"
            source={<Quote text={regionAi} empty="원글에서 지역을 못 읽었어요" />}
            result={<p className="text-secondary">{extracted.regionRaw ?? '지역 없음 — 아래에서 골라 주세요'}</p>}
          />
          <CompareRow
            label="소개"
            edited={editedKeys.has('features')}
            source={<span className="text-quaternary">AI 가 본문을 요약한 문장이에요 — 본문은 아래 블로그 글에서 봐 주세요</span>}
            // `??` 가 아니라 `||` 다(AI 는 '' 로도 준다).
            result={<p className="whitespace-pre-line text-secondary">{extracted.features || '소개 문장이 없어요'}</p>}
          />
          {/*
            * 교차점검 줄은 **점검했을 때만** 그린다 — 여기서 지켜야 할 것은 "안 본 것을 봤다고 하지 않는다" 다.
            * 조건 문장이 있는 후보는 애초에 점검 대상이 아니므로(`needsDogCheck`) 줄이 없는 것이 정상이다.
            */}
          {verify && (
            <CompareRow
              label="교차점검"
              source={<Quote text={extracted.verify?.quote} empty="근거 문장을 못 찾았어요" />}
              result={
                <>
                  <p className="font-semibold text-secondary">{verify.label}</p>
                  {extracted.verify?.why && <p className="mt-0.5 text-tertiary">{extracted.verify.why}</p>}
                </>
              }
            />
          )}
        </div>
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
        <p className="text-xs font-semibold text-secondary">
          원문 — 블로그 글 {group.rows.length}건 <span className="font-normal text-tertiary">· 인용은 AI 가 근거로 짚은 문장</span>
        </p>
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
