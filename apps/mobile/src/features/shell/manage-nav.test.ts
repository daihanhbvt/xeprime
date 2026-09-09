import viNavigation from '@xeprime/domain/messages/vi/navigation.json';
import enNavigation from '@xeprime/domain/messages/en/navigation.json';
import {
  isManageNavBranch,
  manageNavForScope,
  matchActiveHref,
  type ManageNavLeaf,
} from './manage-nav';

/**
 * Cây menu khu quản lý — hai bất biến, cả hai đều đã từng gãy trên máy thật.
 *
 * `use-intl` KHÔNG có nhãn dự phòng: một `labelKey` không tồn tại thì `t()` NÉM, và vì menu
 * dựng ở `ManageDrawerHost` — tổ tiên của mọi màn trong khu quản lý — cú ném đó hạ nguyên khu
 * quản lý, không riêng một dòng menu. TypeScript không đỡ được vì `ManageNavLabel` là `string`
 * (khoá ghép động không kiểu hoá được), nên chỗ chặn phải là test.
 */

const MESSAGES = { vi: viNavigation, en: enNavigation } as const;

function leavesOf(sections: ReturnType<typeof manageNavForScope>): ManageNavLeaf[] {
  return sections.flatMap((section) =>
    section.children.flatMap((node) => (isManageNavBranch(node) ? [...node.children] : [node])),
  );
}

const ALL_LEAVES = [...leavesOf(manageNavForScope(false)), ...leavesOf(manageNavForScope(true))];

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
    const branchKeys = [manageNavForScope(false), manageNavForScope(true)].flatMap((sections) =>
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
  const LEAVES = leavesOf(manageNavForScope(false));
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
