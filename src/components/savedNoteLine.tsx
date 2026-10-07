import { Edit03 } from '@untitledui/icons';
import { useSavedNote } from '../store/useAppStore';
import { cx } from '../utils/cx';

/**
 * 저장한 곳에 적은 내 메모 한 줄 — **읽기 전용**, 메모가 없으면 아무것도 안 그린다.
 *
 * 메모는 사용자가 그 장소에 남긴 유일한 흔적인데 예전엔 저장 화면 카드 **밑** 회색 버튼에만 있었다 — "메모 남기기" 와
 * 같은 자리·같은 색이라 적어 둔 것이 눈에 안 띄고, 둘러보기·지도·상세에는 아예 없었다. 지금은 그 장소가 보이는
 * 모든 자리(목록 카드·지도 시트·상세 머리)에서 **카드 안 위쪽**에 하트와 같은 색 면으로 선다 — 하트가 "저장했다",
 * 이 줄이 "왜 저장했다" 다. 고치는 것은 저장 화면에서만(`savedPageNote.tsx`).
 *
 * 카드 링크 안에 넣어도 된다 — 글자뿐이라 누르면 상세로 간다(입력 칸이 아니다).
 */
export function SavedNoteLine({ id, className }: { id: string; className?: string }) {
  const note = useSavedNote(id);
  if (!note) return null;
  return (
    <p className={cx('flex items-start gap-1.5 rounded-lg bg-camellia-wash px-2.5 py-1.5 text-sm text-primary', className)}>
      <Edit03 size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-camellia" />
      <span className="sr-only">내 메모: </span>
      <span className="min-w-0 flex-1 break-words">{note}</span>
    </p>
  );
}
