import { TENANT_STATUS } from '@xeprime/types';

/** Lựa chọn lọc trạng thái gian hàng (đưa các trạng thái hay dùng lên trước). */
export const ADMIN_TENANT_STATUS_OPTIONS = [
  { value: 'all', label: 'Tất cả' },
  { value: TENANT_STATUS.ACTIVE, label: 'Đang hoạt động' },
  { value: TENANT_STATUS.SUSPENDED, label: 'Bị khóa' },
  { value: TENANT_STATUS.PENDING_REVIEW, label: 'Chờ duyệt' },
  { value: TENANT_STATUS.NEEDS_REVISION, label: 'Cần bổ sung' },
  { value: TENANT_STATUS.DRAFT, label: 'Nháp' },
  { value: TENANT_STATUS.REJECTED, label: 'Bị từ chối' },
];
