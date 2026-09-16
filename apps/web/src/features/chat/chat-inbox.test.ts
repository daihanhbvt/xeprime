import { describe, expect, it } from 'vitest';
import { BILLING_MODE, BILLING_PHASE, CHAT_INBOX, CHAT_SIDE, TENANT_ROLE } from '@xeprime/types';

import type { CurrentUser } from '@/hooks/use-current-user';

import { resolveChatInbox } from './chat-inbox';

/**
 * AI được hộp thư hợp nhất — và quan trọng không kém, ai KHÔNG.
 *
 * Hợp nhất không mở thêm phạm vi nào ở server (`chatInboxScope`), nhưng nó MỞ MỘT BỀ MẶT: với
 * người hôm nay không có hộp thư gian hàng nào trong giao diện, cho họ hộp thư hợp nhất là lặng
 * lẽ dựng một màn mới bằng một thay đổi điều hướng. Bộ này khoá cả hai chiều.
 */

type Tenant = NonNullable<CurrentUser['tenant']>;

function withTenant(over: Partial<Tenant> = {}): Pick<CurrentUser, 'tenant'> {
  return {
    tenant: {
      id: 'T1',
      name: 'Gara Minh',
      roleKey: TENANT_ROLE.SHOP_OWNER,
      billingMode: BILLING_MODE.COMMISSION,
      billingPhase: BILLING_PHASE.CURRENT,
      ...over,
    } as Tenant,
  };
}

describe('resolveChatInbox — ai nhận hộp thư hợp nhất', () => {
  it('chủ xe tuyến hoa hồng: hợp nhất ở bề mặt khách', () => {
    expect(resolveChatInbox(CHAT_SIDE.CUSTOMER, withTenant())).toBe(CHAT_INBOX.UNIFIED);
  });

  /*
   * Hết gói VÀ hết ân hạn ⇒ tenant về tuyến hoa hồng (ADR 0038 điều 5) và mất `/manage`. Đúng lúc
   * đó họ CẦN hộp thư hợp nhất nhất: hộp thư vận hành của họ vừa đóng cửa, và khách vẫn đang nhắn.
   */
  it('gian hàng đã hết gói lấy luôn hộp thư hợp nhất', () => {
    const lapsed = withTenant({ billingPhase: BILLING_PHASE.LAPSED });

    expect(resolveChatInbox(CHAT_SIDE.CUSTOMER, lapsed)).toBe(CHAT_INBOX.UNIFIED);
  });
});

describe('resolveChatInbox — ai KHÔNG nhận', () => {
  /*
   * Nhân viên/quản lý/người xem của một gian hàng tuyến hoa hồng hôm nay không có hộp thư gian
   * hàng nào trong giao diện. Hợp nhất cho họ sẽ là một bề mặt mới mở ra từ một thay đổi menu.
   */
  it('mọi vai KHÔNG phải chủ đều giữ hộp thư khách', () => {
    for (const roleKey of [
      TENANT_ROLE.SHOP_MANAGER,
      TENANT_ROLE.SHOP_STAFF,
      TENANT_ROLE.SHOP_VIEWER,
    ]) {
      expect(resolveChatInbox(CHAT_SIDE.CUSTOMER, withTenant({ roleKey }))).toBe(
        CHAT_INBOX.CUSTOMER,
      );
    }
  });

  /*
   * Tuyến GÓI giữ hai hộp thư: hộp thư khách và hộp thư vận hành là hai màn với hai tập thông tin
   * và hai nhịp làm việc, và họ có `/manage/chat` để đặt cái thứ hai.
   */
  it('gian hàng tuyến gói (kể cả chủ) giữ hộp thư khách ở bề mặt khách', () => {
    const packageShop = withTenant({ billingMode: BILLING_MODE.PACKAGE });

    expect(resolveChatInbox(CHAT_SIDE.CUSTOMER, packageShop)).toBe(CHAT_INBOX.CUSTOMER);
  });

  it('khách thuê thuần giữ hộp thư khách', () => {
    expect(resolveChatInbox(CHAT_SIDE.CUSTOMER, { tenant: null })).toBe(CHAT_INBOX.CUSTOMER);
    expect(resolveChatInbox(CHAT_SIDE.CUSTOMER, undefined)).toBe(CHAT_INBOX.CUSTOMER);
  });

  /*
   * Bề mặt `shop` KHÔNG BAO GIỜ hợp nhất — kể cả với chủ tuyến hoa hồng. `/manage/chat` là bàn
   * làm việc chung của cả gian hàng: trộn hội thoại riêng của người đang đăng nhập vào đó là lộ
   * việc riêng của họ cho đồng nghiệp.
   */
  it('bề mặt gian hàng không bao giờ hợp nhất', () => {
    expect(resolveChatInbox(CHAT_SIDE.SHOP, withTenant())).toBe(CHAT_INBOX.SHOP);
    expect(resolveChatInbox(CHAT_SIDE.SHOP, { tenant: null })).toBe(CHAT_INBOX.SHOP);
  });
});
