import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_ERROR_CODE, PERMISSION } from '@xeprime/types';
import EditVehiclePage from './page';

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => nav,
  useParams: () => ({ id: 'vehicle-1' }),
  usePathname: () => '/manage/vehicles/vehicle-1/edit',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/features/catalog/use-catalog', async () =>
  (await import('@/features/catalog/test-catalog')).catalogModuleMock(),
);
vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));
vi.mock('@/services/upload', () => ({
  presignVehicleImage: vi.fn(),
  presignVehicleContract: vi.fn(),
  uploadImage: vi.fn(),
  uploadToR2: vi.fn(),
  validateImageFile: () => null,
  validateDocumentFile: () => null,
}));
vi.mock('@/features/rental-policies/hooks/use-vehicle-pricing', () => ({
  useVehiclePricing: () => ({
    data: undefined,
    isLoading: false,
    isError: true,
    refetch: vi.fn(),
  }),
  useSaveVehiclePricing: () => ({ mutate: vi.fn(), isPending: false }),
}));
/** Tab Bảo dưỡng & KM (Wave 6) gọi TanStack Query — test này không dựng provider. */
vi.mock('@/features/vehicle-maintenance/hooks', () => ({
  useMaintenanceProfile: () => ({ data: undefined, isLoading: false, isError: false }),
  useMaintenanceRecords: () => ({ data: undefined, isLoading: false, isError: false }),
  useOdometerHistory: () => ({ data: undefined, isLoading: false, isError: false }),
  useInvalidateMaintenance: () => vi.fn(),
}));

vi.mock('@/features/vehicles/hooks/use-vehicle-source', () => ({
  useVehicleSource: () => ({
    data: { sourceType: 'owned', detail: null },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useSaveVehicleSource: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const permissions = vi.hoisted(() => ({ allow: true }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (permission: string) =>
      permissions.allow &&
      (permission === PERMISSION.VEHICLE_UPDATE || permission === PERMISSION.FINANCE_VIEW),
    hasAny: () => permissions.allow,
    isLoading: false,
  }),
}));

/** Chi nhánh của xe — bộ chọn ở tab Thông tin đọc danh sách này. */
vi.mock('@/features/branches/hooks/use-branches', () => ({
  useActiveBranches: () => ({
    data: {
      items: [
        { id: 'branch-1', name: 'Chi nhánh HCM', provinceName: 'Hồ Chí Minh', isDefault: true },
        { id: 'branch-2', name: 'Chi nhánh Hà Nội', provinceName: 'Hà Nội', isDefault: false },
      ],
      total: 2,
      activeCount: 2,
    },
    isLoading: false,
    isError: false,
  }),
}));

const vehicle = {
  id: 'vehicle-1',
  code: 'XP-001',
  name: 'Toyota Vios 2024',
  // Xe luôn thuộc một chi nhánh — đây là vị trí công khai của nó (wave chi nhánh).
  branch: {
    id: 'branch-1',
    name: 'Chi nhánh HCM',
    provinceCode: '79',
    provinceName: 'Hồ Chí Minh',
  },
  plateNumber: '51A-123.45',
  vehicleType: 'car' as const,
  serviceTypes: ['self_drive'] as const,
  sourceType: 'owned' as const,
  brand: 'toyota',
  model: 'Vios',
  manufactureYear: 2024,
  seatCount: 5,
  bodyType: 'sedan',
  discountPercent: null,
  operationStatus: 'available' as const,
  publicStatus: 'approved_public' as const,
  mainImageUrl: 'https://cdn.test/main.jpg',
  weekdayPrice: '850000',
  weekendPrice: '1000000',
  updatedAt: new Date().toISOString(),
  color: 'Trắng',
  fuelType: 'gasoline',
  description: 'Xe gia đình',
  hourlyPrice: null,
  deliveryEnabled: true,
  noCollateral: false,
  createdAt: new Date().toISOString(),
  images: ['https://cdn.test/gallery.jpg'],
  features: ['bluetooth'],
  latestPublicReview: null,
  lengthMm: 4425,
  widthMm: 1730,
  heightMm: 1475,
  curbWeightKg: 1110,
  engineDisplacementCc: 1496,
  horsepowerHp: 107,
  transmission: 'automatic' as const,
  fuelConsumptionCity: '7.5',
  fuelConsumptionHighway: '5.1',
  fuelConsumptionCombined: '6.0',
};

const query = vi.hoisted(() => ({
  data: undefined as typeof vehicle | undefined,
  isLoading: false,
  isError: false,
  error: undefined as unknown,
  refetch: vi.fn(),
  requestedId: undefined as string | undefined,
}));
vi.mock('@/features/vehicles/hooks/use-vehicle', () => ({
  useVehicle: (id?: string) => {
    query.requestedId = id;
    return query;
  },
}));

const update = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  isPending: false,
  isError: false,
  error: undefined as unknown,
}));
vi.mock('@/features/vehicles/hooks/use-vehicle-mutations', () => ({
  useUpdateVehicle: () => update,
}));

vi.mock('@/services/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/api-client')>()),
  getErrorCode: (error: { code?: string }) => error?.code,
  getErrorMessage: () => 'Không thể lưu xe',
}));

function renderPage() {
  return render(
    <App>
      <EditVehiclePage />
    </App>,
  );
}

beforeEach(() => {
  permissions.allow = true;
  query.data = vehicle;
  query.isLoading = false;
  query.isError = false;
  query.error = undefined;
  query.refetch.mockReset();
  update.mutateAsync.mockReset();
  update.mutateAsync.mockResolvedValue(vehicle);
  update.isPending = false;
  update.isError = false;
  update.error = undefined;
  nav.push.mockReset();
  nav.replace.mockReset();
});
afterEach(cleanup);

describe('/manage/vehicles/[id]/edit — Wave 3 tab workspace', () => {
  it('không có quyền thì không gọi API và hiện màn 403', () => {
    permissions.allow = false;
    renderPage();
    expect(query.requestedId).toBeUndefined();
    expect(screen.getByText('Không có quyền sửa xe')).toBeTruthy();
  });

  it('có loading và deleted/not-found state rõ ràng', () => {
    query.data = undefined;
    query.isLoading = true;
    const view = renderPage();
    expect(screen.getByText('Đang tải thông tin xe…')).toBeTruthy();
    view.unmount();
    query.isLoading = false;
    query.isError = true;
    query.error = { code: API_ERROR_CODE.NOT_FOUND };
    renderPage();
    expect(screen.getByText('Không tìm thấy xe')).toBeTruthy();
  });

  it('nạp đúng header, trạng thái và sáu tab; Nguồn xe (Wave 4) + Giấy tờ (Wave 5) + Bảo dưỡng (Wave 6) đều mở', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: vehicle.name })).toBeTruthy();
    expect(screen.getByDisplayValue(vehicle.name)).toBeTruthy();
    expect((screen.getByDisplayValue(vehicle.code) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByRole('tab', { name: 'Thông tin xe' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(
      screen.getByRole('tab', { name: 'Nguồn xe & tài chính' }).getAttribute('aria-disabled'),
    ).not.toBe('true');
    expect(screen.getByRole('tab', { name: 'Giấy tờ' }).getAttribute('aria-disabled')).not.toBe(
      'true',
    );
    expect(
      screen.getByRole('tab', { name: 'Bảo dưỡng & KM' }).getAttribute('aria-disabled'),
    ).not.toBe('true');
  });

  it('Giá & chính sách được nhúng trực tiếp trong tab, không qua màn trung gian', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Giá & chính sách' }));
    expect(await screen.findByText('Không tải được giá & chính sách')).toBeTruthy();
    expect(screen.queryByText('Mở Giá & chính sách')).toBeNull();
  });

  it('thông số nâng cao mặc định đóng và tự đóng lại sau khi lưu', async () => {
    renderPage();
    expect(screen.queryByLabelText('Chiều dài (mm)')).toBeNull();
    const advanced = screen.getByRole('tab', { name: /Thông số kỹ thuật nâng cao/ });
    expect(advanced.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(advanced);
    expect(await screen.findByLabelText('Chiều dài (mm)')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Chiều dài (mm)'), { target: { value: '4500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        screen
          .getByRole('tab', { name: /Thông số kỹ thuật nâng cao/ })
          .getAttribute('aria-expanded'),
      ).toBe('false'),
    );
  });

  it('tab Thông tin chỉ gửi field thuộc tab, không ghi đè media hay giá', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/Tên xe/), { target: { value: 'Toyota Vios mới' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledTimes(1));
    const payload = update.mutateAsync.mock.calls[0]![0];
    expect(payload.name).toBe('Toyota Vios mới');
    expect(payload).not.toHaveProperty('images');
    expect(payload).not.toHaveProperty('mainImageUrl');
    expect(payload).not.toHaveProperty('weekdayPrice');
    expect(payload).not.toHaveProperty('sourceType');
  });

  it('chuyển xe sang chi nhánh tỉnh khác PHẢI gửi branchId — vị trí công khai đổi thật', async () => {
    renderPage();
    fireEvent.mouseDown(screen.getByLabelText(/Chi nhánh giữ xe/));
    fireEvent.click(await screen.findByTitle('Chi nhánh Hà Nội · Hà Nội'));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledTimes(1));
    expect(update.mutateAsync.mock.calls[0]![0].branchId).toBe('branch-2');
  });

  it('tab Hình ảnh chỉ gửi replace-set media có chủ đích', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Hình ảnh & tiện ích' }));
    fireEvent.change(screen.getByLabelText(/Mô tả/), { target: { value: 'Mô tả mới' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledTimes(1));
    expect(update.mutateAsync.mock.calls[0]![0]).toEqual({
      mainImageUrl: vehicle.mainImageUrl,
      images: vehicle.images,
      features: vehicle.features,
      description: 'Mô tả mới',
    });
  });

  it('xoá ảnh đại diện gửi null có chủ đích và đi qua xác nhận của xe public', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Hình ảnh & tiện ích' }));
    fireEvent.click(screen.getAllByRole('button', { name: /Xoá ảnh/ })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect(await screen.findByText('Xác nhận thay đổi nhạy cảm')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận & Lưu' }));

    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledTimes(1));
    expect(update.mutateAsync.mock.calls[0]![0].mainImageUrl).toBeNull();
  });

  it('tab Nguồn xe (Wave 4): sửa dở rồi chuyển tab phải qua xác nhận bỏ thay đổi', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Nguồn xe & tài chính' }));
    fireEvent.change(await screen.findByLabelText(/Nơi mua/), {
      target: { value: 'Toyota Đông Sài Gòn' },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Thông tin xe' }));
    expect(await screen.findByText('Bỏ các thay đổi chưa lưu?')).toBeTruthy();
  });

  it('không cho đổi tab làm mất dữ liệu chưa lưu', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/Tên xe/), { target: { value: 'Chưa lưu' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Hình ảnh & tiện ích' }));
    expect(await screen.findByText('Bỏ các thay đổi chưa lưu?')).toBeTruthy();
    expect(screen.getByDisplayValue('Chưa lưu')).toBeTruthy();
  });

  it('thay đổi nhạy cảm của xe public phải xác nhận trước khi gọi API', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/Biển số xe/), { target: { value: '51A-999.99' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect(await screen.findByText('Xác nhận thay đổi nhạy cảm')).toBeTruthy();
    expect(update.mutateAsync).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận & Lưu' }));
    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledTimes(1));
  });

  /*
   * Lỗi có thật từ staging: nhập mức tiêu thụ `1.233` thì Lưu chỉ hiện toast "Dữ liệu gửi lên
   * không hợp lệ" — không ô nào đỏ, người dùng không biết sai ở đâu (nhập `1.23` lại lưu được).
   * Cột là `Decimal(6, 2)` và DTO có `maxDecimalPlaces: 2`, nhưng yup thì không, nên giá trị đi
   * lọt xuống server. Hai test dưới khoá cả hai lớp phòng thủ.
   */
  it('mức tiêu thụ quá 2 chữ số thập phân: báo NGAY dưới ô, không gọi API', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Thông số kỹ thuật nâng cao/ }));
    const field = await screen.findByLabelText('Trong đô thị');
    fireEvent.change(field, { target: { value: '1.233' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    expect(await screen.findByText(/2 chữ số thập phân/)).toBeTruthy();
    expect(update.mutateAsync).not.toHaveBeenCalled();

    // …và 1.23 thì đi tiếp bình thường.
    fireEvent.change(field, { target: { value: '1.23' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledTimes(1));
  });

  it('server trả lỗi cấp trường: gắn vào ĐÚNG ô và mở vùng thu gọn đang che nó', async () => {
    const { ApiClientError } = await import('@/services/api-client');
    update.mutateAsync.mockRejectedValue(
      new ApiClientError({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Dữ liệu gửi lên không hợp lệ',
        status: 400,
        details: [{ field: 'engineDisplacementCc', constraints: ['must be an integer number'] }],
      }),
    );
    renderPage();
    fireEvent.change(screen.getByLabelText(/Tên xe/), { target: { value: 'Toyota Vios mới' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledTimes(1));

    // Vùng "Thông số kỹ thuật nâng cao" đang đóng phải TỰ MỞ — lỗi khuất sau nó là lỗi vô hình.
    const field = await screen.findByLabelText('Dung tích động cơ (cc)');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(await screen.findByText('Giá trị này chưa hợp lệ. Kiểm tra lại giúp bạn nhé.')).toBeTruthy();
  });
});
