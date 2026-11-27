import { App } from 'antd';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/i18n/test-utils';
import type { ScheduledCredit } from '../types';
import { ScheduledCreditsSection } from './ScheduledCreditsSection';

/**
 * Khoản chờ cộng ví (biên bản họp 19/11/2026): khách huỷ / không đến ⇒ tiền hoàn của khách và phần
 * chủ xe chờ vài giờ. Người trực thấy ai nhận, bao nhiêu, lúc nào vào ví; tạm giữ khoản đang chờ,
 * bỏ tạm giữ khoản đang giữ. Không có khoản nào ⇒ không chiếm chỗ trên tab Hoàn tiền.
 */
const state = vi.hoisted(() => ({ items: [] as unknown[] }));
const mutate = vi.hoisted(() => vi.fn());

vi.mock('../hooks/use-platform-money', () => ({
  useScheduledCredits: () => ({ data: state.items, isFetching: false }),
  useScheduledCreditAction: () => ({ mutate, isPending: false }),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useMediaQuery: () => false,
}));

function credit(over: Partial<ScheduledCredit>): ScheduledCredit {
  return {
    id: 'C1',
    ownerType: 'user',
    ownerId: 'U1',
    ownerName: 'Lê Minh Cường',
    kind: 'hold_refund',
    amount: '350000.00',
    holdId: 'H1',
    bookingId: 'B1',
    holdRefundId: 'R1',
    status: 'scheduled',
    releaseAt: '2026-11-20T08:00:00.000Z',
    frozenAt: null,
    freezeNote: null,
    note: null,
    createdAt: '2026-11-20T04:00:00.000Z',
    ...over,
  } as ScheduledCredit;
}

const renderSection = () =>
  renderWithIntl(
    <App>
      <ScheduledCreditsSection />
    </App>,
  );

afterEach(cleanup);

describe('ScheduledCreditsSection', () => {
  it('không có khoản nào ⇒ không vẽ gì', () => {
    state.items = [];
    const { container } = renderSection();
    expect(container.textContent).toBe('');
  });

  it('khoản đang chờ: người nhận, số tiền, nút Tạm giữ + Cộng ngay', () => {
    state.items = [credit({})];
    renderSection();
    expect(screen.getByText('Khoản chờ cộng ví (1)')).toBeTruthy();
    expect(screen.getByText('Lê Minh Cường')).toBeTruthy();
    expect(screen.getByText('Khách - hoàn tiền')).toBeTruthy();
    expect(screen.getByText('350.000 ₫')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tạm giữ' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cộng ngay' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Bỏ tạm giữ' })).toBeNull();
  });

  it('khoản đang tạm giữ: hiện lý do, có Bỏ tạm giữ, không còn Tạm giữ', () => {
    state.items = [
      credit({
        status: 'frozen',
        ownerType: 'tenant',
        ownerName: 'Hạnh Huế',
        frozenAt: '2026-11-20T05:00:00.000Z',
        freezeNote: 'Chủ xe báo khách thuê lại trực tiếp',
      }),
    ];
    renderSection();
    expect(screen.getByText('Chủ xe - tiền đền')).toBeTruthy();
    expect(screen.getByText('Chủ xe báo khách thuê lại trực tiếp')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bỏ tạm giữ' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Tạm giữ' })).toBeNull();
  });
});
