'use client';

import { CheckVerified02, ChevronDown } from '@untitledui/icons';
import { Badge, BadgeWithIcon } from '../components/base/badges';
import { Checkbox } from '../components/base/checkbox';
import {
  regionUsable,
  TIER_LABEL,
  type TCandidateGroup,
  type TPlaceRow,
  type TPolicyPreview,
  type TRejectReason,
} from '../lib/adminCandidates';
import type { TApplyOutcome, TSimilarPlace } from '../lib/adminApply';
import { draftFromExtracted, type TCandidateEditDraft } from '../lib/adminEdit';
import type { TBadgeTone, TPetBadge } from '../lib/petPolicy';
import { addressView } from '../lib/adminAddress';
import { aiAnalyzed, policySplit, type TAdminFlagView } from '../lib/adminPreview';
import { verifyView } from '../lib/adminVerify';
import { latestPlan } from '../lib/adminLatest';
import { cx } from '../utils/cx';
import { AdminPageGroupDetail } from './adminPageGroupDetail';
import { AdminTypeChip } from './adminTypeChip';
import { AdminPageEditForm } from './adminPageEditForm';
import { AdminChangeList } from './adminChangeList';
import { AdminPageGroupActions } from './adminPageGroupActions';
import { ADMIN_CANDIDATE_GRID, ADMIN_LEAD_CELL, ADMIN_PANEL_DIVIDER, ADMIN_ROW_OPEN } from './adminTable';

/** 묶음 하나의 화면 상태. 소유자는 `adminPage.tsx` 고 여기는 받아서 그린다. */
export type TAdminPageGroupState = {
  busy?: 'approving' | 'rejecting' | 'savingRegion' | 'savingEdit' | 'reanalyzing';
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
  /** '분석 지우고 다시 읽기' 확인이 열려 있다(`adminReanalyze.ts`). 반려와 같은 자리(레일)를 쓴다. */
  reanalyzing?: boolean;
  /** '지역 고르기' 셀렉트의 현재 선택. */
  regionDraft?: string;
  /**
   * 고치기 폼이 열려 있으면 그 초안. `undefined` 가 '안 열림' 이다 — 불리언과 값을 따로 두면
   * 닫을 때 둘을 같이 지워야 하고, 한쪽만 지우면 다음에 열 때 남의 초안이 들어 있다.
   */
  editDraft?: TCandidateEditDraft;
};

export type TApproveChoice = {
  asNew?: boolean;
  mergeInto?: string | null;
  restoreArchived?: boolean;
  /** '정말 다른 가게예요' 를 눌렀다 — 내린 곳을 버리고 새로 만드는 것을 사람이 확인했다(`TApplyOptions` 참고). */
  confirmedDifferent?: boolean;
  /** '최신본으로 저장하기' — 합치기 대신 짝지은 장소의 칸을 이 후보의 값으로 덮는다(`TApplyOptions.overwrite`). */
  overwrite?: boolean;
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
  onReject: (reason: TRejectReason, note: string) => void;
  onPickRegion: (regionRaw: string) => void;
  onSaveRegion: (regionRaw: string) => void;
  onEditDraft: (draft: TCandidateEditDraft | undefined) => void;
  onSaveEdit: (draft: TCandidateEditDraft) => void;
  /** 일괄 반려용으로 골라 뒀는가. 소유자는 `adminPage.tsx` 다(`adminSelection.ts`). */
  selected: boolean;
  onSelect: (selected: boolean) => void;
  /**
   * 지금 패널이 가리키는 기존 장소 행(내린 곳 · 닮은 곳 · 짝). '최신본으로 저장하기' 의 전·후를 그리려면 그 행의 **지금 값**이 있어야 한다.
   * 펼친 줄에만 넘어온다. 없으면(짝이 DB 에 없다) 그 버튼을 안 그린다.
   */
  pairPlace?: TPlaceRow;
  /** 재분석 확인 문장 — 형제 후보까지 세려면 목록 전체가 필요해 페이지가 만들어 넘긴다. 확인이 열렸을 때만 온다. */
  reanalyzeText?: string;
  onStartReanalyze: () => void;
  onCancelReanalyze: () => void;
  onReanalyze: () => void;
};

const TIER_COLOR: Record<string, 'success' | 'warning' | 'blue'> = {
  auto: 'success',
  ask: 'warning',
  new: 'blue',
};

/**
 * 동반 정보 낱개의 톤 → 칩 모양. 사이트와 **같은 위계**다(`petBadges.tsx` 의 `TONE_COLOR`):
 * ok 와 cond 는 둘 다 회색이고, 주의(`warn` — 동반 불가 · 확인된 정보 없음 · 전화 확인)만 노란 바탕으로 나온다.
 *
 * 전부 같은 회색이던 자리다. 한 줄에 칩이 예닐곱 개까지 서는 표에서 '동반 불가' 가 '리드줄' 과 같은
 * 모양이면, 운영자는 그 줄을 **읽어야만** 알 수 있다 — 세로로 훑는 것이 이 화면의 일인데 그 훑기가 여기서 멈춘다.
 */
const POLICY_TONE: Record<TBadgeTone, string> = {
  ok: 'bg-secondary text-secondary',
  cond: 'bg-secondary text-secondary',
  warn: 'bg-warning-primary text-warning-primary',
};

/**
 * 동반 조건 · 강아지 요금 · 필요 장비 세 칸이 **같은 컴포넌트**다. 모양을 세 번 적으면 한 칸만 고쳐져
 * 같은 값이 칸마다 다른 칩으로 보인다(이 표가 막으려는 오독).
 *
 * `message` 는 동반 조건 칸만 넘긴다 — 없는 칸은 아무것도 그리지 않고 **빈 칸으로 남는다.** 빈 칸이 옳다:
 * "요금 얘기가 없다" 는 말을 세 칸이 각각 하면 한 줄이 같은 말을 세 번 하고, 그러면 진짜 비어 있는 칸이 안 보인다.
 */
function PolicyCell({ items, message = null }: { items: TPetBadge[]; message?: string | null }) {
  return (
    <span className="flex min-w-0 flex-wrap content-start items-start gap-1 text-xs text-tertiary max-md:mt-0.5">
      {items.length
        ? items.map((item) => (
            <span key={item.label} className={cx('rounded px-1.5 py-px font-medium break-keep', POLICY_TONE[item.tone])}>
              {item.label}
            </span>
          ))
        : message && <span>{message}</span>}
    </span>
  );
}

/**
 * 후보 묶음 한 줄. 접힌 줄만으로 "올릴지 말지" 의 대부분이 판단되게 한다 —
 * 이름·종류·구간·지역·표식·동반 조건이 그 줄에 있고, 근거(원문·인용·원글)는 펼쳐야 나온다.
 *
 * `md` 이상에서는 머리글과 열이 맞는 **표의 한 줄**이다(`ADMIN_CANDIDATE_GRID`). 예전에는 같은 것을
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
  onSaveRegion,
  onEditDraft,
  onSaveEdit,
  selected,
  onSelect,
  pairPlace,
  reanalyzeText,
  onStartReanalyze,
  onCancelReanalyze,
  onReanalyze,
}: TAdminPageGroupCardProps) {
  const extracted = group.lead.extracted;
  const policy = policySplit(preview, extracted.petPolicyText);
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
  const openEdit = () => onEditDraft(draftFromExtracted(extracted));
  /** 최신본으로 덮으면 무엇이 바뀌나 — 펼쳤고 가리키는 장소 행이 있을 때만 계산한다. */
  const latest = expanded && pairPlace ? latestPlan(pairPlace, extracted) : null;
  /**
   * 이 갈래에서 '최신본으로 저장하기' 가 뜻이 있나. 내린 곳·닮은 곳 패널은 언제나(가리키는 장소가 있다),
   * 기본 갈래는 짝이 있고 지역이 되고 짝이 내린 곳이 아닐 때만 — 내린 곳이면 누르는 순간 되살릴지 묻는 패널로 간다.
   */
  const latestAvailable = Boolean(state.archived || state.similar || (pairId && regionOk && !matchedArchived));

  return (
    /*
     * 줄은 테두리를 갖지 않는다 — 가르는 선은 `<ul>` 의 `divide-y` 한 줄이 긋는다.
     * 펼쳤으면 머리와 패널을 **한 색으로** 덮는다: 승인·반려 버튼이 그 패널에 있어서, 어느 줄의
     * 패널인지 눈으로 정하지 못하면 그것이 곧 다른 가게를 올리는 길이다.
     */
    <li className={cx(expanded ? ADMIN_ROW_OPEN : 'hover:bg-primary_hover')}>
      {/*
        * 고르기 칸은 펼침 버튼 **바깥**에 선다. 버튼 안에 두면 버튼 안의 버튼이라 눌러도 체크가 아니라
        * 펼침이 토글되고, HTML 로도 틀린 구조다. 폭은 `ADMIN_LEAD_CELL` 이 머리글과 함께 소유한다.
        */}
      <div className="flex items-stretch">
        {/* 칸들이 위쪽 정렬이라 체크박스도 첫 줄(이름)에 맞춘다 — 가운데면 키 큰 줄에서 어느 줄의 것인지 흐려진다. */}
        <span className={cx(ADMIN_LEAD_CELL, 'md:items-start md:pt-2.5')}>
          <Checkbox
            size="sm"
            isSelected={selected}
            onChange={onSelect}
            isDisabled={Boolean(busy)}
            aria-label={`${extracted.name || '이름 없는 묶음'} 고르기`}
          />
        </span>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className={cx('min-w-0 flex-1 px-4 py-2 text-left', ADMIN_CANDIDATE_GRID)}
        >
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            {/* 종류 칩은 맨 뒤 자기 열로 갔다(2026-09-30) — 여기 남은 것은 이름과, 승인을 막거나 미루는 표식들이다. */}
            <span className="text-sm font-bold text-primary">{extracted.name || '(이름 없음)'}</span>
            {/*
              * 근거 글 수 — 자기 열(`근거`, 5rem)이던 것을 이름 뒤로 옮겼다(2026-09-30). 값이 거의 늘 `글 1건` 이라
              * 열 하나가 선 두 벌과 함께 동반 조건 칸의 폭을 먹고 있었다(1280px 에서 `소형견만` 이 글자 단위로 접혔다).
              */}
            <span className="text-xs text-quaternary">글 {group.rows.length}건</span>
            {/*
              * tier 가 auto/ask 인데 짝이 비어 있으면 **사람이 비운 것**이고(apply-approved.mjs:13·15) 승인은
              * `targetId: null` 로 **새 장소를 만든다**(adminApply.ts:116-119). 초록 '기존' 을 그대로 두면
              * 합쳐질 줄 알고 누른 결과가 새 장소 생성이다. `new` 와 라벨을 돌려쓰지 않는다 — 그쪽은 재대조가 돈다.
              */}
            {group.tier !== 'new' && !pairId ? (
              <Badge type="color" size="sm" color="blue">
                새 장소로
              </Badge>
            ) : (
              <Badge type="color" size="sm" color={TIER_COLOR[group.tier] ?? 'gray'}>
                {TIER_LABEL[group.tier] ?? group.tier}
                {group.tier !== 'new' && matchedName ? ` → ${matchedName}` : ''}
              </Badge>
            )}
            {matchedArchived && (
              <Badge type="color" size="sm" color="warning">
                짝이 내린 곳
              </Badge>
            )}
            {addressConflict && (
              <Badge type="color" size="sm" color="warning">
                주소 다름
              </Badge>
            )}
            {/*
              * **막는 것이 먼저다.** `view.badges` 는 빨강(지역 없음·동반불가)부터 정렬돼 오는데, 대부분의 카드에 붙는
              * 초록 뱃지를 그 앞에 두면 위계가 뒤집힌다 — 초록이 자리를 먹고 빨강이 줄 끝으로 밀린다.
              */}
            {view.badges.map((badge) => (
              <Badge key={badge.key} type="color" size="sm" color={badge.tone}>
                {badge.label}
              </Badge>
            ))}
            {/*
              * 부재가 기본값인 표식(`AI 판단 없음`)을 뒤집는다 — 잘 분석된 후보가 눈에 띈다. ✓ 글자는 안 넣는다(아이콘이 그린다).
              * 'AI' 를 뗀 것은 자리 때문이다 — 이 줄은 막는 표식(빨강)이 서는 곳이고, 대부분의 카드에 붙는 이 초록이
              * 길면 그만큼 빨강이 줄 끝으로 밀린다. 무엇이 분석했는지는 옆 열 이름(`AI 요약`)이 이미 말한다.
              * `facts` 의 truthy 만 보면 **빈 판단 객체에도 초록이 뜬다** — 그때 펼친 상세는 `AI 가 읽은 동반 조건이 없어요` 라고 해서
              * 한 카드가 자기를 반박한다. `aiAnalyzed` 가 읽어낸 조각이 실제로 있는지까지 본다.
              */}
            {aiAnalyzed(preview) && (
              <BadgeWithIcon type="color" size="sm" color="success" iconLeading={CheckVerified02}>
                분석 완료
              </BadgeWithIcon>
            )}
            {/*
              * 교차점검 뱃지는 `view.badges` **뒤**에 선다 — 초록(`동반 확인`)이 될 수 있어서, 앞에 두면
              * 위의 "막는 것이 먼저다" 가 깨져 초록이 빨강(`지역 없음`)을 줄 끝으로 밀어낸다.
              * 빨강일 때(`동반 불가 정황`)도 여기 둔다: 자리가 갈리면 같은 표식이 카드마다 다른 곳에 뜬다.
              */}
            {verify && (
              <Badge type="color" size="sm" color={verify.tone}>
                {verify.label}
              </Badge>
            )}
          </span>

          {/*
            * 지역 칸. 지역이 없으면 뱃지 `지역 없음` 이 이미 같은 말을 한다 — 비워 둔다(`지역?` 은 문장도 아니었다).
            *
            * **`view.notes` 가 여기로 왔다.** 동반 정보 칸 끝에 붙어 있었는데, 지금 그 칸에 뜨는 한마디는
            * `지도에 안 보여요`(= 좌표 없음) 하나뿐이라 애초에 동반 얘기가 아니었다. 칩과 흐린 글자로 모양을
            * 갈라 두긴 했지만 같은 칸에 있는 한 "동반 조건의 하나" 로 읽힐 여지가 남는다 — 위치 얘기는 위치 칸에 둔다.
            */}
          <span className="block min-w-0 text-xs text-tertiary max-md:mt-0.5">
            <span className="block truncate">{extracted.regionRaw || ''}</span>
            {/*
              * **주소를 접힌 줄에도 적는다**(2026-09-30). 펼치지 않으면 무엇이 올라가는지 알 수 없던 칸이고,
              * 90곳을 훑는 화면에서 그 한 번의 펼침이 곧 검수 속도다. 뒤에 붙는 한 단어(`원글 주소`·`직접 고침`)는
              * **검증 못 한 것에만** 붙는다 — 확인된 주소가 대다수이므로 그쪽에 뱃지를 달면 아무것도 눈에 안 띈다.
              */}
            {(address.address || address.shortLabel) && (
              <span className="block truncate text-quaternary">
                {address.address ?? address.shortLabel}
                {/*
                  * **경보 색을 쓰지 않는다.** 검증 못 한 것이 여섯에 하나(실측 58건 중 16건)라 그것마다 주황을 칠하면
                  * 정말 다른 주소 2건(`주소 다름`)이 같은 색에 묻힌다 — ADR-019 결정 4 가 막으려던 것과 같은 희석이다.
                  */}
                {address.address && address.shortLabel && <span className="ml-1">· {address.shortLabel}</span>}
              </span>
            )}
            {view.notes.map((note) => (
              <span key={note} className="block truncate text-quaternary">
                {note}
              </span>
            ))}
          </span>

          {/*
            * 동반 정보는 **낱개로 나열하고, 세 칸으로 갈라 놓는다**(2026-09-30) — 동반 조건 · 강아지 요금 · 필요 장비.
            * 예전의 `조건 [야외만 · 리드줄]` 에서 대괄호를 뺀 자리이고, 이제 그 낱개가 열로 흩어진다.
            *
            * 순서는 여기서 정하지 않는다: `toPetBadges` 가 사이트와 같은 순서로 세워서 보내고 `policySplit` 이
            * 그 순서를 지키며 축으로만 가른다. 톤도 그 함수가 매긴 것을 그대로 쓴다 — 라벨 문자열로 되찾으려 하면
            * 요금 문장에서 반드시 틀린다. 못 읽었다는 한 문장(`message`)은 **동반 조건 칸에만** 뜬다.
            */}
          <PolicyCell items={policy.condition} message={policy.message} />
          <PolicyCell items={policy.fee} />
          <PolicyCell items={policy.gear} />

          {/*
            * AI 요약 = `extracted.features`. **이 표에서 새로 뽑는 값이 아니다** — AI 추출 프롬프트가 이미
            * "해요체 1~2문장, 첫 문장은 어떤 곳인지, 둘째 문장은 강아지 편의" 로 받아 둔 필드이고
            * (`extractPlaces.mjs` 의 features), 승인되면 **그대로 사이트의 소개 문구가 된다**(`placeCard`·상세·지도 시트).
            * 그래서 여기서 읽는 것이 곧 사이트에 나갈 글을 미리 읽는 일이다.
            *
            * **자르지 않는다**(2026-09-30). 한동안 두 줄에서 잘랐는데, 그러면 검수 중에 읽어야 할 문장을 정작
            * 펼치기 전에는 못 읽는다 — 이 열을 만든 이유가 그것이었다.
            *
            * 자르기를 없애면 **폭 배분의 최적점이 뒤집힌다.** 자를 때는 넘쳐도 잘릴 뿐이라 폭을 줄이는 것이
            * 옳았지만(그 몫을 장소·동반 정보가 받았다), 안 자르면 이 열이 곧 줄 높이라 여기에 폭을 주는 것이
            * 전체를 낮춘다. 실측(40줄·격자 1136px): 243px 이면 평균 90px·목록 3656px, 357px 이면 평균 74px·목록 2981px.
            * 더 넓히면 다시 나빠진다 — 장소·동반 정보가 접히기 시작해서다(455px 에서 평균 79px).
            */}
          <span className="block min-w-0 text-xs text-tertiary max-md:mt-0.5">
            {extracted.features || '요약이 없어요'}
          </span>


          {/*
            * 종류 칸. 이름 앞의 칩이던 것을 맨 뒤 자기 열로 옮겼다(2026-09-30). 세로로 훑히게 하려던 목적은
            * 그대로이고 — 오히려 이름 길이와 무관해져 더 곧게 선다 — 대신 이름 옆에는 승인을 막는 표식만 남는다.
            */}
          <span className="flex items-start max-md:mt-1">
            <AdminTypeChip type={extracted.type} />
          </span>

          {/*
            * 아이콘을 **감싼다.** grid 의 자식마다 세로 여백이 붙는데(`CELL_RULES`), 그 자식이 `<svg>` 면
            * `box-sizing: border-box` 때문에 16px 상자에서 위아래 8px 씩을 빼 **내용 높이가 0** 이 된다 —
            * svg 는 넘치는 부분을 잘라 내므로 화살표가 통째로 사라진다(빌드·테스트는 초록이다, 2026-09-29 실측).
            * 감싼 칸이 여백을 받으면 아이콘은 제 크기를 지킨다.
            */}
          <span className="flex items-start justify-end pt-0.5 max-md:hidden">
            <ChevronDown
              aria-hidden="true"
              className={cx(
                'size-4 shrink-0 text-fg-quaternary transition-transform',
                expanded && 'rotate-180',
              )}
            />
          </span>
        </button>
      </div>

      {/*
        * 펼친 줄 = **왼쪽 근거 · 오른쪽 결정 레일**(2026-09-30). 버튼이 근거 밑에 있던 동안 줄을 펼칠 때마다 수백 px 을
        * 내려가야 눌렀고, 갈래마다 버튼이 세 줄 두 덩어리로 흩어졌다. 레일은 `lg` 에서 스크롤을 따라오고(sticky),
        * 그보다 좁으면 근거 **위**에 선다(`order`) — 어느 폭에서든 펼치자마자 누를 것이 보인다.
        *
        * **고치기는 근거 자리를 대신 쓴다.** 폼의 왼쪽 열이 이미 "지금 값" 이라 근거 표와 같은 값을 두 번 보여 줄 까닭이 없고,
        * 고치는 동안 승인 버튼이 옆에 서 있으면 "저장했나, 올렸나" 가 흐려진다 — 그래서 레일도 접는다(폼이 저장·취소를 갖는다).
        */}
      {expanded &&
        (state.editDraft ? (
          <AdminPageEditForm
            draft={state.editDraft}
            original={extracted}
            busy={busy === 'savingEdit'}
            onChange={onEditDraft}
            onCancel={() => onEditDraft(undefined)}
            onSave={() => state.editDraft && onSaveEdit(state.editDraft)}
          />
        ) : (
          <div className={cx(ADMIN_PANEL_DIVIDER, 'flex flex-col lg:flex-row lg:items-start')}>
            <div className="min-w-0 flex-1">
              {/*
                * 최신본으로 저장하면 바뀌는 칸 — **근거 쪽 맨 위**에 둔다. 레일은 좁아 전·후 문장을 담으면 줄마다 접히고,
                * 이 목록은 버튼의 설명이 아니라 "새 분석이 무엇을 다르게 읽었나" 라는 근거 그 자체다.
                * 목록과 버튼은 같은 계산(`latestPlan`)·같은 조건(`latestAvailable`)에서 나온다.
                */}
              {latestAvailable && latest && latest.changes.length > 0 && (
                <div className="px-4 pt-3">
                  <AdminChangeList title="새 분석이 다르게 읽은 것 — 지금 장소 값 → 새 분석 값" changes={latest.changes} />
                </div>
              )}
              <AdminPageGroupDetail group={group} preview={preview} />
            </div>
            <aside
              aria-label="이 장소 결정"
              className="order-first border-b border-secondary px-4 py-3 lg:sticky lg:top-18 lg:order-none lg:w-72 lg:shrink-0 lg:border-b-0 lg:border-l"
            >
              <AdminPageGroupActions
                group={group}
                state={state}
                regionOk={regionOk}
                latest={latest}
                latestAvailable={latestAvailable}
                onApprove={onApprove}
                onStartReject={onStartReject}
                onCancelReject={onCancelReject}
                onReject={onReject}
                onPickRegion={onPickRegion}
                onSaveRegion={onSaveRegion}
                onEdit={openEdit}
                reanalyzeText={reanalyzeText}
                onStartReanalyze={onStartReanalyze}
                onCancelReanalyze={onCancelReanalyze}
                onReanalyze={onReanalyze}
              />
            </aside>
          </div>
        ))}

      {/* 접힌 상태에서도 방금 실패한 것은 보여야 한다 — 펼치지 않으면 왜 안 됐는지 알 수 없다. */}
      {!expanded && state.error && <p className="px-4 pb-2 text-xs text-error-primary">{state.error}</p>}
    </li>
  );
}
