import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { TENANT_ROLE } from '@xeprime/types';
import { queryKeys } from '@/queries/query-keys';
import * as authApi from '@/features/auth/api';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import { accountApi, type UserProfile } from './api';
import { ManageAccountScreen } from './ManageAccountScreen';

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
  usePathname: () => '/manage/account',
}));

/** Thanh trên của khu quản lý kéo theo cả drawer, chuông và badge chat — không thuộc màn này. */
jest.mock('@/features/shell/ManageHeader', () => ({ ManageHeader: () => null }));

/** Thẻ chuyển tiếp đọc danh sách chuyến vai `renter`; màn này không nói về chuyến. */
jest.mock('./../trips/hooks/use-trips', () => ({ useTripsInfinite: () => ({ data: undefined }) }));

const PROFILE: UserProfile = {
  id: '01JQZX0000000000000000000U',
  displayName: 'Nguyễn Văn An',
  email: 'an@xeprime.test',
  phone: '0901234567',
  avatarUrl: null,
  phoneVerified: true,
  emailVerified: true,
};

const SESSION: authApi.CurrentUser = {
  id: PROFILE.id,
  displayName: PROFILE.displayName,
  email: PROFILE.email,
  avatarUrl: null,
  phone: PROFILE.phone,
  phoneVerified: true,
  hasPassword: true,
  tenant: {
    id: '01JQZX0000000000000000000T',
    name: 'Việt Car Hà Nội',
    slug: 'viet-car',
    status: 'active',
    onboardingState: 'commission',
    logoUrl: null,
    roleKey: TENANT_ROLE.SHOP_OWNER,
    features: [],
    planCode: 'shop_standard',
    planName: 'Gói Gian hàng tiêu chuẩn',
    serviceFeePercent: null,
    billingMode: 'package',
    planEndsAt: null,
    billingPhase: 'current',
    graceEndsAt: null,
    publicVehicleCount: 1,
  } as NonNullable<authApi.CurrentUser['tenant']>,
  openRenterTripCount: 0,
  platformRole: null,
  permissions: [],
};

async function renderScreen(profile: UserProfile = PROFILE) {
  jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(SESSION);
  const meSpy = jest.spyOn(accountApi, 'me').mockResolvedValue(profile);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const ui: ReactElement = withIntl(
    <ReduxProvider store={store}>
      <QueryClientProvider client={queryClient}>
        <ManageAccountScreen />
      </QueryClientProvider>
    </ReduxProvider>,
  );
  const view = await render(ui);
  return { ...view, queryClient, meSpy };
}

/** Mốc neo "thẻ hồ sơ đã hiện" — mô tả của khối SỬA, thứ chỉ màn này có. */
const PROFILE_CARD_TEXT = 'Cập nhật tên hiển thị và ảnh đại diện của bạn.';

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
});

/**
 * "Tài khoản & bảo mật" (ADR 0038 điều 7) — nơi DUY NHẤT sửa hồ sơ con người (chốt 16/09/2026).
 *
 * Bộ test dưới đây trước ở `AccountScreen.test.tsx`: chúng theo chân chế độ sửa khi nó chuyển
 * sang màn này, chứ không phải viết mới — luật không đổi, chỉ đổi chỗ đứng.
 */
describe('ManageAccountScreen — hồ sơ con người', () => {
  it('đọc hồ sơ từ `GET /users/me` — chỉ ở đó mới có SĐT và tình trạng xác thực', async () => {
    const view = await renderScreen();

    expect(await view.findByText(PROFILE_CARD_TEXT)).toBeTruthy();
    expect(view.meSpy).toHaveBeenCalledTimes(1);
    expect(view.getByText('an@xeprime.test')).toBeTruthy();
    expect(view.getByText('0901234567')).toBeTruthy();
  });

  it('đã có email/SĐT: mỗi dòng có nút "Đổi" của riêng nó', async () => {
    const view = await renderScreen();
    await view.findByText(PROFILE_CARD_TEXT);
    // Khớp CHÍNH XÁC: dòng "Đổi mật khẩu" bên dưới cũng mang nhãn bắt đầu bằng "Đổi".
    expect(view.getAllByRole('button', { name: 'Đổi' })).toHaveLength(2);
  });

  it('còn trống: nút đổi thành "Thêm" — cùng một luồng, khác chữ theo việc', async () => {
    const view = await renderScreen({ ...PROFILE, email: null, phone: null });
    await view.findByText(PROFILE_CARD_TEXT);
    expect(view.getAllByRole('button', { name: 'Thêm' })).toHaveLength(2);
  });

  it('luôn giải thích vì sao đổi email/SĐT lại cần một mã', async () => {
    const view = await renderScreen();
    await view.findByText(PROFILE_CARD_TEXT);
    expect(view.getByText('Thông tin đăng nhập')).toBeTruthy();
    expect(view.getByText(/cần một mã 6 số/)).toBeTruthy();
  });

  it('lỗi tải hồ sơ: hiện lỗi có nút thử lại, không hiện form rỗng', async () => {
    jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(SESSION);
    jest.spyOn(accountApi, 'me').mockRejectedValue(new Error('boom'));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = await render(
      withIntl(
        <ReduxProvider store={store}>
          <QueryClientProvider client={queryClient}>
            <ManageAccountScreen />
          </QueryClientProvider>
        </ReduxProvider>,
      ),
    );

    expect(await view.findByRole('button', { name: 'Thử lại' })).toBeTruthy();
    expect(view.queryByText(PROFILE_CARD_TEXT)).toBeNull();
  });
});

describe('ManageAccountScreen — chỉnh sửa hồ sơ', () => {
  it('mở chế độ sửa thì hiện ĐÚNG hai trường backend nhận', async () => {
    const view = await renderScreen();
    await view.findByText(PROFILE_CARD_TEXT);

    await fireEvent.press(view.getByRole('button', { name: new RegExp('Chỉnh sửa hồ sơ$') }));

    expect(await view.findByText(/Họ tên hiển thị/)).toBeTruthy();
    // Ảnh đại diện nay là ô TẢI ẢNH (presign → R2), không còn ô dán URL.
    expect(view.getByText(/Ảnh đại diện/)).toBeTruthy();
  });

  it('huỷ chỉnh sửa TRẢ LẠI dữ liệu gốc, không giữ thứ vừa gõ dở', async () => {
    const view = await renderScreen();
    await view.findByText(PROFILE_CARD_TEXT);
    await fireEvent.press(view.getByRole('button', { name: new RegExp('Chỉnh sửa hồ sơ$') }));

    await fireEvent.changeText(await view.findByDisplayValue('Nguyễn Văn An'), 'Tên gõ dở');
    await fireEvent.press(view.getByRole('button', { name: 'Huỷ' }));

    await waitFor(() => expect(view.queryByText(/Họ tên hiển thị/)).toBeNull());
    expect(view.getAllByText('Nguyễn Văn An').length).toBeGreaterThan(0);
    expect(view.queryByText('Tên gõ dở')).toBeNull();
  });

  it('tên rỗng bị chặn NGAY ở client — không gửi request', async () => {
    const update = jest.spyOn(accountApi, 'updateMe');
    const view = await renderScreen();
    await view.findByText(PROFILE_CARD_TEXT);
    await fireEvent.press(view.getByRole('button', { name: new RegExp('Chỉnh sửa hồ sơ$') }));

    await fireEvent.changeText(await view.findByDisplayValue('Nguyễn Văn An'), '   ');
    await fireEvent.press(view.getByRole('button', { name: new RegExp('Lưu thay đổi$') }));

    expect(await view.findByText('Vui lòng nhập họ tên')).toBeTruthy();
    expect(update).not.toHaveBeenCalled();
  });

  it('lưu xong: cập nhật cache hồ sơ VÀ làm mới `auth.me` để header đổi ngay', async () => {
    const saved: UserProfile = { ...PROFILE, displayName: 'Nguyễn Văn Bình' };
    const update = jest.spyOn(accountApi, 'updateMe').mockResolvedValue(saved);

    const view = await renderScreen();
    await view.findByText(PROFILE_CARD_TEXT);
    const invalidate = jest.spyOn(view.queryClient, 'invalidateQueries');

    await fireEvent.press(view.getByRole('button', { name: new RegExp('Chỉnh sửa hồ sơ$') }));
    await fireEvent.changeText(await view.findByDisplayValue('Nguyễn Văn An'), 'Nguyễn Văn Bình');
    await fireEvent.press(view.getByRole('button', { name: new RegExp('Lưu thay đổi$') }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        displayName: 'Nguyễn Văn Bình',
        // `null` chứ không phải vắng mặt: `undefined` nghĩa là "không đụng tới", nên nút gỡ ảnh
        // sẽ im lặng không làm gì.
        avatarUrl: null,
      }),
    );

    // Hai vế BẮT BUỘC: thiếu vế thứ hai thì header vẫn hiện tên cũ tới lần mở app sau.
    await waitFor(() =>
      expect(view.queryClient.getQueryData(queryKeys.account.profile())).toEqual(saved),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.auth.all });
  });
});

/**
 * Hai LỐI ĐI còn lại của màn. Chúng là dòng dẫn sang màn đã có, không phải bản sao thứ hai của
 * biểu mẫu đổi mật khẩu / xoá tài khoản — xem docblock của màn.
 */
describe('ManageAccountScreen — lối đi bảo mật', () => {
  it('mở đúng màn đổi mật khẩu và màn yêu cầu xoá tài khoản', async () => {
    const view = await renderScreen();
    await view.findByText(PROFILE_CARD_TEXT);

    await fireEvent.press(view.getByRole('menuitem', { name: 'Đổi mật khẩu' }));
    expect(mockPush).toHaveBeenCalledWith('/account/change-password');

    await fireEvent.press(view.getByRole('menuitem', { name: 'Yêu cầu xoá tài khoản' }));
    expect(mockPush).toHaveBeenCalledWith('/account/delete-account');
  });
});
