import { CHAT_INBOX, CHAT_SIDE, TENANT_ROLE } from '@xeprime/types';
import type { CurrentUser } from '@/features/auth/api';
import { resolveChatInbox } from './chat-inbox';

/**
 * Hộp thư HỢP NHẤT của chủ xe tuyến hoa hồng (ADR 0038 điều 10).
 *
 * Bộ này khoá ba ranh giới mà một thay đổi điều hướng rất dễ vượt qua mà không ai nhận ra: ai
 * được hợp nhất, ở bề mặt nào, và bề mặt nào KHÔNG BAO GIỜ hợp nhất.
 */
function user(tenant: Partial<NonNullable<CurrentUser['tenant']>> | null): CurrentUser {
  return { tenant: tenant ? (tenant as NonNullable<CurrentUser['tenant']>) : null } as CurrentUser;
}

const commissionOwner = user({ roleKey: TENANT_ROLE.SHOP_OWNER, billingMode: 'commission' });

describe('resolveChatInbox', () => {
  it('khách thuần ở bề mặt khách: hộp thư khách', () => {
    expect(resolveChatInbox(CHAT_SIDE.CUSTOMER, user(null))).toBe(CHAT_INBOX.CUSTOMER);
  });

  it('chủ xe tuyến hoa hồng ở bề mặt khách: hộp thư HỢP NHẤT', () => {
    expect(resolveChatInbox(CHAT_SIDE.CUSTOMER, commissionOwner)).toBe(CHAT_INBOX.UNIFIED);
  });

  /**
   * `unconfigured` cũng là "không dùng cổng quản lý", nên họ cũng không có hộp thư công việc
   * riêng — cùng lý do với tuyến hoa hồng.
   */
  it('chủ xe chưa xác định được tuyến cũng nhận hộp thư hợp nhất', () => {
    const owner = user({ roleKey: TENANT_ROLE.SHOP_OWNER, billingMode: null });
    expect(resolveChatInbox(CHAT_SIDE.CUSTOMER, owner)).toBe(CHAT_INBOX.UNIFIED);
  });

  /** Tuyến GÓI giữ HAI hộp thư: hai màn, hai tập thông tin, hai nhịp làm việc. */
  it('chủ gian hàng tuyến gói KHÔNG hợp nhất', () => {
    const owner = user({ roleKey: TENANT_ROLE.SHOP_OWNER, billingMode: 'package' });
    expect(resolveChatInbox(CHAT_SIDE.CUSTOMER, owner)).toBe(CHAT_INBOX.CUSTOMER);
  });

  /**
   * CHỈ chủ. Quản lý/nhân viên/người xem của một tenant hoa hồng hôm nay không có hộp thư gian
   * hàng nào trong giao diện — cho họ hộp thư hợp nhất là lặng lẽ mở một bề mặt mới bằng một thay
   * đổi điều hướng.
   */
  it('quản lý/nhân viên/người xem của tenant hoa hồng KHÔNG hợp nhất', () => {
    for (const roleKey of [
      TENANT_ROLE.SHOP_MANAGER,
      TENANT_ROLE.SHOP_STAFF,
      TENANT_ROLE.SHOP_VIEWER,
    ]) {
      expect(resolveChatInbox(CHAT_SIDE.CUSTOMER, user({ roleKey, billingMode: 'commission' }))).toBe(
        CHAT_INBOX.CUSTOMER,
      );
    }
  });

  /**
   * Bề mặt `shop` là bàn làm việc chung của cả gian hàng. Trộn hội thoại RIÊNG của người đang đăng
   * nhập vào đó là lộ việc riêng cho đồng nghiệp — nên nó không bao giờ hợp nhất, kể cả với chủ.
   */
  it('bề mặt gian hàng KHÔNG BAO GIỜ hợp nhất', () => {
    expect(resolveChatInbox(CHAT_SIDE.SHOP, commissionOwner)).toBe(CHAT_INBOX.SHOP);
    expect(resolveChatInbox(CHAT_SIDE.SHOP, user(null))).toBe(CHAT_INBOX.SHOP);
  });
});
