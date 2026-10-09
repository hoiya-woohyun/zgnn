'use client';

import { CheckCircle, MessageAlertSquare } from '@untitledui/icons';
import { useEffect, useState } from 'react';
import { Button } from '../components/base/button';
import { ReportSheet } from '../components/reportSheet';
import { showAppStatus } from '../lib/appStatus';
import {
  buildReport,
  canReportNow,
  PICKABLE_REPORT_KINDS,
  recentReportKinds,
  REPORT_COOLDOWN_TEXT,
  reportFailureText,
  reportSentText,
  reportTraceText,
  type TReportKind,
} from '../lib/placeReport';
import { APP_BUILD, readReportRecord, rememberReport, sendPlaceReport } from '../lib/placeReportSend';
import type { TPlaceEntry } from '../lib/places';
import { CARD_SURFACE } from '../components/cardSurface';

/**
 * 상세 맨 아래 "정보가 달라요" — 사용자 제보의 입구(docs/todo/10 F1, ADR-021).
 *
 * 자리를 맨 아래로 둔 것은 07 의 판단 그대로다: 제보는 **다녀온 뒤**의 동작이라 제목 밑 액션 줄(가기 전의 동작 — 저장·공유·네이버)과 섞지 않는다.
 * 디자인 트랙(10 §7)이 자리·문구를 다시 정하면 이 컴포넌트 하나만 옮기면 된다.
 */
export function PlaceDetailReport({ place }: { place: TPlaceEntry }) {
  const [open, setOpen] = useState(false);
  const [sendingVisit, setSendingVisit] = useState(false);

  /*
   * 보낸 흔적(14 W261007.19) — 보낸 것을 서버에서 다시 읽을 수 없어 이 기기의 하루 기록(`zgnn-reports`)이 전부다.
   * 미리 그린 HTML 엔 localStorage 가 없어 마운트 뒤에 읽는다(빈 기록으로 시작 — 하이드레이션과 어긋나지 않게). 보낸 직후에는 다시 읽는다.
   */
  const [sentKinds, setSentKinds] = useState<TReportKind[]>([]);
  // 지금 시각은 읽는 순간에 잰다 — 렌더 중에 재면 다시 그릴 때마다 값이 흔들린다.
  const reread = () => setSentKinds(recentReportKinds(readReportRecord(), place.id, Date.now()));
  useEffect(() => {
    // localStorage 는 React 밖의 상태다 — 마운트 때 한 번 옮겨 담는다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSentKinds(recentReportKinds(readReportRecord(), place.id, Date.now()));
  }, [place.id]);
  const trace = reportTraceText(sentKinds);

  /*
   * 다녀왔어요(F2) — **한 번 누르면 바로 간다.** 고를 것도 적을 것도 없는 긍정 신호라 시트를 열면 아무도 안 누른다.
   * 되돌리기는 없다(보낸 것을 읽을 수 없다) — 그래서 버튼 이름이 무엇을 보내는지 끝까지 말한다. 제보 시트 안의 한 종류로
   * 묻지 않은 것도 같은 이유다: "정보가 달라요" 를 연 사람에게 "그대로였어요" 는 반대말이다.
   */
  const sendVisited = async () => {
    if (!canReportNow(readReportRecord(), place.id, 'visited_ok', Date.now())) {
      showAppStatus(REPORT_COOLDOWN_TEXT);
      return;
    }
    const built = buildReport({ placeId: place.id, kind: 'visited_ok', build: APP_BUILD });
    if (!built.ok) return;
    setSendingVisit(true);
    const result = await sendPlaceReport(built.row);
    setSendingVisit(false);
    if (!result.ok) {
      showAppStatus(reportFailureText(result.reason));
      return;
    }
    rememberReport(place.id, 'visited_ok');
    showAppStatus(reportSentText('visited_ok'));
    reread();
  };

  return (
    <section className="mt-8 px-4 md:px-6" aria-labelledby="place-report-title">
      <div className={`${CARD_SURFACE} p-4`}>
        <h2 id="place-report-title" className="text-md font-bold text-primary">
          다녀오셨나요?
        </h2>
        <p className="mt-1 text-sm text-tertiary">
          그대로였는지, 달랐는지 알려 주세요. 다음 사람이 헛걸음하지 않게 확인 날짜를 고치고 정보를 바로잡을게요.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="md"
            color="secondary"
            iconLeading={CheckCircle}
            className="min-h-11"
            isLoading={sendingVisit}
            isDisabled={sendingVisit}
            onClick={() => void sendVisited()}
          >
            그대로였어요
          </Button>
          <Button size="md" color="secondary" iconLeading={MessageAlertSquare} className="min-h-11" onClick={() => setOpen(true)}>
            정보가 달라요
          </Button>
        </div>
        {trace && <p className="mt-3 text-sm text-secondary">{trace}</p>}
      </div>

      <ReportSheet
        isOpen={open}
        onOpenChange={setOpen}
        title="정보가 달라요"
        lead={`${place.name}에서 무엇이 다른지 골라 주세요.`}
        placeId={place.id}
        kinds={PICKABLE_REPORT_KINDS}
        notePlaceholder="예: 9월부터 영업 안 해요 · 실내는 안 되고 테라스만 돼요"
        onSent={reread}
      />
    </section>
  );
}
