'use client';

/**
 * ⑤ 알림 — Slack 웹훅이 있는지(features/ops-dashboard.md ⑤). 브라우저는 Vault 를 볼 수 없어 `ops_overview` 가 **이름이 있는지** 만
 * boolean 으로 준다(URL 은 오지 않는다). 이 화면을 여는 것만으로 Slack 에 아무것도 가지 않는다.
 *
 * 테스트 버튼은 아직 없다 — 버튼이 부를 `ops_slack_test()`(todo/15 T1.3)를 Slack 트리거(T5)와 함께 하기로 미뤘다. 원격에 없는 rpc 를
 * 부르는 버튼을 두면 누를 때마다 "함수 없음" 이 뜬다. 버튼은 T6.1 에서 이 묶음에 더한다.
 */
export function AdminOpsPageAlerts({ slackConfigured }: { slackConfigured: boolean }) {
  return (
    <section className="mt-6 px-4 md:px-6" aria-label="알림">
      <h2 className="text-sm font-semibold text-primary">알림</h2>
      <p className="mt-2 text-xs text-secondary">
        {slackConfigured
          ? 'Slack 웹훅 있음 — 실패한 실행이 Slack 으로 가요. 보낸 결과는 실행 기록의 알림 열에 남아요.'
          : 'Slack 알림이 꺼져 있어요 — 켜려면 docs/todo/15 의 T5(Slack 트리거 · Vault 의 slack_webhook_url). 알림 없이도 이 화면은 전부 동작해요.'}
      </p>
    </section>
  );
}
