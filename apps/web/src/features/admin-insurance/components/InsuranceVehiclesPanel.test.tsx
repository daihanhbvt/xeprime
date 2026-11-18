import { App } from 'antd';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/i18n/test-utils';
import type { InsuranceVehicleRow } from '../types';
import { InsuranceVehiclesPanel } from './InsuranceVehiclesPanel';

/**
 * Tab Xe (ADR 0097) — mỗi ô tô: giá trị, chế độ chủ xe, điều kiện còn thiếu, phí theo bậc; chỉ xe
 * đủ dữ liệu (giá trị, năm, số chỗ) mới có nút đối chiếu MIC.
 */
const state = vi.hoisted(() => ({ items: [] as unknown[] }));

vi.mock('../hooks', () => ({
  useInsuranceVehicleFilters: () => ({ filters: {}, setFilters: vi.fn() }),
  useInsuranceVehicles: () => ({
    data: {
      items: state.items,
      meta: { page: 1, limit: 20, total: state.items.length, hasNext: false },
    },
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useInsuranceProducts: () => ({ data: [], isLoading: false }),
  useVehiclePremiumCheck: () => ({
    data: undefined,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useMediaQuery: () => false,
}));

const READY: InsuranceVehicleRow = {
  vehicleId: 'v1',
  vehicleName: 'Toyota Vios',
  plateNumber: '51H-100.00',
  tenantId: 't1',
  tenantName: 'Shop Sài Gòn',
  insuredValue: '340000000',
  manufactureYear: 2019,
  seatCount: 5,
  insuranceMode: 'required',
  eligible: true,
  gaps: [],
  tiers: [
    { maxDays: 2, percent: '0.013', premium: '44200', serviceFee: '0' },
    { maxDays: 5, percent: '0.033', premium: '112200', serviceFee: '0' },
  ],
};

const MISSING: InsuranceVehicleRow = {
  ...READY,
  vehicleId: 'v2',
  vehicleName: 'Kia Morning',
  insuredValue: null,
  insuranceMode: 'optional',
  eligible: false,
  gaps: ['insured_value_missing', 'registration_missing'],
  tiers: [],
};

function renderPanel() {
  return renderWithIntl(
    <App>
      <InsuranceVehiclesPanel />
    </App>,
  );
}

afterEach(cleanup);

describe('InsuranceVehiclesPanel (ADR 0097)', () => {
  it('xe đủ điều kiện: chế độ, phí từng bậc và nút đối chiếu MIC', () => {
    state.items = [READY];
    renderPanel();
    expect(screen.getByText('Toyota Vios')).toBeTruthy();
    expect(screen.getByText('Bắt buộc')).toBeTruthy();
    expect(screen.getAllByText('Đủ điều kiện').length).toBeGreaterThan(0);
    expect(screen.getByText(/44\.200/)).toBeTruthy();
    expect(screen.getByText(/112\.200/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Đối chiếu MIC/ })).toBeTruthy();
  });

  it('xe còn thiếu: liệt kê việc thiếu, không có nút đối chiếu', () => {
    state.items = [MISSING];
    renderPanel();
    expect(screen.getByText('Chưa khai giá trị xe')).toBeTruthy();
    expect(screen.getByText('Chưa có cà vẹt (số khung + tên chủ)')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Đối chiếu MIC/ })).toBeNull();
  });
});
