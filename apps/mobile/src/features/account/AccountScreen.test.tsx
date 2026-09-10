import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { queryKeys } from '@/queries/query-keys';
import * as authApi from '@/features/auth/api';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import { accountApi, type UserProfile } from './api';
import { AccountScreen } from './AccountScreen';

jest.mock('expo-router', () => ({
  // `useNavigateOnce` cần `useNavigation().isFocused()` — thiếu nó là màn nổ giữa lúc render.
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

const PROFILE: UserProfile = {
  id: '01JQZX0000000000000000000U',
  displayName: 'Nguyễn Văn An',
  email: 'an@xeprime.test',
  phone: '0901234567',
  avatarUrl: null,
  phoneVerified: true,
};

const SESSION: authApi.CurrentUser = {
  id: PROFILE.id,
  displayName: PROFILE.displayName,
  email: PROFILE.email,
  avatarUrl: null,
  phone: PROFILE.phone,
  phoneVerified: true,
  hasPassword: true,
  tenant: null,
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
        <AccountScreen />
      </QueryClientProvider>
    </ReduxProvider>,
  );
  // RNTL v14: `render` là async — spread thẳng cái Promise thì `view.findByText` không tồn tại.
  const view = await render(ui);
  return { ...view, queryClient, meSpy };
}

/**
 * CUS-04 — hồ sơ tài khoản của khách.
 *
 * Trước đợt này màn chỉ đọc `/auth/me` và hiện avatar + tên. Bộ test dưới khoá lại phần đã bổ
 * sung: nguồn dữ liệu RIÊNG (`/users/me`), chế độ sửa, khoá hai trường nhận diện, và việc lưu
 * xong phải đồng bộ CẢ HAI cache.
 */
/**
 * Mốc neo "thẻ hồ sơ đã hiện" — dùng MÔ TẢ của thẻ.
 *
 * KHÔNG dùng `Account.profile.title`: màn không render khoá đó (tiêu đề trên thẻ là
 * `profile.eyebrow` viết hoa). Test cũ neo vào nó nên đỏ mà không phải vì màn sai.
 */
const PROFILE_CARD_TEXT = 'Cập nhật tên hiển thị và ảnh đại diện của bạn.';

describe('AccountScreen — hồ sơ (CUS-04)', () => {
  it('đọc hồ sơ từ `GET /users/me`, KHÔNG lấy từ `/auth/me`', async () => {
    const view = await renderScreen();

    expect(await view.findByText(PROFILE_CARD_TEXT)).toBeTruthy();
    expect(view.meSpy).toHaveBeenCalledTimes(1);
  });

  it('hiện email + SĐT ở chế độ CHỈ ĐỌC kèm huy hiệu đã xác thực', async () => {
    const view = await renderScreen();
    await view.findByText(PROFILE_CARD_TEXT);

    expect(view.getByText('an@xeprime.test')).toBeTruthy();
    expect(view.getByText('0901234567')).toBeTruthy();
    expect(view.getByText('Đã xác thực')).toBeTruthy();
    // Hai trường nhận diện KHÔNG có ô nhập khi chưa bấm "Chỉnh sửa hồ sơ".
    expect(view.queryByText(/Họ tên hiển thị/)).toBeNull();
  });

  it('SĐT chưa xác thực: huy hiệu đổi sang "Chưa xác thực"', async () => {
    const view = await renderScreen({ ...PROFILE, phoneVerified: false });
    await view.findByText(PROFILE_CARD_TEXT);
    expect(view.getByText('Chưa xác thực')).toBeTruthy();
  });

  it('không có email/SĐT: nói rõ chưa có, không để ô trống', async () => {
    const view = await renderScreen({ ...PROFILE, email: null, phone: null });
    await view.findByText(PROFILE_CARD_TEXT);

    expect(view.getByText('Chưa có email')).toBeTruthy();
    expect(view.getByText('Chưa có số điện thoại')).toBeTruthy();
    // Không có SĐT thì cũng không có huy hiệu xác thực để hiện.
    expect(view.queryByText('Đã xác thực')).toBeNull();
  });

  it('luôn giải thích vì sao email và SĐT không sửa được ở đây', async () => {
    const view = await renderScreen();
    await view.findByText(PROFILE_CARD_TEXT);
    expect(view.getByText('Thông tin đăng nhập')).toBeTruthy();
  });

  it('lỗi tải hồ sơ: hiện lỗi có nút thử lại, không hiện form rỗng', async () => {
    jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(SESSION);
    jest.spyOn(accountApi, 'me').mockRejectedValue(new Error('boom'));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = await render(
      withIntl(
        <ReduxProvider store={store}>
          <QueryClientProvider client={queryClient}>
            <AccountScreen />
          </QueryClientProvider>
        </ReduxProvider>,
      ),
    );

    expect(await view.findByRole('button', { name: 'Thử lại' })).toBeTruthy();
    expect(view.queryByText(PROFILE_CARD_TEXT)).toBeNull();
  });
});

describe('AccountScreen — chỉnh sửa hồ sơ', () => {
  it('mở chế độ sửa thì hiện ĐÚNG hai trường backend nhận', async () => {
    const view = await renderScreen();
    await view.findByText(PROFILE_CARD_TEXT);

    await fireEvent.press(view.getByRole('button', { name: new RegExp('Chỉnh sửa hồ sơ$') }));

    expect(await view.findByText(/Họ tên hiển thị/)).toBeTruthy();
    expect(view.getByText(/Ảnh đại diện/)).toBeTruthy();
  });

  it('huỷ chỉnh sửa TRẢ LẠI dữ liệu gốc, không giữ thứ vừa gõ dở', async () => {
    const view = await renderScreen();
    await view.findByText(PROFILE_CARD_TEXT);
    await fireEvent.press(view.getByRole('button', { name: new RegExp('Chỉnh sửa hồ sơ$') }));

    await fireEvent.changeText(await view.findByDisplayValue('Nguyễn Văn An'), 'Tên gõ dở');
    await fireEvent.press(view.getByRole('button', { name: 'Huỷ' }));

    // Form đóng lại và tên hiển thị quay về giá trị của server.
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

    await waitFor(() => expect(update).toHaveBeenCalledWith({ displayName: 'Nguyễn Văn Bình' }));

    // Hai vế BẮT BUỘC: thiếu vế thứ hai thì header vẫn hiện tên cũ tới lần mở app sau.
    await waitFor(() =>
      expect(view.queryClient.getQueryData(queryKeys.account.profile())).toEqual(saved),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.auth.all });
  });
});
