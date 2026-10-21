---
name: next-auto
description: /next 를 서브에이전트 레인 여럿으로 계속 돌리는 감독 모드 — 메인은 감독만 한다(레인을 띄우고, 끝나면 닫고, 빈 자리를 다시 채운다). 레인은 일 하나 = 커밋 하나를 끝내고 사라지고, 쌓인 「발견」 은 정리 레인이 대기열로 되돌린다. 멈춤은 "멈춰"·STOP 파일·컨텍스트 알림·구독 한도·대기열 바닥에서 부드럽게(달리는 레인은 커밋까지). "/next-auto", "자동으로 계속 돌려", "병렬로 계속", "감독 모드", "/next-auto stop" 에서 실행.
---

# /next-auto — /next 를 레인 여럿으로 계속

메인 세션은 **감독**이다. 일은 레인(서브에이전트)이 하고, 감독은 띄우기·닫기·채우기만 한다.
레인은 일 하나를 커밋하고 끝나면 그 컨텍스트가 통째로 버려진다 — 서브에이전트에는 `/clear` 가 필요 없다. 쌓이는 곳은 **감독의 컨텍스트**뿐이라
감독은 파일을 읽지 않고, 판단은 `auto.mjs` 의 한 줄 답에 맡기고, 레인 보고는 한 줄만 받는다.

기반은 /next 그대로다 — 선점 `claim.mjs`(레인마다 `sleep` pid 주인), 커밋 `lane-commit.mjs`(개인 인덱스 + HEAD 비교 교체 · 문서는 저널),
레인 규칙 [PARALLEL.md](../next/PARALLEL.md) 「레인 규칙」. 이 스킬이 더하는 것은 **끝난 자리를 바로 채우는 감독 루프**와 멈춤 지점이다.

```
A=.claude/skills/next-auto/auto.mjs   # 아래에서 node $A … 는 이 경로
```

## 인자

`/next-auto [동시 수=3] [--max N] [--hours H] [--model sonnet|opus]` · `/next-auto stop` · `/next-auto status`

- 동시 수는 레인 수의 **상한**이다. 실제로는 파일이 안 겹치는 줄만 같이 돈다(`auto.mjs` 가 고른다).
- 모델 기본은 sonnet. 정찰이 판단이 큰 줄(설계·판정 규칙·ADR 결정)에 opus 를 적어 두면 그 줄만 opus.
- 구독 한도를 같은 계정이 나눠 쓴다(분석 파이프라인 `claude -p`·서버 워커 포함). 동시 수를 올리는 만큼 한도가 빨리 닳는다.

## 감독 순서

1. **시작** — `node $A start --lanes <동시 수> [--max N] [--hours H] [--model M]`. 출력 그대로 한두 줄 보인다.
   이전 실행이 남아 있으면 `RESUMED` 와 함께 이어 받는다(쥔 채 멈춘 줄은 같은 pid 로 RESUME).
2. **채우기** — `node $A pick` 을 아래 표대로 처리하고, **띄웠으면 다시 `pick`**. 띄울 게 없는 답이 나오면 턴을 끝낸다(알림이 다시 깨운다).

   | 답 | 할 일 |
   |---|---|
   | `LANE <pid> <model> <제목>` | Agent — `subagent_type: "general-purpose"` · `model: <model>` · `run_in_background: true` · `name: "lane-<pid>"` · `description: "next-auto 레인 <pid>"` · 프롬프트는 아래 「레인 프롬프트」 |
   | `SCOUT <id> <n>` | Agent — `subagent_type: "Explore"` · `model: "sonnet"` · 백그라운드 · `name: "<id>"` · 프롬프트: `너는 /next-auto 정찰 <id> 다. .claude/skills/next-auto/SCOUT.md 를 읽고 그대로 하라. 마지막 메시지는 한 줄.` |
   | `TIDY <id> <이유>` | Agent — `subagent_type: "general-purpose"` · `model: "opus"` · 백그라운드 · `name: "<id>"` · 프롬프트: `너는 /next-auto 정리 레인 <id> 다. .claude/skills/next-auto/TIDY.md 를 읽고 그대로 하라. 마지막 메시지는 한 줄.` |
   | `FULL` · `WAIT` · `DRAIN` | 한 줄(`⏳ 레인 n개 · <답> — 멈추려면 "멈춰"`) 출력하고 턴을 끝낸다 |
   | `STOP <이유>` | 4 로 |

3. **알림을 받으면** — 결과의 `RESULT <id> …` 줄에서 `<id>`(레인은 pid, 정찰·정리는 `scout-…`·`tidy-…`)를 읽어 `node $A reap <id>`.
   RESULT 줄 없이 **오류로 끝났으면**(한도·중단·크래시) 띄울 때의 이름·설명(`lane-<pid>` · `<id>`)으로 id 를 정하고 `--failed "<오류 첫 줄>"` 을 붙인다 —
   한도 문구면 스크립트가 바로 멈춤으로 돌린다. 어느 레인인지 모르겠으면 `node $A status` 의 🏃 줄과 맞춘다.
   출력 한 줄(✅ · ⏸ · ↩️ · ❌ · 🧭)을 그대로 보이고 2 로. 레인의 긴 설명을 다시 묻지 않는다 — 세부는 `.claude/next-auto/reports/<id>.md` 에 있다.
4. **끝** — `node $A summary` 를 보고로(커밋 해시 · 기다림으로 간 것 · 쥔 채 남은 것과 커밋 안 된 편집 · 👀 화면 확인 필요 · 자동에서 뺀 것) → `node $A cleanup` →
   끝 줄은 멈춘 이유에 따라 `→ 다시 돌리려면 /next-auto` 또는 `→ /clear 후 /next-auto 로 이어 갑니다`.

### 레인 프롬프트

```
너는 /next-auto 레인이다 — pid <pid>, 줄 「<제목>」.
먼저 `node .claude/skills/next-auto/auto.mjs me <pid>` 를 실행하고, 그 안내대로 .claude/skills/next-auto/LANE.md 를 읽고 따른다.
마지막 메시지는 한 줄: `RESULT <pid> <DONE|PARKED|BLOCKED> <해시|-> <한 줄>`.
```

## 멈춤 지점

**부드러운 멈춤이 기본이다** — 새 레인을 띄우지 않고, 달리는 레인은 커밋까지 끝내게 둔 뒤(`DRAIN`) 정리 레인 한 번 → `STOP`.
레인은 일 하나만 하고 끝나므로 "일 사이" 가 곧 안전 지점이다. 걸리는 것:

| 신호 | 감독이 할 일 |
|---|---|
| 사용자가 "멈춰"·"그만"·`/next-auto stop` | `node $A stop "사용자"` → 2 의 `pick`(DRAIN 을 받는다) |
| 다른 터미널에서 `touch .claude/next-auto/STOP` | 없다 — 다음 `pick` 이 알아서 DRAIN |
| `[컨텍스트 NNNk]` 주입을 받음 | `node $A stop "컨텍스트"` → DRAIN 뒤 끝 줄 `→ /clear 후 /next-auto` (잡힌 줄은 RESUME 으로 이어진다) |
| 레인이 한도로 끝남(`reap --failed`) | 스크립트가 멈춤으로 돌린다 — 정리 레인도 건너뛴다(같은 벽) |
| 대기열 바닥 · 남은 줄이 전부 🔒·뺌·남의 편집 | `pick` 이 `STOP` |
| 안전 상한(한 실행 레인 30개) | `pick` 이 DRAIN → STOP |
| 예산 `--max`·`--hours`·연속 실패 | **`auto.mjs` 의 `budgetStop` 을 채운 뒤부터 걸린다** — 비어 있는 동안은 값을 받아 적기만 한다 |

**당장 멈춰야 하면**(하드 멈춤): TaskStop 으로 레인을 끊고 `node $A reap <id> --failed "사용자 중단"` → `node $A stop "사용자"`.
커밋 전 편집이 작업 트리에 남는다 — **되돌리지 않는다**(공유 트리라 남의 것과 섞여 있다). 선점은 sleep pid 가 쥔 채 남아 다음 `/next-auto` 가 그 줄을 RESUME 한다.
그 줄을 버리려면 `node $A cleanup --all`(상태 파일에 적힌 sleep 만 끈다 — 광역 kill 금지) 뒤 편집은 사용자가 본다.

## 하지 않는 것

- 감독은 명세·코드를 읽지 않고 레인의 일을 대신하지 않는다. 레인 보고를 길게 다시 묻지 않는다(감독 컨텍스트 = 이 실행의 수명).
- `pick` 이 고르지 않은 줄을 손으로 띄우지 않는다 — 겹침·남의 편집·혼자 돌 줄 판정이 스크립트에 있다.
- sleep pid 를 직접 `kill` 하지 않는다 — `reap`·`cleanup` 만(그 pid 가 아직 우리 `sleep` 인지 보고 끈다).
- 화면 확인(Chrome)은 감독이 루프 중에 하지 않는다 — 레인은 headless Playwright, 사람 눈이 필요한 것은 summary 의 👀 로 모은다.
- `start` 를 루프 중에 다시 부르지 않는다(달리는 레인을 '이전 감독' 으로 본다). 이어 갈 때는 `pick`.
- push · 원격 DB 쓰기 · 배포 · `pnpm data` 큰 실행은 레인도 하지 않는다 → 「기다림」(/next 와 같다).
