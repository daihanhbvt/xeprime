import { describe, expect, it } from 'vitest';

import {
  BOOKING_BLOCK_REASON,
  resolveBookingBlock,
  type BookingMembership,
} from './booking-eligibility';
import { BILLING_MODE } from './status/billing';

const VEHICLE_TENANT = 'T-VEHICLE';

const shopMember = (tenantId: string): BookingMembership => ({
  tenantId,
  tenantName: 'Gian hàng A',
  billingMode: BILLING_MODE.PACKAGE,
});
const liteMember = (tenantId: string): BookingMembership => ({
  tenantId,
  tenantName: 'Chủ xe B',
  billingMode: BILLING_MODE.COMMISSION,
});

describe('resolveBookingBlock', () => {
  it('không membership nào ⇒ đặt được (khách thuê thuần)', () => {
    expect(resolveBookingBlock({ memberships: [], vehicleTenantId: VEHICLE_TENANT })).toBeNull();
  });

  it('chủ xe TUYẾN HOA HỒNG đặt xe của người khác ⇒ được (ADR 0032 điều 1)', () => {
    expect(
      resolveBookingBlock({
        memberships: [liteMember('T-LITE')],
        vehicleTenantId: VEHICLE_TENANT,
      }),
    ).toBeNull();
  });

  it('thành viên gian hàng TUYẾN GÓI ⇒ chặn, bất kể vai', () => {
    const block = resolveBookingBlock({
      memberships: [shopMember('T-SHOP')],
      vehicleTenantId: VEHICLE_TENANT,
    });
    expect(block?.reason).toBe(BOOKING_BLOCK_REASON.SUBSCRIPTION_SHOP_ACCOUNT);
    expect(block?.tenantName).toBe('Gian hàng A');
  });

  it('xe của CHÍNH tenant mình ⇒ chặn, kể cả tuyến hoa hồng', () => {
    const block = resolveBookingBlock({
      memberships: [liteMember(VEHICLE_TENANT)],
      vehicleTenantId: VEHICLE_TENANT,
    });
    expect(block?.reason).toBe(BOOKING_BLOCK_REASON.OWN_TENANT_VEHICLE);
  });

  /*
   * Thứ tự quan trọng: nói "hãy đăng nhập tài khoản khách thuê khác" với người đang đặt CHÍNH xe
   * của mình là đẩy họ vào ngõ cụt — đổi tài khoản xong vẫn không phải điều họ muốn làm.
   */
  it('vừa là gian hàng gói vừa là xe của mình ⇒ báo mã CỤ THỂ hơn', () => {
    const block = resolveBookingBlock({
      memberships: [shopMember(VEHICLE_TENANT)],
      vehicleTenantId: VEHICLE_TENANT,
    });
    expect(block?.reason).toBe(BOOKING_BLOCK_REASON.OWN_TENANT_VEHICLE);
  });

  it('nhiều membership: chỉ cần MỘT tuyến gói là chặn', () => {
    const block = resolveBookingBlock({
      memberships: [liteMember('T-LITE'), shopMember('T-SHOP')],
      vehicleTenantId: VEHICLE_TENANT,
    });
    expect(block?.reason).toBe(BOOKING_BLOCK_REASON.SUBSCRIPTION_SHOP_ACCOUNT);
  });

  /*
   * Lỗi cấu hình gói của một gian hàng KHÔNG được biến thành việc người của họ mất quyền đi thuê
   * xe ở chỗ khác. Cổng tiền đã chặn đúng chỗ của nó (`TENANT_BILLING_NOT_CONFIGURED`).
   */
  it('billingMode null (chưa xác định tuyến) ⇒ KHÔNG chặn', () => {
    expect(
      resolveBookingBlock({
        memberships: [{ tenantId: 'T-BROKEN', billingMode: null }],
        vehicleTenantId: VEHICLE_TENANT,
      }),
    ).toBeNull();
  });
});
