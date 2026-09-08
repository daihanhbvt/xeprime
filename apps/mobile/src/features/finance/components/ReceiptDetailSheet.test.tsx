import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import {
  FEATURE_STATE,
  PAYMENT_METHOD,
  PERMISSION,
  PLAN_FEATURE,
  RECEIPT_SOURCE,
  RECEIPT_STATUS,
  RECEIPT_TYPE,
  type Permission,
} from '@xeprime/types';
import * as authApi from '@/features/auth/api';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import { ReceiptDetailSheet } from './ReceiptDetailSheet';
import { receiptsApi, type ReceiptDetail } from '../api';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  /* Chạy callback lúc mount, cleanup lúc unmount — đủ để mô phỏng "màn đang focus". */
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(effect, [effect]);
  },
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }));

function user(
  permissions: Permission[],
  features: { feature: string; state: string }[] = [
    { feature: PLAN_FEATURE.FINANCE, state: FEATURE_STATE.ENABLED },
  ],
): authApi.CurrentUser {
  return {
    id: '01JQZX0000000000000000000U',
    displayName: 'Kế toán',
    email: 'ketoan@xeprime.test',
    avatarUrl: null,
    phone: '0902222222',
    phoneVerified: true,
    hasPassword: true,
    tenant: {
      id: '01JQZX0000000000000000000T',
      name: 'Gian hàng Đà Nẵng',
      slug: 'da-nang',
      status: 'active',
      roleKey: 'shop_staff',
      features,
      planCode: 'full_manage',
      planEndsAt: null,
    },
    platformRole: null,
    permissions,
  } as authApi.CurrentUser;
}

function detail(over: Partial<ReceiptDetail> = {}): ReceiptDetail {
  return {
    id: '01JQZX0000000000000000000R',
    receiptNo: 'PC-0007',
    type: RECEIPT_TYPE.EXPENSE,
    status: RECEIPT_STATUS.PENDING_APPROVAL,
    source: RECEIPT_SOURCE.MANUAL,
    amount: '450000',
    paymentMethod: PAYMENT_METHOD.CASH,
    categoryId: 'cat-9',
    categoryName: 'Rửa xe',
    bookingId: '01JQZX0000000000000000000B',
    bookingCode: 'BK-0042',
    vehicleId: '01JQZX0000000000000000000V',
    vehicleName: 'Vios',
    plateNumber: '51A-12345',
    tenantCustomerId: '01JQZX0000000000000000000C',
    customerName: 'Trần Thị Bình',
    description: 'Rửa xe sau chuyến',
    occurredAt: '2026-09-02T02:00:00.000Z',
    createdAt: '2026-09-02T03:00:00.000Z',
    referenceCode: 'CK-99',
    requestedByName: 'Nhân viên A',
    approvedByName: null,
    approvedAt: null,
    cancelledByName: null,
    cancelledAt: null,
    attachments: [],
    updatedAt: '2026-09-02T03:00:00.000Z',
    ...over,
  } as ReceiptDetail;
}

async function renderSheet(
  permissions: Permission[],
  options: { data?: ReceiptDetail; features?: { feature: string; state: string }[] } = {},
) {
  jest
    .spyOn(authApi, 'fetchCurrentUser')
    .mockResolvedValue(options.features ? user(permissions, options.features) : user(permissions));
  const detailSpy = jest.spyOn(receiptsApi, 'detail').mockResolvedValue(options.data ?? detail());
  const approveSpy = jest.spyOn(receiptsApi, 'approve').mockResolvedValue(detail());
  const cancelSpy = jest.spyOn(receiptsApi, 'cancel').mockResolvedValue(detail());

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onClose = jest.fn();
  const ui: ReactElement = withIntl(
    <ReduxProvider store={store}>
      <QueryClientProvider client={queryClient}>
        <ReceiptDetailSheet receiptId="01JQZX0000000000000000000R" onClose={onClose} />
      </QueryClientProvider>
    </ReduxProvider>,
  );
  const view = await render(ui);
  return { ...view, detailSpy, approveSpy, cancelSpy, onClose };
}

afterEach(() => {
  jest.restoreAllMocks();
  mockPush.mockClear();
});

/**
 * Chi tiết phiếu — MỘT implementation cho mọi lối vào.
 *
 * Ba việc thẻ danh sách không làm được và test này khoá lại: đối chiếu được đơn/xe/khách và ĐI
 * SANG được, xem được dấu vết (ai tạo, ai duyệt), và thao tác đúng theo quyền + trạng thái.
 */
describe('ReceiptDetailSheet — nội dung', () => {
  it('hiện đủ tiền, loại, nguồn, danh mục, hình thức, mã tra soát và diễn giải', async () => {
    const { findByText } = await renderSheet([PERMISSION.FINANCE_VIEW]);

    expect(await findByText('− 450.000 ₫')).toBeTruthy();
    expect(await findByText('Phiếu chi')).toBeTruthy();
    expect(await findByText('Nhập tay')).toBeTruthy();
    expect(await findByText('Rửa xe')).toBeTruthy();
    expect(await findByText('Tiền mặt')).toBeTruthy();
    expect(await findByText('CK-99')).toBeTruthy();
    expect(await findByText('Rửa xe sau chuyến')).toBeTruthy();
  });

  it('hiện dấu vết người tạo — sổ tiền không có dấu vết là sổ không đối chiếu được', async () => {
    const { findByText } = await renderSheet([PERMISSION.FINANCE_VIEW]);
    expect(await findByText(/Nhân viên A/)).toBeTruthy();
  });

  it('KHÔNG lấy dữ liệu khi chưa mở (`receiptId` null)', async () => {
    jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(user([PERMISSION.FINANCE_VIEW]));
    const detailSpy = jest.spyOn(receiptsApi, 'detail').mockResolvedValue(detail());

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await render(
      withIntl(
        <ReduxProvider store={store}>
          <QueryClientProvider client={queryClient}>
            <ReceiptDetailSheet receiptId={null} onClose={jest.fn()} />
          </QueryClientProvider>
        </ReduxProvider>,
      ),
    );

    expect(detailSpy).not.toHaveBeenCalled();
  });
});

describe('ReceiptDetailSheet — lối đi liên quan', () => {
  /*
   * Giá trị CHÍNH LÀ link (như web), không còn nút "Xem đơn" đứng cạnh — nên phép thử là bấm
   * thẳng vào mã đơn.
   */
  it('có `bookings.view`: bấm mã đơn là mở đơn', async () => {
    const { findByText } = await renderSheet([PERMISSION.FINANCE_VIEW, PERMISSION.BOOKING_VIEW]);

    await fireEvent.press(await findByText('BK-0042'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/manage/bookings/[id]',
      params: { id: '01JQZX0000000000000000000B' },
    });
  });

  /**
   * Đi sang màn khác KHÔNG được đóng phiếu đang xem.
   *
   * Đối chiếu tiền là việc qua lại vài lượt giữa phiếu và đơn; đóng tấm trượt lúc đẩy màn thì mỗi
   * lượt quay lui người dùng phải đi tìm lại đúng phiếu đó trong sổ. Việc ẩn tấm trượt lúc rời màn
   * do `open={receiptId !== null && focused}` lo — nó là chuyện VẼ RA, không phải chuyện đóng.
   */
  it('bấm sang đơn thuê thì KHÔNG đóng phiếu đang xem', async () => {
    const { findByText, onClose } = await renderSheet([
      PERMISSION.FINANCE_VIEW,
      PERMISSION.BOOKING_VIEW,
    ]);

    await fireEvent.press(await findByText('BK-0042'));

    expect(mockPush).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('thiếu `bookings.view`: mã đơn vẫn đọc được nhưng bấm KHÔNG đi đâu', async () => {
    const { findByText } = await renderSheet([PERMISSION.FINANCE_VIEW]);

    await fireEvent.press(await findByText('BK-0042'));

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('thiếu `customers.view`: tên khách vẫn hiện, bấm KHÔNG mở hồ sơ', async () => {
    const { findByText } = await renderSheet([PERMISSION.FINANCE_VIEW]);

    await fireEvent.press(await findByText('Trần Thị Bình'));

    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('ReceiptDetailSheet — duyệt và huỷ', () => {
  it('thiếu `receipt.approve`: không có hành động nào', async () => {
    const { findByText, queryByText } = await renderSheet([PERMISSION.FINANCE_VIEW]);

    await findByText('− 450.000 ₫');
    expect(queryByText('Duyệt')).toBeNull();
    expect(queryByText('Huỷ phiếu')).toBeNull();
  });

  it('phiếu CHỜ DUYỆT + có quyền: cả Duyệt lẫn Huỷ, và duyệt phải XÁC NHẬN trước', async () => {
    const { findByText, findAllByText, approveSpy } = await renderSheet([
      PERMISSION.FINANCE_VIEW,
      PERMISSION.RECEIPT_APPROVE,
    ]);

    await fireEvent.press(await findByText('Duyệt'));
    expect(await findByText('Duyệt phiếu này?')).toBeTruthy();
    expect(approveSpy).not.toHaveBeenCalled();

    /*
     * Hộp thoại nằm TRONG thân tấm trượt, còn nút mở nằm ở chân — nên nút xác nhận là lần xuất
     * hiện ĐẦU TIÊN của nhãn 'Duyệt' trong cây. Bấm nhầm cái cuối là bấm lại chính nút mở.
     */
    const confirms = await findAllByText('Duyệt');
    await fireEvent.press(confirms[0]!);

    await waitFor(() => expect(approveSpy).toHaveBeenCalledWith('01JQZX0000000000000000000R'));
  });

  it('phiếu ĐÃ DUYỆT: không duyệt lại được, nhưng vẫn huỷ được', async () => {
    const { findByText, queryByText } = await renderSheet(
      [PERMISSION.FINANCE_VIEW, PERMISSION.RECEIPT_APPROVE],
      { data: detail({ status: RECEIPT_STATUS.APPROVED }) },
    );

    expect(await findByText('Huỷ phiếu')).toBeTruthy();
    expect(queryByText('Duyệt')).toBeNull();
  });

  it('phiếu ĐÃ HUỶ: không còn hành động nào', async () => {
    const { findByText, queryByText } = await renderSheet(
      [PERMISSION.FINANCE_VIEW, PERMISSION.RECEIPT_APPROVE],
      { data: detail({ status: RECEIPT_STATUS.CANCELLED }) },
    );

    await findByText('− 450.000 ₫');
    expect(queryByText('Huỷ phiếu')).toBeNull();
    expect(queryByText('Duyệt')).toBeNull();
  });

  it('phiếu TỰ ĐỘNG: không thao tác tay được, và nói rõ phải đảo ở nghiệp vụ gốc', async () => {
    const { findByText, queryByText } = await renderSheet(
      [PERMISSION.FINANCE_VIEW, PERMISSION.RECEIPT_APPROVE],
      { data: detail({ source: RECEIPT_SOURCE.PAYMENT, status: RECEIPT_STATUS.APPROVED }) },
    );

    expect(await findByText('Phiếu tự động')).toBeTruthy();
    expect(queryByText('Huỷ phiếu')).toBeNull();
    expect(queryByText('Duyệt')).toBeNull();
  });

  it('gói hết hạn: vẫn ĐỌC được, nút duyệt bị khoá và nói rõ lý do', async () => {
    const { findByText } = await renderSheet(
      [PERMISSION.FINANCE_VIEW, PERMISSION.RECEIPT_APPROVE],
      { features: [{ feature: PLAN_FEATURE.FINANCE, state: FEATURE_STATE.READ_ONLY }] },
    );

    expect(await findByText('− 450.000 ₫')).toBeTruthy();
    expect(
      await findByText('Gói đã hết hạn nên tính năng này chỉ xem được. Gia hạn để thao tác tiếp.'),
    ).toBeTruthy();
  });

  /*
   * CẢ HAI nút, không riêng nút duyệt. Huỷ phiếu cũng là một phép GHI, và câu "chỉ xem được"
   * đứng ngay trên một cái nút vẫn bấm được là một lời hứa sai — cú bấm đó ăn 403 từ guard
   * backend chứ không phải một thao tác hợp lệ.
   */
  it('gói hết hạn: KHÔNG duyệt và cũng KHÔNG huỷ được', async () => {
    const view = await renderSheet([PERMISSION.FINANCE_VIEW, PERMISSION.RECEIPT_APPROVE], {
      features: [{ feature: PLAN_FEATURE.FINANCE, state: FEATURE_STATE.READ_ONLY }],
    });

    await fireEvent.press(await view.findByText('Huỷ phiếu'));
    await fireEvent.press(await view.findByText('Duyệt'));

    /* Không hộp xác nhận NÀO mở ra — cả hai nút đều không nhận được cú chạm. */
    expect(view.queryByText('Huỷ phiếu này?')).toBeNull();
    expect(view.queryByText('Duyệt phiếu này?')).toBeNull();
    await waitFor(() => expect(view.cancelSpy).not.toHaveBeenCalled());
    expect(view.approveSpy).not.toHaveBeenCalled();
  });
});
