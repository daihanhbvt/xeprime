import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_REALM,
  BILLING_MODE,
  BILLING_PHASE,
  CHAT_INBOX,
  CHAT_SIDE,
  TENANT_ROLE,
  type BillingPhase,
} from '@xeprime/types';

import { OWNER_LITE_NAV, SHOP_NAV, flattenLeaves, navForZone } from '@/constants/nav';
import { ROUTES } from '@/constants/routes';
import {
  PARTNER_TRACK,
  partnerPageRedirect,
  resolvePartnerTrack,
} from '@/features/auth/post-auth-destination';
import { resolveChatInbox } from '@/features/chat/chat-inbox';
import { walletScopeFor } from '@/features/wallet/wallet-scope';
import type { CurrentUser } from '@/hooks/use-current-user';
import { ZONE } from '@/zones';

/**
 * TUYẾN HOA HỒNG KHÔNG CÓ MỐC HẾT HẠN — nhìn từ phía giao diện của site partner.
 *
 * ## Vì sao bộ test này tồn tại
 *
 * Về sản phẩm, tuyến hoa hồng là quyền sử dụng không hết hạn. Về dữ liệu thì không hẳn: mỗi
 * tenant mang một dòng thuê bao KỸ THUẬT 0đ kỳ `COMMISSION_TRACK_TERM_MONTHS` (12 tháng), và
 * migration backfill gán chúng trong cùng một ngày — nên mười hai tháng sau, tất cả cùng đi qua
 * ranh giới đó trong một ngày.
 *
 * `resolveEffectiveBilling` đã khoá phần TIỀN: `billingMode` giữ `commission` ở cả ba pha
 * (`effective-billing.test.ts`). Bộ này khoá phần còn lại — thứ người dùng THẤY ở site partner:
 *
 *   · menu Owner Lite        không được đổi hình
 *   · ví                     không được đổi sổ
 *   · hộp thư                không được đổi
 *   · trang của tuyến        không được đóng lại
 *
 * Đo ở cả ba pha — kể cả `lapsed`, tức là khi job vòng đời CHƯA kịp nối dòng mới.
 */

type Tenant = NonNullable<CurrentUser['tenant']>;

/** Chủ xe tuyến hoa hồng (tài khoản partner) ở một pha của dòng thuê bao kỹ thuật. */
function ownerAt(phase: BillingPhase, billingMode: string = BILLING_MODE.COMMISSION): CurrentUser {
  return {
    id: 'U1',
    realm: ACCOUNT_REALM.PARTNER,
    displayName: 'Chủ xe Minh',
    tenant: {
      id: 'T1',
      name: 'Gara Minh',
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: 'active',
      publicVehicleCount: 3,
      billingMode,
      billingPhase: phase,
    } as Tenant,
  } as CurrentUser;
}

const PHASES: BillingPhase[] = [BILLING_PHASE.CURRENT, BILLING_PHASE.GRACE, BILLING_PHASE.LAPSED];

/** Trang của tuyến hoa hồng mà một chủ xe mở hằng ngày. */
const DAILY_PAGES = [
  ROUTES.MANAGE.ROOT,
  ROUTES.MANAGE.VEHICLES,
  ROUTES.MANAGE.CALENDAR,
  // Yêu cầu + đơn gộp ở "Chuyến cho thuê" (07/10/2026); hộp thư + bảng đơn chuyển về đây.
  ROUTES.MANAGE.TRIPS,
  ROUTES.MANAGE.CHAT,
  ROUTES.MANAGE.BALANCE,
];

describe('Tuyến hoa hồng — đi qua mốc hết kỳ không đổi gì', () => {
  it('menu Owner Lite giữ nguyên ở cả ba pha', () => {
    for (const phase of PHASES) {
      const track = resolvePartnerTrack(ownerAt(phase));
      expect(track, phase).toBe(PARTNER_TRACK.COMMISSION);
      expect(navForZone(ZONE.PARTNER, track)).toBe(OWNER_LITE_NAV);
    }
  });

  it('ví vẫn là ví TENANT ở cả ba pha', () => {
    for (const phase of PHASES) {
      expect(walletScopeFor(ownerAt(phase))).toBe('shop');
    }
  });

  it('hộp thư ở site partner vẫn là hộp thư gian hàng', () => {
    expect(resolveChatInbox(CHAT_SIDE.SHOP)).toBe(CHAT_INBOX.SHOP);
  });

  /*
   * Cổng trang của site partner hỏi TUYẾN, không hỏi pha. Nếu nó lỡ đọc pha, thì đúng vào ngày kỳ
   * kỹ thuật hết hạn, mọi chủ xe hoa hồng bị đá khỏi chính trang làm việc của họ.
   */
  it('trang làm việc hằng ngày vẫn mở ở cả ba pha', () => {
    for (const phase of PHASES) {
      for (const page of DAILY_PAGES) {
        expect(partnerPageRedirect(ownerAt(phase), page), `${phase} ${page}`).toBeNull();
      }
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
  it('current/grace dùng menu Full Manage; lapsed rơi về Owner Lite', () => {
    // `resolveEffectiveBilling` đã đổi `billingMode` sang `commission` TRƯỚC khi giá trị lên dây
    // ở pha `lapsed` — nên web chỉ cần đọc `billingMode`, không phải tự suy từ pha.
    for (const phase of [BILLING_PHASE.CURRENT, BILLING_PHASE.GRACE]) {
      const shop = ownerAt(phase, BILLING_MODE.PACKAGE);
      expect(navForZone(ZONE.PARTNER, resolvePartnerTrack(shop))).toBe(SHOP_NAV);
      expect(partnerPageRedirect(shop, ROUTES.MANAGE.CUSTOMERS)).toBeNull();
    }

    const lapsed = ownerAt(BILLING_PHASE.LAPSED, BILLING_MODE.COMMISSION);
    expect(navForZone(ZONE.PARTNER, resolvePartnerTrack(lapsed))).toBe(OWNER_LITE_NAV);
    expect(partnerPageRedirect(lapsed, ROUTES.MANAGE.CUSTOMERS)).toBe(ROUTES.MANAGE.ROOT);
    expect(walletScopeFor(lapsed)).toBe('shop');
  });

  it('menu Owner Lite không chứa trang nào của Full Manage', () => {
    const ownerLite = new Set(flattenLeaves(OWNER_LITE_NAV).map((leaf) => leaf.href));
    expect(ownerLite.has(ROUTES.MANAGE.CUSTOMERS)).toBe(false);
    expect(ownerLite.has(ROUTES.MANAGE.FINANCE)).toBe(false);
  });
});
