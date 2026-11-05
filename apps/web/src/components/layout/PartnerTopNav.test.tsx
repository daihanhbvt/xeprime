import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NAV_BADGE, SHOP_NAV, type NavLeaf } from '@/constants/nav';

import { PartnerTopNav } from './PartnerTopNav';

/**
 * Huy hiệu trên nhãn khối của menu ngang ("Vận hành") — lời nhắc duy nhất khi dropdown đóng.
 *
 * Chốt 04/11/2026: chỉ đếm việc ĐẾN HẠN (yêu cầu chờ duyệt + lượt giao/trả hôm nay hoặc quá giờ),
 * màu cam; đỏ khi BẤT KỲ mục nào có việc trễ / sắp trễ. Lọc quyền và nguồn số nằm ở
 * `useNavLeafAccess` (test riêng) — ở đây giả lập nó để soát đúng phép DỒN và màu.
 */
const badges = vi.hoisted(() => ({
  counts: {} as Record<string, number>,
  urgent: {} as Record<string, boolean>,
}));

vi.mock('next/navigation', () => ({ usePathname: () => '/manage' }));

vi.mock('./use-manage-nav-tree', () => ({ useManageNavTree: () => ({ sections: SHOP_NAV }) }));

vi.mock('./use-nav-leaf-access', () => {
  const countOf = (leaf: NavLeaf) => (leaf.badge ? (badges.counts[leaf.badge] ?? 0) : 0);
  const urgentOf = (leaf: NavLeaf) =>
    Boolean(leaf.badge && badges.urgent[leaf.badge]) && countOf(leaf) > 0;
  return {
    useNavLeafAccess: () => ({
      canSeeLeaf: () => true,
      isShown: (leaf: NavLeaf) => leaf.hidden !== true,
      badgeCountOf: countOf,
      badgeUrgentOf: urgentOf,
      badgeTotalOf: (leaves: readonly NavLeaf[]) => ({
        count: leaves.reduce((sum, leaf) => sum + countOf(leaf), 0),
        urgent: leaves.some(urgentOf),
      }),
      hrefOf: (leaf: NavLeaf) => leaf.href,
    }),
  };
});

beforeEach(() => {
  badges.counts = {};
  badges.urgent = {};
});

afterEach(cleanup);

const operations = () => screen.getByRole('button', { name: /^Vận hành/ });

describe('PartnerTopNav — huy hiệu khối "Vận hành"', () => {
  it('cộng yêu cầu chờ duyệt + lượt giao/trả đến hạn, màu cam khi chưa có gì trễ', () => {
    // Mục "Đơn thuê xe" gộp mang tổng chờ duyệt (2) + giao/trả đến hạn (3) — useNavBadges cộng.
    badges.counts = { [NAV_BADGE.RENTALS_WORK]: 5 };
    render(<PartnerTopNav />);

    const button = operations();
    expect(button.getAttribute('aria-label')).toBe('Vận hành, 5 việc cần xử lý');
    const badge = button.querySelector('[class*="count"]');
    expect(badge?.textContent).toBe('5');
    expect(button.querySelector('[class*="countUrgent"]')).toBeNull();
  });

  it('một mục có việc trễ → huy hiệu khối đỏ, và "gấp" được nói thành lời', () => {
    badges.counts = { [NAV_BADGE.RENTALS_WORK]: 3 };
    badges.urgent = { [NAV_BADGE.RENTALS_WORK]: true };
    render(<PartnerTopNav />);

    const button = operations();
    expect(button.getAttribute('aria-label')).toBe('Vận hành, 3 việc cần xử lý, có việc gấp');
    expect(button.querySelector('[class*="countUrgent"]')).toBeTruthy();
  });

  it('không có việc đến hạn → không có huy hiệu, nhãn khối trơn', () => {
    render(<PartnerTopNav />);

    const button = screen.getByRole('button', { name: 'Vận hành' });
    expect(button.querySelector('[class*="count"]')).toBeNull();
  });
});
