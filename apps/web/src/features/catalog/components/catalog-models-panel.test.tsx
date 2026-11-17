import { App } from 'antd';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VEHICLE_DATA_STATUS, VEHICLE_TYPE } from '@xeprime/types';

import { renderWithIntl } from '@/i18n/test-utils';
import type {
  VehicleDataDetail,
  VehicleDataFilters,
  VehicleDataListItem,
  VehicleDataModelCount,
} from '@/features/vehicle-data/types';

import type { CatalogModelAdmin } from '../use-admin-catalog-models';
import { CatalogModelFormModal } from './CatalogModelFormModal';
import { CatalogModelsPanel } from './CatalogModelsPanel';

/**
 * Tab MẪU XE của Danh mục (ADR 0096 — gộp màn Dữ liệu xe, MỘT danh sách).
 *
 * Hành vi đáng giữ: (1) cột hãng nói được hãng nào có bao nhiêu dòng xe, bao nhiêu xe, bao nhiêu
 * xe chờ duyệt và bao nhiêu dòng thiếu thông số, (2) bên phải là các DÒNG xe theo nhóm phân phối,
 * dòng có xe chờ duyệt hay thiếu thông số tự mở sẵn các XE của nó, (3) thiếu thông số được gọi tên
 * ngay trên hàng và có lối lọc ở dải số liệu lẫn bộ lọc, (4) dòng xe mới do chủ xe gõ hiện ở nhóm
 * riêng, (5) panel của xe chờ duyệt có Từ chối / Gộp / Lưu và duyệt, (6) form dòng xe chọn hộp số
 * theo nguồn năng lượng.
 */

const nav = vi.hoisted(() => ({ replace: vi.fn(), params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace }),
  usePathname: () => '/catalog',
  useSearchParams: () => nav.params,
}));

function brand(key: string, label: string) {
  return {
    id: `b-${key}`,
    type: 'vehicle_brand',
    key,
    label,
    description: null,
    iconUrl: null,
    sortOrder: 0,
    active: true,
    vehicleTypes: ['car'],
    usageCount: 0,
  };
}

function model(overrides: Partial<CatalogModelAdmin>): CatalogModelAdmin {
  return {
    id: 'm-1',
    key: 'vinfast-vf-5',
    label: 'VF 5',
    brandKey: 'vinfast',
    vehicleType: 'car',
    marketStatus: 'current',
    motorbikeCategory: null,
    fuelTypes: ['electric'],
    transmissions: ['direct_drive'],
    engineDisplacementCc: null,
    seatCounts: [5],
    yearFrom: null,
    yearTo: null,
    active: true,
    sourceUrl: null,
    verifiedAt: null,
    usageCount: 0,
    ...overrides,
  } as CatalogModelAdmin;
}

function count(overrides: Partial<VehicleDataModelCount>): VehicleDataModelCount {
  return {
    modelId: 't1',
    modelLabel: 'Vios',
    modelPending: false,
    total: 0,
    active: 0,
    hidden: 0,
    pending: 0,
    incomplete: 0,
    matched: 0,
    ...overrides,
  };
}

const ROW_BASE = {
  vehicleType: VEHICLE_TYPE.CAR,
  brandKey: 'toyota',
  brandLabel: 'Toyota',
  modelPending: false,
  yearTo: null,
  seatCount: 5,
  fuelType: 'gasoline',
  transmission: 'cvt',
  bodyType: 'sedan',
  marketWeekday: null,
  proposedByTenantName: null,
  updatedAt: '2026-11-11T08:00:00.000Z',
  usageCount: 0,
  listPrice: '545000000',
  weekdayPrice: '800000',
  gaps: [],
};
const ROWS: VehicleDataListItem[] = [
  {
    ...ROW_BASE,
    id: 'r1',
    modelId: 't1',
    modelLabel: 'Vios',
    variantLabel: '1.5 G CVT',
    yearFrom: 2023,
    status: VEHICLE_DATA_STATUS.ACTIVE,
    origin: 'import',
  },
  {
    ...ROW_BASE,
    id: 'r3',
    modelId: 't1',
    modelLabel: 'Vios',
    variantLabel: '1.5 E MT',
    yearFrom: 2023,
    status: VEHICLE_DATA_STATUS.PENDING,
    origin: 'owner',
    proposedByTenantName: 'Shop A',
  },
  {
    ...ROW_BASE,
    id: 'r2',
    modelId: 'p1',
    modelLabel: 'Mới Toanh',
    modelPending: true,
    variantLabel: 'Bản Cao',
    yearFrom: 2024,
    listPrice: null,
    status: VEHICLE_DATA_STATUS.PENDING,
    origin: 'owner',
    proposedByTenantName: 'Shop A',
    gaps: ['list_price'],
  },
];

const data = vi.hoisted(() => ({
  brands: [] as unknown[],
  summary: [] as unknown[],
  models: [] as unknown[],
  counts: [] as unknown[],
  detail: undefined as unknown,
}));
const mutations = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));

vi.mock('../use-admin-catalog', () => ({
  useAdminCatalog: () => ({
    data: data.brands,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('../use-admin-catalog-models', () => ({
  useCatalogModelBrandSummary: () => ({
    data: data.summary,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useAdminCatalogModels: (_vt: string, brandKey?: string) => ({
    data: (data.models as CatalogModelAdmin[]).filter((m) => m.brandKey === brandKey),
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useDeleteCatalogModel: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
  useCreateCatalogModel: () => ({ mutate: mutations.create, isPending: false }),
  useUpdateCatalogModel: () => ({ mutate: mutations.update, isPending: false }),
}));
vi.mock('@/features/vehicle-data/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/vehicle-data/hooks')>()),
  useVehicleDataModelCounts: () => ({
    data: data.counts,
    isLoading: false,
    isFetching: false,
    isError: false,
  }),
  useVehicleDataList: (filters: VehicleDataFilters) => {
    const items = ROWS.filter((r) => r.modelId === filters.modelId);
    return {
      data: {
        data: items,
        meta: { page: 1, limit: 20, total: items.length, hasNext: false },
        summary: { total: items.length, active: 0, hidden: 0, pending: 0, incomplete: 0 },
      },
      isError: false,
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    };
  },
  useVehicleDataDetail: () => ({
    data: data.detail,
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

function renderPanel() {
  return renderWithIntl(
    <App>
      <CatalogModelsPanel />
    </App>,
  );
}

function navReplaceUrl(): string {
  return String(nav.replace.mock.calls.at(-1)?.[0] ?? '');
}

beforeEach(() => {
  nav.params = new URLSearchParams();
  nav.replace.mockReset();
  mutations.create.mockReset();
  mutations.update.mockReset();
  data.detail = undefined;
  data.brands = [brand('toyota', 'Toyota'), brand('vinfast', 'VinFast')];
  data.summary = [
    {
      brandKey: 'toyota',
      total: 3,
      active: 3,
      missingSpecs: 1,
      vehicleDataTotal: 3,
      vehicleDataPending: 2,
    },
    {
      brandKey: 'vinfast',
      total: 1,
      active: 1,
      missingSpecs: 0,
      vehicleDataTotal: 0,
      vehicleDataPending: 0,
    },
  ];
  data.models = [
    model({
      id: 't1',
      key: 'toyota-vios',
      label: 'Vios',
      brandKey: 'toyota',
      fuelTypes: ['gasoline'],
      transmissions: ['manual', 'cvt'],
    }),
    model({
      id: 't3',
      key: 'toyota-camry',
      label: 'Camry',
      brandKey: 'toyota',
      fuelTypes: ['gasoline'],
      transmissions: ['automatic'],
    }),
    model({
      id: 't2',
      key: 'toyota-innova',
      label: 'Innova',
      brandKey: 'toyota',
      marketStatus: 'legacy',
      seatCounts: [],
      fuelTypes: ['gasoline'],
      transmissions: [],
    }),
    model({ id: 'v1' }),
  ];
  data.counts = [
    count({ modelId: 't1', total: 2, active: 1, pending: 1, matched: 2 }),
    count({
      modelId: 'p1',
      modelLabel: 'Mới Toanh',
      modelPending: true,
      total: 1,
      pending: 1,
      matched: 1,
    }),
  ];
});

afterEach(cleanup);

describe('CatalogModelsPanel — cột hãng', () => {
  it('hiện số dòng xe, số xe, số xe chờ duyệt và số dòng thiếu thông số', () => {
    renderPanel();
    const brandColumn = screen.getByRole('navigation', { name: 'Hãng xe' });
    const toyota = within(brandColumn).getByRole('button', { name: /Toyota/ });
    expect(toyota.textContent).toContain('3 dòng');
    expect(toyota.textContent).toContain('3 xe');
    expect(within(toyota).getByLabelText('2 xe chờ duyệt')).toBeTruthy();
    expect(within(toyota).getByLabelText('1 dòng thiếu thông số')).toBeTruthy();
    const vinfast = within(brandColumn).getByRole('button', { name: /VinFast/ });
    expect(vinfast.textContent).toContain('1 dòng');
    expect(within(vinfast).queryByLabelText(/chờ duyệt/)).toBeNull();
  });

  it('chọn hãng khác ghi hãng lên URL và bỏ bộ lọc / panel / link chế độ xem cũ của hãng trước', () => {
    nav.params = new URLSearchParams('status=pending&open=r1&q=vf&missing=true&view=lines');
    renderPanel();
    const brandColumn = screen.getByRole('navigation', { name: 'Hãng xe' });
    fireEvent.click(within(brandColumn).getByRole('button', { name: /VinFast/ }));
    const url = navReplaceUrl();
    expect(url).toContain('brand=vinfast');
    for (const param of ['status=', 'open=', 'q=', 'missing=', 'view=']) {
      expect(url).not.toContain(param);
    }
  });
});

describe('CatalogModelsPanel — một danh sách dòng xe → xe', () => {
  it('không còn hai chế độ xem: dòng xe chia nhóm phân phối, dòng mới chờ duyệt ở nhóm riêng', () => {
    renderPanel();
    expect(screen.getByRole('heading', { level: 2, name: 'Toyota' })).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'Xe' })).toBeNull();
    expect(screen.getByRole('heading', { level: 3, name: /Đang phân phối/ })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: /Mẫu xe đời trước/ })).toBeTruthy();
    const pendingGroup = screen.getByRole('heading', { level: 3, name: /Dòng xe mới chờ duyệt/ });
    expect(pendingGroup).toBeTruthy();
    expect(screen.getAllByText('Dòng mới').length).toBeGreaterThan(0);
  });

  it('dòng có xe chờ duyệt tự mở ra các xe của nó; dòng không có gì cần làm thì đóng', () => {
    renderPanel();
    // Vios có 1 xe chờ duyệt ⇒ mở sẵn.
    expect(screen.getByRole('region', { name: 'Xe của dòng Vios' })).toBeTruthy();
    expect(screen.getAllByText('1.5 G CVT').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1.5 E MT').length).toBeGreaterThan(0);
    // Camry không chờ duyệt, không thiếu ⇒ đóng.
    expect(screen.queryByRole('region', { name: 'Xe của dòng Camry' })).toBeNull();
  });

  it('dòng thiếu thông số gọi tên thứ còn thiếu và tự mở', () => {
    renderPanel();
    expect(screen.getAllByText(/Thiếu số chỗ, hộp số/).length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: 'Xe của dòng Innova' })).toBeTruthy();
    expect(screen.getAllByText('Dòng này chưa có xe nào').length).toBeGreaterThan(0);
  });

  it('bấm hàng dòng xe thì mở / đóng danh sách xe của nó', () => {
    renderPanel();
    fireEvent.click(screen.getAllByText('Camry')[0]!);
    expect(screen.getByRole('region', { name: 'Xe của dòng Camry' })).toBeTruthy();
  });

  it('dải số liệu có ô "Dòng thiếu thông số" — bấm là lọc', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Dòng thiếu thông số/ }));
    expect(navReplaceUrl()).toContain('missing=true');
  });

  it('lọc thiếu thông số trên URL chỉ giữ dòng còn thiếu', () => {
    nav.params = new URLSearchParams('missing=true');
    renderPanel();
    expect(screen.queryAllByText('Vios')).toHaveLength(0);
    expect(screen.getAllByText('Innova').length).toBeGreaterThan(0);
  });

  it('lọc theo trạng thái xe chỉ giữ dòng có xe khớp (theo số đếm của server)', () => {
    nav.params = new URLSearchParams('status=pending');
    data.counts = [count({ modelId: 't1', total: 2, pending: 1, matched: 1 })];
    renderPanel();
    expect(screen.getAllByText('Vios').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Camry')).toHaveLength(0);
    expect(screen.queryAllByText('Innova')).toHaveLength(0);
  });

  it('tìm theo tên vẫn ra dòng chưa có xe nào', () => {
    nav.params = new URLSearchParams('q=camry');
    data.counts = [count({ modelId: 't1', total: 2, matched: 0 })];
    renderPanel();
    expect(screen.getAllByText('Camry').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Vios')).toHaveLength(0);
  });

  it('bấm một xe mở panel làm việc của nó', () => {
    renderPanel();
    const lineTable = screen.getByRole('region', { name: 'Xe của dòng Vios' });
    fireEvent.click(within(lineTable).getByText('1.5 G CVT'));
    expect(navReplaceUrl()).toContain('open=r1');
  });

  it('panel của xe chờ duyệt có Từ chối / Gộp / Lưu và duyệt', () => {
    nav.params = new URLSearchParams('open=r2');
    data.detail = {
      ...ROWS[2]!,
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
    renderPanel();
    expect(screen.getByRole('button', { name: 'Từ chối' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gộp vào xe có sẵn' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Lưu và duyệt' })).toBeTruthy();
  });
});

describe('CatalogModelFormModal', () => {
  function renderForm(current: CatalogModelAdmin | null) {
    return renderWithIntl(
      <App>
        <CatalogModelFormModal
          open
          vehicleType="car"
          brandKey="vinfast"
          brandLabel="VinFast"
          model={current}
          onClose={vi.fn()}
        />
      </App>,
    );
  }

  it('hiện hãng và loại xe thành thông tin cố định, không phải gợi ý dưới ô tên', () => {
    renderForm(model({}));
    expect(screen.getByText('VinFast')).toBeTruthy();
    expect(screen.getByText('vinfast-vf-5')).toBeTruthy();
  });

  it('tick "Điện" thì hộp số tự thành 1 cấp và form đọc ra luật khoá', async () => {
    renderForm(null);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Điện' }));
    await waitFor(() =>
      expect(
        (screen.getByRole('checkbox', { name: '1 cấp (EV)' }) as HTMLInputElement).checked,
      ).toBe(true),
    );
    expect(screen.queryByRole('checkbox', { name: 'Số sàn (MT)' })).toBeNull();
    expect(screen.getByText(/Điện - tự điền, khoá/)).toBeTruthy();
  });

  it('nhiều cấu hình chỗ ngồi ⇒ chủ xe chọn trong các giá trị đó', () => {
    renderForm(model({ seatCounts: [6, 7] }));
    expect(screen.getByText(/chọn trong 6 chỗ, 7 chỗ/)).toBeTruthy();
  });

  it('gửi số chỗ dạng số, không gửi chuỗi của ô tick', async () => {
    renderForm(model({ seatCounts: [5] }));
    fireEvent.click(screen.getByRole('checkbox', { name: '7' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(mutations.update).toHaveBeenCalled());
    expect(mutations.update.mock.calls[0]![0]).toMatchObject({ id: 'm-1', seatCounts: [5, 7] });
  });
});
