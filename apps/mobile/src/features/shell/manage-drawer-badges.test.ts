import { PERMISSION } from '@xeprime/types';
import { resolveSections } from './ManageDrawer';
import { MANAGE_NAV_BADGE } from './manage-nav';
import type { ManageNavBadgeCounts } from './use-manage-nav-badges';

/**
 * Huy hiệu DỒN lên mục cha khi nhánh gập lại.
 *
 * Không có nó thì gập "Đơn thuê" là mất luôn dấu hiệu có yêu cầu đang chờ — trong khi hạn phản
 * hồi 60 phút vẫn đang chạy. Đây là lỗi im lặng: menu trông bình thường, chỉ là thiếu một con số.
 */
const ALL_BADGES: ManageNavBadgeCounts = {
  [MANAGE_NAV_BADGE.BOOKING_REQUESTS_PENDING]: 3,
  [MANAGE_NAV_BADGE.CHAT_UNREAD]: 0,
};

function branches(badges: ManageNavBadgeCounts) {
  return resolveSections(false, () => true, {}, badges)
    .flatMap((section) => section.nodes)
    .filter((node) => node.kind === 'branch');
}

describe('dồn huy hiệu lên mục cha', () => {
  it('mục cha mang TỔNG số của các mục con', () => {
    const orders = branches(ALL_BADGES).find((node) => node.branch.key === 'orders');

    expect(orders).toBeDefined();
    expect(orders?.badge).toBe(3);
  });

  /** Tổng phải bằng đúng tổng các con — lệch nghĩa là đếm hai lần hoặc bỏ sót một mục. */
  it('tổng bằng đúng tổng các mục con, không hơn không kém', () => {
    for (const node of branches(ALL_BADGES)) {
      const sum = node.children.reduce((total, child) => total + child.badge, 0);
      expect(node.badge).toBe(sum);
    }
  });

  it('không có gì chờ thì mục cha KHÔNG mang số', () => {
    const quiet: ManageNavBadgeCounts = {
      [MANAGE_NAV_BADGE.BOOKING_REQUESTS_PENDING]: 0,
      [MANAGE_NAV_BADGE.CHAT_UNREAD]: 0,
    };

    for (const node of branches(quiet)) {
      expect(node.badge).toBe(0);
    }
  });

  /** Mục con bị quyền chặn thì số của nó cũng không được tính lên cha. */
  it('mục con KHÔNG có quyền xem thì số của nó không dồn lên', () => {
    const sections = resolveSections(
      false,
      (permission) => permission !== PERMISSION.BOOKING_REQUEST_VIEW,
      {},
      ALL_BADGES,
    );
    const orders = sections
      .flatMap((section) => section.nodes)
      .filter((node) => node.kind === 'branch')
      .find((node) => node.branch.key === 'orders');

    expect(orders?.badge ?? 0).toBe(0);
  });
});
