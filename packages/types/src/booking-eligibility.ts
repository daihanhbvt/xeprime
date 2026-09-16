/**
 * "Tài khoản này gửi được yêu cầu thuê không" — luật thuần, dùng chung backend/web/app.
 *
 * Hai điều bị chặn, và chúng KHÁC NHAU về lý do:
 *
 *  1. **Tài khoản của gian hàng TUYẾN GÓI không đặt xe.** Họ là bên bán trên chợ này; một tài
 *     khoản vừa bán vừa mua làm hỏng sổ khách, thống kê chuyến và cả trải nghiệm hộp thư (hộp
 *     thư yêu cầu của gian hàng lẫn với chuyến đi thuê của chính người trực). Áp cho MỌI thành
 *     viên hoạt động — chủ, quản lý, nhân viên, người xem — vì cổng phải kiểm được bằng một câu
 *     truy vấn, và một ngoại lệ theo vai là một đường vòng.
 *
 *     Chủ xe TUYẾN HOA HỒNG thì **được** đặt xe: họ là cá nhân dùng Owner Lite trong khu user,
 *     và ADR 0032 điều 1 nói rõ họ vẫn thuê xe như người dùng thường.
 *
 *  2. **Không ai đặt xe của chính gian hàng mình.** Đây không phải quy tắc đạo đức mà là kế
 *     toán: hai vai trên cùng một booking khiến phí dịch vụ `S` thu từ chính người nhận `D − T`,
 *     và người duyệt yêu cầu là người gửi yêu cầu. Giao dịch đó đi qua toàn bộ sổ — doanh thu
 *     XePrime, `tax_withholdings`, đối chiếu quỹ hằng ngày — mà không có đối ứng thật.
 *
 * Luật này KHÔNG hỏi `tenants.tenant_type` (ADR 0014 điều 2) và không hỏi vai: nó hỏi TUYẾN của
 * gói hiệu lực, giải bằng `resolveEffectiveBilling`.
 */

import { BILLING_MODE, type BillingMode } from './status/billing';

export const BOOKING_BLOCK_REASON = {
  /** Thành viên hoạt động của một gian hàng tuyến gói. */
  SUBSCRIPTION_SHOP_ACCOUNT: 'subscription_shop_account',
  /** Xe thuộc chính gian hàng mà người đặt là thành viên. */
  OWN_TENANT_VEHICLE: 'own_tenant_vehicle',
} as const;

export type BookingBlockReason =
  (typeof BOOKING_BLOCK_REASON)[keyof typeof BOOKING_BLOCK_REASON];

/** Một membership hoạt động, kèm TUYẾN của tenant đó tại thời điểm hỏi. */
export interface BookingMembership {
  tenantId: string;
  tenantName?: string | null;
  /** `null` = chưa xác định được tuyến (`BILLING_PHASE.UNCONFIGURED`). */
  billingMode: BillingMode | null;
}

export interface BookingBlock {
  reason: BookingBlockReason;
  tenantId: string;
  tenantName: string | null;
}

/**
 * `null` = được phép đặt.
 *
 * Thứ tự kiểm là CÓ Ý: "xe của chính bạn" trước, vì nó cụ thể hơn và dẫn tới một lối đi tiếp
 * khác hẳn. Nói với một chủ gian hàng "hãy đăng nhập bằng tài khoản khách thuê khác" trong khi
 * vấn đề thật là họ đang đặt chính chiếc xe của mình sẽ đẩy họ vào một ngõ cụt: đổi tài khoản
 * xong vẫn không phải điều họ muốn làm.
 *
 * ⚠️ `billingMode = null` (chưa xác định được tuyến) KHÔNG chặn. Lỗi cấu hình gói của một gian
 * hàng không được biến thành việc người của họ mất quyền đi thuê xe ở chỗ khác — cổng tiền đã
 * chặn đúng chỗ của nó rồi (`TENANT_BILLING_NOT_CONFIGURED` ở đường duyệt).
 */
export function resolveBookingBlock(input: {
  memberships: readonly BookingMembership[];
  vehicleTenantId: string;
}): BookingBlock | null {
  const own = input.memberships.find((m) => m.tenantId === input.vehicleTenantId);
  if (own) {
    return {
      reason: BOOKING_BLOCK_REASON.OWN_TENANT_VEHICLE,
      tenantId: own.tenantId,
      tenantName: own.tenantName ?? null,
    };
  }

  const shop = input.memberships.find((m) => m.billingMode === BILLING_MODE.PACKAGE);
  if (shop) {
    return {
      reason: BOOKING_BLOCK_REASON.SUBSCRIPTION_SHOP_ACCOUNT,
      tenantId: shop.tenantId,
      tenantName: shop.tenantName ?? null,
    };
  }

  return null;
}
