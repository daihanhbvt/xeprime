import { App } from 'antd';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VEHICLE_DATA_GAP_ANY, VEHICLE_DATA_STATUS, VEHICLE_TYPE } from '@xeprime/types';
import { renderWithIntl } from '@/i18n/test-utils';
import type { VehicleDataDetail, VehicleDataFilters, VehicleDataListItem } from '../types';
import { VehicleDataView } from './VehicleDataView';

/**
 * Màn "Dữ liệu xe" (ADR 0090): MỘT danh sách — dữ liệu chủ xe gửi lên nằm chung, trạng thái "Chờ
 * duyệt"; dải số liệu là lối lọc nhanh; panel của dữ liệu chờ duyệt có Duyệt / Gộp / Từ chối.
 */
const state = vi.hoisted(() => ({
  filters: {} as VehicleDataFilters,
  setFilters: vi.fn(),
  detail: undefined as VehicleDataDetail | undefined,
}));

const ROW_BASE = {
  vehicleType: VEHICLE_TYPE.CAR,
  brandKey: 'vinfast',
  brandLabel: 'VinFast',
  modelId: 'm1',
  modelPending: false,
  yearTo: null,
  seatCount: 5,
  fuelType: 'electric',
  transmission: 'direct_drive',
  bodyType: 'cuv',
  marketWeekday: null,
  proposedByTenantName: null,
  updatedAt: '2026-11-11T08:00:00.000Z',
  usageCount: 0,
};
const ROWS: VehicleDataListItem[] = [
  {
    ...ROW_BASE,
    id: 'r1',
    modelLabel: 'VF 5',
    variantLabel: 'Plus',
    yearFrom: 2023,
    listPrice: '471000000',
    weekdayPrice: '650000',
    status: VEHICLE_DATA_STATUS.ACTIVE,
    origin: 'import',
    gaps: [],
    usageCount: 12,
    marketWeekday: {
      field: 'weekdayPrice',
      sampleSize: 12,
      low: '700000',
      median: '800000',
      high: '850000',
    },
  },
  {
    ...ROW_BASE,
    id: 'r2',
    modelLabel: 'Mới Toanh',
    modelPending: true,
    variantLabel: '',
    yearFrom: 2024,
    listPrice: null,
    weekdayPrice: '900000',
    status: VEHICLE_DATA_STATUS.PENDING,
    origin: 'owner',
    proposedByTenantName: 'Shop A',
    gaps: ['list_price'],
  },
];

vi.mock('../hooks', () => ({
  VEHICLE_DATA_SORT_VALUES: ['updated_desc', 'name_asc', 'usage_desc'],
  useVehicleDataFilters: () => ({ filters: state.filters, setFilters: state.setFilters }),
  useVehicleDataList: () => ({
    data: {
      data: ROWS,
      meta: { page: 1, limit: 20, total: 2, hasNext: false },
      summary: { total: 2, active: 1, hidden: 0, pending: 1, incomplete: 0 },
    },
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useVehicleDataDetail: () => ({
    data: state.detail,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useCreateVehicleData: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateVehicleData: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useApproveVehicleData: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteVehicleData: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRejectVehicleData: () => ({ mutate: vi.fn(), isPending: false }),
  useMergeVehicleData: () => ({ mutate: vi.fn(), isPending: false }),
  useVehicleDataImports: () => ({
    data: undefined,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useVehicleDataImport: () => ({ data: undefined, isLoading: false }),
  useVehicleDataImportRows: () => ({
    data: undefined,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useUploadVehicleDataImport: () => ({ mutate: vi.fn(), isPending: false }),
  useApplyVehicleDataImport: () => ({ mutate: vi.fn(), isPending: false }),
  useDiscardVehicleDataImport: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/features/catalog/use-catalog', async () =>
  (await import('@/features/catalog/test-catalog')).catalogModuleMock(),
);
vi.mock('@/features/catalog/use-catalog-models', () => ({
  useCatalogModels: () => ({ models: [], isLoading: false }),
  useCatalogModelGroups: () => [],
}));
vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useMediaQuery: () => false,
}));

function renderView() {
  return renderWithIntl(
    <App>
      <VehicleDataView />
    </App>,
  );
}

beforeEach(() => {
  state.filters = {};
  state.setFilters.mockReset();
  state.detail = undefined;
});

afterEach(cleanup);

describe('VehicleDataView', () => {
  it('một danh sách: xe đang gợi ý và dữ liệu chờ duyệt từ chủ xe nằm chung', () => {
    renderView();
    const table = screen.getByRole('table');
    expect(within(table).getByText('VinFast VF 5')).toBeTruthy();
    expect(within(table).getByText('Từ chủ xe · Shop A')).toBeTruthy();
    expect(within(table).getByText('Dòng xe mới')).toBeTruthy();
    expect(within(table).getAllByText('Chờ duyệt').length).toBeGreaterThan(0);
    // Giá thực tế lệch giá tham khảo ≥ 15% ⇒ nhắc vận hành.
    expect(within(table).getByText('Thực tế cao hơn 23%')).toBeTruthy();
    expect(within(table).getByText('Thiếu giá bán')).toBeTruthy();
  });

  it('dải số liệu là lối lọc nhanh: "Thiếu dữ liệu" = đang gợi ý + thiếu bất kỳ', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /Thiếu dữ liệu/ }));
    expect(state.setFilters).toHaveBeenCalledWith({
      status: VEHICLE_DATA_STATUS.ACTIVE,
      gap: VEHICLE_DATA_GAP_ANY,
    });
  });

  it('panel của dữ liệu chờ duyệt có Từ chối / Gộp / Lưu và duyệt', () => {
    state.filters = { open: 'r2' };
    state.detail = {
      ...ROWS[1]!,
      hourlyPrice: null,
      weekendPrice: null,
      monthlyPrice: null,
      withDriverDailyPrice: null,
      engineDisplacementCc: null,
      horsepowerHp: null,
      lengthMm: null,
      widthMm: null,
      heightMm: null,
      curbWeightKg: null,
      fuelConsumptionCombined: null,
      electricRangeKm: null,
      batteryCapacityKwh: null,
      featureKeys: [],
      sourceVehicle: null,
      reviewNote: null,
      reviewedAt: null,
      updatedByName: null,
      createdAt: '2026-11-11T08:00:00.000Z',
      vehicles: [],
      market: [],
      valueByYear: [],
      similar: [],
    } as unknown as VehicleDataDetail;
    renderView();
    expect(screen.getByRole('button', { name: 'Từ chối' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gộp vào xe có sẵn' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Lưu và duyệt' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Xoá' })).toBeNull();
  });
});
