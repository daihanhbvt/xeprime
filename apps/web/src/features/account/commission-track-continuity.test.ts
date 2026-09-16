import { describe, expect, it } from 'vitest';
import {
  BILLING_MODE,
  BILLING_PHASE,
  CHAT_INBOX,
  CHAT_SIDE,
  TENANT_ROLE,
  type BillingPhase,
} from '@xeprime/types';

import { flattenAccountNav, resolveAccountNav } from '@/constants/account-nav';
import { resolveChatInbox } from '@/features/chat/chat-inbox';
import { walletScopeFor } from '@/features/wallet/wallet-scope';
import type { CurrentUser } from '@/hooks/use-current-user';

import { shopAccountRedirect } from './shop-account-gate';

/**
 * TUYẾN HOA HỒNG KHÔNG CÓ MỐC HẾT HẠN — nhìn từ phía giao diện.
 *
 * ## Vì sao bộ test này tồn tại
 *
 * Về sản phẩm, tuyến hoa hồng là quyền sử dụng không hết hạn. Về dữ liệu thì không hẳn: mỗi
 * tenant mang một dòng thuê bao KỸ THUẬT 0đ kỳ `COMMISSION_TRACK_TERM_MONTHS` (12 tháng), và
 * migration backfill gán chúng trong cùng một ngày — nên mười hai tháng sau, tất cả cùng đi qua
 * ranh giới đó trong một ngày.
 *
 * `resolveEffectiveBilling` đã khoá phần TIỀN: `billingMode` giữ `commission` ở cả ba pha
 * (`effective-billing.test.ts`). Bộ này khoá phần còn lại — thứ người dùng THẤY:
 *
 *   · menu Owner Lite       không được đổi hình
 *   · ví                    không được đổi sổ
 *   · hộp thư               không được tách đôi trở lại
 *   · khu `/account`        không được đóng lại
 *
 * Kỳ kỹ thuật được phép tồn tại đúng khi nào? Khi đi qua nó KHÔNG đổi gì trong bốn dòng trên.
 * Đó là điều test này đo, và nó đo ở cả ba pha — kể cả `lapsed`, tức là khi job vòng đời CHƯA
 * kịp nối dòng mới (job chạy mỗi giờ; ở pha đó giao diện vẫn phải chạy đúng).
 */

type Tenant = NonNullable<CurrentUser['tenant']>;

/** Chủ xe tuyến hoa hồng ở một pha cụ thể của dòng thuê bao kỹ thuật. */
function ownerAt(phase: BillingPhase): CurrentUser {
  return {
    id: 'U1',
    displayName: 'Chủ xe Minh',
    tenant: {
      id: 'T1',
      name: 'Gara Minh',
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: 'active',
      publicVehicleCount: 3,
      billingMode: BILLING_MODE.COMMISSION,
      billingPhase: phase,
    } as Tenant,
  } as CurrentUser;
}

/**
 * Ba pha mà một dòng hoa hồng đi qua.
 *
 *   `current` — trước mốc hết kỳ
 *   `grace`   — ngay sau mốc, worker chưa chạy
 *   `lapsed`  — hết cả ân hạn mà worker VẪN chưa nối dòng mới (worker chạy chậm)
 */
const PHASES: BillingPhase[] = [BILLING_PHASE.CURRENT, BILLING_PHASE.GRACE, BILLING_PHASE.LAPSED];

describe('Tuyến hoa hồng — đi qua mốc hết kỳ không đổi gì', () => {
  it('menu Owner Lite giữ nguyên chín mục ở cả ba pha', () => {
    const shape = PHASES.map((phase) =>
      flattenAccountNav(resolveAccountNav(ownerAt(phase))).map((i) => i.key),
    );

    expect(shape[0]).toHaveLength(9);
    // So từng pha với pha đầu: bất kỳ khác biệt nào cũng là một mục xuất hiện/biến mất theo NGÀY.
    for (const keys of shape) expect(keys).toEqual(shape[0]);
  });

  it('ví vẫn là ví TENANT ở cả ba pha', () => {
    for (const phase of PHASES) {
      expect(walletScopeFor(ownerAt(phase))).toBe('shop');
    }
  });

  it('hộp thư vẫn HỢP NHẤT ở cả ba pha', () => {
    for (const phase of PHASES) {
      expect(resolveChatInbox(CHAT_SIDE.CUSTOMER, ownerAt(phase))).toBe(CHAT_INBOX.UNIFIED);
    }
  });

  /*
   * Cổng URL của khu khách hỏi TUYẾN (`tenantUsesManagePortal`), không hỏi pha. Nếu nó lỡ đọc
   * pha, thì đúng vào ngày kỳ kỹ thuật hết hạn, mọi chủ xe hoa hồng bị đá ra khỏi `/account` —
   * và đích của cú đá đó là `/manage`, nơi họ không vào được.
   */
  it('khu /account vẫn mở ở cả ba pha', () => {
    for (const phase of PHASES) {
      expect(shopAccountRedirect(ownerAt(phase), '/account')).toBeNull();
      expect(shopAccountRedirect(ownerAt(phase), '/account/vehicles')).toBeNull();
      expect(shopAccountRedirect(ownerAt(phase), '/trips')).toBeNull();
    }
  });
});

/**
 * ĐỐI CHỨNG — gian hàng tuyến gói thì mốc hết hạn CÓ nghĩa, và phải có.
 *
 * Nếu không có nửa này, một bản sửa "cho chắc" trong tương lai có thể làm mọi pha đều vô hại và
 * xoá luôn ranh giới hạ cấp của tuyến gói (ADR 0038 điều 5).
 */
describe('Đối chứng — tuyến gói VẪN đổi khi hết ân hạn', () => {
  function packageAt(phase: BillingPhase, billingMode: string): CurrentUser {
    const user = ownerAt(phase);
    return {
      ...user,
      tenant: { ...(user.tenant as Tenant), billingMode } as Tenant,
    } as CurrentUser;
  }

  it('current/grace ở trong Manage; lapsed rơi về Owner Lite', () => {
    // `resolveEffectiveBilling` đã đổi `billingMode` sang `commission` TRƯỚC khi giá trị lên dây
    // ở pha `lapsed` — nên web chỉ cần đọc `billingMode`, không phải tự suy từ pha.
    for (const phase of [BILLING_PHASE.CURRENT, BILLING_PHASE.GRACE]) {
      const inManage = packageAt(phase, BILLING_MODE.PACKAGE);
      expect(shopAccountRedirect(inManage, '/account')).toBe('/manage/security');
    }

    const lapsed = packageAt(BILLING_PHASE.LAPSED, BILLING_MODE.COMMISSION);
    expect(shopAccountRedirect(lapsed, '/account')).toBeNull();
    expect(walletScopeFor(lapsed)).toBe('shop');
  });
});
