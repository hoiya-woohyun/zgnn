# TODO — 블로그 수집 → AI 분석 → 승인 → DB → 자동 배포

> 최종 수정: 2026-09-18 (v1: 신설 — 5단계 파이프라인의 실행 트래커. 설계 근거는 ADR 에 있고 여기엔 순서·의존·상태만 둔다)
> 상태: **계획**. 코드는 아직 없다. 각 항목의 `[ ]` 를 채워 가며 진행하고, 결정이 확정되면 ADR 로 옮기고 여기서는 링크만 남긴다.

## 목표

지금은 Notion 에서 한 번 뽑은 86곳이 빌드에 구워져 있고 갱신은 사람 손이다. 이걸 아래로 바꾼다.

```mermaid
flowchart LR
  K[키워드 목록] -->|네이버 검색 API<br/>최근 1년| P[(blog_posts)]
  P -->|Claude 추출| C[(candidates)]
  C -->|사람이 링크 열어 확인·승인| PL[(places)]
  PL -->|DB 웹훅 → Vercel Deploy Hook| B[next build<br/>빌드 시 DB 를 읽어 JSON 으로]
  B --> S[정적 사이트 · PWA]
  N[(Notion 86곳)] -.->|1회 시드| PL
```

| 단계 | 문서 | 지금 | 목표 |
|---|---|---|---|
| 0 | [00-setup-supabase-vercel.md](00-setup-supabase-vercel.md) | Supabase 없음 · Vercel 미연결 · CLI 미설치 | 프로젝트 둘 다 생성, 시크릿 자리 잡기 |
| 1 | [01-schema-and-seed.md](01-schema-and-seed.md) | 데이터는 `src/data/*.json` 뿐 | Supabase 가 원본. 86곳·15개 시드, `data:pull` 로 JSON 생성 |
| 2 | [02-collect-naver-blog.md](02-collect-naver-blog.md) | 없음 | 키워드로 최근 1년 블로그 글을 GitHub Actions 가 주기 수집 |
| 3 | [03-analyze-and-review.md](03-analyze-and-review.md) | 없음 | Claude 가 장소·조건을 뽑고, 사람이 링크 보고 승인 |
| 4 | [04-deploy-and-propagate.md](04-deploy-and-propagate.md) | 로컬 `pnpm build` | 승인 → 자동 재빌드 → 사이트 반영 |
| 5 | [05-security.md](05-security.md) | 시크릿 없음 | 키 분리·RLS·웹훅 서명·프리뷰 보호 |

## 이 계획이 서 있는 가정 두 개 — 🙋 확인 필요

둘 다 기존 계획([.omc/plans/2026-09-17-notion-supabase-scraping.md](../../.omc/plans/2026-09-17-notion-supabase-scraping.md))과
**다른** 해석이다. 확정되면 `ADR-015` 로 등재하고, 아니면 이 폴더의 문서 절반이 바뀐다.

### 가정 1 — 원본(source of truth)은 Notion 이 아니라 Supabase

기존 계획은 "승인된 후보를 Notion 에 써 넣고 → 다시 뽑는다" 였다(Phase 5, 가장 위험하다고 적혀 있다).
이번 요구에는 Notion 이 등장하지 않는다 — "승인 → DB → 사이트". 그래서:

- **Supabase `places` 가 원본**이 된다. Notion 은 1회 시드 후 읽지 않는다(와이프가 Notion 을 계속 편집한다면 이 가정이 깨진다 — 그때는 기존 계획 Phase 5 가 되살아난다).
- 손으로 고칠 일(오타·폐업)은 Supabase Studio 의 표 편집기에서 한다. 관리 화면은 나중이다(→ 03).

### 가정 2 — "DB 갱신 → 사이트 노출" 은 런타임 fetch 가 아니라 **재빌드**

| | (A) 재빌드 — **이 계획** | (B) 런타임 fetch — ADR-011 |
|---|---|---|
| 흐름 | DB 웹훅 → Vercel Deploy Hook → 빌드가 DB 를 읽어 `src/data/*.json` 생성 → 정적 내보내기 | 클라이언트가 로그인 뒤 Supabase 를 읽고 IndexedDB 에 캐시 |
| 반영 지연 | 빌드 시간(1~2분) | 즉시 |
| 앱 번들에 Supabase | **없음** | 있음 (`@supabase/supabase-js` + anon key) |
| 지켜지는 것 | ADR-001·002·007·010·014, "런타임 fetch 없음", 프리캐시 `revisionHash` 그대로 | 대부분 다시 써야 함(ADR-011 "결과" 절) |
| 필요한 이유 | — | **앱 전체 잠금**(회원만 사용) 을 원할 때만 |

(B) 가 필요한 조건은 하나다 — [ADR-011](../decisions/ADR-011-app-gate-and-supabase.md) 의 "회원만 쓰게 한다" 가 아직 살아 있는가.
이번 요구에는 회원·로그인이 없으므로 (A) 로 간다. 단계 0~3 은 어느 쪽이든 같고, **4 만 갈린다.**

## 순서와 의존

```
0 (계정·시크릿) ──▶ 1 (스키마·시드·data:pull) ──▶ 4 (Vercel 빌드 = pull + build)   ← 여기까지가 "DB 가 원본" 의 최소 완성
                                   │
                                   └──▶ 2 (수집) ──▶ 3 (분석·승인) ──▶ 4 의 웹훅 재빌드
5 (보안) 은 0 에서 시작해 각 단계마다 항목이 하나씩 붙는다
```

**0 → 1 → 4 를 먼저 끝낸다.** 수집·분석(2·3) 없이도 "Studio 에서 한 줄 고치면 사이트가 바뀐다" 가 성립하고,
그 상태가 2·3 을 만드는 동안의 안전한 기반이다.

## 진행 상태

- [ ] 가정 1·2 확인 → `ADR-015` 작성
- [ ] 0 Supabase(서울 리전) · Vercel 프로젝트 · GitHub Secrets
- [ ] 1 스키마 + RLS + 시드 + `scripts/pull-db.mjs`
- [ ] 4a Vercel 빌드 명령 `pnpm data:pull && pnpm build` 로 첫 배포
- [ ] 2 `scripts/collect-blog.mjs` + `.github/workflows/collect.yml`
- [ ] 3 `scripts/analyze-candidates.mjs` + `matchPlace` + 승인 상태 머신
- [ ] 4b DB 웹훅 → Deploy Hook 자동 재빌드
- [ ] 5 `out/` 시크릿 유출 검사 CI · 프리뷰 보호 · 키 회전 절차
- [ ] `docs/architecture/data-pipeline.md` v2 (파이프라인이 실제로 바뀌는 시점에)

## 🙋 사용자가 정할 것 (문서가 결정해 두지 않은 자리)

| 어디 | 무엇 | 왜 사용자 몫인가 |
|---|---|---|
| 02 | 검색 키워드 목록 | 도메인 지식. "강아지 동반" vs "애견 동반" vs "반려견" 이 다른 글을 낸다 |
| 03 | `matchPlace` 자동 병합 임계값, 애매 구간은 자동 vs 사람 | 틀리면 데이터가 조용히 썩는다. 86곳이라 사람 비용이 싸다는 점도 고려 |
| 03 | AI 모델(품질 vs 비용) | 주당 몇 달러 차이. 기본은 `claude-opus-5` |
| 04 | 승인마다 재빌드 vs 모아서 "반영" 한 번 | 빌드 횟수 = Vercel 무료 한도 소비 |

## 기존 문서와의 관계

- [.omc/plans/2026-09-17-notion-supabase-scraping.md](../../.omc/plans/2026-09-17-notion-supabase-scraping.md) — 이 폴더가 **대체**한다. 살아남은 것: Phase 1 의 "재추출 스크립트 부재", Phase 4 의 GitHub Actions 선택 이유, §4 의 `matchPlace`. 거기 적힌 "git 원격이 없다" 는 이제 사실이 아니다(`origin` = `hoiya-woohyun/zgnn`).
- [ADR-011](../decisions/ADR-011-app-gate-and-supabase.md) · [ADR-012](../decisions/ADR-012-personal-data-and-consent.md) — **보류**. 이 계획은 회원을 받지 않으므로 개인정보도 받지 않는다. 잠금이 다시 필요해지면 그때 (B) 로 4 를 다시 쓴다. ADR-012 의 "리전은 서울, 생성 시에만" 은 회원 유무와 무관하게 **지금 0 에서 지킨다.**
- [docs/architecture/data-pipeline.md](../architecture/data-pipeline.md) — 1·4 가 끝나면 "동기화는 수동", "런타임 fetch 없음"(이건 그대로 참), "재추출 스크립트는 없다" 를 다시 쓴다.
