# 3. AI 분석 → 사람이 링크 확인 → 승인

> 최종 수정: 2026-09-21 (v3: 코드 완료 — 본문 파서·Claude 추출(`claude -p`, 구독)·Kakao 보강·`matchPlace` 본체·`data:analyze`·`data:apply`·Actions. 실행은 수집(02) 뒤. 리뷰 지적 반영: 자동 승인 기본 off, Kakao 정확 일치만, 읍·면 목록, 영구 실패 닫기, 재대조)
> 이전 (v2: `matchPlace` 골격 상태 갱신 — 신호 헬퍼·임계값 상수·테스트는 있고 본체는 아직 🙋)
> 이전 (v1: 신설)
> 상태: **코드는 끝났다.** 실제 글로는 아직 안 돌렸다(`blog_posts` 가 비어 있다 — 02 의 네이버 키가 먼저). 실제 후기 링크 1건으로 본문 → 추출 → 대조까지 엔드투엔드는 확인했다. 선행: [02](02-collect-naver-blog.md). 입력은 `blog_posts`, 출력은 `candidates` → 승인되면 `places`.

## 역할 분담 — AI 는 뽑고, 사람은 열어 보고, 코드는 병합한다

```mermaid
flowchart LR
  P[(blog_posts<br/>analyzed_at null)] -->|본문 받기 · 즉시 폐기| A[Claude 추출<br/>구조화 출력]
  A -->|장소 아님 / 제주 아님| X[버림 · analyzed_at 만 기록]
  A --> M[matchPlace<br/>기존 86곳과 대조]
  M -->|일치| C1[(candidate<br/>기존 장소 보강)]
  M -->|신규| C2[(candidate<br/>새 장소)]
  C1 & C2 -->|사람: 링크 열어 확인| R{승인?}
  R -->|approved| PL[(places upsert<br/>+ place_sources)]
  R -->|rejected| N[note 남기고 끝]
```

## AI 추출 — `scripts/analyze-candidates.mjs` (`pnpm data:analyze`)

**Claude 는 API 키가 아니라 구독으로 부른다(2026-09-21 결정).** `scripts/analyze/extractPlaces.mjs` 가 `claude -p --json-schema` 를
자식 프로세스로 돌린다. 인증은 로컬은 이미 로그인된 `claude`, Actions 는 `claude setup-token` 으로 만든 `CLAUDE_CODE_OAUTH_TOKEN`.
왜 — 구독 OAuth 토큰은 Claude Code 전용이라 Messages API SDK 에 못 쓰고, 글당 과금이 0 이 된다. 대신 **세션 한도(5시간 창)를 대화와
공유**한다: 대량 처리는 `--limit` 로 나눈다. 러너에는 `npm i -g @anthropic-ai/claude-code@<버전 고정>` 이 필요하다(`collect.yml`).
`--system-prompt` 로 기본 프롬프트를 대체하고 `--tools "" --strict-mcp-config --setting-sources "" --disable-slash-commands` 로 레포
컨텍스트를 전부 끈다 — 안 끄면 호출마다 CLAUDE.md·MCP 툴 목록이 실려 3~4만 토큰, 끄면 1천(실측). `--bare` 는 못 쓴다(키체인·OAuth 를 안 읽는다).

- [x] 모델 기본 `claude-opus-5`(`ANALYZE_MODEL` 로 덮음), 구조화 출력은 `--json-schema`(결과 JSON 의 `structured_output`).
      사고(thinking)는 CLI 가 모델에 맞게 알아서 — 코드에 없다.
- [x] 한 글 → 장소 **0~N개**. 여행기 하나에 카페 셋이 나온다. 스키마는 배열이다.
- [x] 본문은 데스크톱 `PostView.naver`(`scripts/analyze/naverPostBody.mjs`). 에디터 세대가 셋이다 — SmartEditor ONE(`.se-main-container`) ·
      SE3(`.__se_component_area`) · 구 에디터(`#postViewArea`). 컨테이너를 못 찾으면 `''` → 그 글은 "분석 불가" 로 닫는다.
- [x] 추출 필드 = `TPlace` 의 부분 + 근거:
  ```
  { name, type: 'stay'|'restaurant'|'cafe'|'other', regionRaw?, address?, petPolicyText?, features?,
    isJeju: boolean, evidence: string[] /* 본문 인용 1~3문장 */, confidence: 0..1 }
  ```
  - **`petPolicyText` 는 원문 문장**이다("소형견만 실내 가능, 대형견은 테라스"). 구조화(무게·마릿수)는 하지 않는다 —
    그건 `parsePetPolicy()` 의 일이고, 두 벌이 되면 어긋난다([pet-policy-and-eligibility.md](../architecture/pet-policy-and-eligibility.md)).
  - `evidence` 가 사람 확인의 핵심이다. 링크를 열었을 때 **어디를 보면 되는지**를 알려 준다.
  - `type: 'other'` · `isJeju: false` 는 후보를 만들지 않고 `analyzed_at` 만 찍는다.
- [x] 시스템 프롬프트는 고정 문자열(`--system-prompt`), 메타·본문은 stdin 으로 뒤에 → 호출 간 prefix 가 같다.
- ~~Batches API~~ — 구독 경로엔 없다. 첫 1년치는 `--limit` 로 나눠 여러 번 돌린다(세션 한도).
- 🙋 **모델**: 구독이라 글당 비용은 0 이고 차이는 한도 소모뿐. 기본 `claude-opus-5`. `ANALYZE_MODEL=claude-haiku-4-5` 로 바꿔 품질을 비교해 볼 수 있다.
- [x] 좌표·주소 보강은 **Kakao 로컬 REST API**(`scripts/analyze/kakaoLocal.mjs`, `KAKAO_REST_API_KEY` 선택). `place_name` 이
      후보 이름과 **정규화 후 완전 일치**할 때만 채택한다 — 부분 일치(0.7)를 받으면 "고기부엌" 에 "협재고기부엌" 좌표가 실려 그대로
      `places` 에 쓰인다(리뷰에서 재현). 없으면 좌표를 비워 둔다(지어내지 않는다). 키가 401/403 이면 실행을 세운다 — 조용히 이름만으로
      대조하면 동명 가게가 `ask` 대신 `auto` 로 올라간다. 주소 → `regionRaw` 는 기존 86곳의 읍·면→방향 표에서 추론(`inferRegionRaw`).
- [x] 실패 분류(`analyze-candidates.mjs`): 다시 받아도 같을 실패(본문 **404/410**·컨테이너 없음·모델이 스키마 재시도를 소진)는 `analyzed_at` 을
      찍어 **닫는다** — 안 닫으면 매 실행 `--limit` 창을 잠식하며 영원히 재시도한다. 단 닫기는 **루프 끝에, 그 실행에서 성공한 글이 1건 이상일 때만**
      — 전부 "분석 불가" 면 글이 아니라 파이프라인(에디터 구조 변경·차단 페이지) 문제라 아무것도 닫지 않고 exit 1. 403(차단)·5xx·한도·타임아웃·
      DB 쓰기 실패는 비워 둬 재시도. 인증 실패·CLI 없음·Claude API 4xx(모델명 오타)·Kakao 키 오류는 나머지 글도 같으므로 루프를 끊고 exit 1.

## 🙋 `matchPlace` — 기본안이 구현돼 있다. 가중치·임계값은 사용자가 조정한다

`scripts/analyze/matchPlace.mjs`. 후보가 기존 장소와 같은 곳인지. **틀리면 조용히 데이터가 썩는다** — 잘못 병합하면
사람이 쓴 설명이 덮이고, 잘못 신규면 같은 가게가 두 번 뜬다. 기존 계획 §4 의 그 자리다.

**구현된 기본안**(2026-09-21, 🙋 항목이었지만 기본값으로 채웠다 — 바꿀 자리는 `THRESHOLD`·`WEIGHT` 두 상수뿐):
- `naverPlaceId` 일치 → 1.0. 그 외 **이름이 축**이다: 정규화 이름 완전 일치 1.0 · 부분 포함 0.7 · 아니면 0 — **이름 신호가 0 이면
  다른 신호가 아무리 강해도 후보가 아니다**(평대반점↔평대코지카페 18m 를 좌표로 묶지 않는다).
- 이름 위에 보정: 좌표 100m 안 +0.15 · 2km 밖 −0.3(우도↔성산 16km) · 종류 다름 −0.1 · 읍·면 같음 +0.05 · 읍·면 다름 −0.2.
  값이 없는 신호는 감점 없이 건너뛴다(좌표 없는 5곳). 읍·면은 **제주 12개 읍·면 목록**으로만 본다 — 패턴으로 잡으면
  "함덕해물라면" 의 '면' 이 읍·면이 된다(리뷰에서 재현). 시(제주시·서귀포시)는 신호가 아니다.
- 그래서 생기는 구간: 이름 일치+100m 안 → 1.0 `auto` · 이름 일치+2km 밖 → 0.7 `ask` · 부분 일치+100m 안 → 0.85 `auto` ·
  부분 일치+종류 다름 → 0.6 `ask` · 이름 불일치 → 0 `new`.
- **자기충돌 검사**가 테스트에 있다: 86곳 각각을 후보로 만들어 나머지 85곳과 대조했을 때 `ASK` 를 넘는 쌍이 0 이어야 한다.
  깨지면 임계값을 올리지 말고 `nameSimilarity` 를 조인다.

**🙋 재대조의 경계값**: 부분 일치 0.7 + 100m 안 +0.15 = **정확히 0.85 = `AUTO_MERGE`** 이고 `apply` 의 재대조는 `≥` 다. 그래서 사람이
`new` 후보를 승인해도 이름이 부분만 겹치는 이웃 가게(100m 안)에 조용히 합쳐질 수 있다 — `AUTO_APPROVE` 와 별개 경로다. 리뷰에서는
"임계값 결정" 으로 분류됐다. 보수적으로 가려면 `GEO_NEAR_BONUS` 를 0.1 로 낮추거나 재대조에 `>` 를 쓴다.

**🙋 자동 승인은 기본 꺼져 있다**(`scripts/analyze/analyzeCandidates.mjs` 의 `AUTO_APPROVE = false`). `auto` 구간도 `pending` 으로
들어가고 `extracted.match.tier = 'auto'` 로 표시만 된다 — Studio 에서 `extracted->match->>tier = 'auto'` 로 걸러 한꺼번에 승인한다.
켜면 같은 잡의 `data:apply` 가 사람 확인 없이 `places` 를 고친다(빈 칸만이지만 좌표·주소·category 는 "빈 칸" 이라 그대로 들어간다).
86곳이라 사람 확인이 싸다는 전제로 보수적으로 시작한다 — 몇 주 돌려 보고 `auto` 가 한 번도 틀리지 않으면 그때 켠다.

**실제 데이터에서 찾은 함정**(테스트 케이스로 남겨 뒀다):
- 평대반점(별칭 바당반점) ↔ 평대코지카페 — 좌표 18m 차이. 좌표만으로 묶으면 오병합.
- 제이아일랜드 ↔ 아오오 — 좌표 40m 차이. 역시 좌표 단독 판정 위험.
- "카페살레" 가 "살레" 로만 오는 경우 — 이름 정규화가 부분 문자열까지 다뤄야 하는지가 쟁점.
- 좌표가 아예 없는 5곳(01 의 미확보 목록과 동일) — 좌표 기반 신호가 통하지 않는다.

테스트: `matchPlace.test.mjs` — 실제 86곳으로 위 함정 전부 + 우도 vs 본섬 동명(카페살레) + 좌표 없는 5곳 + 자기충돌 검사. `skip` 없음.

## 사람의 승인 — 어디서 하나

| 단계 | 도구 | 만들 것 |
|---|---|---|
| **지금** | Supabase Studio 표 편집기 | 없음. `candidates` 를 열어 `post_url` 클릭 → `extracted.evidence` 와 대조 → `status` 바꾸고 `reviewer_note`. **`ask` 후보가 신규가 맞다면 `match_place_id` 를 비운 뒤 approved 로** — `data:apply` 는 `match_place_id` 가 있으면 그것을 믿고 병합한다. |
| 다음 | 앱 안 `/admin` (정적 라우트 + 클라이언트 Supabase auth + RLS) | 후보 카드·링크·근거 문장·"승인/거절" 버튼. **이때 처음으로 앱 번들에 Supabase 가 들어간다** → 05 의 anon key 항목이 살아난다 |

Studio 로 먼저 몇 주 돌려 보고 **어떤 정보가 화면에 있어야 결정이 빨라지는지** 안 다음에 화면을 만든다.
후보가 주에 수십 건이면 Studio 로 충분할 수도 있다.

## 승인 → `places` 반영 — `scripts/apply-approved.mjs` (`pnpm data:apply`)

- [x] `status='approved'` 후보를 읽어:
  - `match_place_id` 있음 → 기존 행에 **빈 칸만 채운다**(`mergeIntoExisting`). 사람이 쓴 `features`·`petPolicyText` 를 AI 가 덮지 않는다.
    다른 값이 필요하면 `reviewer_note` 에 적고 Studio 에서 손으로 고친다. **archived 장소에는 병합하지 않는다**(실패로 남겨 사람이 본다).
  - 없음 → 분석 때 `tier` 가 `new` 였던 후보만 현재 `places`(방금 만든 draft 포함)와 **다시 대조**해 `AUTO_MERGE` 이상이면 보강으로 돌린다 —
    같은 새 가게를 말하는 글 둘이 따로 승인되면 분석 시점엔 서로 몰라 둘 다 '신규' 이기 때문이다. `auto`/`ask` 였는데 `match_place_id` 가
    비어 있으면 **사람이 비운 것**이라 재대조 없이 신규로 존중한다. 재대조는 분석 때와 같은 지역 신호(`extracted.regionRawAi`)를 본다.
    아니면 `source='blog'`, `status='draft'` 로 insert.
    **`published` 는 사람이 Studio 에서 올린다** — 승인 두 번이 번거로우면 🙋 여기서 바로 `published` 로 갈지 정한다.
  - `place_sources` 에 링크 추가. 화면의 "후기 링크" 가 이 출처를 쓴다(`reviewUrl` 은 첫 출처).
- [x] 처리한 후보는 `status='merged'`. `--dry-run` 이면 아무것도 쓰지 않고 할 일만 찍는다.
- [x] 이 스크립트는 **DB 웹훅 대신 Actions 에서 `data:analyze` 다음에** 돈다 — 앞 step 이 실패해도 돈다(`if: !cancelled()`):
      사람이 승인한 것의 반영이 분석 장애에 막히지 않게. 웹훅으로 재빌드를 부르는 건 04 의 일이다.

## 끝났다고 볼 조건

- [ ] 실제 글 20건으로 돌려 후보가 생기고, Studio 에서 승인·거절 각 1건 → `data:apply` → `data:pull` → 화면에 새 장소가 뜬다.
      **아직** — `blog_posts` 가 비어 있다(02 의 네이버 키). 대신 실제 후기 링크 1건(제이아일랜드)으로 본문 2,171자 → `claude -p` 8.9초 →
      카페·이용 조건 원문·근거 3문장 → `matchPlace` 1.00 까지 확인했다(2026-09-21, DB 쓰기 없이).
- [x] `matchPlace.test.mjs` 통과(자기충돌 검사 포함). `docs/architecture/data-pipeline.md` 에 "분석·승인" 절과 상태 머신 표.
- [ ] Actions 에서 한 번 실제로: `CLAUDE_CODE_OAUTH_TOKEN`·`KAKAO_REST_API_KEY` 시크릿 등록 → `workflow_dispatch`.
