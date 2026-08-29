import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { PLAN_FEATURE } from '@xeprime/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '@/i18n/test-utils';
import { FeatureExpiredNotice } from './FeatureExpiredNotice';
import { FeatureUpsellState } from './FeatureUpsellState';

/**
 * Hai màn của trạng thái không-enabled (ADR 0027 điều 3), và điều được khoá ở đây là CÂU CHỮ —
 * vì chính câu chữ quyết định người dùng gọi hỗ trợ hay bấm gia hạn:
 *
 *  - `read_only`: phải nói "dữ liệu còn nguyên", nếu không người ta tưởng đã mất sổ;
 *  - `hidden`: KHÔNG được nói "bạn không có quyền" — họ có quyền, gian hàng thiếu tính năng,
 *    nên lối đi tiếp là xem gói chứ không phải liên hệ quản trị viên.
 */
function render(ui: Parameters<typeof renderWithIntl>[0]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithIntl(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

afterEach(cleanup);

describe('FeatureExpiredNotice — băng gói hết hạn', () => {
  it('nói rõ tên tính năng, và rằng dữ liệu cũ VẪN CÒN', () => {
    render(<FeatureExpiredNotice feature={PLAN_FEATURE.FINANCE} planEndsAt={null} />);

    // Tên tính năng bằng ngôn ngữ người dùng, không phải tên module.
    expect(screen.getByText(/Sổ thu chi và báo cáo/)).toBeTruthy();
    expect(screen.getByText(/vẫn còn nguyên/)).toBeTruthy();
  });

  it('có ngày hết hạn thì hiện đúng ngày đó', () => {
    render(
      <FeatureExpiredNotice
        feature={PLAN_FEATURE.DEBTS}
        planEndsAt="2026-08-01T00:00:00.000Z"
      />,
    );

    expect(screen.getByText(/01\/08\/2026/)).toBeTruthy();
  });

  it('hai lối đi: gia hạn (link tới Gói của tôi) và làm mới sau khi đã gia hạn', () => {
    render(<FeatureExpiredNotice feature={PLAN_FEATURE.FINANCE} planEndsAt={null} />);

    const renew = screen.getByRole('link', { name: /Gia hạn gói/ });
    expect(renew.getAttribute('href')).toBe('/manage/subscription');
    expect(screen.getByRole('button', { name: /Tôi đã gia hạn/ })).toBeTruthy();
  });

  it('bấm "Tôi đã gia hạn" làm mới /auth/me — chữa độ trễ 60 giây của staleTime', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    renderWithIntl(
      <QueryClientProvider client={queryClient}>
        <FeatureExpiredNotice feature={PLAN_FEATURE.FINANCE} planEndsAt={null} />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Tôi đã gia hạn/ }));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['auth', 'me'] });
  });
});

describe('FeatureUpsellState — tính năng chưa mua', () => {
  it('KHÔNG nói "không có quyền" — nói gian hàng chưa có tính năng', () => {
    render(<FeatureUpsellState feature={PLAN_FEATURE.DRIVERS} />);

    expect(screen.getByText(/Quản lý tài xế/)).toBeTruthy();
    expect(screen.getByText(/chưa có tính năng này/)).toBeTruthy();
    expect(screen.queryByText(/không có quyền/i)).toBeNull();
    expect(screen.queryByText(/Liên hệ quản trị viên/i)).toBeNull();
  });

  it('lối đi tiếp là XEM GÓI, không phải liên hệ quản trị viên', () => {
    render(<FeatureUpsellState feature={PLAN_FEATURE.CONTRACTS} />);

    expect(screen.getByRole('link', { name: /Xem các gói/ }).getAttribute('href')).toBe(
      '/manage/subscription',
    );
  });
});
