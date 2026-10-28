# ADR-031 — 방문 수는 Vercel Web Analytics 로, 페이지뷰만

> 최종 수정: 2026-10-28 (v1: 신설 — [19 §5](../todo/19-area-cards.md) 사용자 결정 "들인다"(2026-10-27). `@vercel/analytics` 를 루트 레이아웃에 달았다. 🧑 Vercel 대시보드에서 Web Analytics 를 켜야 쌓이기 시작한다)
> 상태: 결정. 코드는 들어갔고, 대시보드 켜기는 사람 손(NOW 「기다림」).

## 맥락

[19 §4](../todo/19-area-cards.md) 의 정량 go(2026-12-03)는 "동네 카드를 몇 명이 봤나" 를 **진짜 사용자 수치**로 재야 한다. 합성 페르소나 평가는 kill 근거로만 쓴다.
쌓이는 수치는 배포한 날부터이므로 늦을수록 모수가 준다. [ADR-029](ADR-029-ui-events.md) 의 `ui_events` 는 "무엇을 눌렀나" 에 답하지만 **방문 수·유입 경로·기기**는 따로 세지 않는다
(영속 아이디를 안 받기 때문에 방문자 수는 못 센다).

## 결정

1. **Vercel Web Analytics 를 페이지뷰만 쓴다.** Hobby 무료, 쿠키 없음, 개인을 식별하는 값을 저장하지 않는다. 요청은 **같은 출처**(`/_vercel/insights/*`)로 나가고 스크립트도 그 경로에서 온다 — 제3자 호스트로 가지 않는다.
2. **이 앱 안의 지점은 하나다** — `src/components/analytics.tsx` 의 `<Analytics />` 를 `src/app/layout.tsx` 의 `<body>` 끝에 둔다. 경로가 바뀔 때마다(Next 라우터) 페이지뷰 하나.
3. **운영 주소의 사람 방문만 센다.** `src/lib/analytics.ts` 의 `analyticsUrlOf` 가 `beforeSend` 에서 거른다 — `location.hostname !== SITE_URL 호스트`(로컬·LAN·프리뷰 배포),
   `navigator.webdriver`(`/ux-eval`·Playwright), `/admin` 이하(운영자). ADR-029 결정 6 과 같은 선이고 같은 이유다(모수가 섞이면 go 가 부풀거나 흐려진다).
   보내는 주소는 **경로만** — 쿼리·해시는 뗀다(지금 쿼리에 개인 값은 없지만 앞으로 생겨도 새지 않게).
4. **사용자 정의 이벤트는 쓰지 않는다.** Hobby 에서는 Pro 전용이다. 누름은 ADR-029 몫이라 겹치지도 않는다.
5. **[ADR-015](ADR-015-supabase-source-and-rebuild.md) 결정 2 "화면은 런타임에 아무것도 fetch 하지 않는다" 의 세 번째 예외다.** 앞의 둘은 제보·실사용 이벤트(우리 Supabase 에 insert 만)이고, 이번은 Vercel 의 같은 출처 비컨이다.
   읽기는 없고, 실패하면 아무도 모른다.

## 결과

- **로컬 `next dev` 에서는 `https://va.vercel-scripts.com/v1/script.debug.js` 를 받는다**(SDK 의 개발 모드). 운영 빌드에는 안 쓰이는 길이고 콘솔 에러는 없다(7727 실측). 거르는 쪽(`beforeSend`)이 로컬 호스트를 막으므로 어디로도 이벤트가 나가지 않는다.
- **오프라인**: 스크립트가 서비스워커 캐시에 있으면 로드되고 비컨 POST 가 조용히 실패하며, 없으면 스크립트가 안 뜬다. 화면은 어느 쪽도 모른다. 이 경로(`/_vercel/`)에 서비스워커 규칙은 따로 두지 않았다 — 같은 출처 JS 라 `defaultCache` 가 받는데 사본이 남아도 해가 없다.
- 프리뷰 배포는 `git.deploymentEnabled` 가 꺼져 있어 거의 없고, 있어도 호스트가 달라 안 센다.
- `scripts/check-bundle.mjs` 는 `supabase.co` 만 본다 — 번들에 남는 `va.vercel-scripts.com` 문자열(개발 모드용)은 걸리지 않는다.

## 하지 않는 것

- Vercel Speed Insights, 커스텀 이벤트(Pro), 영속 방문자 아이디 — 방문자 수의 정확도는 Vercel 의 일 단위 해시에 맡기고 더 파지 않는다.
- GA4·PostHog 등 — ADR-029 「맥락」 과 같은 이유(장기 키·`/ux-eval` 격리를 따로 만들어야 함).

## 다시 볼 조건

- 정량 go(2026-12-03) 판정 때 모수가 너무 작아 쓸 수 없으면 기간을 늘릴지 본다 — 도구를 바꾸는 이유는 아니다.
- 처리방침([ADR-012](ADR-012-personal-data-and-consent.md))을 만들 때 이 한 줄(Vercel 이 방문 수를 센다)을 적는다.
