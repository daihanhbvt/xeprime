import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION } from '@xeprime/types';
import NewVehiclePage from './page';

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('@/features/vehicle-data/hooks', async () =>
  (await import('@/features/vehicle-data/test-vehicle-data')).vehicleDataHooksMock(),
);
vi.mock('next/navigation', () => ({
  useRouter: () => nav,
  usePathname: () => '/manage/vehicles/new',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/features/catalog/use-catalog-models', async () =>
  (await import('@/features/catalog/test-catalog')).catalogModelsModuleMock(),
);
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
  // Mỗi lượt tải trả một URL KHÁC nhau — năm ô ảnh của ô tô phải là năm tấm, không phải một tấm
  // ghi đè bốn lần (07/10/2026: đủ góc là điều kiện lưu).
  uploadImage: vi.fn(async () => `https://cdn.test/${++uploaded}.jpg`),
  validateImageFile: () => null,
}));

let uploaded = 0;

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
/** Cà vẹt (ADR 0089): tải + đọc là một lời gọi; mặc định máy đọc đủ mọi trường. */
const registrationRead = vi.hoisted(() => vi.fn());
const FULL_READING = {
  plateNumber: '51H-100.00',
  holderName: 'NGUYỄN VĂN AN',
  holderAddress: null,
  chassisNumber: 'RL4B29F30K1234567',
  engineNumber: '2NRX123456',
  color: 'Trắng',
};
// jsdom không có canvas — bỏ bước nén ảnh, trả nguyên tệp.
vi.mock('@/features/driver-licence/prepare-licence-image', () => ({
  PrepareImageError: class extends Error {},
  prepareLicenceImage: async (file: File) => file,
}));
/** Cổng 'đủ điều kiện lên chợ' của wizard — mặc định đủ; bộ này kiểm luồng lưu, không kiểm luật. */
vi.mock('@/features/vehicles/publication', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  missingPublishRequirementsForForm: () => [],
}));
vi.mock('@/features/vehicles/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/vehicles/api')>()),
  submitVehiclePublic: submitPublic,
  uploadVehicleRegistration: registrationRead,
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

/** Hồ sơ gian hàng (cột phải + cổng gửi duyệt tuyến gói) — `null` = không áp cổng hồ sơ gian hàng. */
vi.mock('@/features/shop/hooks/use-shop', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useMyShop: () => ({ data: null, isLoading: false, isError: false }),
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

/** Bước cuối: "Gửi duyệt" mở hộp xác nhận; trả về hộp đó để bấm "Lưu nháp"/"Gửi duyệt" bên trong. */
async function openConfirm() {
  fireEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }));
  return screen.findByRole('dialog', { name: 'Xác nhận thông tin & gửi duyệt xe' });
}

/** Ảnh cà vẹt — ô cuối lưới "Ảnh xe" ở bước 1 (Figma `24352:70390`, ADR 0099). */
async function uploadRegistration() {
  const region = screen.getByRole('region', { name: /Cà vẹt xe/ });
  const input = region.querySelector('input[type="file"]')!;
  fireEvent.change(input, {
    target: { files: [new File(['x'], 'ca-vet.jpg', { type: 'image/jpeg' })] },
  });
  await waitFor(() => expect(registrationRead).toHaveBeenCalled());
  return region;
}

/** Hãng + mẫu xe — thay ô "Tên xe" đã gỡ: server ghép tên từ đây (ADR 0102). */
async function pickModel() {
  fireEvent.mouseDown(screen.getByLabelText(/Hãng xe/));
  fireEvent.click(await screen.findByTitle('Toyota'));
  fireEvent.mouseDown(screen.getByLabelText(/^Mẫu xe/));
  fireEvent.click(await screen.findByTitle('Vios'));
}

async function uploadPhotos() {
  const inputs = [...document.querySelectorAll('input[type="file"]')].slice(0, 5);
  for (const [index, input] of inputs.entries()) {
    fireEvent.change(input, {
      target: { files: [new File(['x'], `anh-${index}.jpg`, { type: 'image/jpeg' })] },
    });
    await waitFor(() => expect(uploaded).toBeGreaterThanOrEqual(index + 1));
  }
}

beforeEach(() => {
  permissions.allow = true;
  uploaded = 0;
  mutation.mutateAsync.mockReset();
  mutation.mutateAsync.mockResolvedValue(createdVehicle);
  mutation.isPending = false;
  mutation.isError = false;
  mutation.error = undefined;
  submitPublic.mockReset();
  registrationRead.mockReset();
  registrationRead.mockResolvedValue({
    uploadId: '01JREGISTRATIONUPLOAD00001',
    reading: FULL_READING,
    readerAvailable: true,
  });
  globalThis.URL.createObjectURL ??= () => 'blob:test';
  globalThis.URL.revokeObjectURL ??= () => undefined;
  nav.push.mockReset();
  nav.replace.mockReset();
});
afterEach(cleanup);

describe('/manage/vehicles/new - Wave 3 create wizard', () => {
  it('chặn toàn bộ form khi thiếu quyền tạo xe', () => {
    permissions.allow = false;
    renderPage();
    expect(screen.getByText('Không có quyền thêm xe')).toBeTruthy();
    expect(screen.queryByLabelText('Tên xe')).toBeNull();
  });

  it('hiện ba bước gọn, không bắt nhập thông số nâng cao và có bốn hình thức nguồn xe', () => {
    renderPage();
    // "Thông tin xe" vừa là tên bước vừa là tiêu đề thẻ của bước 1.
    expect(screen.getAllByText('Thông tin xe').length).toBeGreaterThan(0);
    for (const label of ['Dịch vụ & giá', 'Tiện ích & mô tả']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    // Không còn bước "Xác nhận" riêng — xác nhận là hộp thoại của nút "Gửi duyệt".
    expect(screen.queryByText(/^Xác nhận/)).toBeNull();
    expect(screen.queryByText(/^Thông số$/)).toBeNull();
    expect(screen.queryByLabelText('Chiều dài (mm)')).toBeNull();
    for (const label of ['Sở hữu', 'Trả góp', 'Thuê lại', 'Hợp tác']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('không hỏi tên xe (ADR 0102); hãng + mẫu xe validate tại field, mã nội bộ tuỳ chọn', async () => {
    renderPage();
    expect(screen.queryByLabelText(/^Tên xe/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    expect(await screen.findByText('Chọn hãng xe')).toBeTruthy();
    expect(screen.getByText('Chọn mẫu xe')).toBeTruthy();
    expect(screen.queryByText('Mã xe là bắt buộc')).toBeNull();
  });

  it('giữ dữ liệu qua ba bước và gửi payload mới đúng contract', async () => {
    renderPage();
    await pickModel();
    fireEvent.click(screen.getByText('Trả góp'));
    await uploadPhotos();
    await uploadRegistration();
    await screen.findByText(/^Đã quét:/);
    await goNext('Dịch vụ & giá');
    await goNext('Tiện ích & mô tả');
    const dialog = await openConfirm();
    // Hộp xác nhận hiện đúng tên server sẽ ghép (hãng + dòng xe; chưa khai năm).
    expect(within(dialog).getByText('Toyota Vios')).toBeTruthy();
    expect(within(dialog).getByText('Trả góp')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu nháp' }));
    await waitFor(() => expect(mutation.mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutation.mutateAsync.mock.calls[0]![0]).toMatchObject({
      code: undefined,
      vehicleCatalogModelId: 'm-toyota-vios',
      sourceType: 'financed',
      // Biển số + màu sơn tự điền từ lượt đọc cà vẹt (ADR 0102).
      plateNumber: '51H-100.00',
      color: 'Trắng',
    });
    // Không gửi tên: server ghép "Hãng Dòng Phiên bản Năm" từ danh mục.
    expect((mutation.mutateAsync.mock.calls[0]![0] as { name?: string }).name).toBeUndefined();
    expect(mutation.mutateAsync.mock.calls[0]![0]).toMatchObject({
      registration: {
        uploadId: '01JREGISTRATIONUPLOAD00001',
        holderName: 'NGUYỄN VĂN AN',
        chassisNumber: 'RL4B29F30K1234567',
        engineNumber: '2NRX123456',
      },
    });
    expect(mutation.mutateAsync.mock.calls[0]![0]).not.toHaveProperty('tenantId');
    expect(mutation.mutateAsync.mock.calls[0]![0]).not.toHaveProperty('publicStatus');
  });

  it('cà vẹt: thiếu ba ô thì không qua bước 1; KHÔNG ảnh mà nhập tay đủ thì đi tiếp (ADR 0100)', async () => {
    renderPage();
    await pickModel();
    await uploadPhotos();
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    expect(await screen.findByText('Nhập số khung')).toBeTruthy();
    expect(screen.queryByText('Vui lòng chụp hoặc tải ảnh cà vẹt')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Dịch vụ & giá' })).toBeNull();

    fireEvent.change(screen.getByLabelText(/^Tên chủ xe/), { target: { value: 'Trần Bảo' } });
    fireEvent.change(screen.getByLabelText(/^Số khung/), { target: { value: 'rl4b29f30k7654321' } });
    fireEvent.change(screen.getByLabelText(/^Số máy/), { target: { value: '2nrx654321' } });
    await goNext('Dịch vụ & giá');
    await goNext('Tiện ích & mô tả');
    const dialog = await openConfirm();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu nháp' }));
    await waitFor(() => expect(mutation.mutateAsync).toHaveBeenCalledTimes(1));
    const payload = mutation.mutateAsync.mock.calls[0]![0] as { registration: object };
    expect(payload.registration).toMatchObject({
      holderName: 'Trần Bảo',
      chassisNumber: 'RL4B29F30K7654321',
      engineNumber: '2NRX654321',
    });
    expect(payload.registration).not.toHaveProperty('uploadId');
    expect(registrationRead).not.toHaveBeenCalled();
  });

  it('máy đọc thiếu số máy: bắt nhập tay rồi mới đi tiếp', async () => {
    registrationRead.mockResolvedValue({
      uploadId: '01JREGISTRATIONUPLOAD00002',
      reading: { ...FULL_READING, engineNumber: null },
      readerAvailable: true,
    });
    renderPage();
    await pickModel();
    await uploadPhotos();
    await uploadRegistration();
    expect(await screen.findByText(/^Chưa lấy được số máy/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    expect(await screen.findByText('Nhập số máy')).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/^Số máy/), { target: { value: '2nr x999' } });
    await goNext('Dịch vụ & giá');
    await goNext('Tiện ích & mô tả');
    const dialog = await openConfirm();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu nháp' }));
    await waitFor(() => expect(mutation.mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutation.mutateAsync.mock.calls[0]![0]).toMatchObject({
      registration: { uploadId: '01JREGISTRATIONUPLOAD00002', engineNumber: '2NRX999' },
    });
  });

  it('sau khi lưu nháp hiện success workspace thay vì điều hướng mù', async () => {
    renderPage();
    await pickModel();
    await uploadPhotos();
    await uploadRegistration();
    await screen.findByText(/^Đã quét:/);
    await goNext('Dịch vụ & giá');
    await goNext('Tiện ích & mô tả');
    const dialog = await openConfirm();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu nháp' }));
    expect(await screen.findByText('Đã lưu nháp xe')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hoàn thiện hồ sơ xe' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thêm xe mới' })).toBeTruthy();
  });
});
