import { TENANT_STATUS, VEHICLE_PUBLIC_STATUS } from '@xeprime/types';
import type { AdminVehicleFilters } from './types';

/**
 * Lối tắt hay dùng nhất của kiểm duyệt — chỉ GIÁ TRỊ, không nhãn.
 *
 * Nhãn dựng lúc chạy ở `useAdminVehicleOptions` vì nó đổi theo ngôn ngữ người xem; một hằng ở
 * module scope được tính đúng một lần cho cả tiến trình và sẽ rò ngôn ngữ giữa các request SSR.
 *
 * `visible` lọc theo **kết quả hiển thị hiệu lực** (`marketplaceVisible`), KHÔNG theo
 * `publicStatus = approved_public` như bản trước (ADR 0048). Xe đã duyệt mà chủ xe tắt công tắc,
 * hoặc thuộc gian hàng bị khoá, vẫn là `approved_public` — lọc bằng cột đó rồi gắn nhãn "Đang
 * hiển thị" là đưa cho người kiểm duyệt một danh sách có lẫn xe không ai nhìn thấy.
 *
 * `patch` phải liệt kê ĐỦ ba khoá ở mọi lối tắt (kể cả giá trị "bỏ lọc"): nó là trạng thái ĐÍCH
 * của bộ lọc, không phải một phần chỉnh sửa — thiếu một khoá thì lối tắt mới cộng dồn lên lối
 * tắt cũ và không lối nào còn khớp chính xác.
 */
export const ADMIN_VEHICLE_QUICK_FILTERS = [
  {
    key: 'visible',
    patch: { publicStatus: 'all', tenantStatus: 'all', marketplaceVisible: 'true' },
  },
  {
    key: 'platformHidden',
    patch: {
      publicStatus: VEHICLE_PUBLIC_STATUS.HIDDEN,
      tenantStatus: 'all',
      marketplaceVisible: 'all',
    },
  },
  {
    key: 'suspendedShop',
    patch: {
      publicStatus: 'all',
      tenantStatus: TENANT_STATUS.SUSPENDED,
      marketplaceVisible: 'all',
    },
  },
] as const satisfies readonly {
  key: string;
  patch: Pick<AdminVehicleFilters, 'publicStatus' | 'tenantStatus' | 'marketplaceVisible'>;
}[];

export type AdminVehicleQuickFilterKey = (typeof ADMIN_VEHICLE_QUICK_FILTERS)[number]['key'];
