import { AUDIT_ACTOR_SCOPE } from '@xeprime/types';

/**
 * Nhãn VN cho các action đã biết trong `audit_logs` (nguồn: grep `audit.record` phía API).
 * Action mới chưa có nhãn → hiện raw key (fallback ở `auditActionLabel`).
 */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  'tenant.lock': 'Khoá gian hàng',
  'tenant.unlock': 'Mở khoá gian hàng',
  'tenant.submit_review': 'Gửi duyệt gian hàng',
  'approval.approve': 'Duyệt hồ sơ',
  'approval.reject': 'Từ chối hồ sơ',
  'approval.request_revision': 'Yêu cầu bổ sung hồ sơ',
  'vehicle.submit_public': 'Gửi duyệt xe công khai',
  'booking.create': 'Tạo đơn thuê',
  'booking.transition': 'Chuyển trạng thái đơn',
  'booking_request.approve': 'Duyệt yêu cầu đặt xe',
  'booking_request.reject': 'Từ chối yêu cầu đặt xe',
  'receipt.create': 'Tạo phiếu thu/chi',
  'receipt.approve': 'Duyệt phiếu',
  'receipt.cancel': 'Huỷ phiếu',
  'payment.record': 'Ghi thanh toán',
  'payment.void': 'Huỷ thanh toán',
  'contract.create': 'Tạo hợp đồng',
  'member.add': 'Thêm thành viên',
  'member.update_role': 'Đổi vai trò thành viên',
  'member.remove': 'Gỡ thành viên',
  'platform_staff.add': 'Thêm nhân sự nền tảng',
  'platform_staff.update_role': 'Đổi vai trò nhân sự',
  'platform_staff.remove': 'Gỡ nhân sự nền tảng',
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABEL[action] ?? action;
}

export const AUDIT_ACTION_OPTIONS = [
  { value: 'all', label: 'Mọi hành động' },
  ...Object.entries(AUDIT_ACTION_LABEL).map(([value, label]) => ({ value, label })),
];

export const AUDIT_SCOPE_OPTIONS = [
  { value: 'all', label: 'Tất cả' },
  { value: AUDIT_ACTOR_SCOPE.PLATFORM, label: 'Nền tảng' },
  { value: AUDIT_ACTOR_SCOPE.TENANT, label: 'Gian hàng' },
  { value: AUDIT_ACTOR_SCOPE.SYSTEM, label: 'Hệ thống' },
];

/** Nhãn VN cho loại đối tượng trong audit (nguồn: grep `targetType` phía API). */
export const AUDIT_TARGET_TYPE_LABEL: Record<string, string> = {
  tenant: 'Gian hàng',
  vehicle: 'Xe',
  booking: 'Đơn thuê',
  booking_request: 'Yêu cầu đặt xe',
  receipt: 'Phiếu thu/chi',
  payment: 'Thanh toán',
  contract: 'Hợp đồng',
  tenant_membership: 'Thành viên gian hàng',
  platform_membership: 'Nhân sự nền tảng',
};

export function auditTargetTypeLabel(targetType: string): string {
  return AUDIT_TARGET_TYPE_LABEL[targetType] ?? targetType;
}

export const AUDIT_TARGET_TYPE_OPTIONS = [
  { value: 'all', label: 'Mọi đối tượng' },
  ...Object.entries(AUDIT_TARGET_TYPE_LABEL).map(([value, label]) => ({ value, label })),
];
