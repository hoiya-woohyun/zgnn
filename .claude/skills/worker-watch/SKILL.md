---
name: worker-watch
description: 자리를 비운 동안 서버 워커(Vercel zgnn-worker)를 조금씩 돌리고 감시하는 한 회차 — 판정 스크립트가 "지금 깨워도 되나" 를 내고, 그렇다면 Chrome 으로 프로덕션 /admin 의 「미분석 N건 중 M건 분석」 버튼 하나만 누른다. 문제·한도·로그인 만료는 누르지 않고 폰 알림. `/loop 30m /worker-watch` 로 돌린다. "/worker-watch", "서버 워커 감시", "자리 비운 동안 분석 돌려 둬" 에서 실행.
---

# /worker-watch — 서버 워커 한 회차

`/loop 30m /worker-watch` 의 한 번이다. **회차는 서로를 기억하지 않는다** — 판단은 전부 `check.mjs` 가 DB · 함수 로그 · 상태 파일(`.claude/worker-watch.json`)로 낸다.
그래서 Claude 5시간 한도로 몇 회차가 통째로 빠져도, 한도가 풀린 뒤 첫 회차가 그대로 잇는다. 용어(서버 깨우기·홉·사슬)는 [ADR-028 「용어」](../../../docs/decisions/ADR-028-vercel-remote-worker.md).

**토큰을 아낀다** — 이 회차는 밤새 수십 번 돈다. 파일을 읽거나 원인을 파지 않는다. 스크립트 출력만 보고, 할 일만 하고, 한 줄로 끝낸다.

## 순서

1. `node .claude/skills/worker-watch/check.mjs` — 마지막 줄이 사람용 요약, 첫 줄이 JSON(`verdict` · `reason` · `notify` · `facts.selectLimit`).
2. `notify` 가 null 이 아니면 `PushNotification` 으로 그 문장을 그대로 보낸다(스크립트가 같은 알림을 6시간 안에 다시 내지 않는다).
3. `verdict` 가 `press` 일 때만 4로. 그 밖(`wait` · `halt` · `idle` · `blocked`)은 요약 한 줄을 출력하고 끝.
4. **버튼 누르기**(Chrome — 개인 레포라 쓴다):
   - 도구는 ToolSearch 한 번으로: `select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__find,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__get_page_text,mcp__claude-in-chrome__tabs_close_mcp`
   - `tabs_context_mcp`(createIfEmpty) 의 세션 그룹 탭에서 `https://zgnn.vercel.app/admin/` 로 `navigate`. 로그인은 그 Chrome 의 localStorage 에 있다.
   - **로그인 화면이면** 누르지 않고 `check.mjs --pressed login` → 6으로.
   - 「검수 대기」 탭을 누르고, `find` 로 **「미분석 N건 중 M건 분석」**(또는 「저수지 M건 분석」) 버튼을 찾는다. 없거나 꺼져 있으면 `--pressed no-button` → 6.
   - `facts.selectLimit` 이 30 이면(대기 중인 분석 요청이 없다 = 새 요청이 들어간다) 버튼 왼쪽 「분석할 글 수」 칸에서 **30건**을 고른 뒤 누른다. null 이면 고르지 않고 누른다(요청은 이미 있고 버튼은 서버를 깨우기만 한다).
     30건 고르기가 안 되면 그대로(10건) 눌러도 된다.
   - 누르고 `computer` 의 wait 로 5초 뒤 `get_page_text` 에서 문구를 본다:
     「로그인이 곧 끝나 서버 워커는 못 깨웠어요」 → `--pressed expiring` · 「서버 워커를 못 깨웠어요」 → `--pressed failed` · 둘 다 없으면 `--pressed ok`.
5. 기록한 결과에 "멈춤" 이 붙었으면 그 사유로 `PushNotification` 한 번.
6. **그룹 탭을 `tabs_close_mcp` 로 모두 닫는다**(턴 끝에 남기면 Stop 훅이 막는다). 요약 한 줄로 끝.

## 하지 않는 것

- **누르는 것은 그 버튼 하나뿐이다.** 승인·반려·재분석·추가 수집·내리기·고치기·로그인 입력은 하지 않는다. 화면이 예상과 다르면 누르지 않는다(`--pressed no-button`).
- 배포(`vercel deploy`)·DB 쓰기(CLI)·프로세스 죽이기·시크릿 조회를 하지 않는다. `halt` 를 스스로 풀지 않는다(`--reset` 은 사람이 본 뒤).
- 원인 조사는 이 회차의 일이 아니다 — 알림에 사유 한 줄만 싣고 사람에게 넘긴다.

## 판정이 무엇을 보나(check.mjs)

| 신호 | 판정 |
|---|---|
| 함수 로그 `Claude 구독 한도 — … 까지` · 분석 실패의 한도 오류 | `wait` — 리셋 시각(+5분)까지. 시각은 상태 파일에 남아 로그 창(40분)을 넘어도 지킨다. 못 읽으면 60분 |
| `다음 홉 … 508` · Claude `401 Invalid bearer token` · `⚠️ 홉 … 실패` · 300초 초과 · 바이너리 없음 | `halt` + 알림 |
| 서버 심장이 6분 넘게 idle 아님 · 실행 행이 6분 넘게 running | `halt`(홉이 끊겼다 — [todo/20](../../../docs/todo/20-vercel-remote-worker.md) T11) |
| 누른 뒤 8분 동안 실행 행이 하나도 안 섬 | `halt`(깨우기가 안 닿는다) |
| `/admin` JWT 만료 55분 전(로그 `만료 …` 줄 — 시각은 UTC) · 누른 결과 expiring·login | `halt` + 알림(다시 로그인 → `--reset`) |
| 서버가 도는 중 · 로컬 워커가 살아 있음 · 하루 40번 | `wait` |
| 요청 글 · 분석 요청 · 미분석 모두 0 | `idle` |
| supabase · vercel CLI 실패 | `blocked` + 알림 |
| 배터리 · caffeinate 없음 | 경고(배터리는 알림 한 번) |
