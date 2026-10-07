'use client';

import type { ReactNode } from 'react';
import { Badge } from '../components/base/badges';
import { addressView } from '../lib/adminAddress';
import { factsLine, FACTS_EMPTY, type TCandidateGroup, type TPlaceRow, type TPolicyPreview } from '../lib/adminCandidates';
import { correctionView } from '../lib/adminCorrection';
import { aiEdits } from '../lib/adminEdit';
import { policySplit, typeMismatchFlags } from '../lib/adminPreview';
import { verifyView } from '../lib/adminVerify';
import type { TBadgeTone, TPetBadge } from '../lib/petPolicy';
import { environmentPhrases } from '../lib/stayEnvironmentView';
import type { TTextSpan } from '../lib/textSpans';
import { cx } from '../utils/cx';
import { AdminAddressLine } from './adminAddressLine';
import { AdminChangeList } from './adminChangeList';
import { AdminSourceChip, SOURCE_TONE } from './adminSource';
import { AdminMarkedSpans } from './adminMarkedSpans';
import { ADMIN_VERIFY_TEXT } from './adminTable';

type TAdminPageGroupDetailProps = {
  group: TCandidateGroup;
  preview: TPolicyPreview;
  /**
   * 짝지은 장소의 지금 행. 있으면 표에 **짱구누나** 칸이 선다(블로그 원문 · 짱구누나 · AI 정리 — 아래 사이트 비교 분석과 같은 순서).
   * 신규 묶음에는 사이트에 아직 아무것도 없어 칸째로 안 그린다(늘 빈 칸이 된다).
   */
  place?: TPlaceRow;
};

const GRID = 'md:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)]';
const GRID_WITH_SITE = 'md:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]';
const SITE_LABEL = '짱구누나 · 지금 사이트';

/** 짱구누나 칸의 값. 비었으면 빈 칸이라고 말한다 — 승인하면 채워지는 자리다. */
const SiteText = ({ text }: { text: string | null | undefined }) =>
  text?.trim() ? <p className="whitespace-pre-line text-secondary">{text}</p> : <span className="text-quaternary">사이트에 없어요</span>;

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

/**
 * 원문 칸의 인용 모양. 비었으면 **왜 비었는지** 말한다 — 줄이 사라지면 "AI 가 안 뽑은 것" 과 "내가 못 본 것" 이 구별되지 않는다.
 * `spans` 가 오면 그 조각대로 칠한다(06 G — 보정이 대 본 원문의 말). 조각을 이으면 `text` 그대로다(`spansOf`).
 */
function Quote({ text, empty, spans }: { text: string | null | undefined; empty: string; spans?: TTextSpan[] }) {
  return text?.trim() ? (
    <blockquote className="border-l-2 border-quaternary pl-2.5 whitespace-pre-line text-primary">
      {spans ? <AdminMarkedSpans spans={spans} /> : text}
    </blockquote>
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
  site,
  result,
  edited = false,
}: {
  label: string;
  /** 원문 칸. **없으면 한 칸으로 합친다** — 소개·홈페이지는 블로그 원문이 따로 없어서 왼쪽이 늘 같은 안내문이었다. */
  source?: ReactNode;
  /** 짱구누나 칸(짝 장소의 지금 값). `undefined` 면 칸이 없는 표다(신규 묶음) — 그때는 지금까지의 두 칸 그대로. */
  site?: ReactNode;
  result: ReactNode;
  edited?: boolean;
}) {
  /*
   * 칸이 **바탕색을 갖는다** — 원문 칸은 흰 종이, 나갈 값 칸은 AI 남색(`SOURCE_TONE`). 세로선 하나로만 가르던 동안
   * 두 칸의 글자가 같은 회색이라 어느 쪽을 읽는지 줄마다 머리글을 다시 봐야 했다.
   */
  return (
    <div className={cx('grid', site !== undefined ? GRID_WITH_SITE : GRID)}>
      <div className="px-3 py-2 font-semibold text-secondary">{label}</div>
      {/* 짱구누나 칸이 서는 표에서는 원문 없는 줄도 블로그 칸을 비워 둔다 — 칸을 합치면 짱구누나 칸이 줄마다 다른 자리에 선다. */}
      {source === undefined && site !== undefined && (
        <div className={cx('min-w-0 px-3 py-2 text-quaternary max-md:hidden md:border-l', SOURCE_TONE.blog.surface, SOURCE_TONE.blog.border)}>—</div>
      )}
      {source !== undefined && (
        <div className={cx('min-w-0 px-3 py-2 md:border-l', SOURCE_TONE.blog.surface, SOURCE_TONE.blog.border)}>
          <span className="mb-1 block md:hidden">
            <AdminSourceChip source="blog" />
          </span>
          {source}
        </div>
      )}
      {site !== undefined && (
        <div className="min-w-0 px-3 py-2 md:border-l md:border-secondary">
          <span className="mb-1 block text-tertiary md:hidden">{SITE_LABEL}</span>
          {site}
        </div>
      )}
      <div
        className={cx(
          'min-w-0 px-3 py-2 md:border-l',
          source === undefined && site === undefined && 'md:col-span-2',
          SOURCE_TONE.ai.surface,
          SOURCE_TONE.ai.border,
        )}
      >
        {(source !== undefined || site !== undefined) && (
          <span className="mb-1 block md:hidden">
            <AdminSourceChip source="ai" suffix={site !== undefined ? undefined : '나갈 값'} />
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
export function AdminPageGroupDetail({ group, preview, place }: TAdminPageGroupDetailProps) {
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
  // 보정이 원문의 무엇과 대 봤는지 — 같은 원문 문자열(`petPolicyText`)에 다시 돌려 칠한다(인덱스를 넘겨받지 않는다).
  const correction = correctionView(extracted.petPolicyText, preview.dropped);
  const edits = aiEdits(extracted);
  const editedKeys = new Set(edits.map((change) => change.key));
  const policyEdited = edits.some((change) => change.policy || change.key === 'petPolicyText');
  const regionAi = extracted.regionRawAi?.trim() ? extracted.regionRawAi : null;
  // 짝이 없으면 전부 `undefined` — 줄마다 `site` 가 빠져 두 칸 표가 된다.
  const siteOf = (node: ReactNode) => (place ? node : undefined);
  const siteFacts = place ? factsLine(place.pet_policy ?? null) : null;
  const policyQuote = extracted.petPolicyText ? squash(extracted.petPolicyText) : '';
  const category = extracted.category?.trim() ?? '';
  /*
   * 엇갈림 한 마디는 **카테고리가 있을 때만** 이 줄에 붙인다. `typeMismatchFlags` 는 카테고리가 비면 소개 문장으로 판정하는데,
   * 그때 '없음' 옆에 "엇갈려요" 를 적으면 없는 카테고리가 엇갈린다고 말하게 된다(표식 자체는 장소 칸 뱃지가 그대로 말한다).
   */
  const categoryMismatch = category !== '' && typeMismatchFlags(extracted).length > 0;

  return (
    <div className="space-y-3 text-xs">
      <AdminChangeList title="고친 내용 — AI 가 뽑은 값 → 지금 값" changes={edits} />

      {/* 머리글은 짧은 이름표 — 뜻은 `title` 이 말한다(매일 보는 운영자에게 칸마다 문장은 소음이다). */}
      <div className="overflow-hidden rounded-lg border border-secondary bg-secondary">
        <div className={cx('hidden text-[0.6875rem] font-semibold text-tertiary md:grid', place ? GRID_WITH_SITE : GRID)}>
          <span className="px-3 py-1.5">항목</span>
          <span
            title="블로그 본문에 적힌 그대로"
            className={cx('flex items-center gap-1.5 border-l px-3 py-1.5', SOURCE_TONE.blog.surface, SOURCE_TONE.blog.border)}
          >
            <AdminSourceChip source="blog" /> 원문
          </span>
          {place && <span className="border-l border-secondary px-3 py-1.5">{SITE_LABEL}</span>}
          <span
            title={place ? 'AI 가 이 글에서 읽은 값 — 무엇을 바꿀지는 아래 사이트 비교 분석에서 골라요' : '승인하면 사이트에 나갈 값'}
            className={cx('flex items-center gap-1.5 border-l px-3 py-1.5', SOURCE_TONE.ai.surface, SOURCE_TONE.ai.border)}
          >
            <AdminSourceChip source="ai" /> {place ? null : '나갈 값'}
          </span>
        </div>
        <div className="divide-y divide-secondary md:border-t md:border-secondary">
          <CompareRow
            label="동반 조건"
            edited={policyEdited}
            source={
              <Quote
                text={extracted.petPolicyText}
                empty="본문에 동반 조건 문장이 없어요"
                spans={correction.lines.length ? correction.spans : undefined}
              />
            }
            site={siteOf(
              <>
                <SiteText text={place?.pet_policy_text} />
                {siteFacts && siteFacts !== FACTS_EMPTY && <p className="mt-1 text-tertiary">{siteFacts}</p>}
              </>,
            )}
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
                {/*
                  * 색만으로 말하지 않는다 — 원문 인용에 칠한 말을 이 줄이 글로 다시 적고, 칠할 것이 없으면(근거 단어가 원문에 없다)
                  * 없는 말을 적는다. 칠한 곳 없는 인용만 남으면 "원문엔 문제가 없다" 로 읽힌다.
                  */}
                {correction.lines.map((line) => (
                  <div key={line.note} className="text-warning-primary">
                    <p>원문에 없어 뺀 것: {line.note}</p>
                    {line.found.length > 0 && <p className="text-tertiary">원문에서 대 본 곳(칠함): {line.found.join(' · ')}</p>}
                    {line.missing && <p className="text-tertiary">원문에 없는 말: {line.missing}</p>}
                  </div>
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
            site={siteOf(<SiteText text={place?.address} />)}
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
            site={siteOf(<SiteText text={place?.region_raw} />)}
            result={<p className="text-secondary">{extracted.regionRaw ?? '지역 없음 — 아래에서 골라 주세요'}</p>}
          />
          {/*
            * 네이버 카테고리(todo/13 T4.6) — 종류 엇갈림 뱃지가 선 묶음에서 운영자가 종류를 정할 근거다. 승인하면 장소의 `category` 로 나간다
            * (새 장소는 그대로 · 짝이 있으면 그 칸이 빌 때만 — `mergeIntoExisting`).
            * 블로그 원문이 없는 값이라 소개·홈페이지처럼 한 칸이다.
            */}
          <CompareRow
            label="카테고리"
            site={siteOf(<SiteText text={place?.category} />)}
            result={
              <p className="text-secondary">
                {category || '없음'}
                {categoryMismatch && <span className="ml-1.5 text-warning-primary">종류 칩과 엇갈려요</span>}
              </p>
            }
          />
          {/* 소개·홈페이지는 블로그 원문이 없다 — 왼쪽이 늘 같은 안내문이던 줄이라 한 칸으로 합쳤다(다와풀빌라가 두 화면을 먹던 주된 이유). */}
          <CompareRow
            label="소개"
            edited={editedKeys.has('features')}
            site={siteOf(<SiteText text={place?.features} />)}
            // `??` 가 아니라 `||` 다(AI 는 '' 로도 준다).
            result={<p className="whitespace-pre-line text-secondary">{extracted.features || '소개 문장이 없어요'}</p>}
          />
          {/* 숙소 환경(10 F6) — 숙소일 때만. 판정에는 안 쓰고 숙소 필터·상세의 한 줄로만 나간다. */}
          {extracted.type === 'stay' && (
            <CompareRow
              label="숙소 환경"
              site={siteOf(<SiteText text={environmentPhrases(place?.stay_environment ?? undefined).join(' · ')} />)}
              result={
                <p className="text-secondary">
                  {environmentPhrases(extracted.stayEnvironment ?? undefined).join(' · ') || '원글에 환경 문장이 없어요(사이트는 소개 문장에서 읽어요)'}
                </p>
              }
            />
          )}
          {/*
            * 홈페이지 카드 — 승인하면 사이트 상세에 그대로 나간다. 사진을 **작게라도 보여 주는** 이유: 업체 사이트의 og:image 는
            * 로고·배너일 때가 많아 사람이 보고 빼야 한다('고치기' 의 홈페이지 사진 칸을 비운다). 못 받으면 접는다.
            */}
          <CompareRow
            label="홈페이지"
            edited={editedKeys.has('homepageUrl') || editedKeys.has('homepageImage')}
            site={siteOf(<SiteText text={place?.homepage_name ?? place?.homepage_url} />)}
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
              site={siteOf(<span className="text-quaternary">—</span>)}
              result={
                <>
                  <p className={cx('font-semibold', ADMIN_VERIFY_TEXT[verify.tone])}>{verify.label}</p>
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
          {/*
            * 독립 글이 글 수보다 적으면 그 사실을 말한다(`postClusters`) — 같은 블로그거나 같은 제목 틀로 며칠 사이에 올라온 글은
            * 여러 사람의 말이 아니다(광고성 복제 글). 검수 순서·완화 제안은 이미 이 수로 센다.
            */}
          {group.independentPosts != null && group.independentPosts < group.posts.length && (
            <span className="font-normal text-warning-primary">
              비슷한 글 묶음 {group.independentPosts} — 같은 블로그·같은 제목 틀의 글은 하나로 세요
            </span>
          )}
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
              {/* 같은 자리라 한 줄로 묶인 다른 이름(`mergeSameSpotGroups`) — 올리면 대표 이름 하나로 선다. */}
              {row.extracted.name !== extracted.name && (
                <p className="mt-0.5 text-xs text-warning-primary">이 글의 가게 이름: {row.extracted.name} — 주소가 같아 한 줄로 묶었어요</p>
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
