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
import { AccountScreen } from './AccountScreen';

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  // `useNavigateOnce` cần `useNavigation().isFocused()` — thiếu nó là màn nổ giữa lúc render.
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
  // Menu tài khoản đánh dấu mục đang mở theo đường dẫn — màn này LÀ `/account`.
  usePathname: () => '/account',
}));

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
  tenant: null,
  platformRole: null,
  permissions: [],
};

const TENANT: NonNullable<authApi.CurrentUser['tenant']> = {
  id: '01JQZX0000000000000000000T',
  name: 'Việt Car Hà Nội',
  slug: 'viet-car',
  status: 'active',
  roleKey: TENANT_ROLE.SHOP_OWNER,
  features: [],
  planCode: null,
  planEndsAt: null,
} as NonNullable<authApi.CurrentUser['tenant']>;

async function renderScreen(
  profile: UserProfile = PROFILE,
  session: Partial<authApi.CurrentUser> = {},
) {
  jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue({ ...SESSION, ...session });
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
 * KHÔNG dùng `Account.profile.title`: chuỗi đó là mốc của phép thử THỨ TỰ KHỐI bên dưới, và
 * nó chỉ hiện khi không ở chế độ sửa — neo mọi test vào nó thì mở form là cả bộ đỏ theo.
 */
const PROFILE_CARD_TEXT = 'Cập nhật tên hiển thị và ảnh đại diện của bạn.';

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
});

describe('AccountScreen — hồ sơ (CUS-04)', () => {
  it('đọc hồ sơ từ `GET /users/me`, KHÔNG lấy từ `/auth/me`', async () => {
    const view = await renderScreen();

    expect(await view.findByText(PROFILE_CARD_TEXT)).toBeTruthy();
    expect(view.meSpy).toHaveBeenCalledTimes(1);
  });

  it('hiện email + SĐT kèm dấu đã xác thực, và KHÔNG đưa chúng vào form hồ sơ', async () => {
    const view = await renderScreen();
    await view.findByText(PROFILE_CARD_TEXT);

    expect(view.getByText('an@xeprime.test')).toBeTruthy();
    expect(view.getByText('0901234567')).toBeTruthy();
    // Đã xác thực = dấu tích tròn; trình đọc màn hình nghe thấy nó qua nhãn khả truy cập.
    expect(view.getAllByLabelText('Đã xác thực')).toHaveLength(2);
    // Hai trường nhận diện KHÔNG có ô nhập khi chưa bấm "Chỉnh sửa hồ sơ".
    expect(view.queryByText(/Họ tên hiển thị/)).toBeNull();
  });

  /**
   * Đổi email/SĐT đi đường RIÊNG (mã 6 số tới địa chỉ mới), không nằm trong nút "Lưu thay đổi" —
   * nên mỗi dòng phải có lối vào của chính nó, và chữ đổi theo việc: Thêm khi trống, Đổi khi đã có.
   */
  it('đã có email/SĐT: mỗi dòng có nút "Đổi" của riêng nó', async () => {
    const view = await renderScreen();
    await view.findByText(PROFILE_CARD_TEXT);
    // Khớp CHÍNH XÁC: mục "Đổi mật khẩu" trong menu cũng mang nhãn bắt đầu bằng "Đổi".
    expect(view.getAllByRole('button', { name: 'Đổi' })).toHaveLength(2);
  });

  it('còn trống: nút đổi thành "Thêm" — cùng một luồng, khác chữ theo việc', async () => {
    const view = await renderScreen({ ...PROFILE, email: null, phone: null });
    await view.findByText(PROFILE_CARD_TEXT);
    expect(view.getAllByRole('button', { name: 'Thêm' })).toHaveLength(2);
  });

  it('chưa xác thực: hiện CHỮ "Chưa xác thực", không phải một dấu tích im lặng', async () => {
    const view = await renderScreen({ ...PROFILE, phoneVerified: false, emailVerified: false });
    await view.findByText(PROFILE_CARD_TEXT);
    expect(view.getAllByText('Chưa xác thực')).toHaveLength(2);
    expect(view.queryByLabelText('Đã xác thực')).toBeNull();
  });

  it('không có email/SĐT: nói rõ chưa có, không để ô trống', async () => {
    const view = await renderScreen({ ...PROFILE, email: null, phone: null });
    await view.findByText(PROFILE_CARD_TEXT);

    expect(view.getByText('Chưa có email')).toBeTruthy();
    expect(view.getByText('Chưa có số điện thoại')).toBeTruthy();
    // Không có giá trị thì cũng không có dấu xác thực nào để hiện.
    expect(view.queryByLabelText('Đã xác thực')).toBeNull();
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
    // Ảnh đại diện nay là ô TẢI ẢNH (presign → R2), không còn ô dán URL.
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
 * Menu tài khoản trên màn — bản "đã render" của những gì `account-nav.test.ts` khoá ở mức dữ liệu.
 *
 * Ở đây kiểm đúng ba thứ chỉ thấy được khi màn chạy thật: menu đứng NGAY SAU thẻ hồ sơ, phân nhóm
 * hiện ra thành tiêu đề đọc được, và Đăng xuất nằm TRONG menu chứ không còn là một nút rời.
 */
describe('AccountScreen — điều hướng tài khoản', () => {
  it('menu nằm NGAY SAU thẻ hồ sơ, không phải khối đầu màn', async () => {
    const view = await renderScreen();
    await view.findByText(PROFILE_CARD_TEXT);

    const order = view
      .getAllByText(/^(Tài khoản của tôi|Thông tin tài khoản)$/)
      .map((node) => node.props.children);
    /*
     * Thẻ HỒ SƠ mở đầu màn; menu đứng sau nó. Người mở tab Tài khoản muốn thấy mình là ai
     * trước, rồi mới tới danh sách lối đi — thứ tự do người dùng chốt ngày 15/09/2026.
     */
    expect(order[0]).toBe('Thông tin tài khoản');
    expect(order).toContain('Tài khoản của tôi');
  });

  it('khách chưa có gian hàng: đúng 5 mục, có "Trở thành chủ xe", không có mục chủ xe', async () => {
    const view = await renderScreen();
    await view.findByText(PROFILE_CARD_TEXT);

    for (const label of [
      'Tài khoản của tôi',
      'Trở thành chủ xe',
      'Chuyến của tôi',
      'Đổi mật khẩu',
      'Yêu cầu xoá tài khoản',
    ]) {
      expect(view.getAllByRole('menuitem', { name: label }).length).toBeGreaterThan(0);
    }
    expect(view.queryByRole('menuitem', { name: 'Danh sách xe' })).toBeNull();
    expect(view.queryByRole('menuitem', { name: 'Lịch xe' })).toBeNull();
    // Không có nhóm thứ hai ⇒ không có tiêu đề nhóm.
    expect(view.queryByText('TÀI KHOẢN')).toBeNull();
  });

  it('chủ gian hàng: 7 mục chủ xe đúng thứ tự, rồi nhóm "TÀI KHOẢN" tách bằng tiêu đề', async () => {
    const view = await renderScreen(PROFILE, { tenant: TENANT });
    await view.findByText(PROFILE_CARD_TEXT);

    for (const label of [
      'Danh sách xe',
      'Lịch xe',
      'Cẩm nang cho thuê xe',
      'Chuyến của tôi',
      'Thông tin khai thuế',
      'Hợp đồng & Chứng từ',
      'Chính sách bảo vệ dữ liệu',
    ]) {
      expect(view.getAllByRole('menuitem', { name: label }).length).toBeGreaterThan(0);
    }
    // Đường phân cách phải ĐỌC RA được, không chỉ là một nét kẻ.
    expect(view.getByText('TÀI KHOẢN')).toBeTruthy();
    // Chủ xe KHÔNG được mời "trở thành chủ xe" lần nữa.
    expect(view.queryByRole('menuitem', { name: 'Trở thành chủ xe' })).toBeNull();
  });

  it('nhân viên gian hàng KHÔNG nhận menu chủ xe, CTA của họ là "Quản lý gian hàng"', async () => {
    const view = await renderScreen(PROFILE, {
      tenant: { ...TENANT, roleKey: TENANT_ROLE.SHOP_STAFF },
    });
    await view.findByText(PROFILE_CARD_TEXT);

    expect(view.queryByRole('menuitem', { name: 'Danh sách xe' })).toBeNull();
    expect(view.getAllByRole('menuitem', { name: 'Quản lý gian hàng' }).length).toBeGreaterThan(0);
  });

  it('mục đang mở (/account) được đánh dấu chọn và không điều hướng lại chính nó', async () => {
    const view = await renderScreen();
    await view.findByText(PROFILE_CARD_TEXT);

    const profileItem = view.getAllByRole('menuitem', { name: 'Tài khoản của tôi' })[0]!;
    expect(profileItem.props.accessibilityState?.selected).toBe(true);

    await fireEvent.press(profileItem);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  /**
   * "Lịch xe" và "Danh sách xe" mở màn của CHÍNH khu tài khoản — không đổi khu, nên thanh tab
   * khách ở dưới chân màn hình đứng yên và nút lui trả về đúng menu này.
   */
  it('chủ xe bấm "Lịch xe": mở lịch trong khu tài khoản, KHÔNG đổi khu', async () => {
    const view = await renderScreen(PROFILE, { tenant: TENANT });
    await view.findByText(PROFILE_CARD_TEXT);

    await fireEvent.press(view.getAllByRole('menuitem', { name: 'Lịch xe' })[0]!);
    expect(mockPush).toHaveBeenCalledWith('/account/calendar');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('chủ xe bấm "Danh sách xe": mở danh sách xe của khu tài khoản', async () => {
    const view = await renderScreen(PROFILE, { tenant: TENANT });
    await view.findByText(PROFILE_CARD_TEXT);

    await fireEvent.press(view.getAllByRole('menuitem', { name: 'Danh sách xe' })[0]!);
    expect(mockPush).toHaveBeenCalledWith('/account/vehicles');
  });

  it('mục "Đổi mật khẩu" mở đúng màn, không phải một chỗ trống', async () => {
    const view = await renderScreen();
    await view.findByText(PROFILE_CARD_TEXT);

    await fireEvent.press(view.getAllByRole('menuitem', { name: 'Đổi mật khẩu' })[0]!);
    expect(mockPush).toHaveBeenCalledWith('/account/change-password');
  });

  /**
   * Mục MENU và nút trên THẺ là hai luồng khác nhau, đúng như web: menu dừng ở landing công khai,
   * thẻ vào thẳng form đăng ký gian hàng. Gộp chúng lại là mất bước "đọc trước khi khai".
   */
  it('mục "Trở thành chủ xe" dừng ở landing, không ném thẳng vào form đăng ký', async () => {
    const view = await renderScreen();
    await view.findByText(PROFILE_CARD_TEXT);

    await fireEvent.press(view.getAllByRole('menuitem', { name: 'Trở thành chủ xe' })[0]!);
    expect(mockPush).toHaveBeenCalledWith('/list-your-vehicle');
  });

  it('Đăng xuất nằm TRONG menu và hỏi lại trước khi làm', async () => {
    const view = await renderScreen();
    await view.findByText(PROFILE_CARD_TEXT);

    await fireEvent.press(view.getAllByRole('menuitem', { name: 'Đăng xuất' })[0]!);
    expect(await view.findByText('Bạn sẽ cần đăng nhập lại trên thiết bị này.')).toBeTruthy();
  });
});

/**
 * Thẻ cửa vào gian hàng — ba trạng thái của web, đọc từ vai THỰC TẾ của phiên.
 *
 * Trạng thái quan trọng nhất là lúc ĐANG TẢI: mời một chủ shop "đăng xe cho thuê" vì `/auth/me`
 * chưa về là mời họ làm lại thứ họ đã làm rồi.
 */
describe('AccountScreen — thẻ gian hàng', () => {
  it('chưa có gian hàng: mời đăng xe, nút "Bắt đầu" dẫn tới form đăng ký', async () => {
    const view = await renderScreen();
    await view.findByText(PROFILE_CARD_TEXT);

    expect(view.getByText('Đăng xe cho thuê')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: new RegExp('Bắt đầu$') }));
    expect(mockPush).toHaveBeenCalledWith('/manage/onboarding');
  });

  it('đã có gian hàng: hiện TÊN gian hàng thật, không phải nhãn chung', async () => {
    const view = await renderScreen(PROFILE, { tenant: TENANT });
    await view.findByText(PROFILE_CARD_TEXT);

    expect(view.getByText('Việt Car Hà Nội')).toBeTruthy();
    expect(view.queryByText('Đăng xe cho thuê')).toBeNull();
    const cta = view.getByRole('button', { name: /Vào quản lý gian hàng/ });
    expect(cta).toBeTruthy();

    // Nút trên thẻ và mục "Trở thành chủ xe" trong menu là HAI luồng khác nhau bên web — nút
    // này luôn dẫn vào cổng quản lý của người đã có gian hàng.
    await fireEvent.press(cta);
    expect(mockReplace).toHaveBeenCalledWith('/manage');
  });

  it('tài khoản nền tảng: "Quản trị nền tảng" thắng cả vai gian hàng', async () => {
    const view = await renderScreen(PROFILE, {
      tenant: TENANT,
      platformRole: 'platform_admin',
    } as Partial<authApi.CurrentUser>);
    await view.findByText(PROFILE_CARD_TEXT);

    expect(view.getByText('Quản trị nền tảng')).toBeTruthy();
    expect(view.queryByText('Việt Car Hà Nội')).toBeNull();
  });
});
