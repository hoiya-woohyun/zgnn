// 네이버 키 **모양** 검사 — 순수. 값을 돌려주거나 찍지 않는다(ADR-016) — 무엇이 틀렸는지 이름과 갈래만 말한다.
//
// 왜 필요한가(2026-10-02 실측): env 파일에 예시 문구(`검색키_ID`)가 그대로 남은 채 돌렸더니, 401 이 아니라
// `Cannot convert argument to a ByteString ... value 44160` 이 났다 — HTTP 헤더에 한글이 들어가 **요청 자체가 만들어지지 않았다**.
// 그 오류는 상태 코드가 없어 401 게이트(`naverApiError`)를 지나치고 "네이버 보강 실패(좌표 없이 진행)" 로 흘러,
// 키가 없을 때 멈추게 해 둔 장치(BUG-006 · 2026-09-28 의 후보 160건)가 조용히 꺼졌다. 그래서 **부르기 전에** 모양을 본다.
//
// 네이버 키는 보이는 ASCII 만 쓴다(Client ID 는 영숫자·`_`·`-`, Secret 은 영숫자). 여기서는 그보다 넓게 "헤더에 실을 수 있나" 만 본다 —
// 좁게 잡으면 네이버가 형식을 바꾸는 날 멀쩡한 키를 막는다.

const HEADER_SAFE = /^[\x21-\x7e]+$/;

/** 키 하나의 문제 한 줄(없으면 null). `name` 은 env 이름이다 — 값은 싣지 않는다. */
export function naverKeyProblem(name, value) {
  if (typeof value !== 'string' || value === '') return `${name} 가 비었다`;
  if (/[^\x00-\x7f]/.test(value)) return `${name} 에 ASCII 가 아닌 글자(한글 등)가 있다 — 예시 문구가 그대로 남지 않았는지 본다`;
  if (/\s/.test(value)) return `${name} 안에 공백·줄바꿈이 있다`;
  if (!HEADER_SAFE.test(value)) return `${name} 에 헤더에 실을 수 없는 글자가 있다`;
  return null;
}

/** 두 키의 문제를 모아 한 줄로. 둘 다 괜찮으면 null. */
export function naverKeyPairProblem([idName, secretName], { clientId, clientSecret }) {
  const problems = [naverKeyProblem(idName, clientId), naverKeyProblem(secretName, clientSecret)].filter(Boolean);
  return problems.length ? problems.join(' · ') : null;
}
