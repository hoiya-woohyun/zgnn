# ADR-001: PWA + Next.js 정적 내보내기, 서버·스토어 없음

> 작성일: 2026-09-15
> 상태: 채택

## 맥락 (Context)

- 데이터는 Notion 에서 한 번 뽑은 정적 자료 86 + 15건이고, 사용자 상태는 저장·체크·(계획) 강아지 프로필뿐이다.
- 작성자 한 명의 사이드 프로젝트라 서버 운영·스토어 심사 비용을 감당할 이유가 없다.
- 처음엔 Vite SPA 였다. 장소 86곳의 공유·검색용 메타 태그와 주소별 HTML 이 필요해져 Next 로 옮겼다(커밋 `5e27927`).

## 결정 (Decision)

- Next.js 16 App Router 를 `output: 'export'` 로 쓴다. 산출물은 `out/` 정적 파일이고 아무 서버에나 올린다.
- 앱 형태는 PWA. 스토어 배포는 범위 밖.
- 사용자 상태는 localStorage(zustand persist)에만 둔다. 로그인·동기화 없음.
- Notion 동기화는 수동 스크립트. 실시간 연동은 하지 않는다.

## 결과 (Consequences)

- 서버 컴포넌트가 할 수 있는 일은 메타 태그·정적 파라미터뿐이다. 화면 동작은 전부 클라이언트(`src/screens/`).
- 빌드 때 HTML 이 만들어지므로 localStorage 를 첫 렌더에서 읽을 수 없다(`skipHydration`). 첫 프레임에 "저장 0" 이 보인다.
- 서비스워커 프리캐시 목록을 직접 만들어야 한다(→ [architecture/pwa-offline.md](../architecture/pwa-offline.md)).
- 강아지 프로필 같은 새 상태도 같은 제약을 받는다. 기기를 바꾸면 사라진다.
