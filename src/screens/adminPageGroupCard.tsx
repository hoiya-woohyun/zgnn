'use client';

import type { ComponentProps } from 'react';
import { ChevronDown } from '@untitledui/icons';
import { Badge } from '../components/base/badges';
import { Checkbox } from '../components/base/checkbox';
import type { TBlockChoice } from '../lib/adminBlocks';
import {
  regionUsable,
  KIND_LABEL,
  TIER_LABEL,
  type TCandidateGroup,
  type TPlaceRow,
  type TPolicyPreview,
  type TRejectReason,
} from '../lib/adminCandidates';
import type { TApplyOutcome, TSimilarPlace } from '../lib/adminApply';
import type { TPetBadge } from '../lib/petPolicy';
import { addressConflictOf, addressView, type TAddressChoice } from '../lib/adminAddress';
import { POLICY_STATE_WORD, type TAdminFlagView } from '../lib/adminPreview';
import { verifyNeedsLook, verifyView } from '../lib/adminVerify';
import { toggleOverwritePick } from '../lib/adminLatest';
import { listPolicyCell, overwriteDefault } from '../lib/adminPairPolicy';
import { LOOSEN_HINT } from '../lib/policyDirection';
import { liveProposal, proposalView } from '../lib/adminProposal';
import { groupQuote } from '../lib/adminGroupQuote';
import { cx } from '../utils/cx';
import { AdminPageGroupDetail } from './adminPageGroupDetail';
import { AdminPageGroupSiteCompare } from './adminPageGroupSiteCompare';
import { AdminTypeChip } from './adminTypeChip';
import { AdminPageGroupActions } from './adminPageGroupActions';
import { AdminSourceChip } from './adminSource';
import { ADMIN_LEAD_CELL, ADMIN_PANEL_DIVIDER, ADMIN_POLICY_TONE, ADMIN_ROW, ADMIN_ROW_CELLS, ADMIN_ROW_FAILED, ADMIN_ROW_OPEN, ADMIN_ROW_WAITING, ADMIN_VERIFY_TEXT } from './adminTable';

/** 묶음 하나의 화면 상태. 소유자는 `adminPage.tsx` 고 여기는 받아서 그린다. */
export type TAdminPageGroupState = {
  busy?: 'approving' | 'rejecting' | 'savingRegion' | 'savingEdit' | 'reanalyzing' | 'confirming' | 'requestingCollect';
  /** 끝난 묶음의 초록 한 줄. 이 값이 있으면 카드는 접힌 한 줄만 남는다. */
  done?: string;
  error?: string;
  /** 0.4~0.85 구간 — 사람이 합칠지 새로 만들지 고른다. */
  similar?: TSimilarPlace;
  /**
   * 짝지은 장소가 **내린 곳**이다 — 되살려 합치거나 반려해야 한다.
   * `similar` 와 나란히 두는 이유: 둘 다 "쓰기 전에 멈췄고 사람이 고를 차례" 라는 같은 종류의 상태다.
   */
  archived?: Extract<TApplyOutcome, { kind: 'archivedTarget' }>;
  rejecting?: boolean;
  /** '재분석' 확인이 열려 있다(`adminReanalyze.ts`). 반려와 같은 자리(결정 줄)를 쓴다. */
  reanalyzing?: boolean;
  /** '지역 고르기' 셀렉트의 현재 선택. */
  regionDraft?: string;
  /** 덮어쓰기에서 고른 칸(11 T1.4, `latestPlan` 의 change key). `undefined` 는 "안 건드림" = 바뀌는 칸 전부. */
  overwritePick?: string[];
};

export type TApproveChoice = {
  asNew?: boolean;
  mergeInto?: string | null;
  restoreArchived?: boolean;
  /** '정말 다른 가게예요' 를 눌렀다 — 내린 곳을 버리고 새로 만드는 것을 사람이 확인했다(`TApplyOptions` 참고). */
  confirmedDifferent?: boolean;
  /** '덮어쓰기' — 합치기 대신 짝지은 장소의 칸을 이 후보의 값으로 덮는다(`TApplyOptions.overwrite`). */
  overwrite?: boolean;
  /** 덮을 칸(`TApplyOptions.overwriteColumns`). 없으면 전부. */
  overwriteColumns?: string[];
};

type TAdminPageGroupCardProps = {
  group: TCandidateGroup;
  preview: TPolicyPreview;
  view: TAdminFlagView;
  state: TAdminPageGroupState;
  expanded: boolean;
  onToggle: () => void;
  onApprove: (choice?: TApproveChoice) => void;
  onStartReject: () => void;
  onCancelReject: () => void;
  onReject: (reason: TRejectReason, note: string, block: TBlockChoice) => void;
  onPickRegion: (regionRaw: string) => void;
  /** 짝 장소에 열린 `조건이 달라요` 사용자 제보 수(11 T3.2). */
  policyReports?: number;
  /** 갱신 묶음의 '사이트가 맞아요'(11 U8) — 확인 날짜를 찍고 후보를 눕힌다. */
  onConfirmSite: () => void;
  /** 덮어쓰기 칸 고르기의 체크 한 번 — 고른 칸 전체를 돌려준다. */
  onPickOverwrite: (picked: string[]) => void;
  onSaveRegion: (regionRaw: string) => void;
  /** `주소 다름` 에서 맞는 주소를 골랐다(`chooseAddress`). */
  onChooseAddress: (choice: TAddressChoice) => void;
  /** 일괄 반려용으로 골라 뒀는가. 소유자는 `adminPage.tsx` 다(`adminSelection.ts`). */
  selected: boolean;
  onSelect: (selected: boolean) => void;
  /**
   * 지금 패널이 가리키는 기존 장소 행(내린 곳 · 닮은 곳 · 짝). '덮어쓰기' 의 전·후를 그리려면 그 행의 **지금 값**이 있어야 한다.
   * 접힌 줄에도 넘어온다(목록의 동반 조건 칸이 "올리면 나갈 조건" 을 가르는 데 쓴다). 없으면(짝이 DB 에 없다) 그 버튼을 안 그린다.
   */
  pairPlace?: TPlaceRow;
  /** 재분석 확인 문장 — 형제 후보까지 세려면 목록 전체가 필요해 페이지가 만들어 넘긴다. 확인이 열렸을 때만 온다. */
  reanalyzeText?: string;
  onStartReanalyze: () => void;
  onCancelReanalyze: () => void;
  onReanalyze: () => void;
  /** 추가 수집 — 페이지가 이 가게의 마지막 요청으로 만든다(`adminCollectRequest.ts`). 요청 목록을 못 읽었으면 없다. */
  collect?: ComponentProps<typeof AdminPageGroupActions>['collect'];
  onRequestCollect?: () => void;
};

/**
 * 동반 조건 **한 칸** — 요금·장비 열을 다시 여기로 합쳤다(2026-09-30 v2). 세 칸으로 갈랐더니 21줄 중 2~3줄만 요금·장비가 차서
 * 빈 열 둘이 AI 요약의 폭을 먹고 있었다. 순서는 `toPetBadges` 가 정한 사이트 순서 그대로다(요금·장비가 제자리에 선다).
 *
 * 비었을 때는 **상태마다 다른 짧은 단어**다(`POLICY_STATE_WORD`). `문장 없음` 은 정상이라 흐리게, `못 읽음` 은 볼 일이라
 * 노란 칩으로 — 같은 회색 글씨였던 동안 두 상태가 한 상태로 읽혔다. 긴 문장은 `title` 과 펼친 상세에 있다.
 * `조건 미기재`(noLimit)도 노란 칩이다(2026-10-04) — 흐린 `제한 없음` 이던 동안 "다 된다" 로 읽혔는데, 그대로 승인하면
 * 사이트가 조건 없이 '갈 수 있어요' 로 내보낸다. 승인 전에 원문을 한 번 볼 자리다.
 */
function PolicyCell({
  items,
  state,
  message,
  blogDiffers = false,
}: {
  items: TPetBadge[];
  state: keyof typeof POLICY_STATE_WORD | 'items';
  message: string | null;
  /** 칸이 사이트의 지금 조건인데 글은 다르게 말한다 — 흐린 글씨 한마디로 남긴다(무엇이 다른지는 펼친 사이트 비교가 말한다). */
  blogDiffers?: boolean;
}) {
  return (
    <span className="flex min-w-0 flex-wrap content-start items-start gap-1 text-xs text-tertiary max-md:mt-0.5">
      {state === 'items'
        ? items.map((item) => (
            <span key={item.label} className={cx('rounded px-1.5 py-px font-medium break-keep', ADMIN_POLICY_TONE[item.tone])}>
              {item.label}
            </span>
          ))
        : (
            <span
              title={message ?? undefined}
              className={cx(state === 'noText' ? 'text-quaternary' : 'rounded bg-warning-primary px-1.5 py-px font-medium text-warning-primary')}
            >
              {POLICY_STATE_WORD[state]}
            </span>
          )}
      {blogDiffers && <span className="text-quaternary">사이트 조건 · 글은 다르게 말해요</span>}
    </span>
  );
}

/**
 * 후보 묶음 한 줄. 접힌 줄만으로 "올릴지 말지" 의 대부분이 판단되게 한다 —
 * 이름·종류·구간·지역·표식·동반 조건이 그 줄에 있고, 근거(원문·인용·원글)는 펼쳐야 나온다.
 *
 * `md` 이상에서는 머리글과 열이 맞는 **표의 한 줄**이다(`ADMIN_ROW` · `ADMIN_ROW_CELLS`). 예전에는 같은 것을
 * 두 줄로(이름줄 + 흐린 메타줄) 쌓았는데, 그러면 지역·동반 조건이 줄마다 다른 가로 위치에서 시작해
 * 눈으로 세로로 훑을 수가 없다 — 142묶음을 보는 화면에서 그 훑기가 곧 일이다.
 */
export function AdminPageGroupCard({
  group,
  preview,
  view,
  state,
  expanded,
  onToggle,
  onApprove,
  onStartReject,
  onCancelReject,
  onReject,
  onPickRegion,
  onConfirmSite,
  policyReports = 0,
  onPickOverwrite,
  onSaveRegion,
  onChooseAddress,
  selected,
  onSelect,
  pairPlace,
  reanalyzeText,
  onStartReanalyze,
  onCancelReanalyze,
  onReanalyze,
  collect,
  onRequestCollect,
}: TAdminPageGroupCardProps) {
  const extracted = group.lead.extracted;
  /** 접힌 줄의 사람 말 한 조각(09 T6.6) — 나머지 칸이 전부 AI 값이라 이것 없이는 매 줄을 펼친다. 펼치면 근거 목록이 말하므로 접힌 동안만. */
  const quote = expanded ? null : groupQuote(group);
  /*
   * 동반 조건 칸은 **올리면 나갈 조건**이다(todo/13 T2.3) — 짝 장소가 있고 조건 칸이 체크돼 있지 않으면 사이트의 지금 조건을 보여 준다.
   * 글이 읽은 조건을 그대로 두면 상세의 제안("사이트 조건 유지")과 목록이 반대를 말했다(소길스테이).
   */
  const listPolicy = listPolicyCell(group, preview, pairPlace, state.overwritePick);
  const policy = listPolicy.cell;
  const matchedName = group.lead.places?.name;
  const busy = state.busy;
  /*
   * 짝지은 장소가 내린 곳인가 — **누르기 전에** 안다. `CANDIDATE_SELECT` 의 임베딩(`places(id,name,status)`)이
   * 목록을 읽을 때 같이 와 있어서다. 이것을 접힌 줄에 띄우는 것이 요점이다: 없으면 운영자가 '맞아요' 나
   * '새 장소로 올리기' 를 눌러 본 **뒤에야** 내린 곳이라는 걸 알게 되고, 후자는 그 자리에서 복제본을 만든다.
   * 판정 자체는 이 값으로 하지 않는다 — 임베딩은 화면을 그린 시점의 snapshot 이고, 결정은 `approveGroup` 이
   * `places` 행(`placesRef`)으로 한다.
   */
  const matchedArchived = group.lead.places?.status === 'archived';
  /*
   * 접힌 줄의 주소 — 값과 축과 대조를 한 곳에서 받는다. `sameAddress` 를 여기서 직접 부르던 자리다.
   * 옮긴 이유는 그 대조가 **축에 따라 순환**이어서다: 주소→좌표 축의 주소는 원글 주소에서 나온 것이라
   * 둘이 같아도 확인한 것이 없는데, 바로 부르면 그 '같다' 가 확인된 주소와 구별되지 않는다(`adminAddress.ts`).
   *
   * `addressConflict`(= `주소 다름` 뱃지)를 접힌 줄에 띄우는 것이 요점이다 — 이것이 뜨는 뜻은 보통
   * `naverLocal` 이 동명의 다른 가게를 집었다는 것이고(실측: `대포로 93` ↔ `신엄안3길 95`), 그 후보를 그대로
   * 승인하면 엉뚱한 좌표·카테고리가 `places` 로 들어간다. 표기 차이(전체의 91%)와 비교 불가는 여기서 조용하다.
   */
  const address = addressView(extracted);
  const addressConflict = address.cross?.tone === 'warn';
  /*
   * 교차점검 표식. **미점검이면 `null` 이라 아무것도 안 그린다** — 초록도 회색도 거짓말이다(`adminVerify.ts`).
   * 이 패스가 생기기 전의 후보와 `--no-verify` 로 돌린 실행이 그 상태다.
   */
  const verify = verifyView(extracted.verify);
  /** 짝 id. `matchedName` 은 임베드라 비어 있을 수 있어 **판정에 쓰지 않는다**. */
  const pairId = group.lead.match_place_id;
  /** 같은 자리라 한 줄로 묶인 다른 이름들(`mergeSameSpotGroups` — "본카페" ↔ "애월본카페"). 올리면 대표 이름 하나로 선다. */
  const otherNames = [...new Set(group.rows.map((row) => row.extracted.name))].filter((name) => name && name !== extracted.name);
  /** 독립 글(`postClusters`)이 글 수보다 적다 — 같은 블로그·같은 제목 틀의 글이 섞였다(광고성 복제 글). */
  const similarPosts = group.independentPosts != null && group.independentPosts < group.posts.length;

  // 끝난 묶음은 초록 한 줄로 접힌다. 3초 뒤 목록에서 사라지므로 그 사이의 확인용이다.
  if (state.done) {
    // 고르기 칸만큼 비워 두고 시작한다 — 안 그러면 끝난 줄만 왼쪽으로 튀어나와 표가 어긋난 것처럼 보인다.
    return (
      <li className="flex bg-success-primary">
        <span className={ADMIN_LEAD_CELL} />
        <span className="min-w-0 flex-1 px-4 py-2 text-xs text-success-primary">{state.done}</span>
      </li>
    );
  }

  const regionOk = regionUsable(extracted.regionRaw);
  const needsLook = verifyNeedsLook(extracted.verify);
  /** 덮어쓰면 무엇이 바뀌나 — 펼쳤고 가리키는 장소 행이 있을 때만 계산한다. */
  /** 갱신 묶음의 제안(11 T2.2) — 있으면 덮어쓰기의 '새 값' 이 제안 값이 된다(`withProposal`, 쓰기도 같은 함수를 지난다). */
  const proposal = liveProposal(group.rows);
  const proposalBadge = proposalView(group);
  // 짝 장소는 접힌 줄에도 온다(목록의 조건 칸이 쓴다) — 전·후 목록은 펼쳤을 때만 계산한다.
  const pairDefault = expanded && pairPlace ? overwriteDefault(group, pairPlace) : null;
  const latest = pairDefault?.plan ?? null;
  /** 덮을 칸 — 안 건드렸으면 바뀌는 칸 전부(11 T1.4). 목록의 체크와 버튼의 칸 수가 이 값 하나를 읽는다. */
  const latestKeys = latest ? latest.changes.map((change) => change.key) : [];
  // 동반 조건이 더 쉬워지는 덮어쓰기는 조건 칸이 꺼진 채 시작한다(11 U6 — `policyDirection`). 체크를 켜면 쓴다.
  const loosen = Boolean(pairDefault?.loosen);
  // 제안이 있으면 기본 체크는 제안이 change 라 한 칸(완화는 독립 근거 글 둘 이상일 때만) — 없으면 바뀌는 칸 전부에서
  // 완화 조건과 사이트에 값이 있는 이름·종류·소개를 끈다. 일괄(`bulkLatestTargets`)·목록 조건 칸과 같은 함수(`overwriteDefault`)다.
  const overwritePick = state.overwritePick ? state.overwritePick.filter((key) => latestKeys.includes(key)) : (pairDefault?.columns ?? []);
  /**
   * 이 갈래에서 '덮어쓰기' 가 뜻이 있나. 내린 곳·닮은 곳 패널은 언제나(가리키는 장소가 있다),
   * 기본 갈래는 짝이 있고 지역이 되고 짝이 내린 곳이 아닐 때만 — 내린 곳이면 누르는 순간 되살릴지 묻는 패널로 간다.
   */
  const latestAvailable = Boolean(state.archived || state.similar || (pairId && regionOk && !matchedArchived && !addressConflict));
  /** 고를 두 주소 — `approveGroup` 의 가드와 같은 판정(`addressConflictOf`)이라 여기서 안 뜨는 줄은 거기서도 안 멈춘다. */
  const conflict = addressConflictOf(extracted);
  const addressPick = conflict ? { blog: conflict.sourceAddress, search: conflict.address } : null;
  /** 쓰기 전에 멈춰 사람이 고를 차례인 줄 — `similar`(닮은 곳)·`archived`(내린 곳) 둘 다 같은 종류의 상태다. */
  const waiting = Boolean(state.similar || state.archived);

  return (
    /*
     * 줄은 테두리를 갖지 않는다 — 가르는 선은 `<ul>` 의 `divide-y` 한 줄이 긋는다.
     * 펼쳤으면 머리와 패널을 **왼쪽 한 줄기 색**으로 묶는다(`ADMIN_ROW_OPEN`): 결정 버튼이 그 패널에 있어서,
     * 어느 줄의 패널인지 눈으로 정하지 못하면 그것이 곧 다른 가게를 올리는 길이다.
     */
    <li
      className={cx(
        ADMIN_ROW,
        expanded ? ADMIN_ROW_OPEN : 'hover:bg-primary_hover',
        // 접힌 채로도 멈춘 줄은 줄기색으로 찾힌다 — 일괄이 141줄 중 셋을 세워 두면 그 셋을 한 줄씩 펼쳐 찾던 자리(todo/09 T6.4).
        !expanded && waiting && ADMIN_ROW_WAITING,
        !expanded && !waiting && state.error && ADMIN_ROW_FAILED,
      )}
    >
      {/*
        * 고르기 칸은 펼침 버튼 **바깥**에 선다. 버튼 안에 두면 버튼 안의 버튼이라 눌러도 체크가 아니라
        * 펼침이 토글되고, HTML 로도 틀린 구조다. 폭은 `ADMIN_LEAD_CELL` 이 머리글과 함께 소유한다.
        */}
      <div className="flex items-stretch md:grid md:grid-cols-subgrid">
        {/* 칸들이 위쪽 정렬이라 체크박스도 첫 줄(이름)에 맞춘다 — 가운데면 키 큰 줄에서 어느 줄의 것인지 흐려진다. */}
        <span className={cx(ADMIN_LEAD_CELL, 'md:items-start md:pt-2.5')}>
          <Checkbox
            size="sm"
            isSelected={selected}
            onChange={onSelect}
            isDisabled={Boolean(busy)}
            aria-label={`${extracted.name || '이름 없는 곳'} 고르기`}
          />
        </span>
        {/* 체크박스 밖의 줄 전체가 펼침 버튼이다 — 어디를 눌러도 펼친다. 화살표는 그 사실을 이름 옆에서 말한다. */}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className={cx('min-w-0 flex-1 px-4 py-2 text-left md:col-[2/-1]', ADMIN_ROW_CELLS)}
        >
          {/*
            * **정상은 안 보이고 이상만**(2026-09-30 v2). `신규`(21/21)·`글 1건`·`분석 완료` 가 모든 줄에 붙어 있던 동안
            * 문제 없는 줄도 경고 줄만큼 화려했다. 이제 이름 옆에 서는 것은 승인을 막거나 미루는 표식뿐이고,
            * 상태(기존 짝 · 글 여러 건 · 동반 확인)는 회색 글씨다.
            */}
          <span className="block min-w-0">
            <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
              <span className="text-sm font-bold text-primary">{extracted.name || '(이름 없음)'}</span>
              <ChevronDown
                aria-hidden="true"
                className={cx('size-3.5 shrink-0 text-fg-quaternary transition-transform', expanded && 'rotate-180')}
              />
              {/* 펼치면 '골라 주세요' 패널이 그 말을 하므로 뱃지는 접힌 동안만 — 결과 줄의 "N곳은 직접 골라야 해요" 가 가리키는 줄이 이것이다. */}
              {!expanded && waiting && (
                <Badge type="color" size="sm" color="warning">
                  골라 주세요
                </Badge>
              )}
              {group.rows.length > 1 && (
                <span className="text-xs text-quaternary">
                  글 {group.rows.length}건
                  {/* 독립 수가 적으면 그 사실이 보이게(경고 톤) — "글 5건" 이 다섯 사람의 말이 아니다. 검수 순서는 이미 독립 수로 센다. */}
                  {similarPosts && <span className="text-warning-primary"> · 비슷한 글 묶음 {group.independentPosts}</span>}
                </span>
              )}
              {otherNames.length > 0 && <span className="text-xs text-warning-primary">같은 자리: {otherNames.join(' · ')}</span>}
              {/*
                * tier 가 auto/ask 인데 짝이 비어 있으면 **사람이 비운 것**이고 승인은 **새 장소를 만든다**(adminApply.ts 의 decideTarget).
                * `확인`(닮은 곳 — 사람이 고를 일)만 색을 갖는다. `기존 → 이름` 은 상태라 회색 글씨, `신규` 는 기본값이라 안 쓴다.
                */}
              {group.tier !== 'new' && !pairId ? (
                <span className="text-xs text-quaternary">짝 비움 · 새 장소로</span>
              ) : group.tier === 'ask' ? (
                <Badge type="color" size="sm" color="warning">
                  {TIER_LABEL.ask}
                  {matchedName ? ` → ${matchedName}` : ''}
                </Badge>
              ) : group.tier === 'auto' ? (
                <>
                  <span className="text-xs text-quaternary">
                    {TIER_LABEL.auto}
                    {matchedName ? ` → ${matchedName}` : ''}
                  </span>
                  {/*
                    * 종류(11 U2) — `갱신` 만 색을 갖는다: 사이트와 다른 사실을 말하는 글이라 사람이 칸을 골라야 한다.
                    * `보강`(빈 칸만)은 상태라 회색 글씨다.
                    */}
                  {group.kind === 'update' ? (
                    <>
                      <Badge type="color" size="sm" color="brand">
                        {KIND_LABEL.update}
                      </Badge>
                      {/* 제안 없음은 "안 봤다" 다 — 회색 뱃지, 초록이 아니다(`proposalView`). 있으면 회색 글씨로 칸 수만. */}
                      {proposalBadge?.state === 'missing' ? (
                        <Badge type="color" size="sm" color="gray">
                          {proposalBadge.label}
                        </Badge>
                      ) : proposalBadge ? (
                        <span className="text-xs text-quaternary">{proposalBadge.label}</span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-xs text-quaternary">{KIND_LABEL.fill}</span>
                  )}
                </>
              ) : null}
              {matchedArchived && (
                <Badge type="color" size="sm" color="warning">
                  짝이 내린 곳
                </Badge>
              )}
              {/* 같은 가게에 사용자도 "조건이 달라요" 를 보냈다 — 처리는 등록 완료 칸에서(11 T3.2). */}
              {pairId && policyReports > 0 && (
                <Badge type="color" size="sm" color="error">
                  사용자 제보 {policyReports}
                </Badge>
              )}
              {addressConflict && (
                <Badge type="color" size="sm" color="warning">
                  주소 다름
                </Badge>
              )}
              {/* **막는 것이 먼저다.** `view.badges` 는 빨강(지역 없음·동반불가)부터 정렬돼 온다. */}
              {view.badges.map((badge) => (
                <Badge key={badge.key} type="color" size="sm" color={badge.tone}>
                  {badge.label}
                </Badge>
              ))}
              {/*
                * 교차점검 — `동반 확인`(강아지가 그 자리에 있었다)만 뱃지 없이 **초록 글씨**다. 회색이던 동안 '문장 없음' 옆에서
                * 경고처럼 읽혔다(2026-10-04). 근거가 운영자 소개글뿐인 경우(엔젤하우스)는 이제 `동반 표기만` 으로 갈려 노란 뱃지가 선다 —
                * 가장 센 표시가 가장 약한 근거에 붙던 것을 그 갈래가 막는다. 근거 없음·불가 정황도 뱃지다.
                * 미점검(`null`)은 아무것도 안 그린다(`adminVerify.ts`).
                */}
              {verify &&
                (verify.state === 'confirmed' ? (
                  <span className={cx('text-xs', ADMIN_VERIFY_TEXT[verify.tone])}>{verify.label}</span>
                ) : (
                  <Badge type="color" size="sm" color={verify.tone}>
                    {verify.label}
                  </Badge>
                ))}
            </span>
            {/*
              * 이름 밑 한 줄 = 블로그가 실제로 한 말(09 T6.6). 칩이 "여기부터 사람 말" 을 가른다 — 펼친 근거 목록과 같은 칩(`SOURCE_TONE`)이라
              * 접혀 있어도 옆의 AI 요약과 섞이지 않는다. 한 줄로 자른다: 줄 높이는 계속 AI 요약 칸이 정한다.
              */}
            {quote && (
              <span className="mt-1 flex min-w-0 items-center gap-1.5">
                <span className="shrink-0">
                  <AdminSourceChip source="blog" />
                </span>
                <span className="truncate text-xs text-secondary">“{quote}”</span>
              </span>
            )}
          </span>

          {/*
            * 지역 칸 — **지역만** 둔다(2026-09-30 v2). 주소를 여기 적던 동안 `제주 서귀포시 안덕면 …` 이 잘려 읽히지도 않았다.
            * 주소는 펼친 상세의 비교표가 말하고, 문제가 있으면(`주소 다름`) 이름 옆 뱃지가 말한다. 위치 얘기(`지도에 안 보여요`)만 남긴다.
            */}
          <span className="block min-w-0 text-xs text-tertiary max-md:mt-0.5">
            <span className="block truncate">{extracted.regionRaw || ''}</span>
            {view.notes.map((note) => (
              <span key={note} className="block truncate text-quaternary">
                {note}
              </span>
            ))}
          </span>

          <PolicyCell items={policy.items} state={policy.state} message={policy.message} blogDiffers={listPolicy.blogDiffers} />

          {/*
            * AI 요약 = `extracted.features`. 승인되면 **그대로 사이트의 소개 문구가 된다** — 여기서 읽는 것이 곧 사이트에 나갈 글이다.
            * 자르지 않는다: 자르면 검수 중에 읽어야 할 문장을 펼치기 전에는 못 읽는다.
            */}
          <span className="block min-w-0 text-xs text-tertiary max-md:mt-0.5">{extracted.features || '요약이 없어요'}</span>

          <span className="flex items-start max-md:mt-1">
            <AdminTypeChip type={extracted.type} />
          </span>
        </button>
      </div>

      {/*
        * 펼친 줄 = **근거 → 결정 줄**(2026-09-30 v2). 오른쪽 결정 레일(카드)을 없애고, 근거를 다 읽은 자리(`여기까지 · 접기`)에
        * 버튼을 한 줄로 둔다. 판도 한 겹이다 — 색 바탕 위에 카드를 또 얹던 것을 걷고 선으로만 가른다.
        *
        * **여기서는 값을 고치지 않는다**(2026-10-04). 검수 대기는 올릴지 말지만 정하는 자리다 — AI 가 틀렸으면 제외하거나 재분석하고,
        * 값 수정은 등록 완료의 장소 고치기(`adminPagePlaceEditForm`)에서 한다. 주소 고르기·지역 고르기는 결정의 일부라 남는다.
        */}
      {expanded && (
        <div className={cx(ADMIN_PANEL_DIVIDER, 'px-4 pt-3 pb-2 md:pl-14')}>
          <div className="space-y-3">
            <AdminPageGroupDetail group={group} preview={preview} place={pairPlace} />
            {/*
              * 사이트 비교 분석은 **이 글을 어떻게 읽었나(위 표) 다음**이다. 덮어쓸 칸이 있으면 결정 줄이 체크·버튼과 함께 그리고(`AdminPageGroupActions`),
              * 여기는 덮어쓰기가 뜻이 없는 갈래(주소 고르기 · 지역 없음 · 바뀔 칸 없음)에서 읽기 전용으로만 선다. 신규 묶음에는 서지 않는다.
              */}
            {pairPlace && (group.kind === 'update' || group.kind === 'fill') && !(latestAvailable && latest && latest.changes.length > 0) && (
              <AdminPageGroupSiteCompare group={group} place={pairPlace} proposal={proposal} />
            )}
          </div>
          <div className="mt-3 border-t border-secondary pt-3">
            <section aria-label="이 장소 결정">
              <AdminPageGroupActions
                group={group}
                state={state}
                regionOk={regionOk}
                addressPick={addressPick}
                needsLook={needsLook}
                latest={latest}
                latestAvailable={latestAvailable}
                overwritePick={overwritePick}
                /* 체크는 결정 줄의 사이트 비교 분석 표가 그린다 — 계산(`latestPlan`)·조건(`latestAvailable`)은 여기 것 그대로다. */
                overwriteNote={loosen ? `동반 조건은 꺼 두었어요: ${LOOSEN_HINT}` : undefined}
                pairPlace={pairPlace}
                proposal={proposal}
                onToggleOverwrite={(key) => onPickOverwrite(toggleOverwritePick(latestKeys, overwritePick, key))}
                onApprove={onApprove}
                onStartReject={onStartReject}
                onCancelReject={onCancelReject}
                onReject={onReject}
                onConfirmSite={onConfirmSite}
                onPickRegion={onPickRegion}
                onSaveRegion={onSaveRegion}
                onChooseAddress={onChooseAddress}
                reanalyzeText={reanalyzeText}
                onStartReanalyze={onStartReanalyze}
                onCancelReanalyze={onCancelReanalyze}
                onReanalyze={onReanalyze}
                collect={collect}
                onRequestCollect={onRequestCollect}
              />
            </section>
            <button
              type="button"
              onClick={onToggle}
              className="mx-auto mt-3 flex items-center gap-1 py-1.5 text-xs text-tertiary hover:text-secondary"
            >
              <ChevronDown aria-hidden="true" className="size-3.5 rotate-180" />
              여기까지 · 접기
            </button>
          </div>
        </div>
      )}

      {/* 접힌 상태에서도 방금 실패한 것은 보여야 한다 — 펼치지 않으면 왜 안 됐는지 알 수 없다. */}
      {!expanded && state.error && <p className="px-4 pb-2 text-xs text-error-primary">{state.error}</p>}
    </li>
  );
}
