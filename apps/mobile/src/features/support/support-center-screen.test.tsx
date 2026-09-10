import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react-native';
import { FEATURE_STATE, PERMISSION, PLAN_FEATURE, type Permission } from '@xeprime/types';
import * as authApi from '@/features/auth/api';
import { withIntl } from '@/i18n/test-utils';
import { SupportCenterScreen } from './SupportCenterScreen';

/** Bảng cờ gói mà `/auth/me` trả về — trục thứ hai bên cạnh quyền (ADR 0027). */
type TenantFeatures = NonNullable<authApi.CurrentUser['tenant']>['features'];

/**
 * Trung tâm hỗ trợ (SYS-05) — điểm đến của khối HỖ TRỢ ở cuối sidebar.
 *
 * Ba điều bộ này giữ, cùng ba điều bộ test bên web giữ, cộng một điều chỉ app mới có:
 *
 *  1. **không dẫn ai vào 403** — thẻ hướng dẫn lọc theo đúng quyền của màn nó trỏ tới;
 *  2. **cả cờ gói nữa** — quyền còn nguyên mà gian hàng chưa mua gói thì màn đó cũng bị menu
 *     giấu, nên thẻ hướng dẫn không được mời người ta bấm vào (ADR 0027 điều 2);
 *  3. **không hứa suông** — không form gửi ticket, không hotline;
 *  4. văn bản pháp lý đi tới màn WebView đọc bản WEB, không dựng lại bằng màn native.
 */

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  usePathname: () => '/manage/support',
}));

/* Thanh trên đọc phiên qua `useAuthenticatedUser()` và NÉM khi chưa có — nó vốn chỉ sống sau
   `RequireSession`. Ở đây đang test nội dung màn, không phải cái vỏ. */
jest.mock('@/features/shell/ManageHeader', () => ({ ManageHeader: () => null }));

const TENANT_ID = '01JQZX0000000000000000000T';

const ALL_PERMISSIONS: Permission[] = [
  PERMISSION.TENANT_VIEW,
  PERMISSION.VEHICLE_CREATE,
  PERMISSION.BOOKING_REQUEST_VIEW,
  PERMISSION.CALENDAR_VIEW,
  PERMISSION.FINANCE_VIEW,
  PERMISSION.MEMBER_VIEW,
];

function currentUser(
  permissions: Permission[],
  features: TenantFeatures = [],
): authApi.CurrentUser {
  return {
    id: '01JQZX0000000000000000000U',
    displayName: 'Chủ shop',
    email: 'owner@xeprime.test',
    avatarUrl: null,
    phone: '0901111111',
    phoneVerified: true,
    hasPassword: true,
    tenant: {
      id: TENANT_ID,
      name: 'Gian hàng Đà Nẵng',
      slug: 'da-nang',
      status: 'active',
      roleKey: 'shop_owner',
      features,
      planCode: null,
      planEndsAt: null,
    },
    platformRole: null,
    permissions,
  };
}

function wrap(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return withIntl(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}

async function renderScreen(
  permissions: Permission[] = ALL_PERMISSIONS,
  features: TenantFeatures = [],
) {
  jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(currentUser(permissions, features));
  const view = await render(wrap(<SupportCenterScreen />));
  /*
   * Quyền tới từ `GET /auth/me`, nên khối hướng dẫn chỉ có ở lần render THỨ HAI.
   * `findBy*` chứ không `waitFor(queryBy*)`: chỉ `findBy*` bọc sẵn `act()` của RNTL v14, và
   * thiếu nó thì microtask giải query không được xả — cây đứng nguyên ở lần render đầu.
   */
  await view.findByText('BẮT ĐẦU NHANH');
  return view;
}

beforeEach(() => {
  jest.restoreAllMocks();
  mockPush.mockClear();
});

describe('SupportCenterScreen — hướng dẫn nhanh', () => {
  /*
   * MỘT cú chạm mỗi test: `useNavigateOnce` khoá 700ms sau lần điều hướng đầu, nên chạm thẻ thứ
   * hai trong cùng một test sẽ bị nuốt — đúng như trên máy thật, và đúng thứ nó sinh ra để chặn.
   */
  it.each([
    ['Thêm xe cho thuê', '/manage/vehicles/new'],
    ['Duyệt yêu cầu đặt xe', '/manage/requests'],
    ['Xem lịch thuê', '/manage/calendar'],
  ])('thẻ "%s" đi tới màn CÓ THẬT %s', async (label, href) => {
    const view = await renderScreen();

    await fireEvent.press(view.getByLabelText(label));
    expect(mockPush).toHaveBeenCalledWith(href);
  });

  it('lọc theo quyền — không dẫn người dùng vào màn họ sẽ nhận 403', async () => {
    const view = await renderScreen([PERMISSION.TENANT_VIEW]);

    expect(view.queryByLabelText('Thêm xe cho thuê')).toBeNull();
    expect(view.queryByLabelText('Mời nhân viên')).toBeNull();
    // Chính sách thuê chỉ cần `tenant.view` nên vẫn còn.
    expect(view.getByLabelText('Đặt chính sách thuê')).not.toBeNull();
  });

  /**
   * Chỗ app KHÁC web: web chỉ lọc theo quyền, nên gian hàng chưa mua gói Tài chính vẫn thấy thẻ
   * "Ghi thu chi" dù menu đã giấu mục đó. Hai trục kiểm NỐI TIẾP (ADR 0027 điều 2).
   */
  it('cờ gói tắt thì thẻ biến mất dù quyền còn nguyên', async () => {
    const view = await renderScreen(ALL_PERMISSIONS, [
      { feature: PLAN_FEATURE.FINANCE, state: FEATURE_STATE.HIDDEN },
    ]);

    expect(view.queryByLabelText('Ghi thu chi')).toBeNull();
    expect(view.getByLabelText('Mời nhân viên')).not.toBeNull();
  });

  it('không quyền nào → bỏ hẳn khối hướng dẫn, KHÔNG để lại tiêu đề rỗng', async () => {
    jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(currentUser([]));
    const view = await render(wrap(<SupportCenterScreen />));

    // Câu hỏi thường gặp thì ai cũng đọc được — nó không dẫn tới màn nào.
    await view.findByText('CÂU HỎI THƯỜNG GẶP');
    expect(view.queryByText('BẮT ĐẦU NHANH')).toBeNull();
  });
});

describe('SupportCenterScreen — câu hỏi thường gặp', () => {
  it('trả lời đúng hai câu mà cấu trúc menu làm người dùng bối rối', async () => {
    const view = await renderScreen();

    await fireEvent.press(view.getByLabelText('Yêu cầu đặt xe khác đơn thuê thế nào?'));
    expect(view.getByText(/chưa chiếm lịch của xe/)).not.toBeNull();

    await fireEvent.press(view.getByLabelText('Bảo dưỡng xe nằm ở đâu?'));
    expect(view.getByText(/theo dõi cả đội xe/)).not.toBeNull();
  });

  /** Nhiều mục mở cùng lúc: người ta đọc màn này để SO hai câu trả lời với nhau. */
  it('mở câu thứ hai không đóng câu thứ nhất', async () => {
    const view = await renderScreen();

    await fireEvent.press(view.getByLabelText('Yêu cầu đặt xe khác đơn thuê thế nào?'));
    await fireEvent.press(view.getByLabelText('Bảo dưỡng xe nằm ở đâu?'));

    expect(view.getByText(/chưa chiếm lịch của xe/)).not.toBeNull();
    expect(view.getByText(/theo dõi cả đội xe/)).not.toBeNull();
  });

  it('KHÔNG dựng form gửi yêu cầu hay số hotline — kênh thật sống ở màn khác', async () => {
    const view = await renderScreen();

    expect(view.queryByLabelText('Gửi')).toBeNull();
    expect(view.queryByText(/hotline/i)).toBeNull();
  });
});

describe('SupportCenterScreen — văn bản pháp lý', () => {
  it('đi tới màn WebView của đúng văn bản, cùng địa chỉ với web', async () => {
    const view = await renderScreen();

    await fireEvent.press(view.getByLabelText('Quy chế hoạt động sàn'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/legal/[doc]',
      params: { doc: 'marketplace-rules' },
    });
  });

  it('bày đủ bốn văn bản', async () => {
    const view = await renderScreen();

    for (const title of [
      'Điều khoản sử dụng',
      'Chính sách bảo mật',
      'Quy chế hoạt động sàn',
      'Chính sách huỷ và hoàn tiền',
    ]) {
      expect(view.getByLabelText(title)).not.toBeNull();
    }
  });
});

describe('SupportCenterScreen — yêu cầu hỗ trợ', () => {
  it('có `support.view` thì hiện nút, và nút báo màn chưa dựng thay vì mở hàng đợi thứ hai', async () => {
    const view = await renderScreen([...ALL_PERMISSIONS, PERMISSION.SUPPORT_VIEW]);

    await fireEvent.press(view.getByText('Mở yêu cầu hỗ trợ'));

    await view.findByText('Chức năng đang được phát triển.');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('thiếu `support.view` thì không hiện nút', async () => {
    const view = await renderScreen();

    expect(view.queryByText('Mở yêu cầu hỗ trợ')).toBeNull();
  });
});
