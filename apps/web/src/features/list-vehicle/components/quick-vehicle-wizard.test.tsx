import { App } from 'antd';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION, VEHICLE_PUBLIC_STATUS } from '@xeprime/types';

import { VEHICLE_REGISTRATION_SOURCE } from '@/constants/routes';
import { renderWithIntl } from '@/i18n/test-utils';

import { QuickVehicleWizard } from './QuickVehicleWizard';

/**
 * Wizard đăng xe nhanh.
 *
 * Bốn thứ test này giữ, theo thứ tự quan trọng:
 *
 *  1. **Không đẻ ra xe thứ hai.** Bấm hai lần, hoặc thử lại sau khi bước lưu chính sách hỏng,
 *     phải đi tiếp trên CHÍNH chiếc xe đã tạo — không gọi `POST /vehicles` lần nữa.
 *  2. **Nói đúng chuyện đã xảy ra.** Xe đã lưu mà bước sau hỏng thì màn kết quả phải nói "đã
 *     lưu", không phải "tạo xe thất bại".
 *  3. **Đúng ba bước**, nút cuối nói đúng hành động.
 *  4. **Chặn ở đúng cửa**: chưa đăng nhập, chưa có gian hàng, hoặc thiếu quyền tạo xe.
 */
const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  usePathname: () => '/list-your-vehicle/register',
  useSearchParams: () => new URLSearchParams(),
}));

const currentUser = vi.hoisted(() => ({
  data: { id: 'u1', displayName: 'Chủ xe', tenant: { id: 't1', status: 'active' } } as unknown,
  isLoading: false,
}));
vi.mock('@/hooks/use-current-user', () => ({ useCurrentUser: () => currentUser }));

const permissions = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (p: string) => permissions.granted.has(p),
    hasAny: (...keys: string[]) => keys.some((k) => permissions.granted.has(k)),
    isLoading: false,
  }),
}));

vi.mock('@/features/branches/hooks/use-branches', () => ({
  useActiveBranches: () => ({
    data: {
      items: [
        { id: 'b1', name: 'Chi nhánh 1', provinceName: 'Hồ Chí Minh', isDefault: true },
      ],
    },
    isLoading: false,
    isError: false,
  }),
}));

/** Danh mục thật đến từ API — mock trả đúng bộ của TỪNG loại, không phải một danh sách chung. */
vi.mock('@/features/catalog/use-catalog', () => ({
  useCatalog: () => ({ catalog: {}, isLoading: false }),
  useCatalogItems: () => ({ items: [], isLoading: false }),
  useCatalogLabels: () => ({ brand: () => '', feature: () => '' }),
  useCatalogOptions: (type: string) =>
    type === 'fuel_type'
      ? [
          { value: 'gasoline', label: 'Xăng' },
          { value: 'diesel', label: 'Dầu (Diesel)' },
          { value: 'electric', label: 'Điện' },
          { value: 'hybrid', label: 'Hybrid' },
        ]
      : [{ value: 'toyota', label: 'Toyota' }],
}));

/** API biên: đếm số lần gọi để chứng minh retry không tạo xe thứ hai. */
const api = vi.hoisted(() => ({
  createVehicle: vi.fn(),
  submitVehiclePublic: vi.fn(),
  fetchVehiclePricing: vi.fn(),
  saveVehiclePricing: vi.fn(),
  patchServiceSetting: vi.fn(),
}));
vi.mock('@/features/vehicles/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createVehicle: (...args: unknown[]) => api.createVehicle(...args),
  submitVehiclePublic: (...args: unknown[]) => api.submitVehiclePublic(...args),
}));
vi.mock('@/features/rental-policies/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchVehiclePricing: (...args: unknown[]) => api.fetchVehiclePricing(...args),
  saveVehiclePricing: (...args: unknown[]) => api.saveVehiclePricing(...args),
}));
vi.mock('@/features/vehicle-manage/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  patchVehicleServiceSetting: (...args: unknown[]) => api.patchServiceSetting(...args),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
}));

const VEHICLE = {
  id: 'v1',
  name: 'Toyota Vios 2023',
  publicStatus: VEHICLE_PUBLIC_STATUS.DRAFT,
};

function render(source = VEHICLE_REGISTRATION_SOURCE.MARKETPLACE) {
  return renderWithIntl(
    <App>
      <QuickVehicleWizard source={source} />
    </App>,
  );
}

/** Điền tối thiểu để qua bước 1 và bước 2 rồi tới bước ảnh. */
async function fillToLastStep() {
  fireEvent.change(screen.getByLabelText(/Biển số xe/), { target: { value: '51H-123.45' } });
  fireEvent.change(screen.getByLabelText(/Tên hiển thị/), { target: { value: 'Toyota Vios 2023' } });
  fireEvent.mouseDown(screen.getByLabelText(/Nguồn năng lượng|Nhiên liệu/));
  const gasoline = await screen.findByText('Xăng');
  fireEvent.click(gasoline);
  const consumption = await screen.findByLabelText(/Mức tiêu thụ nhiên liệu/);
  fireEvent.change(consumption, { target: { value: '7.5' } });
  fireEvent.mouseDown(screen.getByLabelText(/Hộp số/));
  fireEvent.click(await screen.findByText('Tự động'));

  fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
  const price = await screen.findByLabelText(/Giá thuê mỗi ngày/);
  fireEvent.change(price, { target: { value: '700000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
  await screen.findByText('3. Hình ảnh xe');
}

beforeEach(() => {
  permissions.granted = new Set([PERMISSION.VEHICLE_CREATE]);
  currentUser.data = {
    id: 'u1',
    displayName: 'Chủ xe',
    tenant: { id: 't1', status: 'active' },
  };
  currentUser.isLoading = false;
  api.createVehicle = vi.fn(async () => VEHICLE);
  api.submitVehiclePublic = vi.fn(async () => ({
    ...VEHICLE,
    publicStatus: VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW,
  }));
  api.fetchVehiclePricing = vi.fn(async () => ({ source: 'shop', policy: null, shopPolicy: null }));
  api.saveVehiclePricing = vi.fn(async () => ({}));
  api.patchServiceSetting = vi.fn(async () => ({}));
  nav.push.mockReset();
  sessionStorage.clear();
});

afterEach(cleanup);

describe('Cửa vào', () => {
  it('chưa đăng nhập: mời đăng nhập, KHÔNG dựng form', () => {
    currentUser.data = undefined;
    render();
    expect(screen.getByText('Đăng nhập để đăng xe')).toBeTruthy();
    expect(screen.queryByLabelText(/Biển số xe/)).toBeNull();
  });

  it('chưa có gian hàng: mời tạo hồ sơ chủ xe, KHÔNG tự tạo giúp', () => {
    currentUser.data = { id: 'u1', tenant: null };
    render();
    expect(screen.getByText('Tạo hồ sơ chủ xe trước')).toBeTruthy();
    expect(api.createVehicle).not.toHaveBeenCalled();
  });

  it('thiếu quyền thêm xe: forbidden state, không có form', () => {
    permissions.granted = new Set();
    render();
    expect(screen.getByText('Không có quyền thêm xe')).toBeTruthy();
    expect(screen.queryByLabelText(/Biển số xe/)).toBeNull();
  });
});

describe('Ba bước — đúng ba, và nút cuối nói đúng việc', () => {
  it('thanh bước có đúng ba mục, không có bước "Xác nhận"', () => {
    render();
    expect(screen.getByText('1. Thông tin xe')).toBeTruthy();
    expect(screen.queryByText(/Xác nhận/)).toBeNull();
  });

  it('bước cuối đổi nút "Kế tiếp" thành hai hành động thật', async () => {
    render();
    await fillToLastStep();

    expect(screen.queryByRole('button', { name: 'Tiếp tục' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Lưu nháp' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Lưu & gửi duyệt' })).toBeTruthy();
  });

  it('lưu nháp được khi CHƯA đủ ảnh — không chặn người dùng ở bước cuối', async () => {
    render();
    await fillToLastStep();
    expect(screen.getByText(/Cần thêm .* ảnh/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    await waitFor(() => expect(api.createVehicle).toHaveBeenCalledTimes(1));
    // Lưu nháp KHÔNG gửi duyệt.
    expect(api.submitVehiclePublic).not.toHaveBeenCalled();
    expect(await screen.findByRole('heading', { name: 'Đã lưu xe ở dạng nháp' })).toBeTruthy();
  });
});

describe('Không bao giờ tạo hai chiếc xe', () => {
  it('bấm liên tiếp hai lần: chỉ một lệnh tạo xe', async () => {
    render();
    await fillToLastStep();

    const save = screen.getByRole('button', { name: 'Lưu & gửi duyệt' });
    fireEvent.click(save);
    fireEvent.click(save);

    await waitFor(() => expect(api.createVehicle).toHaveBeenCalledTimes(1));
  });

  it('lưu chính sách hỏng: xe VẪN được lưu, thử lại KHÔNG tạo xe mới', async () => {
    api.saveVehiclePricing = vi.fn(async () => {
      throw new Error('network');
    });
    render();
    await fillToLastStep();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu & gửi duyệt' }));
    const success = await screen.findByText('Xe đã được lưu, còn một phần chưa xong');
    expect(success).toBeTruthy();
    expect(api.createVehicle).toHaveBeenCalledTimes(1);
    // Xe đã tồn tại → không gửi duyệt để tránh nói sai trạng thái.
    expect(api.submitVehiclePublic).not.toHaveBeenCalled();

    // Người dùng bấm "Đăng thêm xe" rồi lưu lại: vẫn KHÔNG được tạo chiếc thứ hai cho lần dở này.
    fireEvent.click(screen.getByRole('button', { name: 'Đăng thêm xe' }));
    await screen.findByText('1. Thông tin xe');
    expect(api.createVehicle).toHaveBeenCalledTimes(1);
  });

  it('gửi duyệt hỏng sau khi tạo: nói "đã lưu", không nói "tạo xe thất bại"', async () => {
    api.submitVehiclePublic = vi.fn(async () => {
      throw new Error('tenant chưa duyệt');
    });
    render();
    await fillToLastStep();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu & gửi duyệt' }));
    expect(await screen.findByText('Xe đã được lưu, còn một phần chưa xong')).toBeTruthy();
    expect(screen.queryByText(/tạo xe thất bại/i)).toBeNull();
    expect(api.createVehicle).toHaveBeenCalledTimes(1);
  });
});

describe('Dữ liệu gửi lên', () => {
  it('gửi đúng dịch vụ TỰ LÁI và giá dạng chuỗi', async () => {
    render();
    await fillToLastStep();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }));

    await waitFor(() => expect(api.createVehicle).toHaveBeenCalled());
    const body = api.createVehicle.mock.calls[0]![0] as Record<string, unknown>;
    expect(body.serviceTypes).toEqual(['self_drive']);
    expect(body.weekdayPrice).toBe('700000');
    expect(typeof body.weekdayPrice).toBe('string');
    // Biển số chuẩn hoá về CHỮ HOA đã trim.
    expect(body.plateNumber).toBe('51H-123.45');
    // Mã xe do backend sinh — wizard không hỏi và không gửi.
    expect(body.code).toBeUndefined();
  });

  it('không bật giảm giá thì KHÔNG gửi phần trăm nào', async () => {
    render();
    await fillToLastStep();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }));

    await waitFor(() => expect(api.createVehicle).toHaveBeenCalled());
    const body = api.createVehicle.mock.calls[0]![0] as Record<string, unknown>;
    expect(body.discountPercent).toBeUndefined();
  });

  it('chính sách gửi kèm giữ NGUYÊN khối wizard không hỏi', async () => {
    api.fetchVehiclePricing = vi.fn(async () => ({
      source: 'shop',
      policy: null,
      shopPolicy: {
        collateralMode: 'cash',
        collateralAssetTypes: [],
        depositAmount: '5000000',
        deliveryEnabled: false,
        deliveryMaxRadiusKm: null,
        deliveryTiers: [],
        overtimeFeePerHour: '100000',
        overtimeGraceMinutes: 15,
        overtimeRoundingMinutes: 30,
        discountEnabled: true,
        discountTiers: [{ minMonths: 3, percent: 10 }],
        legacyDiscountTiers: [],
        includedDistanceKmPerDay: null,
        excessDistanceFeePerKm: null,
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    }));
    render();
    await fillToLastStep();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }));

    await waitFor(() => expect(api.saveVehiclePricing).toHaveBeenCalled());
    const [, body] = api.saveVehiclePricing.mock.calls[0]! as [string, Record<string, never>];
    const policy = body.policy as unknown as Record<string, unknown>;
    // Cọc và phí quá giờ của gian hàng KHÔNG bị wizard xoá.
    expect(policy.depositAmount).toBe('5000000');
    expect(policy.overtimeFeePerHour).toBe('100000');
    expect(policy.discountTiers).toHaveLength(1);
  });
});
