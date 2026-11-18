import { App } from 'antd';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/i18n/test-utils';
import type { InsuranceProduct } from '../types';
import { PremiumSyncCard } from './PremiumSyncCard';

/**
 * Biểu phí đang áp dụng + đồng bộ từ MIC (ADR 0106): bảng nhóm năm × bậc, nhãn khoá/sửa tay theo
 * trạng thái đồng bộ, và nút đồng bộ chỉ gọi server khi bấm.
 */
const state = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));

vi.mock('../hooks', () => ({
  useSyncInsurancePremium: () => ({ mutate: state.mutate, isPending: state.isPending }),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useMediaQuery: () => false,
}));

const PRODUCT = {
  id: 'P1',
  kind: 'vehicle_trip',
  premiumBasis: 'value_tier',
  premiumTiers: [
    { maxDays: 2, percent: '0.011' },
    { maxDays: 5, percent: '0.028' },
  ],
  premiumYearBands: [
    { yearFrom: 2024, yearTo: null, percents: ['0.011', '0.028'] },
    { yearFrom: 2021, yearTo: 2023, percents: ['0.012', '0.03'] },
    { yearFrom: null, yearTo: 2020, percents: ['0.013', '0.033'] },
  ],
  premiumSyncStatus: 'synced',
  premiumSyncedAt: '2026-11-18T02:00:00.000Z',
  premiumSyncStatusAt: '2026-11-18T02:00:00.000Z',
  premiumSyncError: null,
} as unknown as InsuranceProduct;

function renderCard(product: InsuranceProduct = PRODUCT) {
  return renderWithIntl(
    <App>
      <PremiumSyncCard product={product} />
    </App>,
  );
}

beforeEach(() => {
  state.mutate = vi.fn();
  state.isPending = false;
});
afterEach(cleanup);

describe('PremiumSyncCard', () => {
  it('đã đồng bộ: nhãn khoá, mỗi nhóm năm một hàng, % đúng nhóm', () => {
    renderCard();
    expect(screen.getByText('Đồng bộ từ MIC')).toBeTruthy();
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(4);
    expect(within(rows[1]!).getByText('Từ 2024')).toBeTruthy();
    expect(within(rows[1]!).getByText('0,011%')).toBeTruthy();
    expect(within(rows[2]!).getByText('2021 - 2023')).toBeTruthy();
    expect(within(rows[3]!).getByText('Tới 2020')).toBeTruthy();
    expect(within(rows[3]!).getByText('0,033%')).toBeTruthy();
  });

  it('lần đồng bộ gần nhất hỏng: nhãn sửa tay và lý do', () => {
    renderCard({
      ...PRODUCT,
      premiumSyncStatus: 'failed',
      premiumSyncError: 'Năm 2019: timeout - MIC không trả lời',
    } as unknown as InsuranceProduct);
    expect(screen.getByText('Sửa tay')).toBeTruthy();
    expect(screen.getByText(/Năm 2019: timeout/)).toBeTruthy();
  });

  it('lượt duyệt thấy MIC báo khác: nhãn lệch, nhắc đồng bộ lại, kèm lý do', () => {
    renderCard({
      ...PRODUCT,
      premiumSyncStatus: 'drifted',
      premiumSyncError:
        'Lượt duyệt: xe đời 2024, bậc tới 2 ngày - biểu phí 59.150đ, MIC báo 50.050đ',
    } as unknown as InsuranceProduct);
    expect(screen.getByText('Lệch với MIC')).toBeTruthy();
    expect(screen.getByText(/MIC báo phí khác biểu phí lúc/)).toBeTruthy();
    expect(screen.getByText(/MIC báo 50\.050đ/)).toBeTruthy();
  });

  it('chỉ gọi đồng bộ khi bấm', async () => {
    renderCard();
    expect(state.mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Đồng bộ từ MIC ngay/ }));
    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1));
  });
});
