'use client';

import { MessageAlertSquare } from '@untitledui/icons';
import { useState } from 'react';
import { Button } from '../components/base/button';
import { ReportSheet } from '../components/reportSheet';
import { PICKABLE_REPORT_KINDS } from '../lib/placeReport';
import type { TPlaceEntry } from '../lib/places';

/**
 * 상세 맨 아래 "정보가 달라요" — 사용자 제보의 입구(docs/todo/10 F1, ADR-021).
 *
 * 자리를 맨 아래로 둔 것은 07 의 판단 그대로다: 제보는 **다녀온 뒤**의 동작이라 제목 밑 액션 줄(가기 전의 동작 — 저장·공유·네이버)과 섞지 않는다.
 * 디자인 트랙(10 §7)이 자리·문구를 다시 정하면 이 컴포넌트 하나만 옮기면 된다.
 */
export function PlaceDetailReport({ place }: { place: TPlaceEntry }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="mt-8 px-4 md:px-6" aria-labelledby="place-report-title">
      <div className="rounded-2xl border border-secondary bg-primary p-4">
        <h2 id="place-report-title" className="text-md font-bold text-primary">
          다녀와 보니 달랐나요?
        </h2>
        <p className="mt-1 text-sm text-tertiary">문을 닫았거나 주소·조건이 다르면 알려 주세요. 다음 사람이 헛걸음하지 않게 고칠게요.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="md" color="secondary" iconLeading={MessageAlertSquare} className="min-h-11" onClick={() => setOpen(true)}>
            정보가 달라요
          </Button>
        </div>
      </div>

      <ReportSheet
        isOpen={open}
        onOpenChange={setOpen}
        title="정보가 달라요"
        lead={`${place.name} — 무엇이 다른지 골라 주세요.`}
        placeId={place.id}
        kinds={PICKABLE_REPORT_KINDS}
        notePlaceholder="예: 9월부터 영업 안 해요 · 실내는 안 되고 테라스만 돼요"
      />
    </section>
  );
}
