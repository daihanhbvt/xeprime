import { App } from 'antd';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '@/i18n/test-utils';

import type { CatalogModelAdmin } from '../use-admin-catalog-models';
import { CatalogModelFormModal } from './CatalogModelFormModal';
import { CatalogModelsPanel } from './CatalogModelsPanel';

/**
 * Màn quản trị MẪU XE.
 *
 * Ba hành vi đáng giữ: (1) cột hãng nói được hãng nào có bao nhiêu mẫu và bao nhiêu mẫu thiếu
 * thông số, (2) mẫu chia nhóm "Đang phân phối" / "Mẫu xe đời trước" theo hãng đang chọn, (3) form
 * chọn hộp số theo nguồn năng lượng — xe điện tự thành "1 cấp", và đọc ra đúng luật điền sẵn.
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

const data = vi.hoisted(() => ({
  brands: [] as unknown[],
  summary: [] as unknown[],
  models: [] as unknown[],
}));
const mutations = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));

vi.mock('../use-admin-catalog', () => ({
  useAdminCatalog: () => ({ data: data.brands, isLoading: false, isError: false, refetch: vi.fn() }),
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

function renderPanel() {
  return renderWithIntl(
    <App>
      <CatalogModelsPanel />
    </App>,
  );
}

beforeEach(() => {
  nav.params = new URLSearchParams();
  nav.replace.mockReset();
  mutations.create.mockReset();
  mutations.update.mockReset();
  data.brands = [brand('toyota', 'Toyota'), brand('vinfast', 'VinFast')];
  data.summary = [
    { brandKey: 'toyota', total: 2, active: 2, missingSpecs: 1 },
    { brandKey: 'vinfast', total: 1, active: 1, missingSpecs: 0 },
  ];
  data.models = [
    model({ id: 't1', key: 'toyota-vios', label: 'Vios', brandKey: 'toyota', fuelTypes: ['gasoline'], transmissions: ['manual', 'cvt'] }),
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
});

afterEach(cleanup);

describe('CatalogModelsPanel', () => {
  it('cột hãng hiện số mẫu và số mẫu thiếu thông số của từng hãng', () => {
    renderPanel();
    const brandColumn = screen.getByRole('navigation', { name: 'Hãng xe' });
    const toyota = within(brandColumn).getByRole('button', { name: /Toyota/ });
    expect(toyota.textContent).toContain('2 mẫu');
    expect(within(toyota).getByLabelText('1 mẫu thiếu thông số')).toBeTruthy();
    expect(within(brandColumn).getByRole('button', { name: /VinFast/ }).textContent).toContain('1 mẫu');
  });

  it('mở hãng đầu tiên có mẫu và chia mẫu theo nhóm thị trường', () => {
    renderPanel();
    expect(screen.getByRole('heading', { level: 2, name: 'Toyota' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: /Đang phân phối/ })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: /Mẫu xe đời trước/ })).toBeTruthy();
    expect(screen.getAllByText('Vios').length).toBeGreaterThan(0);
    // Mẫu thiếu số chỗ và hộp số được gọi tên, không chỉ để ô trống.
    expect(screen.getAllByText('Thiếu số chỗ, hộp số').length).toBeGreaterThan(0);
  });

  it('chọn hãng khác ghi hãng lên URL', () => {
    renderPanel();
    const brandColumn = screen.getByRole('navigation', { name: 'Hãng xe' });
    fireEvent.click(within(brandColumn).getByRole('button', { name: /VinFast/ }));
    expect(navReplaceUrl()).toContain('brand=vinfast');
  });

  it('bộ lọc "thiếu thông số" trên URL chỉ giữ mẫu còn thiếu', () => {
    nav.params = new URLSearchParams('missing=true');
    renderPanel();
    expect(screen.queryAllByText('Vios')).toHaveLength(0);
    expect(screen.getAllByText('Innova').length).toBeGreaterThan(0);
  });
});

function navReplaceUrl(): string {
  return String(nav.replace.mock.calls.at(-1)?.[0] ?? '');
}

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
      expect((screen.getByRole('checkbox', { name: '1 cấp (EV)' }) as HTMLInputElement).checked).toBe(true),
    );
    expect(screen.queryByRole('checkbox', { name: 'Số sàn (MT)' })).toBeNull();
    expect(screen.getByText(/Điện — tự điền, khoá/)).toBeTruthy();
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
