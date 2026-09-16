import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { fireEvent, render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { TENANT_ROLE } from '@xeprime/types';
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
  openRenterTripCount: 0,
  platformRole: null,
  permissions: [],
};

const TENANT: NonNullable<authApi.CurrentUser['tenant']> = {
  id: '01JQZX0000000000000000000T',
  name: 'Việt Car Hà Nội',
  slug: 'viet-car',
  status: 'active',
  onboardingState: 'commission',
  logoUrl: null,
  roleKey: TENANT_ROLE.SHOP_OWNER,
  features: [],
  planCode: null,
  planName: null,
  serviceFeePercent: null,
  billingMode: 'commission',
  planEndsAt: null,
  billingPhase: 'current',
  graceEndsAt: null,
  publicVehicleCount: 1,
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
 * Mốc neo "thẻ hồ sơ đã hiện" — tiêu đề khối THÔNG TIN ĐĂNG NHẬP.
 *
 * Nó là thứ duy nhất của thẻ luôn có mặt ở bản chỉ xem: tên và ảnh thì mỗi hồ sơ một khác, còn
 * khối sửa đã chuyển hẳn sang `/manage/account` (chốt 16/09/2026).
 */
const PROFILE_CARD_TEXT = 'Thông tin đăng nhập';

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
    // Màn này không có ô nhập nào — hồ sơ chỉ đọc.
    expect(view.queryByText(/Họ tên hiển thị/)).toBeNull();
  });

  /**
   * SỬA Ở ĐÂU đi theo TUYẾN (người dùng chốt 16/09/2026): chủ xe tuyến hoa hồng và khách thuê
   * không có khu quản lý nào để vào, nên đây là chỗ DUY NHẤT họ sửa được hồ sơ của mình.
   */
  it('chủ xe / khách thuê: sửa được ngay tại đây', async () => {
    const view = await renderScreen();
    await view.findByText(PROFILE_CARD_TEXT);

    expect(view.getByRole('button', { name: new RegExp('Chỉnh sửa hồ sơ$') })).toBeTruthy();
    // Khớp CHÍNH XÁC: mục "Đổi mật khẩu" trong menu cũng mang nhãn bắt đầu bằng "Đổi".
    expect(view.getAllByRole('button', { name: 'Đổi' })).toHaveLength(2);
  });

  /**
   * Gian hàng TUYẾN GÓI thì ngược lại: hồ sơ con người sống ở `/manage/account`, và thẻ ở đây
   * chỉ để XEM. Một nút "Đổi" mọc lại là hai bề mặt cùng sửa một thứ, và người dùng không đoán
   * được cái nào là "thật".
   */
  it('gian hàng tuyến gói: CHỈ XEM — không nút sửa hồ sơ, không nút đổi email/SĐT', async () => {
    const view = await renderScreen(PROFILE, {
      tenant: { ...TENANT, billingMode: 'package' },
    });
    await view.findByText(PROFILE_CARD_TEXT);

    expect(view.queryByRole('button', { name: new RegExp('Chỉnh sửa hồ sơ$') })).toBeNull();
    expect(view.queryAllByRole('button', { name: 'Đổi' })).toHaveLength(0);
    expect(view.queryAllByRole('button', { name: 'Thêm' })).toHaveLength(0);
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
      .getAllByText(/^(Tài khoản của tôi|Thông tin đăng nhập)$/)
      .map((node) => node.props.children);
    /*
     * Thẻ HỒ SƠ mở đầu màn; menu đứng sau nó. Người mở tab Tài khoản muốn thấy mình là ai
     * trước, rồi mới tới danh sách lối đi — thứ tự do người dùng chốt ngày 15/09/2026.
     */
    expect(order[0]).toBe('Thông tin đăng nhập');
    expect(order).toContain('Tài khoản của tôi');
  });

  it('khách chưa có gian hàng: bảy mục, có "Trở thành chủ xe", không có mục chủ xe', async () => {
    const view = await renderScreen();
    await view.findByText(PROFILE_CARD_TEXT);

    for (const label of [
      'Tài khoản của tôi',
      'Trở thành chủ xe',
      'Chuyến của tôi',
      // Khách thuê CÓ số dư: tiền hoàn khoản giữ chỗ chảy vào ví điểm của họ (ADR 0033 điều 5).
      'Ví điểm',
      'Tài khoản nhận tiền',
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

  it('chủ xe tuyến hoa hồng: chín mục trong MỘT nhóm phẳng, không tiêu đề', async () => {
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
      'Tài khoản của tôi',
      'Đổi mật khẩu',
    ]) {
      expect(view.getAllByRole('menuitem', { name: label }).length).toBeGreaterThan(0);
    }
    /*
     * MỘT nhóm, không tiêu đề (ADR 0038 điều 9): chủ xe không đổi vai khi bấm từ "Lịch xe" sang
     * "Tài khoản của tôi", nên một tiêu đề ở giữa vẽ ra một ranh giới không có thật.
     */
    expect(view.queryByText('TÀI KHOẢN')).toBeNull();
    /*
     * "Yêu cầu xoá tài khoản" rời MENU (ADR 0038 điều 9) nhưng KHÔNG rời màn: nó là thẻ riêng
     * tông đỏ ở cuối "Tài khoản của tôi". Canh cả hai vế — thiếu vế sau thì chủ xe tuyến hoa
     * hồng không còn lối nào tới màn xoá tài khoản, đúng lỗi đã có trước 16/09/2026.
     *
     * Vế "không nằm trong menu" được canh ở tầng dữ liệu (`account-nav.test.ts`), nơi nói được
     * chính xác điều đó; ở tầng màn thì cả hai đều là `menuitem` và một phép đếm không phân
     * biệt được thẻ đỏ cuối màn với một mục menu.
     */
    expect(view.getByRole('menuitem', { name: 'Yêu cầu xoá tài khoản' })).toBeTruthy();
    // Chủ xe KHÔNG được mời "trở thành chủ xe" lần nữa.
    expect(view.queryByRole('menuitem', { name: 'Trở thành chủ xe' })).toBeNull();
  });

  /**
   * ADR 0038 điều 7: khu khách của một tài khoản gian hàng tuyến GÓI còn đúng hai mục. Công cụ
   * cho thuê, chuyến và hồ sơ con người sống ở khu quản lý.
   */
  it('gian hàng tuyến gói: khu khách còn ba mục, cả ba đều dẫn sang khu quản lý', async () => {
    const view = await renderScreen(PROFILE, {
      tenant: { ...TENANT, billingMode: 'package' },
    });
    await view.findByText(PROFILE_CARD_TEXT);

    expect(view.getAllByRole('menuitem', { name: 'Quản lý gian hàng' }).length).toBeGreaterThan(0);
    expect(view.getAllByRole('menuitem', { name: 'Hồ sơ gian hàng' }).length).toBeGreaterThan(0);
    // Lối DUY NHẤT từ khu khách sang 'Tài khoản & bảo mật' — nơi sửa hồ sơ con người.
    expect(view.getAllByRole('menuitem', { name: 'Hồ sơ cá nhân' }).length).toBeGreaterThan(0);
    for (const gone of ['Danh sách xe', 'Lịch xe', 'Chuyến của tôi', 'Đổi mật khẩu']) {
      expect(view.queryByRole('menuitem', { name: gone })).toBeNull();
    }
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

  /**
   * Thẻ này chỉ có một lời mời — "Vào quản lý gian hàng" — và cánh cửa đó đóng với tuyến hoa hồng
   * (ADR 0038 điều 4). Bản trước vẫn dựng thẻ, chỉ âm thầm đổi đích sang danh sách xe: nhãn hứa
   * một nơi, cú bấm đưa tới nơi khác.
   */
  it('chủ xe tuyến hoa hồng: KHÔNG dựng thẻ gian hàng nào', async () => {
    const view = await renderScreen(PROFILE, { tenant: TENANT });
    await view.findByText(PROFILE_CARD_TEXT);

    expect(view.queryByRole('button', { name: /Vào quản lý gian hàng/ })).toBeNull();
    expect(view.queryByText('Đăng xe cho thuê')).toBeNull();
  });

  /** Hỏi TENANT, không hỏi vai: nhân viên của gian hàng hoa hồng cũng không thấy thẻ. */
  it('nhân viên gian hàng tuyến hoa hồng: cũng KHÔNG thấy thẻ', async () => {
    const view = await renderScreen(PROFILE, {
      tenant: { ...TENANT, roleKey: TENANT_ROLE.SHOP_STAFF },
    });
    await view.findByText(PROFILE_CARD_TEXT);

    expect(view.queryByRole('button', { name: /Vào quản lý gian hàng/ })).toBeNull();
  });

  it('gian hàng tuyến GÓI: thẻ dẫn vào cổng quản lý', async () => {
    const view = await renderScreen(PROFILE, {
      tenant: { ...TENANT, billingMode: 'package' },
    });
    await view.findByText(PROFILE_CARD_TEXT);

    await fireEvent.press(view.getByRole('button', { name: /Vào quản lý gian hàng/ }));
    expect(mockReplace).toHaveBeenCalledWith('/manage');
  });

  it('tài khoản nền tảng: "Quản trị nền tảng" thắng cả vai gian hàng', async () => {
    const view = await renderScreen(PROFILE, {
      tenant: TENANT,
      openRenterTripCount: 0,
      platformRole: 'platform_admin',
    } as Partial<authApi.CurrentUser>);
    await view.findByText(PROFILE_CARD_TEXT);

    expect(view.getByText('Quản trị nền tảng')).toBeTruthy();
    expect(view.queryByText('Việt Car Hà Nội')).toBeNull();
  });
});
