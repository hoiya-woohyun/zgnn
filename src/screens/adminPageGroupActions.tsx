'use client';

import { useState, type ComponentProps, type ReactNode } from 'react';
import { Badge } from '../components/base/badges';
import { Button } from '../components/base/button';
import { Select } from '../components/base/select';
import type { TAddressChoice } from '../lib/adminAddress';
import type { TBlockChoice } from '../lib/adminBlocks';
import { regionOptionsFor, UPDATE_REJECT_REASONS, type TCandidateGroup, type TRejectReason } from '../lib/adminCandidates';
import type { TLatestPlan } from '../lib/adminLatest';
import { lastNoteLine, noteLineText, PLACE_STATUS_COLOR, PLACE_STATUS_LABEL } from '../lib/adminPlaces';
import type { TAdminPageGroupState, TApproveChoice } from './adminPageGroupCard';
import { AdminPageRejectForm } from './adminPageRejectForm';

const BUSY_LABEL: Record<NonNullable<TAdminPageGroupState['busy']>, string> = {
  approving: '반영하고 있어요…',
  rejecting: '제외하고 있어요…',
  savingRegion: '저장하고 있어요…',
  savingEdit: '저장하고 있어요…',
  reanalyzing: '분석을 지우고 있어요…',
  confirming: '확인을 남기고 있어요…',
};

/**
 * 버튼 줄 위의 한두 줄 — **예외일 때만** 선다(주소 고르기 · 내린 곳 · 닮은 곳 · 지역 없음 · 근거 없음 · 합칠 곳).
 * 평범한 신규 후보에는 아무 문장도 없다: 운영자는 한 명이고 매일 보므로 버튼 이름이 곧 설명이다.
 */
function Situation({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="text-xs">
      <p className="font-semibold text-primary">{title}</p>
      {children && <div className="mt-0.5 space-y-0.5 text-tertiary">{children}</div>}
    </div>
  );
}

/** 한 줄 버튼 무리. 주 버튼 하나 + 나머지는 회색 — 색은 누를 것 하나에만 쓴다. */
const Row = ({ children }: { children: ReactNode }) => <div className="flex flex-wrap items-center gap-1.5">{children}</div>;

/**
 * 펼친 줄의 **결정 줄** — 근거 **아래** 한 줄에 `[올리기] 반려 · 고치기 · 재분석`(2026-09-30 v2).
 *
 * 오른쪽 카드(결정 레일)였던 자리다. 레일은 버튼마다 밑에 설명문을 달고, 같은 동작이 표 위 일괄 줄에도 있어서 두 겹으로 무거웠다
 * (UI 스냅샷 피드백). 근거를 다 읽은 자리에서 바로 누르도록 근거 끝(`여기까지 · 접기` 줄)으로 내렸고, 설명문은 뺐다 —
 * 되돌릴 수 없는 결과는 버튼 `title` 과 누른 뒤의 결과 한 줄이 말한다.
 *
 * **색이 곧 기본값이다.** 주 버튼(핑크)은 한 줄에 하나이고 상황이 그것을 옮긴다:
 * - `주소 다름` → 올리기가 **없다.** 어느 주소가 맞는지 고르기 전에는 못 올린다(`leadProblem` 도 막는다 — 일괄 올리기 경로).
 * - 교차점검 `동반 근거 없음`·`동반 불가 정황` → 주 버튼이 **반려**, 올리기는 회색으로 내려간다.
 * - 짝이 내린 곳 · 닮은 곳 → 그 갈래의 결정(되살려서 합치기 · 같은 곳이에요)이 주 버튼이다.
 *
 * 갈래와 각 버튼이 싣는 `TApproveChoice`(= 안전장치)는 레일 시절과 같다 — 모양만 바뀌었다.
 */
export function AdminPageGroupActions({
  group,
  state,
  regionOk,
  addressPick,
  needsLook,
  latest,
  latestAvailable,
  overwritePick,
  onApprove,
  onStartReject,
  onCancelReject,
  onReject,
  onConfirmSite,
  onPickRegion,
  onSaveRegion,
  onChooseAddress,
  onEdit,
  reanalyzeText,
  onStartReanalyze,
  onCancelReanalyze,
  onReanalyze,
}: {
  group: TCandidateGroup;
  state: TAdminPageGroupState;
  regionOk: boolean;
  /** `주소 다름` 이 아직 안 골라졌으면 두 주소. 있으면 올리기 대신 주소 고르기가 선다. */
  addressPick: { blog: string; search: string } | null;
  /** 교차점검이 근거를 못 찾았다(`verifyNeedsLook`) — 반려가 기본 동작이 된다. */
  needsLook: boolean;
  /** 덮어쓰면 바뀌는 칸. 없으면(짝 행을 못 찾음) 그 버튼을 안 그린다. */
  latest: TLatestPlan | null;
  /** 이 갈래에서 덮어쓰기가 뜻이 있나 — 카드가 정해 근거 쪽 전·후 목록과 같은 조건을 쓴다. */
  latestAvailable: boolean;
  /** 덮을 칸(11 T1.4) — 근거 맨 위 목록의 체크. 바뀌는 칸 전부면 `latest.changes` 와 같다. */
  overwritePick: string[];
  onApprove: (choice?: TApproveChoice) => void;
  onStartReject: () => void;
  onCancelReject: () => void;
  onReject: (reason: TRejectReason, note: string, block: TBlockChoice) => void;
  onConfirmSite: () => void;
  onPickRegion: (regionRaw: string) => void;
  onSaveRegion: (regionRaw: string) => void;
  onChooseAddress: (choice: TAddressChoice) => void;
  onEdit: () => void;
  reanalyzeText?: string;
  onStartReanalyze: () => void;
  onCancelReanalyze: () => void;
  onReanalyze: () => void;
}) {
  const busy = state.busy;
  const off = Boolean(busy);
  const matched = group.lead.places;
  const pairId = group.lead.match_place_id;
  const matchedArchived = matched?.status === 'archived';
  const matchedDraft = matched?.status === 'draft';
  const similarArchived = state.similar?.status === 'archived';
  const regionChoices = regionOptionsFor(group.lead.extracted.address);

  // 반려 폼은 이 줄 **자리에서** 열린다 — 누른 자리에서 이어서 고르고, 근거는 위에 그대로 남는다.
  if (state.rejecting) {
    return (
      <AdminPageRejectForm
        inline
        busy={busy === 'rejecting'}
        onCancel={onCancelReject}
        onSubmit={onReject}
        // 갱신 묶음은 칩이 다르다(11 §4-4 ⑤) — `폐업`·`동반 불가` 는 반려가 아니라 사이트를 바꿀 입구다.
        reasons={group.kind === 'update' ? UPDATE_REJECT_REASONS : undefined}
      />
    );
  }

  // 재분석 확인도 같은 자리. 무엇이 사라지는지(형제 후보 수까지) 읽고 누르는 자리다.
  if (state.reanalyzing) {
    return (
      <div className="space-y-2">
        <Situation title="수집 완료로 되돌릴까요?">
          <p>{reanalyzeText}</p>
          <p>
            목록에서 빠진 후보는 반려 목록에 남아요. 그다음 터미널에서 <code>pnpm data:analyze</code> 를 돌려 주세요.
          </p>
        </Situation>
        <Row>
          <TipButton color="secondary" size="sm" isDisabled={off} isLoading={busy === 'reanalyzing'} onClick={onReanalyze}>
            재분석
          </TipButton>
          <TipButton color="secondary" size="sm" isDisabled={off} onClick={onCancelReanalyze}>
            취소
          </TipButton>
        </Row>
        <Status state={state} />
      </div>
    );
  }

  const tertiary = (label: string, onClick: () => void, extra?: { title?: string; isDisabled?: boolean }) => (
    <TipButton color="tertiary" size="sm" isDisabled={off || extra?.isDisabled} onClick={onClick} title={extra?.title}>
      {label}
    </TipButton>
  );

  /**
   * 덮어쓰기 — **고른** 칸 수를 이름에 싣는다(무엇이 바뀌는지는 근거 맨 위 목록이 말한다). 바뀔 칸이 없으면 안 그린다.
   * 다 끄면 꺼진다. 전부 골랐으면 칸 목록을 넘기지 않는다 — 지금까지의 "바뀌는 칸 전부" 와 같은 쓰기다.
   */
  const overwrite = (choice: TApproveChoice) =>
    latestAvailable && latest && latest.changes.length ? (
      <TipButton
        color="secondary"
        size="sm"
        isDisabled={off || overwritePick.length === 0}
        isLoading={busy === 'approving'}
        title="기존 장소의 칸을 새 분석 값으로 바꿔요 — 덮을 칸은 위 목록에서 골라요"
        onClick={() =>
          onApprove({ ...choice, overwrite: true, overwriteColumns: overwritePick.length === latest.changes.length ? undefined : overwritePick })
        }
      >
        덮어쓰기 · {overwritePick.length}칸
      </TipButton>
    ) : null;

  /*
   * 반려 · 고치기 · 재분석 — 모든 갈래 끝에 같은 순서로 선다.
   * 고치기가 전부에 서는 이유: 닮은 곳(0.4~0.85)·지역 없음 줄이 곧 "이름·주소가 틀렸나" 를 가리는 자리다.
   * `rejectPrimary` 면 반려는 앞쪽 주 버튼으로 나갔으니 여기서 빠진다.
   */
  const tail = (rejectPrimary = false) => (
    <>
      {!rejectPrimary && tertiary('제외', onStartReject)}
      {tertiary('고치기', onEdit)}
      {tertiary('재분석', onStartReanalyze, {
        isDisabled: !group.lead.post_url,
        title: group.lead.post_url ? '이 글을 수집 완료로 되돌려요(지우지 않아요)' : '글 링크가 없어 다시 읽을 수 없어요',
      })}
    </>
  );

  let body: ReactNode;
  if (state.archived) {
    /*
     * 짝지은 장소가 **내린 곳**이다. 이 갈래가 소프트 삭제의 방어선이고, 여기서 '새 장소로' 를 권하지 않는 것이 요점이다 —
     * 그러면 내린 가게의 복제본이 새 id 로 다시 올라가 내린 일 자체가 무효가 된다. 다시 열었으면 되살려 합치고, 폐업 그대로면 반려한다.
     */
    const note = noteLineText(lastNoteLine(state.archived.note));
    const placeId = state.archived.placeId;
    body = (
      <>
        <Situation title={<>내린 곳과 같은 가게예요 · {state.archived.placeName}</>}>{note && <p>{note}</p>}</Situation>
        <Row>
          <TipButton
            color="primary"
            size="sm"
            isDisabled={off}
            isLoading={busy === 'approving'}
            title="게시로 되돌리고 빈 칸만 채워요"
            /* **짝 id 를 실어 보낸다.** 안 실으면 그 사이 다른 줄의 승인이 캐시를 바꿔 다른 장소로 합쳐진다 — 조용한 오병합이다. */
            onClick={() => onApprove({ mergeInto: placeId, restoreArchived: true })}
          >
            되살려서 합치기
          </TipButton>
          {overwrite({ mergeInto: placeId, restoreArchived: true })}
          {tail()}
          {/* 같은 이름의 **다른** 가게는 실제로 있다. 막지 않고 맨 끝 회색 링크로 — `confirmedDifferent` 가 복제본 가드를 지나는 유일한 표식이다. */}
          <Escape busy={busy} label="정말 다른 가게예요 — 새 장소로" title="같은 가게면 두 번 생겨요" onClick={() => onApprove({ asNew: true, confirmedDifferent: true })} />
        </Row>
      </>
    );
  } else if (state.similar) {
    /*
     * 0.4~0.85 구간. 코드가 정하면 어느 쪽이든 조용히 틀린다 — 합치면 오병합, 새로 만들면 이웃 가게의 중복이다.
     * 닮은 이유를 그대로 보여 주고 사람이 고른다. 여기서 '새 장소로' 는 빠져나가는 길이 아니라 동등한 두 선택 중 하나다.
     */
    const similar = state.similar;
    const archiveNote = similarArchived ? noteLineText(lastNoteLine(similar.archiveNote)) : null;
    body = (
      <>
        <Situation
          title={
            <>
              같은 가게일까요? · {similar.name}{' '}
              {similarArchived && (
                <Badge type="color" size="sm" color="warning">
                  내림
                </Badge>
              )}
            </>
          }
        >
          {/* 이름 없는 괄호 소수(0.62)를 "62% 확실" 로 읽는 오독을 없앤다. */}
          <p>
            닮은 정도 {Math.round(similar.confidence * 100)}% · {similar.reason}
          </p>
          {archiveNote && <p>{archiveNote}</p>}
        </Situation>
        <Row>
          <TipButton
            color="primary"
            size="sm"
            isDisabled={off}
            isLoading={busy === 'approving'}
            /* 내린 곳이면 합치기 전에 되살려야 한다 — 안 그러면 `approveGroup` 이 archived 가드에서 되돌려 보낸다. */
            onClick={() => onApprove({ mergeInto: similar.id, restoreArchived: similarArchived || undefined })}
          >
            {similarArchived ? '같은 곳이에요 — 되살려서 합치기' : '같은 곳이에요 — 합치기'}
          </TipButton>
          <TipButton
            color="secondary"
            size="sm"
            isDisabled={off}
            title={similarArchived ? '같은 가게면 두 번 생겨요' : undefined}
            /* 이웃이 내린 곳이면 여기서 만드는 새 장소가 곧 복제본이라, '내림' 배지를 보고 누른 것을 확인으로 넘긴다. */
            onClick={() => onApprove({ asNew: true, confirmedDifferent: similarArchived || undefined })}
          >
            다른 곳이에요 — 새 장소로
          </TipButton>
          {overwrite({ mergeInto: similar.id, restoreArchived: similarArchived || undefined })}
          {tail()}
        </Row>
      </>
    );
  } else if (addressPick) {
    /*
     * **주소가 두 곳이다** — 검색이 동명의 다른 가게를 집었을 수 있다(실측: 애월 `신엄안3길 95` ↔ 서귀포 `대포로 93`).
     * 고르기 전에는 올리기가 없다. 지역도 고른 주소를 따라간다(`chooseAddress`) — 난드르 포구의 '지역 없음' 과 같은 틀이다.
     */
    body = (
      <>
        <Situation title="어느 주소가 맞나요?">
          <p>원글 · {addressPick.blog}</p>
          <p>검색 · {addressPick.search}</p>
        </Situation>
        <Row>
          <TipButton
            color="secondary"
            size="sm"
            isDisabled={off}
            isLoading={busy === 'savingEdit'}
            title="주소를 원글 것으로 바꾸고, 검색이 준 좌표는 버려요 — 지역도 원글 주소로 다시 정해요"
            onClick={() => onChooseAddress('blog')}
          >
            원글 주소로
          </TipButton>
          <TipButton color="secondary" size="sm" isDisabled={off} title="검색 주소·좌표를 그대로 써요" onClick={() => onChooseAddress('search')}>
            검색 주소로
          </TipButton>
          {tail()}
        </Row>
      </>
    );
  } else if (!regionOk) {
    /*
     * 지역이 없으면 반영을 막는다 — 읍·면 칩이 비고 상세 헤더가 '기타' 가 되기 때문이다.
     * 선택지는 기존 86곳이 쓰는 표기뿐이다(새 표기를 만들면 그 장소 혼자 다른 칩을 단다).
     */
    body = (
      <>
        {/*
          * 주소에 읍·면이 있으면 그 선택지를 맨 위로(`regionOptionsFor`) — 안덕면처럼 방향이 갈리는 곳이 대표라, 20여 개 목록에서
          * `남쪽 (안덕면)`·`서쪽 (안덕면)` 을 찾게 두지 않는다. 어느 쪽인지는 여전히 사람이 정한다.
          */}
        <Situation title="지역을 골라야 올릴 수 있어요">
          {regionChoices.town && <p>주소가 {regionChoices.town}이에요 — 맨 위의 {regionChoices.suggested.join(' · ')} 중에서 골라 주세요.</p>}
        </Situation>
        <Row>
          <Select
            aria-label="지역 고르기"
            size="sm"
            className="w-48"
            placeholder="지역 고르기"
            selectedKey={state.regionDraft ?? null}
            onSelectionChange={(key) => key && onPickRegion(String(key))}
            isDisabled={off}
          >
            {[...regionChoices.suggested, ...regionChoices.rest].map((option) => (
              <Select.Item key={option} id={option}>
                {option}
              </Select.Item>
            ))}
          </Select>
          <TipButton
            color="primary"
            size="sm"
            isDisabled={off || !state.regionDraft}
            isLoading={busy === 'savingRegion'}
            onClick={() => state.regionDraft && onSaveRegion(state.regionDraft)}
          >
            지역 저장
          </TipButton>
          {tail()}
        </Row>
      </>
    );
  } else {
    /*
     * 기본 갈래 — 누르면 무슨 일이 되는지는 `title` 이 말한다. **갈래가 셋인 이유**는 `decideTarget` 이 셋이어서다:
     * 짝이 있으면 그리로 합치고, 짝이 없어도 `tier === 'new'` 면 재대조가 돌아 점수가 높으면 기존 장소로 합쳐진다.
     */
    const approveTitle = pairId
      ? matchedDraft
        ? '빈 칸만 채우고 그 곳을 게시해요 · 되돌릴 수 없어요'
        : '빈 칸만 채워요 · 합친 내용은 되돌릴 수 없어요'
      : group.tier === 'new'
        ? '같은 가게가 이미 있으면 거기 합쳐져요'
        : "새 장소로 올라가요 · 되돌릴 땐 '올린 장소' 에서 내려요";
    const approve = (
      <TipButton
        color={needsLook ? 'secondary' : 'primary'}
        size="sm"
        isDisabled={off}
        isLoading={busy === 'approving'}
        title={approveTitle}
        onClick={() => onApprove()}
      >
        {pairId ? '합치기' : '올리기'}
      </TipButton>
    );
    body = (
      <>
        {pairId || needsLook ? (
          <Situation
            title={
              pairId ? (
                <>
                  합칠 곳 ·{' '}
                  {matched?.status === 'published' ? (
                    <a className="text-brand-secondary underline" href={`/place/${matched.id}/`} target="_blank" rel="noopener noreferrer">
                      {matched.name}
                    </a>
                  ) : (
                    (matched?.name ?? '짝지은 장소')
                  )}{' '}
                  {matched && matched.status !== 'published' && (
                    <Badge type="color" size="sm" color={PLACE_STATUS_COLOR[matched.status]}>
                      {PLACE_STATUS_LABEL[matched.status]}
                    </Badge>
                  )}
                </>
              ) : (
                '교차점검이 강아지를 데려간 근거를 못 찾았어요'
              )
            }
          >
            {/* 병합 승인은 초안 대상을 **게시로 올린다**(`adminApply.ts`) — 버튼 앞에서 "사이트는 안 바뀐다" 로 읽히면 안 된다. */}
            {matchedDraft && <p>아직 사이트에 없는 곳이에요 — 합치면 함께 게시돼요.</p>}
            {matchedArchived && <p>짝이 내린 곳이에요 — 누르면 되살릴지 물어봐요.</p>}
            {pairId && needsLook && <p>교차점검이 강아지를 데려간 근거를 못 찾았어요.</p>}
          </Situation>
        ) : null}
        <Row>
          {/* 근거가 없으면 반려가 주 버튼이다 — 5곳이 핑크 한 번씩에 게시되던 자리(UI 스냅샷 피드백). */}
          {needsLook && (
            <TipButton color="primary" size="sm" isDisabled={off} onClick={onStartReject}>
              제외
            </TipButton>
          )}
          {approve}
          {overwrite({ mergeInto: pairId })}
          {/*
            * 갱신 묶음의 둘째 결정(11 U8) — 글들과 사이트를 대 봤더니 사이트가 맞다. 반려가 아니라 **확인**이다:
            * 장소에 확인 날짜를 찍고(되돌릴 수 없다) 후보를 눕힌다. 블랙리스트는 건드리지 않는다 — 틀린 것은 가게가 아니라 글이다.
            */}
          {group.kind === 'update' && pairId && !matchedArchived && (
            <TipButton
              color="secondary"
              size="sm"
              isDisabled={off}
              isLoading={busy === 'confirming'}
              title="사이트 값이 맞아요 — 확인 날짜를 찍고 이 글들을 내려요. 이 날짜보다 옛 글은 다시 안 올라와요"
              onClick={onConfirmSite}
            >
              사이트가 맞아요
            </TipButton>
          )}
          {tail(needsLook)}
          {/*
           * 짝이 잘못 붙은 경우 — 신규로 보낸다. **짝이 내린 곳이면 감춘다**: 그 경우 이 버튼은 내린 가게의 복제본을
           * 새 id 로 게시하는 길이 되고, 같은 일은 '내린 곳' 갈래의 '정말 다른 가게예요' 를 지나야 한다.
           */}
          {group.tier !== 'new' && pairId && !matchedArchived && (
            <Escape busy={busy} label="짝이 틀렸어요 — 새 장소로" title="짝을 무시하고 새로 만들어요" onClick={() => onApprove({ asNew: true })} />
          )}
        </Row>
      </>
    );
  }

  return (
    <div className="space-y-2">
      {body}
      <Status state={state} />
    </div>
  );
}

function Status({ state }: { state: TAdminPageGroupState }) {
  return (
    <>
      {state.busy && <p className="text-xs text-tertiary">{BUSY_LABEL[state.busy]}</p>}
      {state.error && <p className="text-xs text-error-primary">{state.error}</p>}
    </>
  );
}

/**
 * 빠져나가는 길 — 짝을 **버리는** 선택. 앞에 구분선을 두고 밑줄 회색 링크로 줄 맨 끝에 둔다(주 버튼과 같은 색이면 가장 위험한 버튼이 가장 눈에 띈다).
 * 한 번 누르면 확인 한 줄이 서고, 거기서 다시 눌러야 실행된다 — 복제본이 게시되는 길이라 `접기` 와 헷갈린 손이 닿지 않게.
 */
function Escape({ busy, label, title, onClick }: { busy: TAdminPageGroupState['busy']; label: string; title: string; onClick: () => void }) {
  const [asking, setAsking] = useState(false);
  if (asking) {
    return (
      <div className="basis-full space-y-1.5 border-t border-secondary pt-2">
        <Situation title="정말 다른 가게예요?">같은 가게면 장소가 두 개 생겨요.</Situation>
        <Row>
          <TipButton color="secondary" size="sm" isDisabled={Boolean(busy)} isLoading={busy === 'approving'} onClick={onClick}>
            네, 새 장소로
          </TipButton>
          <TipButton color="secondary" size="sm" isDisabled={Boolean(busy)} onClick={() => setAsking(false)}>
            취소
          </TipButton>
        </Row>
      </div>
    );
  }
  return (
    <>
      <span aria-hidden="true" className="ml-1 text-quaternary">
        |
      </span>
      <TipButton color="link-gray" size="sm" className="underline" isDisabled={Boolean(busy)} title={title} onClick={() => setAsking(true)}>
        {label}
      </TipButton>
    </>
  );
}

/**
 * `title` 을 쓰는 버튼. react-aria 버튼은 DOM 으로 넘길 속성을 거르면서 `title` 을 버린다(`filterDOMProps`) —
 * 그래서 감싼 칸에 단다. 버튼 밑 설명문이던 문장들이 여기로 왔다: 매일 보는 운영자에게는 누르기 전 한 번 확인하면 되는 말이다.
 */
function TipButton({ title, ...props }: ComponentProps<typeof Button> & { title?: string }) {
  const button = <Button {...props} />;
  return title ? (
    <span title={title} className="inline-flex">
      {button}
    </span>
  ) : (
    button
  );
}
