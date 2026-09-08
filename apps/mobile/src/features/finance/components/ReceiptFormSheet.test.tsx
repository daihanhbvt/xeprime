import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { PERMISSION, RECEIPT_TYPE } from '@xeprime/types';
import * as authApi from '@/features/auth/api';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import { ReceiptFormSheet } from './ReceiptFormSheet';
import {
  financeCategoriesApi,
  receiptsApi,
  type FinanceCategory,
  type ReceiptBookingOption,
  type ReceiptVehicleOption,
} from '../api';

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

const CATEGORIES: FinanceCategory[] = [
  { id: 'cat-9', type: RECEIPT_TYPE.EXPENSE, name: 'Rửa xe', isSystem: false },
];

const BOOKING: ReceiptBookingOption = {
  id: 'b1',
  code: 'BK-0042',
  customerName: 'Trần Thị Bình',
  customerPhone: '0912345678',
  tenantCustomerId: 'c1',
  status: 'completed',
  vehicleId: 'v9',
  vehicleName: 'Vios',
  plateNumber: '51A-12345',
  vehicleImageUrl: null,
  totalAmount: '5000000',
  paidAmount: '2000000',
  debtAmount: '3000000',
};

const VEHICLE: ReceiptVehicleOption = {
  id: 'v1',
  code: 'X-01',
  name: 'Vios 2022',
  plateNumber: '51A-12345',
  imageUrl: null,
  operationStatus: 'available',
  branchId: null,
  branchName: null,
  currentBookingId: null,
  currentBookingCode: null,
  currentCustomerName: null,
  currentDebtAmount: null,
};

async function renderForm(
  initialVehicleId: string | null = null,
  options: { vehicles?: ReceiptVehicleOption[] } = {},
) {
  jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue({
    id: 'u1',
    displayName: 'Kế toán',
    email: 'ketoan@xeprime.test',
    avatarUrl: null,
    phone: '0902222222',
    phoneVerified: true,
    hasPassword: true,
    tenant: {
      id: 't1',
      name: 'Gian hàng',
      slug: 'g',
      status: 'active',
      roleKey: 'shop_staff',
      features: [],
      planCode: null,
      planEndsAt: null,
    },
    platformRole: null,
    permissions: [PERMISSION.FINANCE_VIEW, PERMISSION.RECEIPT_CREATE],
  } as authApi.CurrentUser);

  jest.spyOn(financeCategoriesApi, 'list').mockResolvedValue(CATEGORIES);
  const bookingOptionsSpy = jest.spyOn(receiptsApi, 'bookingOptions').mockResolvedValue([BOOKING]);
  const vehicleOptionsSpy = jest
    .spyOn(receiptsApi, 'vehicleOptions')
    .mockResolvedValue(options.vehicles ?? [VEHICLE]);
  const createSpy = jest.spyOn(receiptsApi, 'create').mockResolvedValue({} as never);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const ui: ReactElement = withIntl(
    <ReduxProvider store={store}>
      <QueryClientProvider client={queryClient}>
        <ReceiptFormSheet open onClose={jest.fn()} initialVehicleId={initialVehicleId} />
      </QueryClientProvider>
    </ReduxProvider>,
  );
  const view = await render(ui);
  return { ...view, createSpy, bookingOptionsSpy, vehicleOptionsSpy };
}

afterEach(() => jest.restoreAllMocks());

/**
 * Tạo phiếu thu/chi (FIN-02).
 *
 * Điều dễ vỡ nhất: **CHẾ ĐỘ quyết định cái gì được gửi**, không phải "ô nào tình cờ còn giá trị".
 * Chọn một đơn rồi đổi sang "gắn xe" mà vẫn gửi `bookingId` cũ là gửi một liên kết người dùng đã
 * bỏ — và server sẽ từ chối bằng một lỗi họ không hiểu vì ô đơn đã biến khỏi màn hình.
 */
describe('ReceiptFormSheet — chọn cái gì để gắn', () => {
  it('chỉ hỏi danh sách ĐƠN khi đang ở chế độ gắn đơn', async () => {
    const view = await renderForm();
    expect(view.bookingOptionsSpy).not.toHaveBeenCalled();

    await fireEvent.press(await view.findByText('Đơn thuê'));
    await fireEvent.press(await view.findByLabelText(/^Liên kết với/));

    await waitFor(() => expect(view.bookingOptionsSpy).toHaveBeenCalled());
  });

  it('mở từ hồ sơ xe: vào thẳng chế độ "Xe" và xe đã chọn sẵn hiện TÊN, không phải id', async () => {
    const view = await renderForm('v1');

    // `includeId` giữ xe đang chọn trong kết quả kể cả khi không khớp từ khoá đang gõ.
    await waitFor(() => expect(view.vehicleOptionsSpy).toHaveBeenCalledWith('', 'v1'));
    /* Tên xe hiện ở CẢ HAI chỗ: ô liên kết và thẻ xác nhận bên dưới nó. */
    expect((await view.findAllByText('Vios 2022 (51A-12345)')).length).toBeGreaterThanOrEqual(2);
  });

  /*
   * `includeId` bắt server luôn kèm xe đang chọn NẾU nó còn hợp lệ — xin đích danh mà không thấy
   * thì đúng là xe đã bị xoá hoặc đã rời gian hàng. Không nói ra thì ô liên kết chỉ hiện TRỐNG
   * trong khi `vehicleId` vẫn nằm trong form và vẫn được gửi đi: người dùng gõ xong mọi ô rồi mới
   * nhận một lỗi 404 không giải thích được.
   */
  it('xe chọn sẵn đã biến mất khỏi gian hàng: nói ngay tại form, không im lặng', async () => {
    const view = await renderForm('v-gone', { vehicles: [] });

    await waitFor(() => expect(view.vehicleOptionsSpy).toHaveBeenCalledWith('', 'v-gone'));
    expect(
      await view.findByText(
        'Xe này không còn trong gian hàng (đã xoá hoặc đã chuyển đi). Chọn xe khác giúp mình nhé.',
      ),
    ).toBeTruthy();
  });

  it('chọn chế độ "Đơn thuê" mà chưa chọn đơn thì KHÔNG gửi đi', async () => {
    const view = await renderForm();

    await fireEvent.press(await view.findByText('Đơn thuê'));
    await fireEvent.press(await view.findByText('Tạo khoản chi'));

    await waitFor(() => expect(view.createSpy).not.toHaveBeenCalled());
  });

  it('chọn đơn xong thì thẻ xác nhận hiện KHÁCH và SỐ CÒN NỢ của chuyến', async () => {
    const view = await renderForm();

    await fireEvent.press(await view.findByText('Đơn thuê'));
    await fireEvent.press(await view.findByLabelText(/^Liên kết với/));
    await fireEvent.press(await view.findByLabelText('BK-0042'));

    expect(await view.findByText('Trần Thị Bình')).toBeTruthy();
    expect(await view.findByText('3.000.000 ₫')).toBeTruthy();
  });
});

describe('ReceiptFormSheet — ô bắt buộc', () => {
  it('thiếu diễn giải thì KHÔNG gửi đi — một dòng sổ không diễn giải là dòng không đối chiếu được', async () => {
    const view = await renderForm();

    await fireEvent.press(await view.findByText('Tạo khoản chi'));

    await waitFor(() => expect(view.createSpy).not.toHaveBeenCalled());
  });

  it('nhãn nút nói rõ đang tạo khoản THU hay khoản CHI', async () => {
    const view = await renderForm();

    expect(await view.findByText('Tạo khoản chi')).toBeTruthy();

    await fireEvent.press(await view.findByLabelText('Loại giao dịch'));
    await fireEvent.press(await view.findByLabelText('Phiếu thu'));

    expect(await view.findByText('Tạo khoản thu')).toBeTruthy();
  });
});
