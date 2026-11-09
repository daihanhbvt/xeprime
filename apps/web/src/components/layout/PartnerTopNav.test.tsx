import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NAV_BADGE, SHOP_NAV, type NavLeaf } from '@/constants/nav';
import { ROUTES } from '@/constants/routes';

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

const nav = vi.hoisted(() => ({ pathname: '/manage' }));

vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));

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
  nav.pathname = '/manage';
  badges.counts = {};
  badges.urgent = {};
});

afterEach(cleanup);

const operations = () => screen.getByRole('link', { name: /^Vận hành/ });

describe('PartnerTopNav - huy hiệu khối "Vận hành"', () => {
  it('cộng yêu cầu chờ duyệt + lượt giao/trả đến hạn, màu cam khi chưa có gì trễ', () => {
    // Mục "Đơn thuê xe" gộp mang tổng chờ duyệt (2) + giao/trả đến hạn (3) — useNavBadges cộng.
    badges.counts = { [NAV_BADGE.RENTALS_WORK]: 5 };
    render(<PartnerTopNav />);

    const item = operations();
    expect(item.getAttribute('aria-label')).toBe('Vận hành, 5 việc cần xử lý');
    const badge = item.querySelector('[class*="count"]');
    expect(badge?.textContent).toBe('5');
    expect(item.querySelector('[class*="countUrgent"]')).toBeNull();
  });

  it('một mục có việc trễ → huy hiệu khối đỏ, và "gấp" được nói thành lời', () => {
    badges.counts = { [NAV_BADGE.RENTALS_WORK]: 3 };
    badges.urgent = { [NAV_BADGE.RENTALS_WORK]: true };
    render(<PartnerTopNav />);

    const item = operations();
    expect(item.getAttribute('aria-label')).toBe('Vận hành, 3 việc cần xử lý, có việc gấp');
    expect(item.querySelector('[class*="countUrgent"]')).toBeTruthy();
  });

  it('không có việc đến hạn → không có huy hiệu, nhãn khối trơn', () => {
    render(<PartnerTopNav />);

    const item = screen.getByRole('link', { name: 'Vận hành' });
    expect(item.querySelector('[class*="count"]')).toBeNull();
  });
});

describe('PartnerTopNav — nhãn khối là liên kết, khối của trang đang mở được tô', () => {
  const active = (el: HTMLElement) => el.className.includes('itemActive');

  it('bấm "Vận hành" đi tới "Đơn thuê xe" — mục đầu tiên của khối', () => {
    render(<PartnerTopNav />);
    expect(operations().getAttribute('href')).toBe(ROUTES.MANAGE.BOOKINGS);
  });

  it('trang con của một mục trong khối → nhãn khối active, aria-current="true"', () => {
    nav.pathname = `${ROUTES.MANAGE.BOOKINGS}/01HZZZZZZZZZZZZZZZZZZZZZZZ`;
    render(<PartnerTopNav />);
    // Trang chi tiết đơn thuộc "Đơn thuê xe" — chính đích của nhãn khối.
    expect(active(operations())).toBe(true);
    expect(operations().getAttribute('aria-current')).toBe('page');
    expect(active(screen.getByRole('link', { name: 'Tổng quan' }))).toBe(false);
  });

  it('mục khác trong khối (Lịch thuê xe) → khối vẫn active, nhưng không phải "page"', () => {
    nav.pathname = ROUTES.MANAGE.CALENDAR;
    render(<PartnerTopNav />);
    expect(active(operations())).toBe(true);
    expect(operations().getAttribute('aria-current')).toBe('true');
  });

  it('ở Tổng quan → chỉ "Tổng quan" active', () => {
    render(<PartnerTopNav />);
    expect(active(screen.getByRole('link', { name: 'Tổng quan' }))).toBe(true);
    expect(active(operations())).toBe(false);
  });
});
