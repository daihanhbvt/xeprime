import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react-native';
import { Provider as ReduxProvider } from 'react-redux';
import { PERMISSION, VEHICLE_PUBLIC_STATUS, type Permission } from '@xeprime/types';
import viVehicles from '@xeprime/domain/messages/vi/vehicles.json';
import * as authApi from '@/features/auth/api';
import { withIntl } from '@/i18n/test-utils';
import { ROUTES } from '@/navigation/routes';
import { store } from '@/store';
import type { VehicleDetail } from '../api';
import { publicationEditTab, vehiclePublicationTask } from '../publication';
import { vehicleEditPartHref } from '../workspace-links';
import { VehiclePublicationTaskItem } from './VehiclePublicationTaskItem';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

const actions = viVehicles.publish.task.actions;

/** Xe ĐỦ hồ sơ — chỉ đổi trạng thái công khai / công tắc theo từng bài. */
function vehicle(over: Partial<VehicleDetail> = {}): VehicleDetail {
  return {
    id: '01JQZX0000000000000000000V',
    vehicleType: 'car',
    serviceTypes: ['self_drive'],
    weekdayPrice: '500000',
    monthlyPrice: null,
    withDriverDailyPrice: null,
    mainImageUrl: 'https://cdn.test/a.jpg',
    images: [
      'https://cdn.test/a.jpg',
      'https://cdn.test/b.jpg',
      'https://cdn.test/c.jpg',
      'https://cdn.test/d.jpg',
    ],
    plateNumber: '51A-12345',
    brand: 'Mazda',
    model: 'Mazda3',
    manufactureYear: 2020,
    fuelType: 'gasoline',
    transmission: 'automatic',
    seatCount: 5,
    motorbikeCategory: null,
    fuelConsumptionCombined: '6.5',
    engineDisplacementCc: null,
    electricRangeKm: null,
    branch: { provinceCode: '79' },
    publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
    marketplaceEnabled: true,
    latestPublicReview: null,
    ...over,
  } as unknown as VehicleDetail;
}

async function renderItem(
  data: VehicleDetail,
  handlers: {
    customerScope?: boolean;
  },
  permissions: Permission[] = [PERMISSION.VEHICLE_UPDATE, PERMISSION.VEHICLE_SUBMIT_PUBLIC],
) {
  jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue({
    id: 'u1',
    displayName: 'Chủ shop',
    email: null,
    avatarUrl: null,
    phone: null,
    phoneVerified: true,
    hasPassword: true,
    tenant: null,
    openRenterTripCount: 0,
    platformRole: null,
    permissions,
  } as unknown as authApi.CurrentUser);
  const task = vehiclePublicationTask(data);
  if (!task) throw new Error('fixture không sinh việc nào');
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <ReduxProvider store={store}>
        <QueryClientProvider client={queryClient}>
          <VehiclePublicationTaskItem vehicle={data} task={task} {...handlers} />
        </QueryClientProvider>
      </ReduxProvider>,
    ),
  );
}

beforeEach(() => {
  jest.restoreAllMocks();
  mockPush.mockClear();
});

/*
 * Bản native của hai liên kết `#anchor` bên web. Trước 25/09/2026 app KHÔNG vẽ hai nút này (lý do
 * cũ: "Screen không phơi ref cuộn") — nay màn hồ sơ xe truyền hàm cuộn vào.
 */
describe('VehiclePublicationTaskItem — hai nút neo trong cùng màn', () => {
  it('đang chờ duyệt: "Cập nhật hồ sơ" mở màn sửa, KHÔNG vẽ "Xem trạng thái" (web: thẻ xét duyệt đã rời 360)', async () => {
    const view = await renderItem(
      vehicle({ publicStatus: VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW }),
      {},
    );

    expect(view.queryByText(actions.viewStatus)).toBeNull();
    await fireEvent.press(await view.findByText(actions.updateProfile));
    expect(mockPush).toHaveBeenCalledWith(
      ROUTES.manage.vehicleEditTab('01JQZX0000000000000000000V', publicationEditTab([])),
    );
  });

  it('chủ xe đang tạm ẩn: chỉ là lời nhắc, KHÔNG vẽ nút nào (công tắc "Trên chợ" ở đầu màn)', async () => {
    const view = await renderItem(vehicle({ marketplaceEnabled: false }), {});

    expect(await view.findByText(viVehicles.publish.task.ownerPaused.title)).toBeTruthy();
    expect(view.queryByRole('button')).toBeNull();
  });
});

/*
 * Khu TÀI KHOẢN (chủ xe tuyến hoa hồng — `/account/vehicles/[id]`): mọi nút của thẻ việc cần làm
 * phải ở lại khu đó. Web tra đích theo `useWorkspace().paths`; chủ xe tuyến hoa hồng không vào
 * được cổng quản lý (ADR 0038 điều 4), nên một lối đóng cứng vào `/manage` là ngõ cụt.
 */
describe('VehiclePublicationTaskItem — đích theo khu làm việc', () => {
  it('xe bị nền tảng ẩn, khu tài khoản: "Liên hệ hỗ trợ" mở /account/support', async () => {
    const view = await renderItem(vehicle({ publicStatus: VEHICLE_PUBLIC_STATUS.HIDDEN }), {
      customerScope: true,
    });

    await fireEvent.press(await view.findByText(actions.contactSupport));
    // Builder thay literal — app Partner không đăng ký khu tài khoản (fallback /not-available).
    expect(mockPush).toHaveBeenCalledWith(ROUTES.account.support());
  });

  it('xe bị nền tảng ẩn, cổng quản lý: "Liên hệ hỗ trợ" mở /manage/support', async () => {
    const view = await renderItem(vehicle({ publicStatus: VEHICLE_PUBLIC_STATUS.HIDDEN }), {});

    await fireEvent.press(await view.findByText(actions.contactSupport));
    // Ở app Customer đích /manage đổ về màn handoff /partner — builder nói đúng cả hai app.
    expect(mockPush).toHaveBeenCalledWith(ROUTES.manage.support());
  });

  it('khu tài khoản: "Cập nhật hồ sơ" mở mục trong không gian quản lý xe, KHÔNG /manage', async () => {
    const view = await renderItem(
      vehicle({ publicStatus: VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW }),
      { customerScope: true },
    );

    await fireEvent.press(await view.findByText(actions.updateProfile));
    expect(mockPush).toHaveBeenCalledWith(
      vehicleEditPartHref('01JQZX0000000000000000000V', publicationEditTab([]), true),
    );
    // Bất biến "KHÔNG /manage" giữ nguyên ở CẢ HAI app; còn dạng đường dẫn tuỳ app (ở app
    // Partner, đích khu tài khoản là chuỗi fallback /not-available, không phải object).
    const pressed = mockPush.mock.calls[0]![0] as { pathname?: string } | string;
    const pressedPath = typeof pressed === 'string' ? pressed : String(pressed.pathname);
    expect(pressedPath.startsWith('/manage')).toBe(false);
  });
});
