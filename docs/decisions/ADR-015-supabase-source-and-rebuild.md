# ADR-015 — 원본은 Supabase, 반영은 재빌드

> 최종 수정: 2026-09-29 (v3: **§2 의 "앱 번들에 Supabase 가 들어가지 않는다" 를 번복했다** — 운영자 검수 화면 `/admin` 하나가 publishable 키와
> 프로젝트 호스트를 번들에 싣고 브라우저에서 직접 읽고 쓴다([ADR-018](ADR-018-in-app-admin-review.md)). 경계는 번들의 비밀이 아니라 RLS·GRANT 다.
> **재빌드 모델 자체는 그대로다** — 사이트가 보여 주는 데이터는 여전히 빌드 때 구워진 JSON 세 개뿐이고, 승인은 다음 빌드에서 반영된다)
> 이전 (v2: 결과 두 줄을 4a 이후로 정정 — 빌드가 DB 를 읽으므로 커밋된 JSON 은 '빌드 입력' 이 아니라 dev·test 용 스냅샷이다. data-pipeline.md 재작성 예고도 이미 일어난 일)
> 이전 (v1: 신설 — `docs/todo/` 의 가정 두 개가 사용자 확인으로 확정됨)
> 상태: 결정. 구현은 [docs/todo/](../todo/README.md) 가 추적한다.

## 맥락

블로그 수집 → AI 분석 → 사람 승인 → DB → 사이트 반영 파이프라인을 붙이려 한다. 앱은 정적 내보내기이고
데이터는 Notion 에서 한 번 뽑아 빌드에 구워져 있다. 두 갈래가 있었다.

## 결정

1. **원본(source of truth)은 Supabase `places` 다. Notion 은 1회 시드 뒤 읽지 않는다.**
   Notion 작성자(와이프)가 더 이상 Notion 을 편집하지 않는다고 확인했다(2026-09-18). 그래서 "승인 → Notion 에 써 넣기 →
   재추출" 이라는 옛 계획의 가장 위험한 경로(비공식 API 쓰기)가 통째로 사라진다. 손으로 고칠 일은 Supabase Studio 에서 한다.

2. **"DB 가 바뀌면 사이트에 반영" 은 런타임 fetch 가 아니라 재빌드로 한다.**
   DB 웹훅 → Vercel Deploy Hook → 빌드가 `data:pull` 로 `src/data/*.json` 을 만들고 → 정적 내보내기.
   `output: 'export'`·프리캐시는 그대로다 — **사용자가 보는 화면은 런타임에 아무것도 fetch 하지 않는다.**
   **v3 정정**: "앱 번들에 Supabase 가 들어가지 않는다" 는 더 이상 사실이 아니다. 운영자 검수 화면 `/admin` 이 publishable 키와 프로젝트 호스트를
   번들에 싣고 브라우저에서 `candidates`·`places` 를 직접 읽고 쓴다(→ [ADR-018](ADR-018-in-app-admin-review.md)). 경계는 RLS·GRANT 이고,
   유출 검사는 `supabase.co` 전면 차단에서 **우리 호스트 하나만 허용**으로 좁혔다. 그래도 이 항의 나머지는 살아 있다 —
   승인이 사이트에 닿는 길은 여전히 재빌드뿐이다.
   `next.config.mjs` 의 `revisionHash` 가 `src/` 를 해싱하므로 데이터 변경이 프리캐시 revision 을 바꾼다 — 설치된 PWA 도 새 데이터를 받는다.

3. **회원·로그인은 범위 밖이다.** [ADR-011](ADR-011-app-gate-and-supabase.md)·[ADR-012](ADR-012-personal-data-and-consent.md) 는
   "추후 고도화" 로 보류한다. todo 에 넣지 않는다. 잠금이 필요해지는 날 4번(반영)만 런타임 fetch 로 다시 쓰면 되고,
   0~3 은 그대로다. 단 [ADR-012 §2](ADR-012-personal-data-and-consent.md) 의 서울 리전은 지금 지킨다 — 생성 시에만 정할 수 있어서다.

## 결과

- 반영 지연은 빌드 시간(1~2분). 승인 N건 = 빌드 N번이 될 수 있다(→ todo/04).
- `src/data/*.json` 은 계속 커밋한다 — 키 없이 dev·test 가 돌아야 해서다. **빌드 입력은 아니다**(4a 뒤로 `vercel.json` 의 `pnpm data:pull && pnpm build` 가 매 배포에 DB 를 읽고, 빈 결과면 exit 1 로 멈춘다 — 잠든 DB 를 옛 스냅샷으로 덮지 않는다).
- `docs/architecture/data-pipeline.md` 는 1·4a 구현과 함께 다시 썼다(지금 v7).
- 옛 계획 `.omc/plans/2026-09-17-notion-supabase-scraping.md` 의 Phase 5 는 소멸.

## 관련

[ADR-001](ADR-001-pwa-static-export.md) 정적 내보내기 전제 · [ADR-011](ADR-011-app-gate-and-supabase.md) 보류된 잠금 · [ADR-018](ADR-018-in-app-admin-review.md) §2 를 번복한 결정 · [docs/todo/](../todo/README.md)
