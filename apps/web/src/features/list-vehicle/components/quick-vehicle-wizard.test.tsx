import { App } from 'antd';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useController, type Control } from 'react-hook-form';
import {
  API_ERROR_CODE,
  PERMISSION,
  PUBLISH_REQUIREMENT,
  REGISTRATION_TRACK,
  VEHICLE_PUBLIC_STATUS,
} from '@xeprime/types';
import type { OwnerProfileValues } from '@xeprime/validators';
import { ApiClientError } from '@xeprime/api-client';

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

/*
 * Phụ thuộc của BƯỚC HỒ SƠ CHỦ XE — chỉ user chưa có gian hàng mới chạm tới.
 *
 * `AddressField` là ô địa chỉ DÙNG CHUNG (tỉnh → xã/phường → số nhà + ghim bản đồ): nó tự gọi
 * danh mục hành chính và dịch vụ bản đồ, và đã có test của riêng nó. Ở đây thay bằng một chốt
 * giả — test này hỏi "bước hồ sơ có hiện không", không hỏi "ô địa chỉ chạy thế nào".
 */
vi.mock('@/components/form/AddressField', () => ({
  AddressField: ({
    control,
    names,
  }: {
    control: Control<OwnerProfileValues>;
    names: { provinceCode: 'provinceCode'; addressLine: 'addressLine' };
  }) => <AddressFieldStub control={control} names={names} />,
}));

/*
 * Ô địa chỉ thật gọi danh mục hành chính + bản đồ và đã có test riêng. Bản giả ở đây chỉ cần
 * GHI ĐƯỢC giá trị vào form: `ownerProfileSchema` đòi mã tỉnh, nên một stub chỉ hiện chữ sẽ
 * khiến bước hồ sơ không bao giờ hợp lệ và mọi test sau nó kẹt ở màn đầu.
 */
function AddressFieldStub({
  control,
  names,
}: {
  control: Control<OwnerProfileValues>;
  names: { provinceCode: 'provinceCode'; addressLine: 'addressLine' };
}) {
  const province = useController({ control, name: names.provinceCode });
  const line = useController({ control, name: names.addressLine });
  return (
    <div data-testid="address-field">
      <label>
        Tỉnh/thành
        <input
          value={province.field.value ?? ''}
          onChange={(e) => province.field.onChange(e.target.value)}
        />
      </label>
      <label>
        Địa chỉ
        <input
          value={line.field.value ?? ''}
          onChange={(e) => line.field.onChange(e.target.value)}
        />
      </label>
    </div>
  );
}

/* Danh mục hành chính: test không dựng `QueryClientProvider`, chốt hai hook ở danh sách rỗng. */
vi.mock('@/features/locations/hooks/use-provinces', () => ({
  useProvinceOptions: () => ({ options: [{ value: '79', label: 'TP Hồ Chí Minh' }] }),
}));
vi.mock('@/features/locations/hooks/use-wards', () => ({
  useWardOptions: () => ({ options: [] }),
}));

/**
 * `POST /tenants` và `PATCH /tenants/current/profile` ở mức API, không phải mock hook.
 *
 * Từ 17/09/2026 bước "Hồ sơ chủ xe" KHÔNG gọi API nào — gian hàng mở trong cùng lần lưu chiếc
 * xe (`useQuickVehicleRegistration`). Đếm ở đây là cách chứng minh đúng điều đó.
 */
const shopApi = vi.hoisted(() => ({
  registerShop: vi.fn(),
  updateShopProfile: vi.fn(),
}));
vi.mock('@/features/shop/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  registerShop: (...args: unknown[]) => shopApi.registerShop(...args),
  updateShopProfile: (...args: unknown[]) => shopApi.updateShopProfile(...args),
}));

/* Hộp xác thực OTP có luồng API riêng và đã được test ở feature tài khoản. */
vi.mock('@/features/account/components/ContactVerifyModal', () => ({
  ContactVerifyModal: () => null,
}));

/**
 * Chi nhánh — thay đổi được theo từng test vì bước "Địa chỉ xe" có hai hình dạng: MỘT chi nhánh
 * thì không có gì để chọn (chủ xe cá nhân tuyến hoa hồng), NHIỀU thì mới có bộ chọn.
 */
const BRANCH_1 = {
  id: 'b1',
  name: 'Chi nhánh 1',
  provinceName: 'Hồ Chí Minh',
  address: '12 Nguyễn Huệ, Phường Bến Nghé, Hồ Chí Minh',
  isDefault: true,
  vehicleCount: 0,
};
const branches = vi.hoisted(() => ({
  data: { items: [] as unknown[] },
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
vi.mock('@/features/branches/hooks/use-branches', () => ({
  useActiveBranches: () => branches,
  useBranches: () => branches,
  useCreateBranch: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateBranch: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

/** Danh mục thật đến từ API — mock trả đúng bộ của TỪNG loại, không phải một danh sách chung. */
vi.mock('@/features/catalog/use-catalog-models', async () =>
  (await import('@/features/catalog/test-catalog')).catalogModelsModuleMock(),
);
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

/*
 * Tải ảnh: `uploadImage` thật sẽ PUT lên R2. Bản giả ở đây GỌI ĐÚNG `presign` được truyền vào —
 * đó chính là chỗ wizard chèn bước mở gian hàng cho người chưa có, nên không được đi vòng qua nó.
 */
const upload = vi.hoisted(() => ({ presign: vi.fn() }));
vi.mock('@/services/upload', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  presignVehicleImage: (...args: unknown[]) => upload.presign(...args),
  uploadImage: async (file: File, presign: (f: File) => Promise<unknown>) => {
    await presign(file);
    return 'https://cdn.xeprime.test/anh-xe.jpg';
  },
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

/*
 * Gợi ý giá thị trường gọi một API công khai qua TanStack Query. Test này không dựng
 * `QueryClientProvider` (nó chỉ mock `useQueryClient`), và câu hỏi của nó là luồng wizard chứ
 * không phải khối gợi ý giá — nên chốt hook ở trạng thái "chưa có số liệu", đúng cách đã làm với
 * danh mục và ô địa chỉ.
 */
vi.mock('@/features/vehicles/hooks/use-market-price', () => ({
  useMarketPriceSuggestion: () => ({ data: undefined, isLoading: false }),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
}));

/** `POST /tenants` trả về hồ sơ gian hàng KÈM chi nhánh mặc định — xe mới gắn thẳng vào đó. */
const SHOP = {
  id: 't1',
  name: 'Chủ xe',
  defaultBranch: { id: 'b-new', name: 'Chi nhánh TP Hồ Chí Minh' },
};

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
/**
 * Khai xong bước "Hồ sơ chủ xe" của người CHƯA có gian hàng.
 *
 * Đặt `currentUser.data.tenant = null` TRƯỚC khi gọi `render()`.
 */
async function fillOwnerStep() {
  fireEvent.change(screen.getByLabelText('Tỉnh/thành'), { target: { value: '79' } });
  fireEvent.change(screen.getByLabelText('Địa chỉ'), {
    target: { value: '12 Nguyễn Huệ' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/ }));
  await screen.findByText('1. Thông tin xe');
}

async function gotoRentalStep() {
  fireEvent.change(screen.getByLabelText(/Biển số xe/), { target: { value: '51H-123.45' } });
  fireEvent.change(screen.getByLabelText(/Tên hiển thị/), {
    target: { value: 'Toyota Vios 2023' },
  });
  fireEvent.mouseDown(screen.getByLabelText(/Nguồn năng lượng|Nhiên liệu/));
  fireEvent.click(await screen.findByText('Xăng'));
  fireEvent.change(await screen.findByLabelText(/Mức tiêu thụ nhiên liệu/), {
    target: { value: '7.5' },
  });
  fireEvent.mouseDown(screen.getByLabelText(/Hộp số/));
  fireEvent.click(await screen.findByText('Số tự động (AT)'));

  fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
  await screen.findByText('2. Thiết lập cho thuê');
}

async function fillToLastStep() {
  fireEvent.change(screen.getByLabelText(/Biển số xe/), { target: { value: '51H-123.45' } });
  fireEvent.change(screen.getByLabelText(/Tên hiển thị/), {
    target: { value: 'Toyota Vios 2023' },
  });
  fireEvent.mouseDown(screen.getByLabelText(/Nguồn năng lượng|Nhiên liệu/));
  const gasoline = await screen.findByText('Xăng');
  fireEvent.click(gasoline);
  const consumption = await screen.findByLabelText(/Mức tiêu thụ nhiên liệu/);
  fireEvent.change(consumption, { target: { value: '7.5' } });
  fireEvent.mouseDown(screen.getByLabelText(/Hộp số/));
  // Nhãn hộp số nói rõ ký hiệu từ 09/09/2026 — 'Tự động' một mình không phân biệt nổi AT với
  // CVT hay tay ga của xe máy.
  fireEvent.click(await screen.findByText('Số tự động (AT)'));

  fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
  const price = await screen.findByLabelText(/Giá thuê mỗi ngày/);
  fireEvent.change(price, { target: { value: '700000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
  await screen.findByText('3. Hình ảnh xe');
}

beforeEach(() => {
  sessionStorage.clear();
  permissions.granted = new Set([PERMISSION.VEHICLE_CREATE]);
  branches.data = { items: [BRANCH_1] };
  branches.isLoading = false;
  branches.isError = false;
  branches.refetch.mockReset();
  shopApi.registerShop.mockReset();
  shopApi.registerShop.mockResolvedValue(SHOP);
  shopApi.updateShopProfile.mockReset();
  shopApi.updateShopProfile.mockResolvedValue(SHOP);
  upload.presign.mockReset();
  upload.presign.mockResolvedValue({ uploadUrl: 'https://r2.test/put', publicUrl: 'https://cdn.xeprime.test/anh-xe.jpg' });
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

  /*
   * Chưa có hồ sơ chủ xe: hỏi NGAY TẠI ĐÂY. Trước đây chỗ này đẩy sang `/manage/onboarding` —
   * rời trang, mất nháp, và hiện form đăng ký gian hàng cho người chỉ có một chiếc xe.
   */
  it('chưa có hồ sơ chủ xe: hỏi ngay trong wizard, không rời trang và không tự tạo xe', () => {
    currentUser.data = {
      id: 'u1',
      displayName: 'Chủ xe',
      tenant: null,
      phone: '0901234567',
      phoneVerified: true,
    };
    render();

    expect(screen.getByText('1. Hồ sơ chủ xe')).toBeTruthy();
    // Thanh bước có 4 mục: hồ sơ đứng trước ba bước xe.
    expect(screen.getAllByText('Hồ sơ chủ xe').length).toBeGreaterThan(0);
    expect(screen.getByText('Thông tin xe')).toBeTruthy();
    // Không còn lối nào dẫn sang form đăng ký gian hàng.
    const toOnboarding = screen
      .queryAllByRole('link')
      .filter((a) => a.getAttribute('href')?.includes('/manage/onboarding'));
    expect(toOnboarding).toHaveLength(0);
    expect(api.createVehicle).not.toHaveBeenCalled();
  });

  it('chưa xác thực SĐT: khoá nút đi tiếp cho tới khi xác thực xong', () => {
    currentUser.data = {
      id: 'u1',
      displayName: 'Chủ xe',
      tenant: null,
      phone: null,
      phoneVerified: false,
    };
    render();

    expect(screen.getByText('Tài khoản chưa có số điện thoại')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Tiếp tục/ }).hasAttribute('disabled')).toBe(true);
    expect(shopApi.registerShop).not.toHaveBeenCalled();
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

/**
 * MỘT cổng duyệt cho tuyến hoa hồng — ADR 0036.
 *
 * Bản trước của wizard rẽ hai nhánh ở nút "Lưu & gửi duyệt": gian hàng chưa `active` thì gọi
 * `submitShopReview` (gửi HỒ SƠ GIAN HÀNG), `active` rồi mới gọi `submitVehiclePublic`. Nó chạy
 * được, nhưng vẫn là hai vòng duyệt cho một người có một chiếc xe — và chủ xe phải chờ hết vòng
 * thứ nhất mới biết chiếc xe của mình có vấn đề gì không.
 *
 * Ba test dưới đây khoá ba mặt của "một cổng": gọi ĐÚNG một API, không đọc `tenant.status` để rẽ
 * nhánh, và không bao giờ nói "đã gửi duyệt" khi chưa có phiếu thật.
 */
describe('Một cổng duyệt: gửi thẳng XE', () => {
  it('bấm "Lưu & gửi duyệt" → gọi submit-public, KHÔNG gọi gửi duyệt gian hàng', async () => {
    render();
    await fillToLastStep();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu & gửi duyệt' }));

    await waitFor(() => expect(api.submitVehiclePublic).toHaveBeenCalledTimes(1));
    expect(api.submitVehiclePublic).toHaveBeenCalledWith('v1');
    expect(await screen.findByRole('heading', { name: 'Đã gửi xe đi duyệt' })).toBeTruthy();
  });

  /*
   * Gian hàng vừa mở (`tenant.status` bất kỳ) vẫn gửi THẲNG xe. Đây là chỗ luồng cũ rẽ sang gửi
   * hồ sơ gian hàng, và đọc lại `tenant.status` ở đây chính là cách cổng thứ hai lẻn trở lại.
   */
  it('gian hàng vừa mở hồ sơ: vẫn gửi XE, không rẽ sang duyệt gian hàng', async () => {
    currentUser.data = {
      id: 'u1',
      displayName: 'Chủ xe',
      tenant: { id: 't1', status: 'draft' },
    };
    render();
    await fillToLastStep();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu & gửi duyệt' }));

    await waitFor(() => expect(api.submitVehiclePublic).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('heading', { name: 'Đã gửi xe đi duyệt' })).toBeTruthy();
  });

  /*
   * Server từ chối vì xe còn thiếu điều kiện: đó là DANH SÁCH VIỆC PHẢI LÀM, không phải một lỗi
   * kỹ thuật. Màn kết quả phải liệt kê TỪNG mục bằng nhãn đã dịch (mã `PUBLISH_REQUIREMENT` →
   * `Vehicles.publish.requirements.*`), và tuyệt đối không được nói "đã gửi duyệt".
   */
  it('thiếu điều kiện: liệt kê từng mục, xe ở lại nháp, KHÔNG nói "đã gửi duyệt"', async () => {
    api.submitVehiclePublic = vi.fn(async () => {
      throw new ApiClientError({
        code: API_ERROR_CODE.VEHICLE_PUBLISH_INCOMPLETE,
        message: 'Xe còn thiếu thông tin bắt buộc nên chưa gửi duyệt được.',
        status: 400,
        details: { missing: [PUBLISH_REQUIREMENT.PHOTOS, PUBLISH_REQUIREMENT.BRANCH_LOCATION] },
      });
    });
    render();
    await fillToLastStep();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu & gửi duyệt' }));

    expect(await screen.findByRole('heading', { name: 'Xe chưa gửi duyệt được' })).toBeTruthy();
    expect(screen.getByText('Tối thiểu 4 ảnh xe')).toBeTruthy();
    expect(screen.getByText('Chi nhánh có tỉnh/thành')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Đã gửi xe đi duyệt' })).toBeNull();
    // Xe ĐÃ tồn tại — lối vào sửa phải có mặt để chủ xe bổ sung rồi gửi lại.
    expect(screen.getByRole('button', { name: 'Bổ sung ngay' })).toBeTruthy();
  });
});

/**
 * ĐỊA CHỈ XE — chỗ luồng này từng chết hẳn với tuyến hoa hồng.
 *
 * `GET /branches` khi đó nằm sau `@SubscriptionTrackOnly` ở cấp class, nên chủ xe cá nhân nhận
 * 403: bộ chọn "Chi nhánh giữ xe" rỗng, `branchId` không bao giờ có giá trị, và `POST /vehicles`
 * thì bắt buộc trường đó ⇒ không đăng nổi chiếc xe đầu tiên. Backend đã mở ba route đọc/sửa chi
 * nhánh của CHÍNH MÌNH cho cả hai tuyến; phần còn lại là hình dạng của bước này.
 */
describe('Bước 2 — địa chỉ xe', () => {
  it('một chi nhánh: KHÔNG có bộ chọn, hiện thẳng địa chỉ kèm nút sửa', async () => {
    permissions.granted = new Set([PERMISSION.VEHICLE_CREATE, PERMISSION.BRANCH_MANAGE]);
    render();
    await gotoRentalStep();

    expect(screen.getByText('12 Nguyễn Huệ, Phường Bến Nghé, Hồ Chí Minh')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sửa địa chỉ' })).toBeTruthy();
    // Một dòng thì không có gì để chọn — một ô select một lựa chọn là thao tác thừa.
    expect(screen.queryByLabelText(/Chi nhánh giữ xe/)).toBeNull();
  });

  it('không có quyền sửa chi nhánh: vẫn thấy địa chỉ, KHÔNG có nút sửa', async () => {
    permissions.granted = new Set([PERMISSION.VEHICLE_CREATE]);
    render();
    await gotoRentalStep();

    expect(screen.getByText('12 Nguyễn Huệ, Phường Bến Nghé, Hồ Chí Minh')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sửa địa chỉ' })).toBeNull();
  });

  it('nhiều chi nhánh: có bộ chọn, và địa chỉ của chi nhánh mặc định hiện ngay bên dưới', async () => {
    branches.data = {
      items: [
        BRANCH_1,
        {
          id: 'b2',
          name: 'Chi nhánh 2',
          provinceName: 'Đà Nẵng',
          address: '5 Bạch Đằng, Đà Nẵng',
          isDefault: false,
          vehicleCount: 3,
        },
      ],
    };
    render();
    await gotoRentalStep();

    expect(screen.getByLabelText(/Chi nhánh giữ xe/)).toBeTruthy();
    expect(screen.getByText('12 Nguyễn Huệ, Phường Bến Nghé, Hồ Chí Minh')).toBeTruthy();
  });

  it('tải chi nhánh hỏng: báo lỗi kèm nút thử lại NGAY TẠI CHỖ, không bắt F5 cả wizard', async () => {
    branches.data = { items: [] };
    branches.isError = true;
    render();
    await gotoRentalStep();

    expect(screen.getByText(/Không tải được danh sách chi nhánh/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(branches.refetch).toHaveBeenCalledTimes(1);
  });

  it('tài khoản chưa có chi nhánh nào: nói thẳng, không để một ô select rỗng', async () => {
    branches.data = { items: [] };
    render();
    await gotoRentalStep();

    expect(screen.getByText(/chưa có địa chỉ nhận xe/i)).toBeTruthy();
  });
});

/**
 * GIAN HÀNG CHỈ MỞ KHI CÓ MỘT CHIẾC XE THẬT — sửa 17/09/2026.
 *
 * Lỗi cũ: bước "Hồ sơ chủ xe" gọi thẳng `POST /tenants`. Điền xong màn đó rồi F5 hoặc bấm về
 * trang chủ là tài khoản ĐÃ thành chủ xe — có gian hàng, có chi nhánh mặc định, có gói hoa hồng,
 * và menu `/account` đổi hẳn sang menu chủ xe — dù chưa khai một chiếc xe nào.
 *
 * Bốn điều được khoá ở đây, và điều đầu tiên là điều quan trọng nhất.
 */
describe('Gian hàng chỉ mở cùng chiếc xe', () => {
  beforeEach(() => {
    currentUser.data = {
      id: 'u1',
      displayName: 'Chủ xe',
      tenant: null,
      phone: '0901234567',
      phoneVerified: true,
    };
  });

  it('khai xong hồ sơ rồi bỏ dở: KHÔNG có lời gọi tạo gian hàng nào', async () => {
    render();
    await fillOwnerStep();

    // Đã sang bước xe — tức là hồ sơ hợp lệ và wizard đi tiếp.
    expect(screen.getByLabelText(/Biển số xe/)).toBeTruthy();
    // …nhưng trên server vẫn chưa có gì. Đây chính là ca "back về trang chủ hoặc F5".
    expect(shopApi.registerShop).not.toHaveBeenCalled();
    expect(api.createVehicle).not.toHaveBeenCalled();
  });

  it('bước 2 hiện địa chỉ vừa khai, KHÔNG có bộ chọn chi nhánh', async () => {
    render();
    await fillOwnerStep();
    await gotoRentalStep();

    expect(screen.getByText(/12 Nguyễn Huệ/)).toBeTruthy();
    expect(screen.queryByLabelText(/Chi nhánh giữ xe/)).toBeNull();
  });

  it('lưu xe: mở gian hàng TRƯỚC, rồi gắn xe vào chi nhánh mặc định vừa sinh ra', async () => {
    render();
    await fillOwnerStep();
    await fillToLastStep();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    await waitFor(() => expect(api.createVehicle).toHaveBeenCalledTimes(1));

    expect(shopApi.registerShop).toHaveBeenCalledTimes(1);
    expect(shopApi.registerShop.mock.invocationCallOrder[0]!).toBeLessThan(
      api.createVehicle.mock.invocationCallOrder[0]!,
    );
    expect(shopApi.registerShop.mock.calls[0]![0]).toMatchObject({
      registrationTrack: REGISTRATION_TRACK.COMMISSION,
      provinceCode: '79',
      addressLine: '12 Nguyễn Huệ',
    });
    // Chi nhánh của chiếc xe đến từ `defaultBranch` của gian hàng vừa mở, không từ form.
    expect(api.createVehicle.mock.calls[0]![0]).toMatchObject({ branchId: 'b-new' });
  });

  /*
   * `/uploads/vehicle-images/presign` là tenant-scoped: không có gian hàng thì tấm ảnh đầu tiên
   * nhận 403. Gian hàng phải được mở NGAY TRƯỚC lời gọi presign đó — và chỉ khi người dùng thật
   * sự chọn một tấm ảnh, chứ không phải khi họ bấm "Tiếp tục" sang bước ảnh.
   */
  it('chọn ảnh đầu tiên: mở gian hàng ngay trước khi presign', async () => {
    render();
    await fillOwnerStep();
    await fillToLastStep();
    expect(shopApi.registerShop).not.toHaveBeenCalled();

    const input = document.querySelector('input[type="file"]');
    fireEvent.change(input!, {
      target: { files: [new File(['x'], 'anh-xe.jpg', { type: 'image/jpeg' })] },
    });

    await waitFor(() => expect(upload.presign).toHaveBeenCalledTimes(1));
    expect(shopApi.registerShop).toHaveBeenCalledTimes(1);
    expect(shopApi.registerShop.mock.invocationCallOrder[0]!).toBeLessThan(
      upload.presign.mock.invocationCallOrder[0]!,
    );
  });

  it('tạo xe hỏng rồi thử lại: KHÔNG mở gian hàng lần hai', async () => {
    let attempt = 0;
    api.createVehicle = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('network');
      return VEHICLE;
    });
    render();
    await fillOwnerStep();
    await fillToLastStep();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    await waitFor(() => expect(api.createVehicle).toHaveBeenCalledTimes(1));
    expect(shopApi.registerShop).toHaveBeenCalledTimes(1);

    // Người dùng bấm lại: gian hàng ĐÃ mở ở lần trước, gọi `POST /tenants` lần nữa là 409.
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    await waitFor(() => expect(api.createVehicle).toHaveBeenCalledTimes(2));
    expect(shopApi.registerShop).toHaveBeenCalledTimes(1);
  });
});
