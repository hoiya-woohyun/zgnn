'use client';

import type { ReactNode } from 'react';
import { Badge } from '../components/base/badges';
import { addressView } from '../lib/adminAddress';
import { factsLine, FACTS_EMPTY, type TCandidateGroup, type TPolicyPreview } from '../lib/adminCandidates';
import { aiEdits } from '../lib/adminEdit';
import { policySplit } from '../lib/adminPreview';
import { verifyView } from '../lib/adminVerify';
import type { TBadgeTone, TPetBadge } from '../lib/petPolicy';
import { cx } from '../utils/cx';
import { AdminAddressLine } from './adminAddressLine';
import { AdminChangeList } from './adminChangeList';
import { AdminSourceChip, SOURCE_TONE } from './adminSource';

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
    <blockquote className="border-l-2 border-quaternary pl-2.5 whitespace-pre-line text-primary">{text}</blockquote>
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
  /** 원문 칸. **없으면 한 칸으로 합친다** — 소개·홈페이지는 블로그 원문이 따로 없어서 왼쪽이 늘 같은 안내문이었다. */
  source?: ReactNode;
  result: ReactNode;
  edited?: boolean;
}) {
  /*
   * 칸이 **바탕색을 갖는다** — 원문 칸은 흰 종이, 나갈 값 칸은 AI 남색(`SOURCE_TONE`). 세로선 하나로만 가르던 동안
   * 두 칸의 글자가 같은 회색이라 어느 쪽을 읽는지 줄마다 머리글을 다시 봐야 했다.
   */
  return (
    <div className="grid md:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)]">
      <div className="px-3 py-2 font-semibold text-secondary">{label}</div>
      {source !== undefined && (
        <div className={cx('min-w-0 px-3 py-2 md:border-l', SOURCE_TONE.blog.surface, SOURCE_TONE.blog.border)}>
          <span className="mb-1 block md:hidden">
            <AdminSourceChip source="blog" />
          </span>
          {source}
        </div>
      )}
      <div
        className={cx(
          'min-w-0 px-3 py-2 md:border-l',
          source === undefined && 'md:col-span-2',
          SOURCE_TONE.ai.surface,
          SOURCE_TONE.ai.border,
        )}
      >
        {source !== undefined && (
          <span className="mb-1 block md:hidden">
            <AdminSourceChip source="ai" suffix="나갈 값" />
          </span>
        )}
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

/** 공백을 한 칸으로 — 인용과 조건 원문을 견줄 때만 쓴다. */
const squash = (text: string) => text.replace(/\s+/g, ' ').trim();

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
  /*
   * 나갈 주소는 **어디서 온 주소인지**부터 말한다(`adminAddress.ts`). 예전에는 전부 '네이버 검색 결과' 로 적고 원글과
   * 견주기만 했는데, 그 대조는 축에 따라 순환이다 — 주소→좌표 축의 주소는 원글 주소에서 나온 것이라
   * '같다' 가 나와도 확인한 것이 없다. 검증은 상호 검색 축 하나뿐이고, 화면이 그것을 구별해 적는다.
   */
  const addressAi = extracted.addressAi?.trim() ? extracted.addressAi : null;
  const address = addressView(extracted);
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
  const policyQuote = extracted.petPolicyText ? squash(extracted.petPolicyText) : '';

  return (
    <div className="space-y-3 text-xs">
      <AdminChangeList title="고친 내용 — AI 가 뽑은 값 → 지금 값" changes={edits} />

      {/* 머리글은 짧은 이름표 — 뜻은 `title` 이 말한다(매일 보는 운영자에게 칸마다 문장은 소음이다). */}
      <div className="overflow-hidden rounded-lg border border-secondary bg-secondary">
        <div className="hidden text-[0.6875rem] font-semibold text-tertiary md:grid md:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)]">
          <span className="px-3 py-1.5">항목</span>
          <span
            title="블로그 본문에 적힌 그대로"
            className={cx('flex items-center gap-1.5 border-l px-3 py-1.5', SOURCE_TONE.blog.surface, SOURCE_TONE.blog.border)}
          >
            <AdminSourceChip source="blog" /> 원문
          </span>
          <span
            title="승인하면 사이트에 나갈 값"
            className={cx('flex items-center gap-1.5 border-l px-3 py-1.5', SOURCE_TONE.ai.surface, SOURCE_TONE.ai.border)}
          >
            <AdminSourceChip source="ai" /> 나갈 값
          </span>
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
                <AdminAddressLine view={address} />
                {!extracted.geo && <p className="mt-0.5 text-quaternary">좌표 없음(지도에 안 보여요)</p>}
              </>
            }
          />
          <CompareRow
            label="지역"
            source={<Quote text={regionAi} empty="원글에서 지역을 못 읽었어요" />}
            result={<p className="text-secondary">{extracted.regionRaw ?? '지역 없음 — 아래에서 골라 주세요'}</p>}
          />
          {/* 소개·홈페이지는 블로그 원문이 없다 — 왼쪽이 늘 같은 안내문이던 줄이라 한 칸으로 합쳤다(다와풀빌라가 두 화면을 먹던 주된 이유). */}
          <CompareRow
            label="소개"
            edited={editedKeys.has('features')}
            // `??` 가 아니라 `||` 다(AI 는 '' 로도 준다).
            result={<p className="whitespace-pre-line text-secondary">{extracted.features || '소개 문장이 없어요'}</p>}
          />
          {/*
            * 홈페이지 카드 — 승인하면 사이트 상세에 그대로 나간다. 사진을 **작게라도 보여 주는** 이유: 업체 사이트의 og:image 는
            * 로고·배너일 때가 많아 사람이 보고 빼야 한다('고치기' 의 홈페이지 사진 칸을 비운다). 못 받으면 접는다.
            */}
          <CompareRow
            label="홈페이지"
            edited={editedKeys.has('homepageUrl') || editedKeys.has('homepageImage')}
            result={
              extracted.homepage ? (
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
                <span className="text-quaternary">없음</span>
              )
            }
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

      {/* 합쳐질 기존 장소는 결정 레일의 맨 위 줄이 말한다(`AdminPageGroupActions`) — 누를 버튼 바로 위라야 읽힌다. */}
      {/*
        * 블로그 글 — **흰 종이 한 장**으로 묶는다. 인용은 본문 문장 그대로라 원문 목소리지만, 어느 문장을 짚을지는 AI 가 골랐다 —
        * 그 사실은 머리의 한 줄이 말하고 문장 자체는 원문 색으로 둔다(말을 지어낸 것이 아니므로).
        */}
      {/*
        * 상자를 두르지 않는다 — 판 안에 카드를 또 얹던 것을 걷었다(테두리는 비교표 한 겹). 인용에 대한 설명은 `title` 로 갔다.
        * 동반 조건 원문 칸에 이미 나온 문장은 인용에서 뺀다 — 같은 문장이 한 화면에 두 번 서 있었다(다와풀빌라).
        */}
      <section>
        <p
          className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-secondary"
          title="인용은 본문 문장 그대로예요 · 어느 문장을 짚을지는 AI 가 골랐어요"
        >
          <AdminSourceChip source="blog" suffix={`수집한 글 ${group.rows.length}건`} />
        </p>
        <ul className="mt-2 divide-y divide-secondary">
          {group.rows.map((row) => (
            <li key={row.id} className="py-2 text-xs first:pt-0 last:pb-0">
              {row.post_url ? (
                <a
                  className="font-semibold text-brand-secondary underline"
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
              {(row.extracted.evidence ?? []).filter((quote) => !policyQuote || !policyQuote.includes(squash(quote))).map((quote, index) => (
                <blockquote
                  key={index}
                  className="mt-1.5 border-l-2 border-quaternary pl-2.5 text-xs whitespace-pre-line text-primary"
                >
                  {quote}
                </blockquote>
              ))}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
