import viNavigation from '@xeprime/domain/messages/vi/navigation.json';
import enNavigation from '@xeprime/domain/messages/en/navigation.json';
import { PERMISSION } from '@xeprime/types';
import {
  MANAGE_NAV_BADGE,
  isManageNavBranch,
  manageMenuTabsForTrack,
  manageNavForTrack,
  matchActiveHref,
  visibleNodes,
  type ManageNavLeaf,
} from './manage-nav';
import { ROUTES } from '@/navigation/routes';
import { PARTNER_TRACK } from './partner-track';

/**
 * Cây menu khu quản lý — hai bất biến, cả hai đều đã từng gãy trên máy thật.
 *
 * `use-intl` KHÔNG có nhãn dự phòng: một `labelKey` không tồn tại thì `t()` NÉM, và vì menu
 * dựng ở thanh menu dưới đáy (`ManageTabBar`) — tổ tiên của mọi màn trong khu quản lý — cú ném đó hạ nguyên khu
 * quản lý, không riêng một dòng menu. TypeScript không đỡ được vì `ManageNavLabel` là `string`
 * (khoá ghép động không kiểu hoá được), nên chỗ chặn phải là test.
 */

const MESSAGES = { vi: viNavigation, en: enNavigation } as const;

function leavesOf(sections: ReturnType<typeof manageNavForTrack>): ManageNavLeaf[] {
  return sections.flatMap((section) =>
    section.children.flatMap((node) => (isManageNavBranch(node) ? [...node.children] : [node])),
  );
}

const SHOP = manageNavForTrack(PARTNER_TRACK.PACKAGE);
const OWNER_LITE = manageNavForTrack(PARTNER_TRACK.COMMISSION);
const ALL_LEAVES = [...leavesOf(SHOP), ...leavesOf(OWNER_LITE)];

function labelAt(messages: object, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => {
    if (node === null || typeof node !== 'object') return undefined;
    return (node as Record<string, unknown>)[part];
  }, messages);
}

describe('manage-nav - nhãn', () => {
  it.each(['vi', 'en'] as const)('mọi labelKey có bản dịch (%s)', (locale) => {
    const missing = [
      ...new Set(
        ALL_LEAVES.map((leaf) => leaf.labelKey).filter(
          (key) => typeof labelAt(MESSAGES[locale], key) !== 'string',
        ),
      ),
    ];
    expect(missing).toEqual([]);
  });

  it('nhãn của mục cha cũng phải có bản dịch', () => {
    const branchKeys = [SHOP, OWNER_LITE].flatMap((sections) =>
      sections.flatMap((section) => [
        section.labelKey,
        ...section.children.filter(isManageNavBranch).map((branch) => branch.labelKey),
      ]),
    );
    for (const locale of ['vi', 'en'] as const) {
      const missing = [
        ...new Set(branchKeys.filter((key) => typeof labelAt(MESSAGES[locale], key) !== 'string')),
      ];
      expect(missing).toEqual([]);
    }
  });
});

/**
 * Gương của `apps/web/src/constants/nav.test.ts`: hai mục này đã bị GỠ ngày 03/09/2026 (R1 —
 * "ẩn dead link và menu placeholder chưa có luồng"). App giữ lại chúng lâu hơn web, và vì chúng
 * chưa bao giờ có nhãn nên khu quản lý nổ ngay khi mở menu.
 */
describe('manage-nav - không mục nào trỏ tới chỗ chưa dựng', () => {
  it('không còn "Khu vực nhận xe" và "Thùng rác"', () => {
    const keys = ALL_LEAVES.map((leaf) => leaf.key);
    expect(keys).not.toContain('pickup-areas');
    expect(keys).not.toContain('trash');
  });
});

/**
 * Mục menu đang mở — tiền tố DÀI NHẤT thắng (web `matchSelectedKey`). Mục ẩn (route app còn giữ mà
 * web đã gộp vào màn khác) quy về mục HIỆN mà nó thuộc về (`activeAs`).
 */
describe('matchActiveHref - đúng MỘT mục sáng', () => {
  const LEAVES = leavesOf(SHOP);
  const HOME = '/manage';
  const active = (pathname: string) => matchActiveHref(pathname, LEAVES, HOME);

  it('Chi nhánh là thẻ của Thông tin cửa hàng: /manage/shop/branches sáng "Thông tin cửa hàng"', () => {
    expect(active('/manage/shop/branches')).toBe('/manage/shop');
  });

  it('/manage/shop/policies là mục riêng "Chính sách thuê"', () => {
    expect(active('/manage/shop/policies')).toBe('/manage/shop/policies');
  });

  it('chính trang cha thì cha sáng', () => {
    expect(active('/manage/shop')).toBe('/manage/shop');
  });

  it('"Đơn đã kết thúc" sáng "Đơn thuê xe"', () => {
    expect(active('/manage/bookings/ended')).toBe('/manage/bookings');
    expect(active('/manage/bookings/abc')).toBe('/manage/bookings');
  });

  it('Công nợ là tab của Lịch sử giao dịch', () => {
    expect(active('/manage/debts')).toBe('/manage/receipts');
  });

  it('trang con KHÔNG có mục menu riêng vẫn sáng mục gần nhất', () => {
    expect(active('/manage/vehicles/new')).toBe('/manage/vehicles');
  });

  it('Tổng quan chỉ khớp tuyệt đối - nếu không thì trang nào cũng làm nó sáng', () => {
    expect(active('/manage')).toBe('/manage');
    expect(active('/manage/vehicles')).not.toBe('/manage');
  });

  it('đường dẫn ngoài khu quản lý: không mục nào sáng', () => {
    expect(active('/explore')).toBeNull();
  });

  it('KHÔNG khớp theo tiền tố chuỗi cụt: /manage/shopping không phải /manage/shop', () => {
    expect(active('/manage/shopping')).toBeNull();
  });
});

/**
 * Menu theo TUYẾN (ADR 0085 điều 1) — MỘT cây `PARTNER_NAV` của web, cây từng tuyến suy ra.
 */
describe('manageNavForTrack - menu theo tuyến', () => {
  const visibleKeys = (sections: ReturnType<typeof manageNavForTrack>) =>
    sections.map((section) => ({
      section: section.key,
      items: visibleNodes(section).map((node) => node.key),
    }));

  it('gian hàng: sáu khối, đúng mục và thứ tự của web PARTNER_NAV', () => {
    expect(visibleKeys(SHOP)).toEqual([
      { section: 'overview', items: ['dashboard'] },
      { section: 'operations', items: ['bookings', 'calendar', 'customers'] },
      { section: 'fleet', items: ['vehicles', 'drivers', 'maintenance'] },
      { section: 'revenue', items: ['finance-overview', 'balance', 'receipts'] },
      { section: 'settings', items: ['shop', 'shop-policies', 'members'] },
      { section: 'support', items: ['support', 'support-cases'] },
    ]);
  });

  it('chủ xe tuyến hoa hồng: cùng cây, mục không áp dụng thì vắng', () => {
    expect(visibleKeys(OWNER_LITE)).toEqual([
      { section: 'overview', items: ['dashboard'] },
      { section: 'operations', items: ['bookings', 'calendar'] },
      { section: 'fleet', items: ['vehicles', 'drivers'] },
      { section: 'revenue', items: ['balance'] },
      { section: 'settings', items: ['shop'] },
      {
        section: 'support',
        items: ['host-guide', 'contracts-documents', 'data-protection', 'support-cases'],
      },
    ]);
  });

  it('Owner Lite không chứa trang nào của Full Manage', () => {
    const ownerLite = new Set(leavesOf(OWNER_LITE).map((leaf) => String(leaf.href)));
    for (const fullManageOnly of [
      '/manage/customers',
      '/manage/finance',
      '/manage/receipts',
      '/manage/debts',
      '/manage/maintenance',
      '/manage/members',
      '/manage/shop/policies',
      '/manage/shop/branches',
    ]) {
      expect(ownerLite.has(fullManageOnly)).toBe(false);
    }
  });

  it('"Thông tin cửa hàng" thành "Hồ sơ chủ xe" (chỉ CHỦ) ở tuyến hoa hồng - ADR 0085 điều 2', () => {
    const shop = leavesOf(OWNER_LITE).find((leaf) => leaf.key === 'shop');
    expect(shop?.labelKey).toBe('account.ownerProfile');
    expect(shop?.ownerOnly).toBe(true);
    expect(leavesOf(SHOP).find((leaf) => leaf.key === 'shop')?.ownerOnly).toBeUndefined();
  });

  it('ví chỉ dành cho CHỦ ở cả hai tuyến', () => {
    for (const tree of [SHOP, OWNER_LITE]) {
      expect(leavesOf(tree).find((leaf) => leaf.key === 'balance')?.ownerOnly).toBe(true);
    }
  });

  it('"Đơn thuê xe" gộp mang huy hiệu RENTALS_WORK, thấy được với MỘT trong hai quyền', () => {
    const bookings = leavesOf(SHOP).find((leaf) => leaf.key === 'bookings');
    expect(bookings?.href).toBe(ROUTES.manage.bookings());
    expect(bookings?.badge).toBe(MANAGE_NAV_BADGE.RENTALS_WORK);
    expect(bookings?.permission).toEqual([
      PERMISSION.BOOKING_REQUEST_VIEW,
      PERMISSION.BOOKING_VIEW,
    ]);
  });

  it('Lịch thuê xe KHÔNG mang số (trùng với Đơn - đếm đôi)', () => {
    expect(leavesOf(SHOP).find((leaf) => leaf.key === 'calendar')?.badge).toBeUndefined();
  });

  it('chưa có gian hàng / gói chưa thanh toán: không có menu, không có thanh tab', () => {
    expect(manageNavForTrack(PARTNER_TRACK.NONE)).toEqual([]);
    expect(manageNavForTrack(PARTNER_TRACK.PACKAGE_PENDING)).toEqual([]);
    expect(manageMenuTabsForTrack(PARTNER_TRACK.NONE)).toEqual([]);
  });
});

describe('thanh menu dưới đáy - Figma Menu MB', () => {
  it.each([PARTNER_TRACK.PACKAGE, PARTNER_TRACK.COMMISSION])('năm ô theo khối (%s)', (track) => {
    expect(manageMenuTabsForTrack(track).map((tab) => tab.key)).toEqual([
      'overview',
      'operations',
      'fleet',
      'revenue',
      'account',
    ]);
  });

  it('mọi khối của cây menu thuộc đúng MỘT ô - không mục nào rơi khỏi thanh', () => {
    const owned = manageMenuTabsForTrack(PARTNER_TRACK.PACKAGE).flatMap((tab) => tab.sections);
    expect([...owned].sort()).toEqual(SHOP.map((section) => section.key).sort());
    expect(new Set(owned).size).toBe(owned.length);
  });

  it.each(['vi', 'en'] as const)('nhãn ô có bản dịch (%s)', (locale) => {
    const missing = manageMenuTabsForTrack(PARTNER_TRACK.PACKAGE)
      .map((tab) => tab.labelKey)
      .filter((key) => typeof labelAt(MESSAGES[locale], key) !== 'string');
    expect(missing).toEqual([]);
  });
});
