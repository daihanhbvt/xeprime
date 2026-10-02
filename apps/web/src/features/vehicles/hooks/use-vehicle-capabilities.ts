'use client';

import { useMemo } from 'react';
import { PERMISSION, PLAN_FEATURE } from '@xeprime/types';

import { useFeature } from '@/hooks/use-feature';
import { usePermissions } from '@/hooks/use-permissions';

/**
 * "Người này có được THẤY khối này trên hồ sơ xe không" — kiểm NỐI TIẾP cả ba trục (ADR 0027
 * điều 2), ở một chỗ duy nhất.
 *
 * ## Vì sao không đọc thẳng `usePermissions()` như trước
 *
 * Chủ xe cá nhân tuyến hoa hồng và chủ gian hàng trả phí dùng **CÙNG một vai `shop_owner`, nên
 * cùng một bộ permission** (ADR 0014 — xem `packages/types/src/account-track.ts`). Vì vậy
 * `has(PERMISSION.FINANCE_VIEW)` trả `true` cho cả hai, và mọi khối gác bằng mỗi câu đó đều hiện
 * ra cho tuyến hoa hồng.
 *
 * Nhưng backend gác ba khối đó bằng trục KHÁC — `@SubscriptionTrackOnly()` + `@RequiresFeature`
 * trên `finance/*` và `vehicles/:id/maintenance/*`. Kết quả trước đợt này, đúng như quan sát
 * được ở `/account/vehicles/:id`: khối "Tiền của xe này" và thẻ "Bảo dưỡng & KM" dựng lên, hai
 * request bay đi, cùng nhận 403, và chủ xe đọc được **"Không tải được số liệu"** — một câu nói
 * rằng hệ thống đang hỏng, cho một tính năng họ chưa từng mua.
 *
 * Hook này trả lời bằng cả ba trục cùng lúc, nên câu trả lời của web không thể khác câu trả lời
 * của guard backend. Nó **không cấp thêm gì cho ai**: mỗi trường chỉ là phép `&&` giữa những
 * điều kiện vốn đã tồn tại.
 *
 * ⚠️ Đây vẫn là lớp TRẢI NGHIỆM. Lớp chặn thật là guard backend (CLAUDE.md §3) — ẩn một thẻ ở
 * đây không bảo vệ gì cả, nó chỉ khiến màn hình nói đúng sự thật.
 *
 * Cờ vắng trong cache `/auth/me` ⇒ `useFeature` mặc định "cho qua" (xem docblock của nó), nên
 * hook này giữ nguyên hành vi cũ với mọi phiên chưa kịp làm mới.
 */
export interface VehicleCapabilities {
  /** Khối TIỀN của xe (doanh thu/chi phí/lợi nhuận theo kỳ, sổ thu chi). */
  money: boolean;
  /** Ghi phiếu thu/chi cho xe — `read_only` lúc hết gói vẫn xem được, nhưng không ghi. */
  createReceipt: boolean;
  /** Bảo dưỡng & số KM. */
  maintenance: boolean;
  /** Nguồn xe & tài chính (ký gửi, hợp tác, trả góp). */
  source: boolean;
  /** Giấy tờ xe — thuộc bộ CƠ BẢN, không có cờ gói nào gác (chỉ permission). */
  documents: boolean;
}

export function useVehicleCapabilities(): VehicleCapabilities {
  const { has } = usePermissions();
  const finance = useFeature(PLAN_FEATURE.FINANCE);
  const maintenance = useFeature(PLAN_FEATURE.MAINTENANCE);

  const canViewFinance = has(PERMISSION.FINANCE_VIEW);
  const canCreateReceipt = has(PERMISSION.RECEIPT_CREATE);
  const canViewMaintenance = has(PERMISSION.VEHICLE_MAINTENANCE_VIEW);
  const canViewDocuments = has(PERMISSION.VEHICLE_DOCUMENT_VIEW);

  return useMemo(
    () => ({
      money: canViewFinance && finance.isVisible,
      // `canWrite` chứ không `isVisible`: gói hết hạn để lại chế độ chỉ-xem, và một nút "Tạo
      // phiếu" trong chế độ đó chỉ dẫn tới một lần 403.
      createReceipt: canCreateReceipt && finance.canWrite,
      maintenance: canViewMaintenance && maintenance.isVisible,
      source: canViewFinance && finance.isVisible,
      documents: canViewDocuments,
    }),
    [
      canViewFinance,
      canCreateReceipt,
      canViewMaintenance,
      canViewDocuments,
      finance.isVisible,
      finance.canWrite,
      maintenance.isVisible,
    ],
  );
}
