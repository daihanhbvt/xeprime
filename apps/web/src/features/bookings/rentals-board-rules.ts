import { RENTAL_STAGE, RENTAL_STAGE_NEXT, type RentalStage } from '@/constants/rental-stages';

/**
 * Phán quyết khi thả một thẻ của nhóm `from` vào cột `to` trên bảng Kanban.
 *
 * - `allowed`  — đúng bước kế và bước đó có người làm được: thả mở ĐÚNG chỗ nút trên thẻ mở (hộp
 *                Phê duyệt / trang chi tiết để giao xe). Thả KHÔNG đổi trạng thái — server xác nhận
 *                xong thẻ mới sang cột (sổ cái §3.2b, 05/11/2026).
 * - `locked`   — đúng bước kế nhưng không ai bấm qua được: "Chờ khách thanh toán" → "Chờ giao xe" chỉ
 *                xảy ra khi đối soát xác nhận đủ tiền (ADR 0044 điều 2).
 * - `not_next` — nhảy cóc / đi lùi.
 * - `same`     — thả lại chỗ cũ.
 */
export type BoardDropVerdict = 'allowed' | 'locked' | 'not_next' | 'same';

export function boardDropVerdict(from: RentalStage, to: RentalStage): BoardDropVerdict {
  if (from === to) return 'same';
  if (RENTAL_STAGE_NEXT[from] !== to) return 'not_next';
  return from === RENTAL_STAGE.AWAITING_PAYMENT ? 'locked' : 'allowed';
}
