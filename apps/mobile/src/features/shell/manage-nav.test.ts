import viNavigation from '@xeprime/domain/messages/vi/navigation.json';
import enNavigation from '@xeprime/domain/messages/en/navigation.json';
import { isManageNavBranch, manageNavForScope, type ManageNavLeaf } from './manage-nav';

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
