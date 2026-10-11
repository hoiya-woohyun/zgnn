/**
 * 글 루프의 **앞당겨 읽기 창** — 글마다 오래 걸리는 앞 절반(본문 받기 · `claude -p` 추출 · 교차점검)을 최대 `concurrency` 건 동시에 띄우고,
 * 뒤 절반(네이버 보강 · 대조 · 중복 판정 · insert)은 호출자가 **원래 순서대로 하나씩** `take(i)` 로 받아 처리한다.
 *
 * 왜 앞 절반만인가 — 앞 절반은 그 글 하나만 읽는다. 뒤 절반은 `newNamesSeen`·`newPlacesSeen`(이번 실행에서 먼저 난 신규 후보)을
 * 글 순서대로 쌓아 `dupOf` 를 정하므로, 순서가 바뀌면 같은 입력에서 다른 묶음이 나온다. 창은 그 순서를 지키면서 기다림만 겹친다.
 *
 * - 띄울 때마다 `canStart(ahead)` 를 본다(서버 홉의 시간 예산). `ahead` 는 이 글 앞에서 뒤 절반을 기다리는 글 수(띄웠지만 아직 처리 안 한 글) —
 *   이 글의 끝은 "띄운 시각 + 한 글 추정" 이 아니라 앞 글들의 뒤 절반이 다 끝난 뒤다. 거짓이면 그 뒤로는 띄우지 않고 `deadlineHit` 이 선다.
 * - `stop()` 은 새로 띄우기만 멈춘다(한도 · fatal) — 이미 떠 있는 것은 `settle()` 로 기다려야 자식 프로세스가 실행 기록 뒤에 남지 않는다.
 * - 결과는 띄우는 순간 `{ ok, value | error }` 로 감싼다. 루프가 아직 `await` 하지 않은 글이 먼저 reject 되면 미처리 rejection 으로
 *   프로세스가 죽는다(로컬 워커·서버 함수는 같은 프로세스에서 `main()` 을 부른다).
 */
export function createAnalyzePrefetch(items, prepare, { concurrency = 1, canStart = () => true } = {}) {
  const width = Math.max(1, Math.floor(concurrency));
  const slots = [];
  let stopped = false;
  let deadlineHit = false;
  let current = 0; // 지금 뒤 절반을 하는(또는 기다리는) 글

  function fill(upTo) {
    while (!stopped && slots.length < items.length && slots.length < upTo) {
      if (!canStart(slots.length - current)) {
        stopped = true;
        deadlineHit = true;
        break;
      }
      const index = slots.length;
      slots.push(
        Promise.resolve()
          .then(() => prepare(items[index], index))
          .then(
            (value) => ({ ok: true, value }),
            (error) => ({ ok: false, error }),
          ),
      );
    }
  }

  return {
    /** `index` 번째 글의 앞 절반 결과. 띄우지 못한 글(시간 예산 · stop 뒤)이면 null. 받는 김에 창을 `index + concurrency` 까지 채운다. */
    async take(index) {
      current = index;
      fill(index + width);
      return index < slots.length ? slots[index] : null;
    },
    stop() {
      stopped = true;
    },
    /** 떠 있는 것을 전부 기다린다 — 루프를 끊은 뒤 부른다. */
    async settle() {
      await Promise.all(slots);
    },
    /** 띄운 글 수 — 손대지 않은 글은 `items.length - launched` 다(`onDeadline` 이 저수지에 되돌리는 수). */
    get launched() {
      return slots.length;
    },
    get deadlineHit() {
      return deadlineHit;
    },
  };
}
