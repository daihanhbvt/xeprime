import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import {
  COLLATERAL_MODE,
  PERMISSION,
  VEHICLE_TYPE,
  type Permission,
} from '@xeprime/types';
import * as authApi from '@/features/auth/api';
import { queryKeys } from '@/queries/query-keys';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import { shopPoliciesApi, type ShopRentalPolicy } from './api';
import { ShopPolicyScreen } from './ShopPolicyScreen';

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('@/features/shell/ManageHeader', () => ({ ManageHeader: () => null }));

function currentUser(permissions: Permission[]): authApi.CurrentUser {
  return {
    id: '01JQZX0000000000000000000U',
    displayName: 'Chủ shop',
    email: 'owner@xeprime.test',
    avatarUrl: null,
    phone: '0901111111',
    phoneVerified: true,
    hasPassword: true,
    tenant: {
      id: '01JQZX0000000000000000000T',
      name: 'Gian hàng Đà Nẵng',
      slug: 'da-nang',
      status: 'active',
      roleKey: 'shop_owner',
      features: [],
      planCode: null,
      planEndsAt: null,
    },
    platformRole: null,
    permissions,
  };
}

function policy(overrides: Partial<ShopRentalPolicy> = {}): ShopRentalPolicy {
  return {
    policy: {
      collateralMode: COLLATERAL_MODE.CASH,
      collateralAssetTypes: [],
      depositAmount: '3000000',
      deliveryEnabled: false,
      deliveryMaxRadiusKm: null,
      deliveryTiers: [],
      overtimeFeePerHour: '80000',
      overtimeGraceMinutes: 30,
      overtimeRoundingMinutes: 30,
      discountEnabled: false,
      discountTiers: [],
      legacyDiscountTiers: [],
      updatedAt: '2026-09-01T02:00:00.000Z',
    },
    inheritingVehicles: 7,
    overriddenVehicles: 2,
    ...overrides,
  };
}

async function renderScreen(permissions: Permission[], data: ShopRentalPolicy = policy()) {
  jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(currentUser(permissions));
  const getSpy = jest.spyOn(shopPoliciesApi, 'get').mockResolvedValue(data);
  const saveSpy = jest.spyOn(shopPoliciesApi, 'save').mockResolvedValue(data);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = await render(
    withIntl(
      <ReduxProvider store={store}>
        <QueryClientProvider client={queryClient}>
          <ShopPolicyScreen />
        </QueryClientProvider>
      </ReduxProvider>,
    ),
  );
  return { ...view, getSpy, saveSpy, queryClient };
}

beforeEach(() => jest.restoreAllMocks());

describe('ShopPolicyScreen — quyền', () => {
  it('thiếu `tenant.view`: màn thiếu quyền, KHÔNG gọi API', async () => {
    const view = await renderScreen([PERMISSION.VEHICLE_VIEW]);

    expect(await view.findByText('Không có quyền truy cập')).toBeTruthy();
    expect(view.getSpy).not.toHaveBeenCalled();
  });

  it('xem được nhưng thiếu `tenant.update`: chỉ-đọc, KHÔNG có nút lưu', async () => {
    const view = await renderScreen([PERMISSION.TENANT_VIEW]);

    expect(await view.findByText('Bạn chỉ có quyền xem chính sách thuê của gian hàng.')).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Lưu chính sách' })).toBeNull();
  });
});

describe('ShopPolicyScreen — chính sách theo LOẠI XE', () => {
  it('mở màn: hỏi chính sách của Ô TÔ trước', async () => {
    const view = await renderScreen([PERMISSION.TENANT_VIEW]);

    await waitFor(() => expect(view.getSpy).toHaveBeenCalledWith(VEHICLE_TYPE.CAR));
  });

  it('đổi sang Xe máy: hỏi ĐÚNG bộ của loại đó, không dùng lại bộ ô tô', async () => {
    const view = await renderScreen([PERMISSION.TENANT_VIEW]);
    await view.findByLabelText('Số tiền cọc mặc định');

    await fireEvent.press(view.getByText('Xe máy'));

    await waitFor(() => expect(view.getSpy).toHaveBeenCalledWith(VEHICLE_TYPE.MOTORBIKE));
  });

  it('hiện phạm vi áp dụng từ SERVER: xe kế thừa và xe ghi đè riêng', async () => {
    const view = await renderScreen([PERMISSION.TENANT_VIEW]);

    expect(await view.findByText('Đã áp dụng cho 7 ô tô')).toBeTruthy();
    expect(
      view.getByText('2 xe đang dùng chính sách riêng nên không kế thừa bộ chính sách mặc định này.'),
    ).toBeTruthy();
  });

  it('gian hàng CHƯA cấu hình: nói ra hệ quả thay vì hiện form trống im lặng', async () => {
    const view = await renderScreen([PERMISSION.TENANT_VIEW], policy({ policy: null }));

    expect(await view.findByText('Gian hàng chưa cấu hình chính sách thuê')).toBeTruthy();
  });
});

describe('ShopPolicyScreen — lưu', () => {
  const editor: Permission[] = [PERMISSION.TENANT_VIEW, PERMISSION.TENANT_UPDATE];

  it('chưa sửa gì: nút Lưu bị khoá', async () => {
    const view = await renderScreen(editor);

    const save = await view.findByRole('button', { name: 'Lưu chính sách' });
    expect(save.props.accessibilityState?.disabled).toBe(true);
  });

  it('sửa rồi lưu: XÁC NHẬN trước, và câu xác nhận nêu đúng số xe bị ảnh hưởng', async () => {
    const view = await renderScreen(editor);

    await fireEvent.changeText(await view.findByLabelText('Số tiền cọc mặc định'), '5000000');
    await fireEvent.press(view.getByRole('button', { name: 'Lưu chính sách' }));

    expect(await view.findByText('Xác nhận thay đổi chính sách thuê?')).toBeTruthy();
    expect(view.getByText(/7 xe đang kế thừa/)).toBeTruthy();
    expect(view.saveSpy).not.toHaveBeenCalled();

    await fireEvent.press(view.getByRole('button', { name: 'Xác nhận thay đổi' }));

    await waitFor(() => expect(view.saveSpy).toHaveBeenCalled());
    // Tiền đi trên dây là CHUỖI (ADR 0007), và `vehicleType` là tham số đầu.
    expect(view.saveSpy.mock.calls[0]?.[0]).toBe(VEHICLE_TYPE.CAR);
    expect(view.saveSpy.mock.calls[0]?.[1]).toMatchObject({ depositAmount: '5000000' });
  });

  it('cọc tiền = 0 bị chặn ở client, KHÔNG gọi API', async () => {
    const view = await renderScreen(editor);

    await fireEvent.changeText(await view.findByLabelText('Số tiền cọc mặc định'), '0');
    await fireEvent.press(view.getByRole('button', { name: 'Lưu chính sách' }));

    await waitFor(() =>
      expect(view.getByText('Chọn "Cọc tiền" thì số tiền cọc phải lớn hơn 0')).toBeTruthy(),
    );
    expect(view.saveSpy).not.toHaveBeenCalled();
  });

  it('lưu xong: làm mới nhánh xe để màn Giá & chính sách của từng xe không đọc bản cũ', async () => {
    const view = await renderScreen(editor);
    const invalidate = jest.spyOn(view.queryClient, 'invalidateQueries');

    await fireEvent.changeText(await view.findByLabelText('Số tiền cọc mặc định'), '5000000');
    await fireEvent.press(view.getByRole('button', { name: 'Lưu chính sách' }));
    await fireEvent.press(await view.findByRole('button', { name: 'Xác nhận thay đổi' }));

    await waitFor(() => expect(view.saveSpy).toHaveBeenCalled());
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.vehicles.all }),
    );
  });
});

describe('ShopPolicyScreen — mốc ưu đãi CŨ theo ngày', () => {
  it('nói ra và KHÔNG tự quy đổi — quy đổi ngầm là đổi giá bán sau lưng chủ xe', async () => {
    const data = policy();
    const view = await renderScreen([PERMISSION.TENANT_VIEW, PERMISSION.TENANT_UPDATE], {
      ...data,
      policy: {
        ...data.policy!,
        discountEnabled: true,
        legacyDiscountTiers: [{ minDays: 90, percent: 5, legacy: true }],
      },
    });

    expect(await view.findByText(/1 mốc ưu đãi cũ/)).toBeTruthy();
    expect(view.getByText(/từ 90 ngày giảm 5%/)).toBeTruthy();
  });
});
