'use client';

import { CheckVerified02, ChevronDown } from '@untitledui/icons';
import { Badge, BadgeWithIcon } from '../components/base/badges';
import { Button } from '../components/base/button';
import { Select } from '../components/base/select';
import {
  regionUsable,
  REGION_OPTIONS,
  TIER_LABEL,
  TYPE_LABEL,
  type TCandidateGroup,
  type TPolicyPreview,
  type TRejectReason,
} from '../lib/adminCandidates';
import type { TApplyOutcome, TSimilarPlace } from '../lib/adminApply';
import { lastNoteLine, noteLineText } from '../lib/adminPlaces';
import { aiAnalyzed, policyLine, type TAdminFlagView } from '../lib/adminPreview';
import { isPlaceType, TYPE_COLOR, typeTint } from '../lib/places';
import { cx } from '../utils/cx';
import { AdminPageGroupDetail } from './adminPageGroupDetail';
import { AdminPageRejectForm } from './adminPageRejectForm';

/** 묶음 하나의 화면 상태. 소유자는 `adminPage.tsx` 고 여기는 받아서 그린다. */
export type TAdminPageGroupState = {
  busy?: 'approving' | 'rejecting' | 'savingRegion';
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
  /** '지역 고르기' 셀렉트의 현재 선택. */
  regionDraft?: string;
};

export type TApproveChoice = {
  asNew?: boolean;
  mergeInto?: string | null;
  restoreArchived?: boolean;
  /** '정말 다른 가게예요' 를 눌렀다 — 내린 곳을 버리고 새로 만드는 것을 사람이 확인했다(`TApplyOptions` 참고). */
  confirmedDifferent?: boolean;
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
};

const TIER_COLOR: Record<string, 'success' | 'warning' | 'blue'> = {
  auto: 'success',
  ask: 'warning',
  new: 'blue',
};

const BUSY_LABEL: Record<NonNullable<TAdminPageGroupState['busy']>, string> = {
  approving: '반영하고 있어요…',
  rejecting: '반려하고 있어요…',
  savingRegion: '저장하고 있어요…',
};

/**
 * 후보 묶음 한 장. 접힌 줄만으로 "올릴지 말지" 의 대부분이 판단되게 한다 —
 * 이름·종류·구간·지역·표식·조건 수준이 그 줄에 있고, 근거(원문·인용·원글)는 펼쳐야 나온다.
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
}: TAdminPageGroupCardProps) {
  const extracted = group.lead.extracted;
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
  /** 짝 id. `matchedName` 은 임베드라 비어 있을 수 있어 **판정에 쓰지 않는다**. */
  const pairId = group.lead.match_place_id;
  /** 짝이 아직 게시 전인가 — 병합 승인이 그 행을 `published` 로 올린다(`adminApply.ts:157`). */
  const matchedDraft = group.lead.places?.status === 'draft';
  /** 0.4~0.85 패널이 가리키는 이웃이 내린 곳인가. `approveGroup` 이 경계에서 채워 준 값이다(`TSimilarPlace`). */
  const similarArchived = state.similar?.status === 'archived';

  // 끝난 묶음은 초록 한 줄로 접힌다. 3초 뒤 목록에서 사라지므로 그 사이의 확인용이다.
  if (state.done) {
    return (
      <li className="rounded-2xl border border-secondary bg-success-primary px-4 py-3 text-sm text-success-primary">
        {state.done}
      </li>
    );
  }

  const typeTone = isPlaceType(extracted.type)
    ? { background: typeTint(extracted.type, 14), color: TYPE_COLOR[extracted.type] }
    : undefined;

  const regionOk = regionUsable(extracted.regionRaw);

  return (
    <li className="overflow-hidden rounded-2xl border border-secondary bg-primary">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex min-h-11 w-full items-start gap-2 px-4 py-3 text-left hover:bg-primary_hover"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-md font-bold text-primary">{extracted.name || '(이름 없음)'}</span>
            <span
              className={cx(
                'rounded-md px-1.5 py-0.5 text-xs font-medium',
                !typeTone && 'bg-secondary text-tertiary',
              )}
              style={typeTone}
            >
              {TYPE_LABEL[extracted.type] ?? extracted.type}
            </span>
            {/*
              * tier 가 auto/ask 인데 짝이 비어 있으면 **사람이 비운 것**이고(apply-approved.mjs:13·15) 승인은
              * `targetId: null` 로 **새 장소를 만든다**(adminApply.ts:116-119). 초록 '이미 있는 곳' 을 그대로 두면
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
              * `facts` 의 truthy 만 보면 **빈 판단 객체에도 초록이 뜬다** — 그때 펼친 상세는 `AI 가 읽은 조건이 없어요` 라고 해서
              * 한 카드가 자기를 반박한다. `aiAnalyzed` 가 읽어낸 조각이 실제로 있는지까지 본다.
              */}
            {aiAnalyzed(preview) && (
              <BadgeWithIcon type="color" size="sm" color="success" iconLeading={CheckVerified02}>
                AI 분석 완료
              </BadgeWithIcon>
            )}
          </span>
          <span className="mt-1 block text-xs text-tertiary">
            {/* 지역이 없으면 칸과 구분자를 함께 지운다 — 뱃지 `지역 없음` 이 같은 말을 이미 한다(`지역?` 은 문장도 아니었다). */}
            {extracted.regionRaw ? `${extracted.regionRaw} · ` : ''}
            {policyLine(preview, extracted.petPolicyText)} · 블로그 글 {group.rows.length}건
            {view.notes.map((note) => ` · ${note}`).join('')}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cx('mt-0.5 size-5 shrink-0 text-fg-quaternary transition-transform', expanded && 'rotate-180')}
        />
      </button>

      {expanded && <AdminPageGroupDetail group={group} preview={preview} />}

      {expanded && state.rejecting ? (
        <AdminPageRejectForm busy={busy === 'rejecting'} onCancel={onCancelReject} onSubmit={onReject} />
      ) : (
        expanded && (
          <div className="border-t border-secondary px-4 py-4">
            {state.archived ? (
              /*
               * 짝지은 장소가 **내린 곳**이다. 이 갈래가 소프트 삭제의 방어선이고, 여기서 '새 장소로' 를
               * 권하지 않는 것이 요점이다 — 그러면 내린 가게의 복제본이 새 id 로 사이트에 다시 올라가
               * 내린 일 자체가 무효가 된다. 고를 수 있는 것은 둘뿐이다: 다시 열었으면 되살려 합치고,
               * 폐업 그대로면 반려한다.
               */
              <div>
                <p className="text-sm text-secondary">
                  내린 곳과 같은 가게로 보여요: <span className="font-semibold">{state.archived.placeName}</span>
                </p>
                {noteLineText(lastNoteLine(state.archived.note)) && (
                  <p className="mt-0.5 text-xs text-tertiary">{noteLineText(lastNoteLine(state.archived.note))}</p>
                )}
                <p className="mt-0.5 text-xs text-tertiary">
                  다시 연 가게면 되살려서 합치고, 아니면 반려해 주세요. 새 장소로 올리면 같은 가게가 두 번 생겨요.
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Button
                    color="primary"
                    size="lg"
                    className="sm:flex-1"
                    isDisabled={Boolean(busy)}
                    isLoading={busy === 'approving'}
                    /*
                     * **짝 id 를 실어 보낸다.** 안 실으면 `decideTarget` 이 짝을 다시 계산하는데, tier 가 'new' 면
                     * 그 계산은 `placesRef` 에 대한 재대조라 그 사이 다른 카드를 승인했으면 **패널이 말한 장소와
                     * 다른 장소**로 합쳐진다. 사람이 읽은 이름과 실제로 쓰는 곳이 달라지는 건 조용한 오병합이다.
                     */
                    onClick={() => onApprove({ mergeInto: state.archived?.placeId, restoreArchived: true })}
                  >
                    되살려서 합치기
                  </Button>
                  <Button
                    color="secondary"
                    size="lg"
                    className="sm:flex-1"
                    isDisabled={Boolean(busy)}
                    onClick={onStartReject}
                  >
                    반려하기
                  </Button>
                </div>
                {/*
                  * 같은 이름의 **다른** 가게는 실제로 있다. 그 길을 아예 막지 않고 여기 둔다 —
                  * 무엇을 버리는지(위의 이름·사유) 읽은 뒤에만 누를 수 있는 자리다.
                  * `confirmedDifferent` 가 `approveGroup` 의 복제본 가드를 지나가게 하는 유일한 표식이다.
                  */}
                <Button
                  color="link-color"
                  size="md"
                  className="mt-2 h-11"
                  isDisabled={Boolean(busy)}
                  onClick={() => onApprove({ asNew: true, confirmedDifferent: true })}
                >
                  정말 다른 가게예요 — 새 장소로
                </Button>
              </div>
            ) : state.similar ? (
              /*
               * 0.4~0.85 구간. 코드가 정하면 어느 쪽이든 조용히 틀린다 — 합치면 오병합, 새로 만들면 이웃 가게의 중복이다.
               * 그래서 닮은 이유(reason)를 그대로 보여 주고 사람이 고른다.
               */
              <div>
                <p className="text-sm text-secondary">
                  같은 가게인지 확실하지 않아요: <span className="font-semibold">{state.similar.name}</span> — 같은
                  곳인지 봐 주세요.
                  {similarArchived && (
                    <>
                      {' '}
                      <Badge type="color" size="sm" color="warning">
                        내림
                      </Badge>
                    </>
                  )}
                </p>
                {/* 이름 없는 괄호 소수(0.62)를 "62% 확실" 로 읽는 오독을 없앤다. 값은 살린다 — 같은 모양의 사유가 0.45 일 수도 0.82 일 수도 있다. */}
                <p className="mt-0.5 text-xs text-tertiary">
                  닮은 정도 {Math.round(state.similar.confidence * 100)}% · {state.similar.reason}
                </p>
                {/*
                  * 내린 곳이면 **왜 내렸는지**를 같이 보여 준다. 이 한 줄이 없으면 '되살려서 합치기' 가
                  * 폐업한 가게를 되살리는 버튼인지 다시 연 가게를 잇는 버튼인지 구분할 근거가 화면에 없다.
                  */}
                {similarArchived && noteLineText(lastNoteLine(state.similar.archiveNote)) && (
                  <p className="mt-0.5 text-xs text-tertiary">
                    {noteLineText(lastNoteLine(state.similar.archiveNote))}
                  </p>
                )}
                {/* 이 버튼이 곧 `confirmedDifferent` 로 기록돼 복제본 가드를 통째로 건너뛴다(adminApply.ts:241-246) — 화면이 그것을 묻는다. */}
                {similarArchived && (
                  <p className="mt-0.5 text-xs text-tertiary">
                    같은 가게면 되살려서 합쳐 주세요. 새 장소로 올리면 같은 가게가 두 번 생겨요.
                  </p>
                )}
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Button
                    color="primary"
                    size="lg"
                    className="sm:flex-1"
                    isDisabled={Boolean(busy)}
                    isLoading={busy === 'approving'}
                    /* 내린 곳이면 합치기 전에 되살려야 한다 — 안 그러면 `approveGroup` 이 archived 가드에서 되돌려 보낸다. */
                    onClick={() =>
                      onApprove({ mergeInto: state.similar?.id, restoreArchived: similarArchived || undefined })
                    }
                  >
                    {similarArchived ? '되살려서 합치기' : '여기에 합치기'}
                  </Button>
                  <Button
                    color="secondary"
                    size="lg"
                    className="sm:flex-1"
                    isDisabled={Boolean(busy)}
                    /*
                     * 0.4~0.85 에서는 이웃이 정말 다른 가게일 수 있어 이 길을 남긴다. 다만 그 이웃이 내린 곳이면
                     * 여기서 만드는 새 장소가 곧 복제본이라, 사람이 '내림' 배지를 보고 누른 것을 확인으로 넘긴다.
                     */
                    onClick={() => onApprove({ asNew: true, confirmedDifferent: similarArchived || undefined })}
                  >
                    {similarArchived ? '정말 다른 가게예요 — 새 장소로' : '새 장소로'}
                  </Button>
                </div>
                {/*
                 * 이 갈래에도 '아니에요' 가 있어야 한다. 0.4~0.85 는 애매한 것이 모이는 구간이라 목록글·홍보글이 그대로 여기 오는데,
                 * 둘 중 하나를 고르는 길만 두면 **반려하려면 새로고침**해야 한다 — `similar` 를 지우는 길이 성공한 승인뿐이어서다.
                 */}
                <Button
                  color="secondary"
                  size="lg"
                  className="mt-2 w-full"
                  isDisabled={Boolean(busy)}
                  onClick={onStartReject}
                >
                  반려하기
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {regionOk ? (
                  /* 버튼과 결과 한 줄을 한 덩어리로 감싼다 — 부모의 `space-y-2` 가 둘을 갈라 놓지 않게. */
                  <div>
                    <Button
                      color="primary"
                      size="lg"
                      className="w-full"
                      isDisabled={Boolean(busy)}
                      isLoading={busy === 'approving'}
                      onClick={() => onApprove()}
                    >
                      맞아요, 장소로 올리기
                    </Button>
                    {/*
                      * 누르기 전에 무엇이 되돌릴 수 없어지는지 말한다. **갈래가 셋인 이유**는 `decideTarget` 이 셋이어서다
                      * (adminApply.ts:115-127): 짝이 있으면 그리로 합치고, 짝이 없어도 `tier === 'new'` 면 **재대조**가 돌아
                      * 점수가 높으면 기존 장소로 합쳐진다. 그 갈래를 "새로 생겨요" 로 뭉개면 운영자가 되돌리려고
                      * '올린 장소' 에서 내릴 때 **합쳐 넣은 원래 장소**를 내린다 — 캡션이 틀리는 방향이 최악이 된다.
                      */}
                    <p className="mt-1 text-xs text-tertiary">
                      {pairId
                        ? matchedDraft
                          ? '기존 장소에 합쳐지고, 그 곳이 사이트에 게시돼요 · 되돌릴 수 없어요'
                          : '기존 장소에 합쳐져요 · 합친 내용은 되돌릴 수 없어요'
                        : group.tier === 'new'
                          ? '같은 가게가 이미 있으면 거기 합쳐지고, 없으면 새로 올라가요 · 결과는 누른 뒤에 알려 줘요'
                          : "새 장소로 올라가요 · 되돌릴 땐 '올린 장소' 에서 내려요"}
                    </p>
                  </div>
                ) : (
                  /*
                   * 지역이 없으면 반영을 막는다 — 읍·면 칩이 비고 상세 헤더가 '기타' 가 되기 때문이다.
                   * 선택지는 기존 86곳이 쓰는 표기뿐이다(새 표기를 만들면 그 장소 혼자 다른 칩을 단다).
                   */
                  <div className="rounded-xl bg-secondary px-3 py-3">
                    <p className="text-sm text-secondary">지역이 정해지지 않아 아직 올릴 수 없어요. 하나 골라 주세요.</p>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <Select
                        aria-label="지역 고르기"
                        /* `sm` 만 `min-h-11` 을 갖는다(select-shared.tsx) — 옆의 h-11 '저장' 과 높이를 맞추고 터치 타깃을 지킨다. */
                        size="sm"
                        placeholder="지역 고르기"
                        selectedKey={state.regionDraft ?? null}
                        onSelectionChange={(key) => key && onPickRegion(String(key))}
                        isDisabled={Boolean(busy)}
                        className="sm:flex-1"
                      >
                        {REGION_OPTIONS.map((option) => (
                          <Select.Item key={option} id={option}>
                            {option}
                          </Select.Item>
                        ))}
                      </Select>
                      <Button
                        color="primary"
                        size="lg"
                        isDisabled={Boolean(busy) || !state.regionDraft}
                        isLoading={busy === 'savingRegion'}
                        onClick={() => state.regionDraft && onSaveRegion(state.regionDraft)}
                      >
                        저장
                      </Button>
                    </div>
                  </div>
                )}

                <Button
                  color="secondary"
                  size="lg"
                  className="w-full"
                  isDisabled={Boolean(busy)}
                  onClick={onStartReject}
                >
                  반려하기
                </Button>

                {group.tier !== 'new' && pairId && regionOk && !matchedArchived && (
                  /*
                   * 짝이 잘못 붙은 경우 — 사람이 짝을 비우는 대신 여기서 신규로 보낸다(CLI 의 match_place_id 비우기와 같은 뜻).
                   * **짝이 내린 곳이면 이 버튼을 감춘다**(`!matchedArchived`). 그 경우 이 버튼은 내린 가게의 복제본을
                   * 새 id 로 게시하는 길이 되고, 그것이 소프트 삭제를 무효로 만드는 가장 빠른 경로다. 같은 일을 하려면
                   * 아래 '내린 곳' 패널의 '정말 다른 가게예요' 를 지나야 한다 — 거기서는 무엇을 버리는지 보고 누른다.
                   */
                  <Button
                    color="link-color"
                    size="md"
                    className="h-11"
                    isDisabled={Boolean(busy)}
                    onClick={() => onApprove({ asNew: true })}
                  >
                    새 장소로 올리기
                  </Button>
                )}
              </div>
            )}

            {busy && <p className="mt-2 text-sm text-tertiary">{BUSY_LABEL[busy]}</p>}
            {state.error && <p className="mt-2 text-sm text-error-primary">{state.error}</p>}
          </div>
        )
      )}

      {/* 접힌 상태에서도 방금 실패한 것은 보여야 한다 — 펼치지 않으면 왜 안 됐는지 알 수 없다. */}
      {!expanded && state.error && <p className="px-4 pb-3 text-sm text-error-primary">{state.error}</p>}
    </li>
  );
}
