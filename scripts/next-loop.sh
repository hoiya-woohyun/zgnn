#!/usr/bin/env bash
# /next 를 새 세션으로 반복한다 — "/next 하고 /clear" 를 사람 대신.
# 매 회차가 별도 `claude -p` 프로세스라 컨텍스트가 매번 비어 있다(= /clear).
# /next 는 한 세션에 최대 3개를 끝내고 NOW.md 를 정리해 커밋한 뒤 멈춘다(.claude/skills/next/SKILL.md).
#
#   scripts/next-loop.sh          # 기본 5회차
#   MAX_RUNS=2 scripts/next-loop.sh
#
# 구독 5시간 한도를 같이 쓴다 — 회차를 크게 잡지 않는다.
set -uo pipefail

cd "$(dirname "$0")/.."
MAX_RUNS="${MAX_RUNS:-5}"
LOG_DIR=".omc/logs/next-loop"
mkdir -p "$LOG_DIR"

# 「지금」 절에 열린 항목(- [ ])이 몇 개인가
now_open_count() {
  awk '/^## 지금/{on=1; next} /^## /{on=0} on && /^- \[ \]/{n++} END{print n+0}' docs/todo/NOW.md
}

# 한 회차가 끝난 뒤 루프를 멈출지 정한다. 0 을 돌려주면 멈춘다.
#   $1 = 회차 시작 전 HEAD, $2 = 회차 끝난 뒤 HEAD, $3 = 회차 시작 전 「지금」 개수
# HEAD 가 움직였는지만 보면 안 된다 — /next 는 막혀도 NOW.md 정리 커밋을 남기고,
# 다른 세션이 develop 에 동시에 커밋하기도 한다. 그래서 두 가지를 본다.
should_stop() {
  local before="$1" after="$2" open_before="$3"
  # 「지금」 이 줄지 않았다 = 맨 위 일을 못 끝냈다
  [[ "$(now_open_count)" -lt "$open_before" ]] || return 0
  # 바뀐 파일이 NOW.md 하나뿐이다 = 정리만 하고 실제 일은 없었다
  local changed
  changed=$(git diff --name-only "$before" "$after")
  [[ -z "$changed" || "$changed" == "docs/todo/NOW.md" ]] && return 0
  return 1
}

# headless 회차에 덧붙이는 말. -p 는 턴이 끝나면 프로세스가 끝난다 —
# "기다리겠다" 고 턴을 닫으면 반쯤 한 일이 커밋 없이 작업 트리에 남는다(2026-10-06 첫 실행).
PROMPT='/next

사람 없이 도는 회차다(scripts/next-loop.sh). 턴을 끝내면 프로세스가 끝나니, 기다리려고 턴을 끝내지 않는다.
다른 세션이 같은 파일을 고치고 있으면 기다리지 말고 그 일에서 손을 떼고(내 변경도 되돌리지 말고 그대로 두고)
보고 첫 줄에 "■ 충돌: <파일>" 을 적고 끝낸다.'

# 추적 파일에 커밋 안 된 변경이 있는가 — 다른 세션이 작업 중이거나, 앞 회차가 일을 남겼다
dirty() { [[ -n "$(git status --porcelain --untracked-files=no)" ]]; }

for ((i = 1; i <= MAX_RUNS; i++)); do
  if dirty; then
    echo "■ 커밋 안 된 변경이 있다 — 다른 세션이 작업 중이거나 앞 회차가 남겼다. 정리한 뒤 다시 돌린다"
    git status --short --untracked-files=no
    break
  fi

  open=$(now_open_count)
  if [[ "$open" -eq 0 ]]; then
    echo "■ 「지금」 이 비었다 — 멈춘다"
    break
  fi

  before=$(git rev-parse HEAD)
  log="$LOG_DIR/$(date +%Y%m%d-%H%M%S)-run$i.log"
  echo "▶ 회차 $i/$MAX_RUNS — 「지금」 $open 개 · 로그 $log"

  if ! claude -p "$PROMPT" --permission-mode auto >"$log" 2>&1; then
    echo "■ claude 가 실패로 끝났다(한도·오류) — 멈춘다. 로그: $log"
    tail -5 "$log"
    break
  fi
  tail -8 "$log"

  after=$(git rev-parse HEAD)
  if dirty; then
    echo "■ 회차가 커밋 안 된 변경을 남겼다 — 멈춘다. 로그: $log"
    git status --short --untracked-files=no
    break
  fi
  if should_stop "$before" "$after" "$open"; then
    echo "■ 진척 없음 — 다음 일이 사람을 기다리는 듯. NOW.md 「기다림」 을 본다"
    break
  fi
done

git log --oneline -15 --since="6 hours ago"
