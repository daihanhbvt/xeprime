import type { UserBadgeCounts } from '@xeprime/types';
import { useBadgeRealtime } from '../BadgeRealtimeProvider';
import { useOnBadgeChange } from './use-on-badge-change';

/**
 * `useOnBadgeChange` cho những hook ĐỌC con số từ `BadgeRealtimeProvider` — hộp thư, danh sách
 * thông báo, huy hiệu menu Manage. Bản native của
 * `apps/web/src/features/badges/hooks/use-on-badge-signal.ts`.
 *
 * Tự đưa `null` khi con số chưa được biết, để luật đó nằm ở MỘT chỗ: kiểu `number | null` nhận
 * cả một con số trần, nên một nơi gọi mới viết thẳng `counts.x` sẽ không bị typecheck chặn — và
 * mang lại đúng lỗi "mỗi lần mở app tải lại danh sách hai lần". Provider thì gọi thẳng
 * `useOnBadgeChange`, vì nó không đọc được context của chính nó.
 */
export function useOnBadgeSignal(
  select: (counts: UserBadgeCounts) => number,
  onChange: () => void,
): void {
  const { counts, known } = useBadgeRealtime();
  useOnBadgeChange(known ? select(counts) : null, onChange);
}
