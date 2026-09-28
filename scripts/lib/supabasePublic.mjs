// Supabase 의 공개 상수 — 스크립트(supabaseClient.mjs)와 브라우저(src/lib/admin*, ADR-018)가 같은 값을 쓴다.
// import 가 없는 순수 모듈로 둔다: node 모듈을 넣으면 앱 번들이 안 되고, 여기 시크릿을 두면 정적 번들에 그대로 실린다.
// 시크릿은 여기에도 다른 어디에도 없다 — 인증은 로그인 세션(ADR-016), 경계는 RLS 다.
// 이 파일은 out/ 의 JS 에 들어가므로 check-bundle.mjs 의 패턴(service 키 이름·secret 키 접두·JWT 형태)에 걸리는 문자열을
// 주석 밖 코드에 적지 않는다 — 에러 문구도 그래서 키 이름을 풀어서 쓴다.

// 둘 다 공개값이다. ref 는 API 주소의 서브도메인이고, publishable 키는 브라우저 번들에 실으라고 만든 키다(RLS 가 방어선).
// 코드 상수인 이유: Vercel 빌드엔 `supabase/.temp/project-ref`(gitignored) 가 없다. link 된 ref 가 이 값과 다르면 supabaseClient.mjs 가 멈춘다.
export const PROJECT_REF = 'qfzasaszpwcgtbzirujx';
export const PUBLISHABLE_KEY = 'sb_publishable_OqCciy03V9rlf6X2l9mJvA_vimcVhSz';
// 리터럴 문자열로 둔다 — `projectUrl(PROJECT_REF)` 로 조립하지 않는다. check-bundle.mjs 는 "우리 프로젝트 호스트가 아닌 supabase.co" 만 잡는데,
// 그 식별이 이 리터럴 그대로 번들에 남아 있다는 데 기댄다(템플릿으로 조립하면 번들엔 `.supabase.co` 조각만 남아 차단된다).
export const PROJECT_URL = 'https://qfzasaszpwcgtbzirujx.supabase.co';

// "공개 상수" 자리에 secret/service 키를 붙여 넣어도 PostgREST 는 그대로 동작한다(오히려 RLS 우회) — 형식으로 막는다.
export function assertPublishableKey(key) {
  if (key && !/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key)) {
    throw new Error('PUBLISHABLE_KEY 는 sb_publishable_ 로 시작해야 한다 — secret 키·service 키·legacy JWT 를 넣으면 레포에 시크릿이 커밋되고 번들에 실린다.');
  }
}
assertPublishableKey(PUBLISHABLE_KEY);

// 다른 ref 의 주소(supabaseClient.mjs 의 link 검사·테스트용). PROJECT_URL 에서 ref 만 바꿔 만든다 — `https://${ref}.supabase.co` 템플릿으로
// 쓰면 브라우저 번들에 `.supabase.co` 조각이 남아 check-bundle.mjs 가 "다른 호스트" 로 잡는다(tree-shaking 에 기대지 않는다).
export function projectUrl(ref) {
  return PROJECT_URL.replace(PROJECT_REF, () => ref);
}
