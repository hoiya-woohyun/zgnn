# 4. Vercel 배포 · 빌드 시 DB 읽기 · 승인되면 재빌드

> 최종 수정: 2026-09-21 (v2: 4a 완료 — `vercel.json` 빌드 명령·env 확인, `outputDirectory` 함정(BUG-005) 수정. 4b 는 아직)
> 이전 (v1: 신설)
> 상태: 4a 는 코드·설정이 끝났고 push 뒤 첫 배포 확인만 남았다. 4b 는 계획. 선행: 4a 는 [01](01-schema-and-seed.md), 4b 는 [03](03-analyze-and-review.md). 재빌드 방식은 [ADR-015](../decisions/ADR-015-supabase-source-and-rebuild.md) §2 로 확정.

## 왜 런타임 fetch 가 아니라 재빌드인가

앱은 `output: 'export'` 라 서버가 없고, 프리캐시가 라우트 95개를 통째로 든다. 데이터를 빌드 밖으로 빼면
"런타임 fetch 없음"·오프라인·`revisionHash` 가 전부 다시 설계 대상이 된다([ADR-011 "결과"](../decisions/ADR-011-app-gate-and-supabase.md)).
빌드 **안에서** DB 를 읽어 `src/data/*.json` 을 만들면 그 뒤는 지금과 완전히 같다 —
`revisionHash` 는 `src/` 를 해싱하므로 **데이터가 바뀌면 프리캐시 revision 도 바뀐다.** 이게 이 방식의 핵심 이점이다.

반영 지연은 빌드 시간(1~2분)이다. 하루 몇 건 승인하는 서비스에 충분하다.

## 4a. 빌드가 DB 를 읽는다

- [x] Vercel Build Command: `pnpm data:pull && pnpm build` — `vercel.json` 의 `buildCommand`(대시보드가 아니라 레포에 둔다).
      **`outputDirectory` 는 적지 않는다** — `out` 을 적으면 pull·빌드·유출 검사가 다 통과한 뒤 배포만 죽는다
      (→ [BUG-005](../bugs/BUG-005-vercel-output-directory.md)). 로컬 `vercel build --prod` 로 검증했고 배포는 push 뒤.
- [x] `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY` 를 Vercel env(Production·Preview, Sensitive). **`NEXT_PUBLIC_` 없이.**
      빌드 단계에서만 읽히고 `out/` 에는 들어가지 않는다 — 05 의 유출 검사가 이걸 매 빌드 확인한다.
      → Vercel 빌드 로그에서 `pull 완료: places 86 (published) · items 15` 와 `번들 유출 검사 통과` 를 봤다(2026-09-20 배포).
- [x] `data:pull` 실패 = 빌드 실패. Vercel 은 실패한 배포를 올리지 않으니 **이전 배포가 그대로 산다.** 조용히 옛
      데이터로 새 배포가 나가는 것보다 낫다. → BUG-005 때 실제로 그랬다: 배포는 Error, 사이트는 이전 배포로 그대로.
- [x] 로컬 `pnpm build` 는 `data:pull` 없이 커밋된 스냅샷으로 — 지금과 같다.
- [ ] 커밋된 `src/data/*.json` 은 **주기적으로 갱신해 커밋**한다(수집 잡이 PR 을 열거나, 사람이 `data:pull` 후 커밋).
      안 하면 로컬과 배포가 점점 벌어진다. 초안: Actions 수집 잡 끝에 `git diff --quiet src/data || (PR 생성)`.
      → 이러려면 Actions 권한이 `contents: write` 가 돼야 한다. 00 에서 Read 로 둔 것과 충돌 — 🙋 PR 자동화를 원하면 그때 올린다.

### Preview 배포

- [ ] PR 마다 Preview 가 뜬다. 같은 Supabase 를 읽는다(데이터는 하나뿐이고 공개 정보다).
- [ ] Deployment Protection → **Vercel Authentication** 을 Preview 에 켠다(무료). 미완성 화면이 검색엔진·남에게 노출되지 않게.
- [ ] Kakao 지도는 Preview URL 이 매번 달라 콘솔 등록이 안 된다 → Preview 에서 지도가 비는 건 **알고 감수**한다(00 에 적음).

## 4b. 승인되면 재빌드

```
Studio 에서 status 변경  ──▶  Supabase Database Webhook (places: INSERT/UPDATE)  ──▶  Vercel Deploy Hook URL  ──▶  빌드
```

- [ ] Supabase → Database → Webhooks: 테이블 `places`, 이벤트 INSERT·UPDATE·DELETE, HTTP POST → Deploy Hook URL.
      Deploy Hook 은 본문을 안 본다 — URL 만 맞으면 빌드가 돈다.
- [ ] `candidates` 가 아니라 **`places`** 에 건다. 승인(candidates) 자체는 화면에 아무 영향이 없고, `data:apply` 가
      `places` 를 만질 때 비로소 반영할 것이 생긴다.
- [ ] Deploy Hook URL 은 시크릿이다. Supabase 웹훅 설정 화면에만 존재한다. 새 나가면 Vercel 에서 폐기·재발급(05).
- [ ] 🙋 **승인 N건 = 빌드 N번.** 한 번에 20건 승인하면 빌드 20번이 줄줄이 선다(Vercel 이 같은 브랜치의 대기 중 빌드를
      건너뛰긴 한다). Hobby 에서 **먼저 걸리는 한도가 하루 배포 횟수인지 월 빌드 시간인지**를 첫 달에 관찰한다 — 그게
      아래 세 갈래 중 무엇을 고를지 정한다. 대안:
      - (기본) 그냥 둔다. 주 2회 수 건이면 문제없다.
      - 웹훅을 `places` 가 아니라 별도 `deploy_requests` 테이블에 걸고, 관리 화면의 "반영" 버튼이 거기에 한 줄 넣는다.
      - Actions 수집 잡 끝에서만 Deploy Hook 을 `curl` 한다(승인은 모였다가 다음 수집 때 반영).
      첫 달은 기본으로 가고 빌드 횟수를 본다.

### 수동 경로도 남긴다

- Vercel 대시보드 "Redeploy" 나 `vercel deploy --prod` — 웹훅이 잘못돼도 반영할 길.
- Actions `workflow_dispatch` 로 "지금 수집·분석·재빌드" 한 번에.

## 앱 코드 변경 — 사실상 없다

- `src/` 는 손대지 않는다. `data:pull` 이 만든 JSON 이 지금 스키마와 같으니까(01 의 합격 기준).
- 단 하나: `place_sources` 가 생기면 상세 화면의 "후기 링크" 를 여러 개로 보여줄지 — 기능 변경이라 `docs/features/` 에 따로. 지금 범위 밖.

## 끝났다고 볼 조건

- Studio 에서 장소 이름 한 글자 고침 → 2분 안에 프로덕션 URL 에 반영, 그리고 **이미 설치된 PWA 가 다음 실행 때 새 데이터를 받는다**(revision 이 바뀌었으니). 후자를 꼭 폰에서 확인한다 — 빌드는 통과하고 화면은 그려지는데 옛 데이터만 보이는 고장이 이 자리다.
- `docs/architecture/pwa-offline.md` 에 "데이터 갱신도 revision 을 바꾼다" 한 줄. `data-pipeline.md` v2 의 배포 절.
