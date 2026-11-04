import { describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ redirect: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: nav.redirect }));

import DebtsPage from './page';

/**
 * `/debts` từ 04/11/2026 chỉ còn chuyển tiếp sang tab Công nợ của Lịch sử giao dịch — link trong
 * thông báo, email và bookmark cũ không được chết, và không được rơi mất bộ lọc đang mang.
 */
describe('/manage/debts → /manage/receipts?view=debts', () => {
  it('chuyển tiếp và mang theo mọi tham số lọc', async () => {
    await DebtsPage({ searchParams: Promise.resolve({ q: '51A', filter: 'overdue', page: '2' }) });
    const target = String(nav.redirect.mock.calls.at(-1)?.[0]);
    expect(target.startsWith('/manage/receipts?')).toBe(true);
    const params = new URLSearchParams(target.split('?')[1]);
    expect(params.get('view')).toBe('debts');
    expect(params.get('q')).toBe('51A');
    expect(params.get('filter')).toBe('overdue');
    expect(params.get('page')).toBe('2');
  });

  it('link trần vẫn tới đúng tab', async () => {
    await DebtsPage({ searchParams: Promise.resolve({}) });
    expect(nav.redirect).toHaveBeenLastCalledWith('/manage/receipts?view=debts');
  });
});
