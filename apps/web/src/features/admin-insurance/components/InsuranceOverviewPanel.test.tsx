import { App } from 'antd';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/i18n/test-utils';
import type { InsuranceOverview } from '../types';
import { InsuranceOverviewPanel } from './InsuranceOverviewPanel';

/**
 * Tổng quan bảo hiểm (ADR 0097) — màn chỉ BÀY số server tính: XePrime thu, phải chuyển MIC, phí đã
 * thu, nguồn phí lúc duyệt và việc tồn. Kiểm các con số đi đúng ô và cảnh báo khi MIC trả lời kém.
 */
const state = vi.hoisted(() => ({ data: undefined as unknown }));

vi.mock('../hooks', () => ({
  useOverviewMonth: () => ({ filters: { month: '2026-11' }, setFilters: vi.fn() }),
  useInsuranceOverview: () => ({
    data: state.data,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useMediaQuery: () => false,
}));

const OVERVIEW: InsuranceOverview = {
  month: '2026-11',
  issued: {
    count: 12,
    testCount: 0,
    collectedPremium: '1560000',
    payablePremium: '1540000',
    partnerPremiumMissingCount: 0,
    premiumDifference: '20000',
    serviceFee: '156000',
    agencyCommissionPercent: '15.00',
    agencyCommission: '231000',
    netPayable: '1309000',
    platformEarnings: '407000',
  },
  sources: {
    partner: 7,
    formula: 3,
    unrecorded: 0,
    fallbacks: [{ reason: 'timeout', count: 3 }],
  },
  refunds: { count: 1, amount: '55000' },
  backlog: { failed: 2, attention: 1, unremittedCount: 12, unremittedPremium: '1540000' },
};

function renderPanel() {
  return renderWithIntl(
    <App>
      <InsuranceOverviewPanel />
    </App>,
  );
}

afterEach(cleanup);

describe('InsuranceOverviewPanel (ADR 0097)', () => {
  it('ba con số chính: XePrime thu, phải chuyển MIC, phí đã thu', () => {
    state.data = OVERVIEW;
    renderPanel();
    expect(screen.getByText('XePrime thu từ bảo hiểm')).toBeTruthy();
    expect(screen.getByText(/407\.000/)).toBeTruthy();
    expect(screen.getByText(/1\.309\.000/)).toBeTruthy();
    expect(screen.getByText(/1\.560\.000/)).toBeTruthy();
    expect(screen.getByText('Hoa hồng đại lý (15%)')).toBeTruthy();
  });

  it('nguồn phí: đếm MIC báo / công thức kèm lý do, cảnh báo khi tỷ lệ MIC thấp', () => {
    state.data = OVERVIEW;
    renderPanel();
    expect(screen.getByText('MIC báo phí')).toBeTruthy();
    expect(screen.getByText('MIC không trả lời trong 1,5 giây')).toBeTruthy();
    expect(screen.getByText(/Nhiều hợp đồng phải dùng công thức/)).toBeTruthy();
  });

  it('tháng chưa có hợp đồng ⇒ câu trống, không cảnh báo', () => {
    state.data = {
      ...OVERVIEW,
      sources: { partner: 0, formula: 0, unrecorded: 0, fallbacks: [] },
    };
    renderPanel();
    expect(screen.getByText('Chưa có hợp đồng nào trong tháng.')).toBeTruthy();
    expect(screen.queryByText(/Nhiều hợp đồng phải dùng công thức/)).toBeNull();
  });
});
