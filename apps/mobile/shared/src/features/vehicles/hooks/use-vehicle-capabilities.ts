import { useMemo } from 'react';
import { PERMISSION, PLAN_FEATURE, type Permission } from '@xeprime/types';
import { useFeature } from '@/features/auth/hooks/use-feature';
import { usePermissions } from '@/features/auth/hooks/use-permissions';

/**
 * "Người này có được THẤY khối này trên hồ sơ xe không" — bản native của
 * `apps/web/src/features/vehicles/hooks/use-vehicle-capabilities.ts`.
 *
 * Kiểm NỐI TIẾP permission ∧ cờ gói (ADR 0027 điều 2). Chủ xe tuyến hoa hồng và chủ gian hàng trả
 * phí dùng CÙNG vai `shop_owner`, nên chỉ đọc permission thì khối tiền/bảo dưỡng dựng lên cho cả
 * tuyến hoa hồng, bắn request rồi nhận 403 (`@SubscriptionTrackOnly` + `@RequiresFeature`).
 *
 * Chỉ là lớp TRẢI NGHIỆM — guard backend mới là lớp chặn thật.
 */
export interface VehicleCapabilities {
  /** Khối TIỀN của xe (doanh thu/chi phí theo kỳ, sổ thu chi). */
  money: boolean;
  /** Ghi phiếu thu/chi — `read_only` lúc hết gói vẫn xem được nhưng không ghi. */
  createReceipt: boolean;
  /** Bảo dưỡng & số KM. */
  maintenance: boolean;
  /** Nguồn xe & tài chính. */
  source: boolean;
  /** Giấy tờ xe — bộ CƠ BẢN, chỉ permission. */
  documents: boolean;
}

/** Phép tính THUẦN — tách khỏi hook để ma trận quyền × cờ kiểm được bằng test. */
export function vehicleCapabilities({
  has,
  finance,
  maintenance,
}: {
  has: (permission: Permission) => boolean;
  finance: { isVisible: boolean; canWrite: boolean };
  maintenance: { isVisible: boolean };
}): VehicleCapabilities {
  const canViewFinance = has(PERMISSION.FINANCE_VIEW);
  return {
    money: canViewFinance && finance.isVisible,
    createReceipt: has(PERMISSION.RECEIPT_CREATE) && finance.canWrite,
    maintenance: has(PERMISSION.VEHICLE_MAINTENANCE_VIEW) && maintenance.isVisible,
    source: canViewFinance && finance.isVisible,
    documents: has(PERMISSION.VEHICLE_DOCUMENT_VIEW),
  };
}

export function useVehicleCapabilities(): VehicleCapabilities {
  const { has } = usePermissions();
  const finance = useFeature(PLAN_FEATURE.FINANCE);
  const maintenance = useFeature(PLAN_FEATURE.MAINTENANCE);

  const financeVisible = finance.isVisible;
  const financeWrite = finance.canWrite;
  const maintenanceVisible = maintenance.isVisible;

  return useMemo(
    () =>
      vehicleCapabilities({
        has,
        finance: { isVisible: financeVisible, canWrite: financeWrite },
        maintenance: { isVisible: maintenanceVisible },
      }),
    [has, financeVisible, financeWrite, maintenanceVisible],
  );
}
