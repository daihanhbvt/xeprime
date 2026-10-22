import { FEE_POLICY_STATUS, type FeePolicyStatus } from '@xeprime/types';
import type { FeePolicy } from './types';

/**
 * Ba SỔ của trang chính sách phí — đang áp dụng · bản nháp · lịch sử lưu trữ.
 *
 * Sàn chỉ có ĐÚNG MỘT bản `active` tại mọi thời điểm; trải phẳng mọi phiên bản trong một bảng làm
 * admin tưởng nhiều chính sách đang chạy song song. Sổ là GÓC NHÌN (`QueueViewSwitch`), không phải
 * bộ lọc: mặc định là "đang áp dụng" và không ghi lên URL; hai sổ còn lại sống ở `?view=` để chia
 * sẻ được và sống qua reload (ADR 0004). Bản nháp có sổ RIÊNG — gộp vào lịch sử thì bản vừa tạo
 * nằm lẫn với bản đã chết, ẩn đi thì admin tạo nháp xong không thấy nó đâu.
 */
export const FEE_POLICY_VIEW = {
  ACTIVE: 'active',
  DRAFT: 'draft',
  ARCHIVED: 'archived',
} as const;
export type FeePolicyView = (typeof FEE_POLICY_VIEW)[keyof typeof FEE_POLICY_VIEW];

/** Sổ → trạng thái phiên bản hiện trong sổ đó. */
const VIEW_STATUS: Readonly<Record<FeePolicyView, FeePolicyStatus>> = {
  [FEE_POLICY_VIEW.ACTIVE]: FEE_POLICY_STATUS.ACTIVE,
  [FEE_POLICY_VIEW.DRAFT]: FEE_POLICY_STATUS.DRAFT,
  [FEE_POLICY_VIEW.ARCHIVED]: FEE_POLICY_STATUS.ARCHIVED,
};

/** Tham số URL của trang. `view` vắng mặt = đang áp dụng (mặc định, không ghi lên URL). */
export interface FeePolicyFilters {
  view?: typeof FEE_POLICY_VIEW.DRAFT | typeof FEE_POLICY_VIEW.ARCHIVED;
}

/** Đọc `?view=`. Giá trị lạ (link cũ, gõ tay) rơi về sổ mặc định thay vì một sổ rỗng khó hiểu. */
export function parseFeePolicyFilters(params: URLSearchParams): FeePolicyFilters {
  const view = params.get('view');
  return view === FEE_POLICY_VIEW.DRAFT || view === FEE_POLICY_VIEW.ARCHIVED ? { view } : {};
}

export function feePolicyViewOf(filters: FeePolicyFilters): FeePolicyView {
  return filters.view ?? FEE_POLICY_VIEW.ACTIVE;
}

/**
 * Các phiên bản thuộc một sổ. Lịch sử xếp phiên bản MỚI trước — người mở sổ này thường đang đối
 * chiếu một đơn gần đây, không phải bản pilot đầu tiên.
 */
export function feePoliciesInView(items: readonly FeePolicy[], view: FeePolicyView): FeePolicy[] {
  const status = VIEW_STATUS[view];
  return items.filter((p) => p.status === status).sort((a, b) => b.version - a.version);
}

/** Số phiên bản mỗi sổ — để nhãn công tắc nói trước sổ nào có gì. */
export function countFeePoliciesByView(items: readonly FeePolicy[]): Record<FeePolicyView, number> {
  return Object.fromEntries(
    Object.values(FEE_POLICY_VIEW).map((view) => [
      view,
      items.filter((p) => p.status === VIEW_STATUS[view]).length,
    ]),
  ) as Record<FeePolicyView, number>;
}

/** Bản đang áp dụng (server bảo đảm tối đa một), `null` khi sàn chưa kích hoạt bản nào. */
export function activeFeePolicy(items: readonly FeePolicy[]): FeePolicy | null {
  return items.find((p) => p.status === FEE_POLICY_STATUS.ACTIVE) ?? null;
}
