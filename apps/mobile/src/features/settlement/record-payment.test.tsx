import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { PAYMENT_KIND, PERMISSION } from '@xeprime/types';
import { ApiClientError } from '@xeprime/api-client';
import * as authApi from '@/features/auth/api';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import { RecordPaymentSheet } from './components/RecordPaymentSheet';
import { paymentsApi, settlementApi, type BookingSettlement } from './api';
import { RefundSheet } from './components/RefundSheet';

const BOOKING_ID = '01JQZX0000000000000000000B';

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

function user(): authApi.CurrentUser {
  return {
    id: 'u1',
    displayName: 'Thu ngân',
    email: 'thungan@xeprime.test',
    avatarUrl: null,
    phone: '0903333333',
    phoneVerified: true,
    hasPassword: true,
    tenant: {
      id: 't1',
      name: 'Gian hàng Đà Nẵng',
      slug: 'da-nang',
      status: 'active',
      roleKey: 'shop_staff',
      features: [],
      planCode: null,
      planEndsAt: null,
    },
    platformRole: null,
    permissions: [PERMISSION.PAYMENT_RECORD, PERMISSION.BOOKING_VIEW],
  } as authApi.CurrentUser;
}

function settlement(over: Partial<BookingSettlement> = {}): BookingSettlement {
  return {
    bookingId: BOOKING_ID,
    depositStatus: 'awaiting_refund',
    depositRequired: '5000000',
    depositReceived: '5000000',
    surchargeTotal: '0',
    proposedRefund: '5000000',
    additionalDue: '0',
    surcharges: [],
    refund: null,
    ...over,
  } as BookingSettlement;
}

function wrap(node: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return withIntl(
    <ReduxProvider store={store}>
      <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
    </ReduxProvider>,
  );
}

beforeEach(() => {
  jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(user());
});

afterEach(() => jest.restoreAllMocks());

/**
 * FIN-05/06 — ghi nhận tiền của một đơn.
 *
 * Luật quan trọng nhất và cũng dễ vỡ nhất: **cọc KHÔNG cộng vào "đã trả"**. Client không tự
 * cộng gì cả — nó chỉ gửi đúng `kind`, và server phân biệt. Một client gửi nhầm `kind` là báo
 * cho chủ xe rằng khách đã trả một khoản họ chưa trả.
 */
describe('RecordPaymentSheet — tiền thuê và tiền cọc là hai loại tiền', () => {
  it('mặc định ghi TIỀN THUÊ: gửi `kind = rental`', async () => {
    const recordSpy = jest.spyOn(paymentsApi, 'record').mockResolvedValue({} as never);

    const { findByText } = await render(
      wrap(
        <RecordPaymentSheet open onClose={jest.fn()} bookingId={BOOKING_ID} debtAmount="3000000" />,
      ),
    );

    await fireEvent.press(await findByText('Ghi nhận'));

    await waitFor(() =>
      expect(recordSpy).toHaveBeenCalledWith(
        BOOKING_ID,
        expect.objectContaining({ kind: PAYMENT_KIND.RENTAL, amount: '3000000' }),
      ),
    );
  });

  it('thu CỌC: gửi `kind = deposit` và nói TRƯỚC là cọc không trừ vào công nợ', async () => {
    const recordSpy = jest.spyOn(paymentsApi, 'record').mockResolvedValue({} as never);

    const { findByText } = await render(
      wrap(
        <RecordPaymentSheet
          open
          onClose={jest.fn()}
          bookingId={BOOKING_ID}
          kind={PAYMENT_KIND.DEPOSIT}
          debtAmount="5000000"
        />,
      ),
    );

    // Nói trước khi ghi: chủ xe nhìn công nợ không đổi sau khi thu 5 triệu sẽ tưởng mất tiền.
    expect(await findByText('Cọc không trừ vào công nợ')).toBeTruthy();

    await fireEvent.press(await findByText('Ghi nhận'));

    await waitFor(() =>
      expect(recordSpy).toHaveBeenCalledWith(
        BOOKING_ID,
        expect.objectContaining({ kind: PAYMENT_KIND.DEPOSIT }),
      ),
    );
  });

  it('KHÔNG gợi ý số nào thì ô tiền để TRỐNG, và bấm ghi không gửi một khoản 0 ₫', async () => {
    const recordSpy = jest.spyOn(paymentsApi, 'record').mockResolvedValue({} as never);

    const { findByText } = await render(
      wrap(<RecordPaymentSheet open onClose={jest.fn()} bookingId={BOOKING_ID} />),
    );

    await fireEvent.press(await findByText('Ghi nhận'));

    await waitFor(() => expect(recordSpy).not.toHaveBeenCalled());
  });

  it('lỗi từ server thì GIỮ tấm mở và hiện lỗi — không nuốt mất thao tác', async () => {
    jest
      .spyOn(paymentsApi, 'record')
      .mockRejectedValue(
        new ApiClientError({ code: 'VALIDATION_FAILED', message: 'Sai', status: 400 }),
      );
    const onClose = jest.fn();

    const { findByText } = await render(
      wrap(
        <RecordPaymentSheet open onClose={onClose} bookingId={BOOKING_ID} debtAmount="3000000" />,
      ),
    );

    await fireEvent.press(await findByText('Ghi nhận'));

    await waitFor(() => expect(onClose).not.toHaveBeenCalled());
  });
});

/**
 * FIN-06 — hoàn cọc.
 *
 * Trần "không hoàn quá cọc đã thu" nằm ở SERVER (`assertRefundable`): nó là nơi duy nhất có
 * `depositReceived` đúng tại thời điểm ghi. Client hiện con số đó ngay đầu tấm để người nhập
 * thấy trần trước khi gõ, và khi server từ chối thì tấm PHẢI ở lại kèm câu lỗi.
 */
describe('RefundSheet — hoàn cọc', () => {
  it('mặc định là số ĐỀ XUẤT do server tính, không phải một phép trừ ở client', async () => {
    const recordSpy = jest.spyOn(settlementApi, 'recordRefund').mockResolvedValue({} as never);

    const { findAllByText } = await render(
      wrap(
        <RefundSheet
          open
          onClose={jest.fn()}
          bookingId={BOOKING_ID}
          settlement={settlement({ proposedRefund: '4200000', surchargeTotal: '800000' })}
          onDone={jest.fn()}
        />,
      ),
    );

    /* Tiêu đề tấm và nhãn nút trùng chuỗi — nút ở CHÂN nên là lần xuất hiện cuối trong cây. */
    const buttons = await findAllByText('Đánh dấu đã hoàn cọc');
    await fireEvent.press(buttons[buttons.length - 1]!);

    await waitFor(() =>
      expect(recordSpy).toHaveBeenCalledWith(
        BOOKING_ID,
        expect.objectContaining({ refundAmount: '4200000' }),
      ),
    );
  });

  it('hiện CỌC ĐÃ THU ngay đầu tấm — đó là trần của khoản hoàn', async () => {
    const { findByText } = await render(
      wrap(
        <RefundSheet
          open
          onClose={jest.fn()}
          bookingId={BOOKING_ID}
          settlement={settlement()}
          onDone={jest.fn()}
        />,
      ),
    );

    expect(await findByText('Cọc đã nhận')).toBeTruthy();
    expect(await findByText('5.000.000 ₫')).toBeTruthy();
  });

  it('hoàn QUÁ cọc đã thu: server từ chối, tấm ở lại và KHÔNG báo thành công', async () => {
    jest.spyOn(settlementApi, 'recordRefund').mockRejectedValue(
      new ApiClientError({
        code: 'VALIDATION_FAILED',
        message: 'Số tiền hoàn không được lớn hơn tiền cọc đã thu',
        status: 400,
      }),
    );
    const onDone = jest.fn();

    const { findAllByText } = await render(
      wrap(
        <RefundSheet
          open
          onClose={jest.fn()}
          bookingId={BOOKING_ID}
          settlement={settlement()}
          onDone={onDone}
        />,
      ),
    );

    /* Tiêu đề tấm và nhãn nút trùng chuỗi — nút ở CHÂN nên là lần xuất hiện cuối trong cây. */
    const buttons = await findAllByText('Đánh dấu đã hoàn cọc');
    await fireEvent.press(buttons[buttons.length - 1]!);

    await waitFor(() => expect(onDone).not.toHaveBeenCalled());
  });

  it('ĐIỀU CHỈNH một bản ghi đã có: bắt buộc lý do, và gửi kèm `expectedRowVersion`', async () => {
    const correctSpy = jest.spyOn(settlementApi, 'correctRefund').mockResolvedValue({} as never);

    const existing = settlement({
      refund: {
        refundAmount: '4000000',
        refundMethod: 'bank_transfer',
        refundedAt: '2026-09-06T02:00:00.000Z',
        reference: null,
        note: null,
        recordedByName: 'Nhân viên A',
        rowVersion: 3,
      },
    } as never);

    const { findAllByText, findByPlaceholderText } = await render(
      wrap(
        <RefundSheet
          open
          onClose={jest.fn()}
          bookingId={BOOKING_ID}
          settlement={existing}
          onDone={jest.fn()}
        />,
      ),
    );

    /*
     * Tiêu đề tấm và nhãn nút là cùng một chuỗi; nút nằm ở CHÂN nên nó là lần xuất hiện cuối
     * cùng trong cây (`BottomSheet` vẽ tiêu đề → nội dung → chân).
     */
    const submit = async () => {
      const all = await findAllByText('Điều chỉnh thông tin hoàn cọc');
      await fireEvent.press(all[all.length - 1]!);
    };

    // Thiếu lý do thì KHÔNG gửi đi — sửa một con số tiền đã ghi sổ phải giải thích được.
    await submit();
    await waitFor(() => expect(correctSpy).not.toHaveBeenCalled());

    /* `TextField` không gắn nhãn khả truy cập lên ô nhập — tìm bằng chữ mờ, như các test khác. */
    await fireEvent.changeText(
      await findByPlaceholderText('Ví dụ: ghi nhầm số, đã đối chiếu lại sao kê'),
      'Ghi nhầm số',
    );
    await submit();

    await waitFor(() =>
      expect(correctSpy).toHaveBeenCalledWith(
        BOOKING_ID,
        expect.objectContaining({ correctionReason: 'Ghi nhầm số', expectedRowVersion: 3 }),
      ),
    );
  });
});
