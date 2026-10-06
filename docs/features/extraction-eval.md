# AI 추출 정확도 평가 (`pnpm data:eval`)

> 최종 수정: 2026-10-06 (v1: 처음 씀 — 시드 86곳을 정답으로 운영 추출(`extractPlaces`)을 채점한다. golden 은 `data/golden/seed-extract.json` 에 얼려 두고, 추출은 캐시, 채점은 Claude 호출 없이)

## 무엇을 재나

시드 86곳은 짱구누나가 **블로그 글 하나씩**(`reviewUrl` — 86곳 모두 다른 글)을 쓰고 그 글을 보며 조건 문장(`petPolicyText`)을 손으로 적은 것이다.
그래서 같은 글을 운영 추출(`scripts/analyze/extractPlaces.mjs` 의 `extractPlaces` — 프롬프트·스키마·`correctPetPolicyFacts` 보정까지 그대로)에 넣고
나온 값을 사람 값과 비교하면, 프롬프트를 고칠 때마다 "좋아졌나 나빠졌나" 를 숫자로 볼 수 있다.

가장 중요한 숫자는 칸 일치율이 아니라 **판정 뒤집힘**이다 — 고정 강아지 다섯(4kg·이동가방 / 12kg / 28kg / 5kg+8kg·유모차 / 6kg·이동수단 없음)으로
사람 정책과 AI 정책을 각각 `judgeEligibility` 에 넣어 레벨(갈 수 있어요·확인 필요·정보 없음·어려움)이 달라진 곳을 센다.

## 명령

| 명령 | 하는 일 | 비용 |
|---|---|---|
| `pnpm data:eval golden [--force]` | `src/data/places.json` → `data/golden/seed-extract.json`. **이미 있으면 거부한다**(`review` 가 날아간다). places.json 은 앞으로 바뀌므로 한 번 얼린다 | 0 |
| `pnpm data:eval extract [--limit N] [--only <placeId\|이름>…] [--refresh]` | 글마다 본문을 받아(`data/raw/eval/bodies/`) `claude -p` 한 번. 결과는 `data/raw/eval/extract/<PROMPT_VERSION>-<MODEL>/<logNo>.json` — 있으면 건너뛴다. `--limit` 은 **이번에 부를 Claude 횟수**다 | 글당 `claude -p` 1회 |
| `pnpm data:eval score [--prompt <버전>]` | golden + 캐시만 읽어 채점. 요약은 터미널과 `data/raw/eval/score-<버전>-<모델>.json`, 어긋난 곳 전부는 `data/raw/eval/report-<버전>.md` | 0 |

- **86곳 전체는 나눠 돌린다.** `claude -p` 는 구독이라 돈은 안 들지만 5시간 세션 한도를 대화와 공유한다. `--limit 20` 씩 돌리면 캐시 다음부터 이어 간다.
  로그인 안 됨·CLI 없음·한도에 걸리면 그 자리에서 멈춘다(나머지도 같은 이유로 실패한다).
- 프롬프트나 스키마를 고치면 `PROMPT_VERSION` 이 바뀌어 **새 캐시 폴더**에 쌓인다. 옛 버전 채점은 `--prompt <옛 버전>`.
  `score` 는 다른 버전의 요약이 있으면 차이를 같이 찍는다 — **`claude -p` 는 같은 입력에도 결과가 흔들린다.** 몇 건 차이는 소음이고, 분모가 다르면(한쪽만 다 돌렸으면) 비교가 안 된다.
- 운영과 다른 점 하나: 운영 분석은 수집 검색어(`keyword`)를 넘기지만 시드 글엔 그게 없어 비운다. 글 제목은 같은 응답의 `og:title` 에서 읽는다.
  **장소 이름을 프롬프트에 넣지 않는다** — 정답을 흘린다.
- Supabase 는 쓰지 않는다. 로그인(`pnpm data:login`)도 필요 없다.
- **본문 캐시는 예외다.** 운영 분석은 본문을 받아 쓰고 버린다(`naverPostBody.mjs` · todo/02). 여기서는 같은 글을 버전마다 다시 받지 않으려고
  `data/raw/eval/bodies/` 에 둔다 — 이 머신에만 있고(gitignored · 레포가 공개다) 지워도 된다(다음 `extract` 가 다시 받는다).
  보고서도 본문은 싣지 않고 사람 조건 문장과 AI 의 `petPolicyText` 만 인용한다.

## 결과 읽는 법

장소마다 먼저 AI 가 뽑은 장소들 중 짝을 찾는다(이름 키 일치 → 지점 꼬리만 다름 → 한쪽이 다른 쪽을 품음). 한 글에 다른 장소도 나오지만 그건 오답이 아니라 안 본다.
짝을 못 찾으면 `못 찾음`. 짝이 있어도 운영 분석이 후보를 만들지 않는 경우(`exclusionReason` 그대로 — 제주 밖 · 종류 `other` · 동반 불가 `petAllowed: 'no'`)는
`후보 탈락` 으로 이유별로 세고, 사이트에 들어갈 수 없으므로 판정은 전부 '어려움' 으로 센다.

짝이 있으면 칸마다(종류·동반 여부·실내·리드줄·대형/중형/소형·전화 확인·무료·요금 금액·무게 상한·마릿수·야외 자유·마릿수 무제한) 방향을 가른다.

| 방향 | 뜻 | 무게 |
|---|---|---|
| **지어냄** | 사람 값엔 없는데(false·없음) AI 가 세웠다 | **가장 비싸다** — 원문에 없는 `weightLimitKg: 10` 하나가 대형견을 '어려움' 으로 보낸다([BUG-009](../bugs/BUG-009-unread-and-denied-policy-judged-ok.md)) |
| 놓침 | 사람은 적었는데 AI 는 없다 | '확인 필요' 쪽으로 기운다 |
| 틀림 | 둘 다 있는데 다르다 | |

**golden 은 정답이 아니라 "정규식이 사람 문장을 읽은 값"** 이다(`parsePetPolicy`). 그래서 두 가지를 조심한다.

- 정규식은 **요금 구간의 kg 을 무게 상한으로 읽는다**(`19kg 이하 1마리당 2만원` → 상한 19, `src/lib/petPolicy.ts` 의 `withPolicyFacts` 머리 주석). AI 의 '놓침' 중 일부는 golden 쪽 오류다.
- 정규식이 **세우지 못하는 칸**(`vaccineRequired` · `feeCharged`)은 golden 이 늘 false 라 방향을 매기지 않고 "AI 가 true 로 읽은 수" 만 따로 센다.
- '지어냄' 은 **사람 문장에 없다**는 뜻이지 글에 없다는 뜻이 아니다. 짱구누나가 짧게 줄여 쓰며 뺀 조건("최대 2마리")을 AI 가 글에서 읽어 오면 '지어냄' 으로 잡힌다 — 아래 보정으로 가른다.

요금은 문자열이 아니라 원 단위 금액 집합으로 비교한다(AI 쪽은 `20,000원` → `2만원` 으로 정규화돼 저장된다).

## 보정 — `review`

보고서(`data/raw/eval/report-<버전>.md`)를 보고, 어긋난 칸을 **글을 직접 열어** 판정한 뒤 `data/golden/seed-extract.json` 의 그 장소 `review` 에 적는다(커밋한다).

```json
"review": {
  "maxDogs": { "verdict": "ai", "note": "글에 '최대 2마리' — 사이트 문장에서 빠짐" },
  "weightLimitKg": { "verdict": "unclear", "note": "글에 무게 언급 없음" }
}
```

| `verdict` | 뜻 | 채점 |
|---|---|---|
| `"site"` | 사이트(사람) 값이 맞다 | golden 그대로 — AI 오답 |
| `"ai"` | AI 가 맞다 | 그 칸은 일치로 세고 **사이트 데이터 오류 후보**로 표시 → `/admin` 에서 그 장소의 조건 문장을 고친다 |
| `"unclear"` | 글이 말하지 않는다 | 그 칸은 분모에서 뺀다 |

- `review: null` 은 "아직 안 봤다" 다. 칸 이름은 보고서 표의 `칸` 그대로(`type` · `petAllowed` · `weightLimitKg` · `feeAmountsWon` …).
- AI 의 `null` 은 "언급 없음" 이지 "아니다" 가 아니다 — 사람 값이 false 이고 AI 가 null 이면 일치다.
- 판정 뒤집힘 수는 `review` 를 반영하지 않은 원값이다. 뒤집힘의 원인 칸이 `ai` 로 판정됐으면 사이트를 고칠 일이지 프롬프트를 고칠 일이 아니다.
- `golden --force` 로 다시 만들면 `review` 가 사라진다. 파서가 바뀌어 golden 이 지금 파서와 다르게 읽히면 `score` 가 그 수를 경고로 찍는다 — 채점은 얼린 값으로 한다.

## 관련 파일

- `scripts/eval-extract.mjs` — I/O(golden 쓰기·본문/추출 캐시·채점 출력)
- `scripts/analyze/evalExtract.mjs` · `evalExtract.test.mjs` — 짝 찾기·방향·판정 뒤집힘·보고서(순수, 앱 함수는 주입)
- `scripts/lib/tsExtResolve.mjs` — `eligibility.ts` 의 확장자 없는 import 를 node 에서 풀어 주는 훅(`package.json` 의 `--import`)
- `data/golden/seed-extract.json` — 얼린 정답 + 사람 보정
