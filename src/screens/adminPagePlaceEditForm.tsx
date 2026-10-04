'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '../components/base/button';
import { Checkbox } from '../components/base/checkbox';
import { Input } from '../components/base/input';
import { Select } from '../components/base/select';
import { regionOptionsFor, TYPE_LABEL, type TPlaceRow } from '../lib/adminCandidates';
import { EDITABLE_TYPES, type TPolicyDraft } from '../lib/adminEdit';
import {
  placeCurrentText,
  placeEditChanges,
  placeEditDraft,
  placeEditPatch,
  placeEditPreview,
  placeEditProblem,
  type TPlaceEditDraft,
  type TPlaceEditPatch,
  renameRisksTwin,
} from '../lib/adminPlaceEdit';
import { naverMapSearchUrl, naverPlacePhotoUrl, parseNaverPlaceId } from '../lib/naverPlaceLink';
import type { TPetBadge } from '../lib/petPolicy';
import { cx } from '../utils/cx';
import { AdminChangeList } from './adminChangeList';
import { EDIT_GRID, EditRow, INDOOR_OPTIONS, TEXTAREA, TriButtons } from './adminPagePlaceEditFormParts';
import { ADMIN_PANEL_DIVIDER, ADMIN_POLICY_TONE } from './adminTable';

/** 사이트 배지 한 벌 — 접힌 줄·펼친 상세와 같은 칩(`ADMIN_POLICY_TONE`). 지금 · 저장하면 이 같은 모양이어야 무엇이 생기고 사라졌는지 보인다. */
function BadgeChips({ badges }: { badges: TPetBadge[] }) {
  return (
    <span className="mt-1 flex flex-wrap gap-1 text-xs">
      {badges.map((badge) => (
        <span key={badge.label} className={cx('rounded px-1.5 py-px font-medium', ADMIN_POLICY_TONE[badge.tone])}>
          {badge.label}
        </span>
      ))}
    </span>
  );
}

/**
 * 올린 장소 고치기 — 펼친 상세의 `고치기` 하나로 열린다(`adminPagePlaceRow`). 열려 있는 동안 상세 자리를 이 폼이 쓴다 —
 * 왼쪽 열이 곧 지금 값이라 상세를 같이 두면 같은 값이 두 번 선다. 쓰기는 소유자(`adminPage` 의 `savePlace`)가 하고 여기는 초안과 검사만 든다.
 *
 * **모양은 옛 후보 고치기 폼에서 왔다**(`adminPagePlaceEditFormParts` 의 `EditRow`·`TriButtons` — 그 폼은 2026-10-04 에 없앴다): `지금 값 | 고칠 값` 표, 바뀐 줄은 분홍,
 * 저장 버튼 위에 `저장하면 바뀌는 것` 목록. 두 폼의 모양이 다르면 같은 칸을 고치는 손이 화면마다 달라진다.
 *
 * 다른 점은 셋이다.
 * - **사실을 확인하러 갈 곳**(네이버 플레이스·지도 검색)을 맨 위에 둔다 — 이 폼을 여는 이유가 "실제로 보니 다르다" 라서,
 *   그 실제를 보는 길이 옆에 없으면 운영자가 기억으로 적는다(주소 폼 v25 에서 물려받았다).
 * - 지역은 기존 장소들이 쓰는 표기에서만 고른다(`regionOptionsFor` — 주소의 읍·면이 맨 위). 지금 값이 선택지에 없는 시드 표기면 그것도 남긴다.
 * - 동반 미리보기는 **사이트와 같은 길**(`placeBadges`)이다 — 후보 폼의 `previewFor` 가 아니다(`placeEditPreview` 주석).
 */
export function AdminPagePlaceEditForm({
  place,
  busy,
  onSave,
  onCancel,
}: {
  place: TPlaceRow;
  busy: boolean;
  onSave: (patch: TPlaceEditPatch) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(() => placeEditDraft(place));
  const set = (patch: Partial<TPlaceEditDraft>) => setDraft((prev) => ({ ...prev, ...patch }));
  const setPolicy = (patch: Partial<TPolicyDraft>) => setDraft((prev) => ({ ...prev, policy: { ...prev.policy, ...patch } }));

  const problem = placeEditProblem(draft);
  const patch = problem ? null : placeEditPatch(place, draft);
  const changes = placeEditChanges(place, draft);
  const changedKeys = new Set(changes.map((change) => change.key));
  const preview = placeEditPreview(place, draft);
  const placeHref = place.naver_url || naverPlacePhotoUrl(place.naver_place_id ?? undefined);
  const hasHomepage = 'homepage_url' in place;
  /* 좌표도 플레이스 id 도 없는 장소의 이름을 바꿀 때만 경고한다(`renameRisksTwin`) — 그때만 옛 이름의 새 글이 쌍둥이로 올라올 수 있다. */
  const twinRisk = renameRisksTwin(place, draft);

  const regions = regionOptionsFor(draft.address);
  const regionList = [...regions.suggested, ...regions.rest];
  const regionChoices = [...new Set([place.region_raw, draft.regionRaw].filter((value) => value && !regionList.includes(value))), ...regionList];

  const row = (key: string, label: string, children: ReactNode) => (
    <EditRow label={label} current={placeCurrentText(place, key)} changed={changedKeys.has(key)}>
      {children}
    </EditRow>
  );

  return (
    <div className={cx(ADMIN_PANEL_DIVIDER, 'space-y-3 px-4 py-3')}>
      <div>
        <p className="text-xs font-semibold text-secondary">장소 고치기</p>
        <p className="mt-1 text-xs text-tertiary">
          확인하러 가기:{' '}
          {placeHref && (
            <>
              <a href={placeHref} target="_blank" rel="noopener noreferrer" className="text-brand-secondary underline">
                네이버 플레이스
              </a>
              {' · '}
            </>
          )}
          <a href={naverMapSearchUrl(place.name)} target="_blank" rel="noopener noreferrer" className="text-brand-secondary underline">
            네이버 지도에서 찾기
          </a>
        </p>
        <p className="mt-1 text-xs text-tertiary">
          왼쪽이 지금 사이트 값, 오른쪽에 고칠 값을 적어요. 바꾼 줄은 <span className="rounded bg-brand-primary px-1">분홍</span>으로 칠해지고,
          저장 전에 아래에서 한 번 더 모아 보여 줘요.
        </p>
      </div>

      <section className="rounded-lg border border-secondary bg-primary p-1.5">
        <div className={cx('hidden px-2 py-1 text-[0.6875rem] font-semibold text-tertiary', EDIT_GRID)}>
          <span>항목</span>
          <span>지금 값</span>
          <span>고칠 값</span>
        </div>
        <p className="px-2 pt-1 text-xs font-semibold text-secondary">장소</p>
        {row('name', '이름', <Input aria-label="이름" size="sm" value={draft.name} onChange={(value) => set({ name: value })} isDisabled={busy} />)}
        {row(
          'type',
          '종류',
          <Select
            aria-label="종류"
            size="sm"
            selectedKey={draft.type}
            onSelectionChange={(key) => key && set({ type: key as TPlaceEditDraft['type'] })}
            isDisabled={busy}
          >
            {EDITABLE_TYPES.map((type) => (
              <Select.Item key={type} id={type}>
                {TYPE_LABEL[type]}
              </Select.Item>
            ))}
          </Select>,
        )}
        {row(
          'regionRaw',
          '지역',
          <>
            <Select
              aria-label="지역"
              size="sm"
              selectedKey={draft.regionRaw || null}
              onSelectionChange={(key) => key && set({ regionRaw: String(key) })}
              isDisabled={busy}
            >
              {regionChoices.map((option) => (
                <Select.Item key={option} id={option}>
                  {option}
                </Select.Item>
              ))}
            </Select>
            {regions.town && (
              <p className="mt-1 text-xs text-tertiary">
                주소가 {regions.town}이에요 — 맨 위의 {regions.suggested.join(' · ')} 중 하나일 가능성이 커요.
              </p>
            )}
          </>,
        )}
        {row('address', '주소', <Input aria-label="주소" size="sm" placeholder="제주특별자치도 서귀포시 안덕면 …" value={draft.address} onChange={(value) => set({ address: value })} isDisabled={busy} />)}
        {/*
          * 좌표는 두 칸이다. 한 칸만 채운 상태는 `validGeo` 가 통째로 버려 좌표가 조용히 사라지므로 `placeEditProblem` 이 저장을 막는다.
          * 주소만 고쳐도 되지만 지도 핀은 좌표로만 선다 — 그걸 숨기면 "고쳤는데 지도에 없다" 가 된다.
          */}
        {row(
          'geo',
          '좌표',
          <>
            <div className="grid grid-cols-2 gap-2">
              <Input aria-label="위도" placeholder="위도 (33.xx)" size="sm" value={draft.lat} onChange={(value) => set({ lat: value })} isDisabled={busy} />
              <Input aria-label="경도" placeholder="경도 (126.xx)" size="sm" value={draft.lng} onChange={(value) => set({ lng: value })} isDisabled={busy} />
            </div>
            <p className="mt-1 text-xs text-tertiary">비워도 저장돼요. 지도에 핀이 서려면 위도·경도가 둘 다 있어야 해요.</p>
          </>,
        )}
        {row(
          'naverPlace',
          '네이버 플레이스',
          <Input
            aria-label="네이버 플레이스"
            size="sm"
            placeholder="가게 화면 주소나 숫자 id"
            value={draft.naverPlace}
            onChange={(value) => set({ naverPlace: value })}
            isInvalid={'error' in parseNaverPlaceId(draft.naverPlace)}
            hint="넣으면 링크가 그 플레이스 홈으로 바뀌고 상세에 '네이버 사진' 이 생겨요. 지우면 링크도 같이 지워져요"
            isDisabled={busy}
          />,
        )}
        {/* 홈페이지 카드는 세 칸이 한 벌이다 — 주소를 비우면 카드째 빠진다. 칸이 없는 원격(마이그레이션 20260930120000 전)에서는 줄을 세우지 않는다. */}
        {hasHomepage && (
          <>
            {row('homepageUrl', '홈페이지', <Input aria-label="공식 홈페이지" size="sm" placeholder="https://…" value={draft.homepageUrl} onChange={(value) => set({ homepageUrl: value })} isDisabled={busy} />)}
            {row('homepageName', '홈페이지 이름', <Input aria-label="홈페이지 이름" size="sm" placeholder="카드에 적힐 사이트 이름" value={draft.homepageName} onChange={(value) => set({ homepageName: value })} isDisabled={busy} />)}
            {row('homepageImage', '홈페이지 사진', <Input aria-label="홈페이지 사진" size="sm" placeholder="비우면 사진 없이 카드만" value={draft.homepageImage} onChange={(value) => set({ homepageImage: value })} isDisabled={busy} />)}
          </>
        )}
        {row('category', '카테고리', <Input aria-label="카테고리" size="sm" placeholder="예: 카페, 디저트" value={draft.category} onChange={(value) => set({ category: value })} isDisabled={busy} />)}
        {row(
          'features',
          '소개',
          <textarea aria-label="소개" rows={3} value={draft.features} disabled={busy} onChange={(event) => set({ features: event.target.value })} className={TEXTAREA} />,
        )}

        {/* ── 동반 정보 — 원문과 구조값을 한 무리로(후보 폼과 같은 이유: `correctPetPolicyFacts` 가 원문에 근거 없는 판단을 지운다). */}
        <p className="mt-2 border-t border-secondary px-2 pt-2 text-xs font-semibold text-secondary">동반 정보</p>
        {row(
          'petPolicyText',
          '조건 원문',
          <>
            <textarea
              aria-label="조건 원문"
              rows={2}
              value={draft.petPolicyText}
              disabled={busy}
              onChange={(event) => set({ petPolicyText: event.target.value })}
              className={TEXTAREA}
            />
            {!draft.petPolicyText.trim() ? (
              <p className="mt-1 text-xs text-warning-primary">원문이 비어 있으면 아래 조건은 저장되지 않고, 사이트 판정은 &lsquo;정보가 없어요&rsquo; 가 돼요.</p>
            ) : (
              <p className="mt-1 text-xs text-tertiary">아래 칸에 넣은 조건도 이 문장에 근거가 있어야 사이트에 나가요.</p>
            )}
          </>,
        )}
        {row(
          'indoor',
          '실내',
          <div className="flex flex-wrap gap-1.5">
            {INDOOR_OPTIONS.map((option) => (
              <Button
                key={option.key}
                size="sm"
                color={draft.policy.indoor === option.key ? 'primary' : 'secondary'}
                aria-pressed={draft.policy.indoor === option.key}
                isDisabled={busy}
                onClick={() => setPolicy({ indoor: option.key })}
              >
                {option.label}
              </Button>
            ))}
          </div>,
        )}
        {row('largeDogOk', '대형견', <TriButtons value={draft.policy.largeDogOk} yes="가능" no="불가" busy={busy} onChange={(largeDogOk) => setPolicy({ largeDogOk })} />)}
        {row('feeFree', '추가 요금', <TriButtons value={draft.policy.feeFree} yes="없음" no="있음" busy={busy} onChange={(feeFree) => setPolicy({ feeFree })} />)}
        {row(
          'feeLines',
          '강아지 요금',
          <textarea
            aria-label="강아지 요금"
            rows={2}
            value={draft.policy.feeLines}
            disabled={busy}
            placeholder={'기준마다 한 줄\n예: 1마리당 3만원\n청소비 5만원'}
            onChange={(event) => setPolicy({ feeLines: event.target.value })}
            className={TEXTAREA}
          />,
        )}
        {row('weightLimitKg', '무게 상한', <Input aria-label="무게 상한(kg)" placeholder="숫자만 (kg)" size="sm" value={draft.policy.weightLimitKg} isDisabled={busy} onChange={(weightLimitKg) => setPolicy({ weightLimitKg })} />)}
        {row('maxDogs', '마릿수 상한', <Input aria-label="마릿수 상한" placeholder="숫자만 (마리)" size="sm" value={draft.policy.maxDogs} isDisabled={busy} onChange={(maxDogs) => setPolicy({ maxDogs })} />)}
        {row('leash', '리드줄', <Checkbox size="sm" label="리드줄 필수" isSelected={draft.policy.leash} isDisabled={busy} onChange={(leash) => setPolicy({ leash })} />)}
        {row('smallDogOnly', '소형견만', <Checkbox size="sm" label="소형견만 가능" isSelected={draft.policy.smallDogOnly} isDisabled={busy} onChange={(smallDogOnly) => setPolicy({ smallDogOnly })} />)}
        {row('callFirst', '전화 확인', <Checkbox size="sm" label="가기 전 전화 확인" isSelected={draft.policy.callFirst} isDisabled={busy} onChange={(callFirst) => setPolicy({ callFirst })} />)}
        {row('vaccineRequired', '예방접종', <Checkbox size="sm" label="예방접종 필수" isSelected={draft.policy.vaccineRequired} isDisabled={busy} onChange={(vaccineRequired) => setPolicy({ vaccineRequired })} />)}
        {row('notes', '그 밖의 조건', <Input aria-label="그 밖의 조건" size="sm" value={draft.policy.notes} isDisabled={busy} onChange={(notes) => setPolicy({ notes })} />)}

        {/* 숙소 칸은 고친 종류가 숙소일 때만 — 다른 종류에는 원래 없는 칸이고, 쓰기에도 실리지 않는다(`placeEditPatch`). */}
        {draft.type === 'stay' && (
          <>
            <p className="mt-2 border-t border-secondary px-2 pt-2 text-xs font-semibold text-secondary">숙소</p>
            {row('stayPriceText', '숙박 요금', <textarea aria-label="숙박 요금" rows={2} value={draft.stayPriceText} disabled={busy} onChange={(event) => set({ stayPriceText: event.target.value })} className={TEXTAREA} />)}
            {row('stayAmenitiesText', '숙소 시설', <textarea aria-label="숙소 시설" rows={2} value={draft.stayAmenitiesText} disabled={busy} onChange={(event) => set({ stayAmenitiesText: event.target.value })} className={TEXTAREA} />)}
          </>
        )}
      </section>

      {/* 사이트의 동반 배지 — 지금과 저장 뒤를 나란히. 접힌 줄과 같은 함수(`placeBadges`)라 저장 뒤 화면과 어긋날 수 없다. */}
      <section className="grid gap-2 rounded-lg bg-secondary px-3 py-2 md:grid-cols-2">
        <div>
          <p className="text-xs text-tertiary">사이트의 동반 배지 — 지금</p>
          <BadgeChips badges={preview.before} />
        </div>
        <div className="md:border-l md:border-secondary md:pl-3">
          <p className="text-xs font-semibold text-secondary">저장하면</p>
          <BadgeChips badges={preview.after} />
          {preview.corrections.length > 0 && (
            <p className="mt-1 text-xs text-warning-primary">원문에 없어서 사이트가 빼고 보는 것: {preview.corrections.join(' · ')}</p>
          )}
        </div>
      </section>

      <AdminChangeList title="저장하면 바뀌는 것 — 지금 값 → 고칠 값" changes={changes} />

      {twinRisk && (
        <p className="text-xs text-warning-primary">
          좌표도 네이버 플레이스도 없는 곳이라, 이름을 바꾸면 옛 이름으로 쓴 새 글이 <span className="font-semibold">새 장소로 한 번 더</span> 올라올 수 있어요 —
          네이버 플레이스를 함께 넣으면 안전해요.
        </p>
      )}

      {/* 저장 줄은 화면 아래에 붙는다(`md` 이상) — 후보 폼과 같은 이유(폼이 한 화면을 넘는다). 막는 이유도 같이 붙어 다닌다. */}
      <div className="flex flex-wrap items-center gap-2 border-t border-secondary bg-active py-2 md:sticky md:bottom-0">
        {problem && <p className="w-full text-xs text-error-primary">{problem}</p>}
        <Button color="primary" size="sm" isDisabled={busy || !patch} isLoading={busy} onClick={() => patch && onSave(patch)}>
          {busy ? '저장하고 있어요…' : patch ? `${changes.length}칸 바꿔서 저장` : '저장'}
        </Button>
        <Button color="secondary" size="sm" isDisabled={busy} onClick={onCancel}>
          취소
        </Button>
        {/* 원문이 빈 채로 동반 칸만 만지면 목록에는 줄이 서도 쓸 것이 없다(`placeEditPatch`) — 그때는 다르게 말한다. */}
        {!problem && !patch && (
          <span className="text-xs text-tertiary">{changes.length ? '저장해도 사이트 값이 바뀌지 않아요' : '아직 바꾼 칸이 없어요'}</span>
        )}
        {patch && place.status === 'published' && <span className="text-xs text-tertiary">저장하면 다음 빌드부터 사이트에 반영돼요.</span>}
      </div>
    </div>
  );
}
