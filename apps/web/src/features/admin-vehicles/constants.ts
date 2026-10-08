import {
  PLATFORM_VEHICLE_VIEW,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  type PlatformVehicleView,
} from '@xeprime/types';
import { ALL_FILTER } from '@/constants/filters';
import type { AdminVehicleFilters } from './types';

/** Ba chiều lọc mà một góc nhìn nhanh ghi vào — mọi góc nhìn liệt kê ĐỦ ba khoá. */
export type AdminVehicleViewPatch = Required<
  Pick<AdminVehicleFilters, 'publicStatus' | 'tenantStatus' | 'marketplaceVisible'>
>;

/**
 * Góc nhìn nhanh của màn "Xe toàn hệ thống" — chỉ GIÁ TRỊ, không nhãn (nhãn đổi theo ngôn ngữ
 * người xem, dựng lúc chạy ở trang). Khoá là `PLATFORM_VEHICLE_VIEW`: cũng là khoá của `counts`
 * server trả về, nên tab và số đếm không thể lệch tên nhau.
 *
 * `visible` lọc theo **kết quả hiển thị hiệu lực** (`marketplaceVisible`), KHÔNG theo
 * `publicStatus = approved_public` (ADR 0048). Xe đã duyệt mà chủ xe tắt công tắc, hoặc thuộc
 * gian hàng bị khoá, vẫn là `approved_public` — lọc bằng cột đó rồi gắn nhãn "Đang hiển thị" là
 * đưa cho người kiểm duyệt một danh sách có lẫn xe không ai nhìn thấy.
 *
 * `patch` phải liệt kê ĐỦ ba khoá ở mọi góc nhìn (kể cả giá trị "bỏ lọc"): nó là trạng thái ĐÍCH
 * của bộ lọc, không phải một phần chỉnh sửa — thiếu một khoá thì góc nhìn mới cộng dồn lên góc
 * nhìn cũ và không góc nào còn khớp chính xác.
 */
export const ADMIN_VEHICLE_VIEWS: readonly {
  key: PlatformVehicleView;
  patch: AdminVehicleViewPatch;
}[] = [
  {
    key: PLATFORM_VEHICLE_VIEW.ALL,
    patch: { publicStatus: ALL_FILTER, tenantStatus: ALL_FILTER, marketplaceVisible: ALL_FILTER },
  },
  {
    key: PLATFORM_VEHICLE_VIEW.VISIBLE,
    patch: { publicStatus: ALL_FILTER, tenantStatus: ALL_FILTER, marketplaceVisible: 'true' },
  },
  {
    key: PLATFORM_VEHICLE_VIEW.PENDING_REVIEW,
    patch: {
      publicStatus: VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW,
      tenantStatus: ALL_FILTER,
      marketplaceVisible: ALL_FILTER,
    },
  },
  {
    key: PLATFORM_VEHICLE_VIEW.PLATFORM_HIDDEN,
    patch: {
      publicStatus: VEHICLE_PUBLIC_STATUS.HIDDEN,
      tenantStatus: ALL_FILTER,
      marketplaceVisible: ALL_FILTER,
    },
  },
  {
    key: PLATFORM_VEHICLE_VIEW.SUSPENDED_SHOP,
    patch: {
      publicStatus: ALL_FILTER,
      tenantStatus: TENANT_STATUS.SUSPENDED,
      marketplaceVisible: ALL_FILTER,
    },
  },
];

/**
 * Góc nhìn đang khớp CHÍNH XÁC bộ lọc hiện tại — `null` khi bộ lọc tay tạo ra một tổ hợp không
 * có tên (ví dụ `publicStatus=draft`), và khi đó không tab nào sáng.
 *
 * So khớp phải gồm CẢ `marketplaceVisible` (ADR 0048): thiếu nó thì "Đang hiển thị" và "Tất cả"
 * trông giống hệt nhau, vì cả hai cùng để `publicStatus`/`tenantStatus` ở `all`.
 */
export function activeAdminVehicleView(
  filters: Pick<AdminVehicleFilters, 'publicStatus' | 'tenantStatus' | 'marketplaceVisible'>,
): PlatformVehicleView | null {
  const current: AdminVehicleViewPatch = {
    publicStatus: filters.publicStatus ?? ALL_FILTER,
    tenantStatus: filters.tenantStatus ?? ALL_FILTER,
    marketplaceVisible: filters.marketplaceVisible ?? ALL_FILTER,
  };
  return (
    ADMIN_VEHICLE_VIEWS.find(
      (view) =>
        view.patch.publicStatus === current.publicStatus &&
        view.patch.tenantStatus === current.tenantStatus &&
        view.patch.marketplaceVisible === current.marketplaceVisible,
    )?.key ?? null
  );
}

/** Patch bộ lọc để vào một góc nhìn — khoá lạ (gõ tay) rơi về "Tất cả". */
export function adminVehicleViewPatch(key: string): AdminVehicleViewPatch {
  return (
    ADMIN_VEHICLE_VIEWS.find((view) => view.key === key)?.patch ?? ADMIN_VEHICLE_VIEWS[0]!.patch
  );
}
