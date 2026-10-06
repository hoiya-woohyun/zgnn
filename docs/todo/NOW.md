# 지금 할 일 — 대기열

> 최종 수정: 2026-10-06 (v1: 신설 — 00~15 의 열린 항목을 한 줄 대기열로. 명세는 번호 문서, 순서는 여기)

`/next`(`.claude/skills/next/SKILL.md`)가 이 파일만 읽고 「지금」 의 맨 위부터 묻지 않고 처리한다 — 한 일 = 한 커밋, 끝나면 그 줄을 지운다.
번호 붙은 todo 문서(00~15)가 **명세**이고 이 파일은 그중 지금 할 것의 **순서**다. 사람 손·결정이 필요한 것만 「기다림」 에 모은다.

## 지금 (위에서부터)

- [ ] 야외 자유 옵션을 한 규칙으로(심바카레·무거버거·블리스풀 카드↔상세) — [14 W261006.4](14-weekly-ux-eval.md) · 왜 지금: 위 이동가방 줄을 끝낸 뒤의 나머지. 심바카레("케이지 동반시 가능")와 무거버거("실외는 자유")는 원문이 달라 판정이 다른 것이 맞을 수 있다 — 고치기 전에 원문부터 대 본다
- [ ] 이동가방·유모차를 적은 원문에 "케이지 필요" 칩을 붙이지 않는다 — [14 W261006.18](14-weekly-ux-eval.md) · 왜 지금: 0638b0f 로 판정은 카페스누피 이동가방을 받는데 칩은 여전히 '케이지 필요' — 카드와 상세가 다른 말
- [ ] 커밋된 `src/data/*.json` 을 `pnpm data:pull` 로 갱신 — [04](04-deploy-and-propagate.md) · 왜 지금: 레포 스냅샷이 시드 86곳 그대로라(`남쪽 (서귀포)` 등 13 T3.1 이 DB 에서 고친 지역이 안 보인다) 로컬 dev·테스트·다음 `/ux-eval` 이 낡은 데이터를 본다. anon 이라 세션 불필요, 0 이면 exit 1
- [ ] 강아지 저장 뒤 `/settings` 로 떨어지는지 재현부터 — [14 ↪ 08 T3.3](14-weekly-ux-eval.md) · 왜 지금: 6/6 이 겪었지만 코드는 앱 안 이동이면 `router.back()`, 딥링크면 `/settings` — 평가가 `/dog` 를 직접 연 탓인지, 홈 CTA 가 앱 기록을 안 남기는지 Playwright 로 가른다
- [ ] "지도에 없는 N곳" 을 그 N곳만 보이게 — [14 ↪ 12 U1.7](14-weekly-ux-eval.md) · 왜 지금: `mapPage.tsx` 의 링크가 `/places/<type>` 전체 목록으로 간다(코드 확인) — 5곳을 찾으러 26곳을 훑는다
- [ ] 크림 바탕 보조 텍스트 대비 4.5:1 이상 — [14 W261006.15](14-weekly-ux-eval.md) · 왜 지금: `text-quaternary` = `neutral-500` `#7d756c` 14px 가 4.27:1(홈·설정 고지문). 토큰 한 곳
- [ ] 이동 수단 "없어요" 부연을 "리드줄만 써요(걷거나 안고)" 로 — [14 W261006.14](14-weekly-ux-eval.md) · 왜 지금: `CARRIER_LABELS.none.hint` 한 줄. 대형견 보호자가 "안고 다녀요" 에서 첫인상을 잃는다
- [ ] 닿지 않는 U1 보강 갈래 정리 — [14 W261006.19](14-weekly-ux-eval.md) · 왜 지금: cd6eb4c 뒤로 죽은 코드. 작다

## 기다림 (사람 손·결정)

- 🧑 검수 대기 130곳을 `/admin` 에서 훑고 등록·제외 — [13 §5](13-ai-analysis-audit-2026-10-04.md) · 명령: `/admin` 검수 대기 탭(블로그 장소는 아직 하나도 사이트에 없다 — 첫 등록이 곧 첫 블로그 장소)
- 🧑 Deploy Hook 회전(URL 이 대화 기록에 남았다) — [05 「Deploy Hook 회전」](05-security.md) · 명령: `vercel deploy-hooks create auto-deploy-2 --ref main` → Studio `vault.update_secret(…'vercel_deploy_hook'…)` → `vercel deploy-hooks remove gD3ioVFKtV` → `/admin` 머리글 `201` 확인 (create·list 는 URL 을 찍으니 **본인 터미널에서만**)
- 🧑 Supabase 계정 2FA 켜기 — [05](05-security.md) · 명령: supabase.com 계정 설정의 MFA(Studio 로그인 = 관리자 인증이다)
- 🙋 무료 티어 7일 일시정지 대책 — [05](05-security.md) · 권고: 주 1회 `pnpm data:collect` 를 습관으로(이제 `pipeline_runs` 에 남아 `/admin/ops` 가 "언제 돌렸나" 를 보여 준다). 그 주에 못 돌리면 Claude 가 `pnpm data:pull`(anon)로 깨운다
- 🧑 시드 나머지 63곳 추출 평가 — [features/extraction-eval](../features/extraction-eval.md) · 명령: `pnpm data:eval extract --limit 20` 을 한도 안에서 반복(23/86 캐시됨) → `pnpm data:eval score`
- 🧑 읍면이 주소와 어긋난 세 곳(+ 안덕면 방향) 바로잡기 — [12 UH.1](12-ux-audit-2026-10-02.md) · 명령: `/admin` 등록 완료 → 위미애머물다락쿤(좌표·`naverPlaceId` 부터) · 살롱드라방 · 제주포슬 주소·지역 고치기
- 🙋 미분석 글 저수지를 어디서 멈출지·수집을 줄일지 — [03 「2026-10-02 실측」](03-analyze-and-review.md) · 권고: 키워드는 그대로 두고 `--limit 30` 을 수율이 꺾일 때까지만(전량 읽기 계획 없음). 이게 정해져야 다음 대량 `data:analyze` 를 돌린다
- 🙋 업체명 재검색(ADR-019 결정 7·8)을 열지 — [03](03-analyze-and-review.md) · 권고: 먼저 🧑 PostView 지도 카드·태그 모양 한 번 확인(03 「검증 계획」 A 명령), 뺀 것 허용선은 "10건 중 1건 이하" 제안대로
- 🧑 운영 현황 실측 — [15 「검증」](15-ops-dashboard.md) · 명령: `pnpm data:collect` 한 번 → `/admin/ops` 수집 칸 "방금 · 신규 N", 실행 기록 첫 행 요약이 터미널 줄과 같은지. `pnpm data:analyze --limit 3` 도중 `kill -9` → 10분 뒤 "중단된 듯" + 안내 한 줄. 화면은 가짜 응답으로만 그려 봤다(진짜 세션·진짜 행은 아직)
- 🙋 Slack 실패 알림을 켤지(15 T1.3·T5·T6) — [15](15-ops-dashboard.md) · 권고: 위 실측 뒤 기록이 한 주 쌓이면. 켜면 🧑 Incoming Webhook 을 만들어 Studio 에서 `vault.create_secret(…, 'slack_webhook_url')`(값은 Claude 에게 보이지 않게), 개인 DM · `partial` 은 실패 건수 > 0 일 때만

## 발견 (분류 전)

<!-- /next 가 작업 중 찾은 것을 한 줄씩 — 출처: <커밋/파일>. 멈출 때 번호 문서로 옮긴다 -->
