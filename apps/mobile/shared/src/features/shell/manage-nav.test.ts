import viNavigation from '@xeprime/domain/messages/vi/navigation.json';
import enNavigation from '@xeprime/domain/messages/en/navigation.json';
import {
  MANAGE_NAV_BADGE,
  isManageNavBranch,
  manageNavForTrack,
  matchActiveHref,
  type ManageNavLeaf,
} from './manage-nav';
import { ROUTES } from '@/navigation/routes';
import { PARTNER_TRACK } from './partner-track';

/**
 * Cây menu khu quản lý — hai bất biến, cả hai đều đã từng gãy trên máy thật.
 *
 * `use-intl` KHÔNG có nhãn dự phòng: một `labelKey` không tồn tại thì `t()` NÉM, và vì menu
 * dựng ở `ManageDrawerHost` — tổ tiên của mọi màn trong khu quản lý — cú ném đó hạ nguyên khu
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

describe('manage-nav — nhãn', () => {
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
describe('manage-nav — không mục nào trỏ tới chỗ chưa dựng', () => {
  it('không còn "Khu vực nhận xe" và "Thùng rác"', () => {
    const keys = ALL_LEAVES.map((leaf) => leaf.key);
    expect(keys).not.toContain('pickup-areas');
    expect(keys).not.toContain('trash');
  });
});

/**
 * Mục menu đang mở — bug thật ngày 09/09/2026: vào Chi nhánh thì "Cửa hàng" cũng sáng.
 *
 * Nguyên nhân là so từng mục bằng `startsWith`, mà `/manage/shop/branches` bắt đầu bằng cả
 * `/manage/shop`. Web không dính vì `matchSelectedKey` chọn tiền tố DÀI NHẤT; app nay dùng đúng
 * luật đó.
 */
describe('matchActiveHref — đúng MỘT mục sáng', () => {
  const LEAVES = leavesOf(SHOP);
  const HOME = '/manage';
  const active = (pathname: string) => matchActiveHref(pathname, LEAVES, HOME);

  it('trang con thắng trang cha: /manage/shop/branches KHÔNG làm Cửa hàng sáng', () => {
    expect(active('/manage/shop/branches')).toBe('/manage/shop/branches');
  });

  it('/manage/shop/policies cũng vậy', () => {
    expect(active('/manage/shop/policies')).toBe('/manage/shop/policies');
  });

  it('chính trang cha thì cha sáng', () => {
    expect(active('/manage/shop')).toBe('/manage/shop');
  });

  it('trang con KHÔNG có mục menu riêng vẫn sáng mục gần nhất', () => {
    expect(active('/manage/vehicles/new')).toBe('/manage/vehicles');
  });

  it('Tổng quan chỉ khớp tuyệt đối — nếu không thì trang nào cũng làm nó sáng', () => {
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
 * Menu theo TUYẾN (ADR 0053) — gương của `commission-track-continuity.test.ts` bên web: tuyến hoa
 * hồng có menu Owner Lite riêng, KHÔNG chứa trang nào của Full Manage; hai tuyến chưa vào được khu
 * quản lý không có menu.
 */
describe('manageNavForTrack — menu theo tuyến', () => {
  const hrefs = (sections: ReturnType<typeof manageNavForTrack>) =>
    leavesOf(sections).map((leaf) => String(leaf.href));

  it('Owner Lite không chứa trang nào của Full Manage', () => {
    const ownerLite = new Set(hrefs(OWNER_LITE));
    for (const fullManageOnly of [
      '/manage/customers',
      '/manage/finance',
      '/manage/receipts',
      '/manage/maintenance',
      '/manage/members',
      '/manage/shop',
    ]) {
      expect(ownerLite.has(fullManageOnly)).toBe(false);
    }
  });

  it('Owner Lite giữ đúng các mục của web OWNER_LITE_NAV, đúng thứ tự', () => {
    expect(leavesOf(OWNER_LITE).map((leaf) => leaf.key)).toEqual([
      'home',
      'vehicles',
      'calendar',
      'trips',
      'booking-requests',
      'bookings',
      'chat',
      'balance',
      'owner-profile',
      'host-guide',
      'contracts-documents',
      'data-protection',
      'support-cases',
    ]);
  });

  it('chuyến, số dư và hồ sơ chủ xe (gồm thuế + gói, PR #159) chỉ dành cho CHỦ', () => {
    const ownerOnly = leavesOf(OWNER_LITE)
      .filter((leaf) => leaf.ownerOnly)
      .map((leaf) => leaf.key);
    expect(ownerOnly).toEqual(['trips', 'balance', 'owner-profile']);
  });

  it('PR #158: chủ đọc "Chuyến cho thuê"; hộp thư + bảng đơn chỉ còn cho THÀNH VIÊN', () => {
    const memberOnly = leavesOf(OWNER_LITE)
      .filter((leaf) => leaf.memberOnly)
      .map((leaf) => leaf.key);
    expect(memberOnly).toEqual(['booking-requests', 'bookings']);
    const trips = leavesOf(OWNER_LITE).find((leaf) => leaf.key === 'trips');
    expect(trips?.badge).toBe(MANAGE_NAV_BADGE.BOOKING_REQUESTS_PENDING);
    expect(trips?.href).toBe(ROUTES.manage.trips());
  });

  it('chưa có gian hàng / gói chưa thanh toán: không có menu', () => {
    expect(manageNavForTrack(PARTNER_TRACK.NONE)).toEqual([]);
    expect(manageNavForTrack(PARTNER_TRACK.PACKAGE_PENDING)).toEqual([]);
  });
});
