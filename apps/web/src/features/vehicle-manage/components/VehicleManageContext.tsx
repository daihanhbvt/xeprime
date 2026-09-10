'use client';

import { createContext, useContext } from 'react';
import type { VehicleDetail } from '@/features/vehicles/types';

export interface VehicleManageContextValue {
  vehicle: VehicleDetail;
  /** `vehicles.update` — mọi form con khoá nút lưu khi thiếu. */
  canEdit: boolean;
}

const VehicleManageContext = createContext<VehicleManageContextValue | null>(null);

export const VehicleManageProvider = VehicleManageContext.Provider;

/**
 * Xe đang được quản lý — vỏ `VehicleManageWorkspace` đã tải, kiểm quyền và gác mọi trạng thái
 * tải/lỗi TRƯỚC khi render trang con, nên trang con không cần tải lại hồ sơ xe.
 */
export function useManagedVehicle(): VehicleManageContextValue {
  const value = useContext(VehicleManageContext);
  if (!value) {
    throw new Error('useManagedVehicle phải nằm trong VehicleManageWorkspace');
  }
  return value;
}
