import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION } from '@xeprime/types';
import NewVehiclePage from './page';

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => nav,
  usePathname: () => '/manage/vehicles/new',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/features/catalog/use-catalog', async () =>
  (await import('@/features/catalog/test-catalog')).catalogModuleMock(),
);
vi.mock('@/features/rental-policies/hooks/use-shop-policy', () => ({
  useShopPolicy: () => ({ data: { policy: null }, isLoading: false }),
}));
vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));
vi.mock('@/services/upload', () => ({
  presignVehicleImage: vi.fn(),
  uploadImage: vi.fn(),
  validateImageFile: () => null,
}));

const mutation = vi.hoisted(() => ({
  // Trang dùng `mutateAsync` để NÉM lại lỗi API cho wizard gắn vào đúng ô nhập
  // (`use-api-field-errors`) — mock phải là promise, không phải callback `onSuccess`.
  mutateAsync: vi.fn(),
  isPending: false,
  isError: false,
  error: undefined as unknown,
}));
vi.mock('@/features/vehicles/hooks/use-vehicle-mutations', () => ({
  useCreateVehicle: () => mutation,
}));

const submitPublic = vi.hoisted(() => vi.fn());
vi.mock('@/features/vehicles/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/vehicles/api')>()),
  submitVehiclePublic: submitPublic,
}));

/**
 * Chi nhánh: xe BẮT BUỘC thuộc một chi nhánh từ wave chi nhánh. Mock trả về đúng một chi nhánh
 * mặc định — wizard phải tự chọn nó, người dùng không phải bấm thêm bước nào.
 */
const branches = vi.hoisted(() => ({
  items: [
    { id: 'branch-1', name: 'Chi nhánh HCM', provinceName: 'Hồ Chí Minh', isDefault: true },
  ] as { id: string; name: string; provinceName: string | null; isDefault: boolean }[],
}));
vi.mock('@/features/branches/hooks/use-branches', () => ({
  useActiveBranches: () => ({
    data: { items: branches.items, total: branches.items.length, activeCount: branches.items.length },
    isLoading: false,
    isError: false,
  }),
}));

const permissions = vi.hoisted(() => ({ allow: true }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (permission: string) => permissions.allow && permission === PERMISSION.VEHICLE_CREATE,
    hasAny: () => permissions.allow,
    isLoading: false,
  }),
}));

const createdVehicle = {
  id: 'vehicle-1',
  code: 'XP-001',
  name: 'Toyota Vios 2024',
  plateNumber: '51A-123.45',
  vehicleType: 'car' as const,
  serviceTypes: ['self_drive'] as const,
  sourceType: 'owned' as const,
  brand: null,
  model: null,
  manufactureYear: null,
  seatCount: null,
  bodyType: null,
  discountPercent: null,
  operationStatus: 'available' as const,
  publicStatus: 'draft' as const,
  mainImageUrl: null,
  weekdayPrice: null,
  weekendPrice: null,
  updatedAt: new Date().toISOString(),
  color: null,
  fuelType: null,
  description: null,
  hourlyPrice: null,
  deliveryEnabled: false,
  noCollateral: false,
  createdAt: new Date().toISOString(),
  images: [],
  features: [],
  latestPublicReview: null,
};

function renderPage() {
  return render(
    <App>
      <NewVehiclePage />
    </App>,
  );
}

async function goNext(expectedHeading: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
  await screen.findByRole('heading', { name: expectedHeading });
}

beforeEach(() => {
  permissions.allow = true;
  mutation.mutateAsync.mockReset();
  mutation.mutateAsync.mockResolvedValue(createdVehicle);
  mutation.isPending = false;
  mutation.isError = false;
  mutation.error = undefined;
  submitPublic.mockReset();
  nav.push.mockReset();
  nav.replace.mockReset();
});
afterEach(cleanup);

describe('/manage/vehicles/new — Wave 3 create wizard', () => {
  it('chặn toàn bộ form khi thiếu quyền tạo xe', () => {
    permissions.allow = false;
    renderPage();
    expect(screen.getByText('Không có quyền thêm xe')).toBeTruthy();
    expect(screen.queryByLabelText('Tên xe')).toBeNull();
  });

  it('hiện bốn bước gọn, không bắt nhập thông số nâng cao và có bốn hình thức nguồn xe', () => {
    renderPage();
    for (const label of [/^Cơ bản$/, /Giá/, /Hình ảnh/, /Xác nhận/]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.queryByText(/^Thông số$/)).toBeNull();
    expect(screen.queryByLabelText('Chiều dài (mm)')).toBeNull();
    for (const label of ['Sở hữu', 'Trả góp', 'Thuê lại', 'Hợp tác']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('mã nội bộ là tuỳ chọn nhưng tên xe vẫn được validate tại field', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    expect(await screen.findByText('Tên xe là bắt buộc')).toBeTruthy();
    expect(screen.queryByText('Mã xe là bắt buộc')).toBeNull();
  });

  it('giữ dữ liệu qua bốn bước và gửi payload mới đúng contract', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/Tên xe/), { target: { value: ' Toyota Altis ' } });
    fireEvent.click(screen.getByText('Trả góp'));
    await goNext('2. Giá thuê & chính sách');
    await goNext('3. Hình ảnh, tiện ích & mô tả xe');
    await goNext('4. Xác nhận thông tin hồ sơ xe');
    expect(screen.getByText('Toyota Altis')).toBeTruthy();
    expect(screen.getByText('Trả góp')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    await waitFor(() => expect(mutation.mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutation.mutateAsync.mock.calls[0]![0]).toMatchObject({
      code: undefined,
      name: 'Toyota Altis',
      sourceType: 'financed',
    });
    expect(mutation.mutateAsync.mock.calls[0]![0]).not.toHaveProperty('tenantId');
    expect(mutation.mutateAsync.mock.calls[0]![0]).not.toHaveProperty('publicStatus');
  });

  it('sau khi lưu nháp hiện success workspace thay vì điều hướng mù', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/Tên xe/), { target: { value: createdVehicle.name } });
    await goNext('2. Giá thuê & chính sách');
    await goNext('3. Hình ảnh, tiện ích & mô tả xe');
    await goNext('4. Xác nhận thông tin hồ sơ xe');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    expect(await screen.findByText('Tạo xe thành công!')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Xem hồ sơ xe chi tiết' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thêm xe khác' })).toBeTruthy();
  });
});
