import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { BOOKING_STATUS, CANCELLATION_REASON_CATEGORY } from '@xeprime/types';
import viBookings from '@xeprime/domain/messages/vi/bookings.json';
import viDomain from '@xeprime/domain/messages/vi/domain.json';
import { withIntl } from '@/i18n/test-utils';
import type { BookingDetail } from '../api';
import { BookingStatusSheet, type Decision } from './BookingStatusSheet';

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

const dialog = viBookings.statusActions.dialog;

/** Nhãn hiển thị của một nhóm lý do — đọc CÙNG bó message mà `useDomainLabel` đọc. */
function categoryLabel(value: string): string {
  return viDomain.cancellationReasonCategory[
    value as keyof typeof viDomain.cancellationReasonCategory
  ];
}

function booking(): BookingDetail {
  return {
    id: '01JQZX0000000000000000000B',
    code: 'XP-000123',
    customerName: 'Nguyễn Văn An',
    vehicleName: 'Toyota Vios 2022',
    pickupAt: '2026-09-25T02:00:00.000Z',
    returnAt: '2026-09-27T02:00:00.000Z',
    collectedAmount: '0',
  } as BookingDetail;
}

/**
 * `findBy*` chứ không `getBy*` cho lượt hỏi ĐẦU TIÊN sau khi dựng: tấm trượt mở bằng một nhịp
 * hiệu ứng, nên nội dung của nó chưa chắc có mặt ngay trong khung render đầu tiên.
 */
async function renderSheet(decision: Decision) {
  const onConfirm = jest.fn();
  const view = await render(
    withIntl(
      <BookingStatusSheet
        open
        onClose={jest.fn()}
        booking={booking()}
        decision={decision}
        onConfirm={onConfirm}
        loading={false}
      />,
    ),
  );
  const confirm = await view.findByText(
    decision === BOOKING_STATUS.CANCELLED ? dialog.cancelOk : dialog.noShowOk,
  );
  return { view, onConfirm, confirm };
}

/**
 * HUỶ ĐƠN phải gửi kèm NHÓM lý do — ADR 0045 điều 1.
 *
 * Bài test này tồn tại vì bản trước của tấm chỉ gửi `{ status, reason }`, trong khi
 * `TransitionBookingDto` đã đòi `reasonCategory` ở nhánh `cancelled`. Hệ quả không phải một nhãn
 * sai mà là một tính năng CHẾT: mọi lượt huỷ đơn từ app nhận 400, và không màn hình nào nói ra
 * điều đó — tấm vẫn dựng bình thường, chỉ lượt gửi là hỏng.
 */
describe('BookingStatusSheet — huỷ đơn', () => {
  it('bày lưới nhóm lý do', async () => {
    const { view } = await renderSheet(BOOKING_STATUS.CANCELLED);

    expect(await view.findByText(dialog.categoryLabel)).toBeTruthy();
    expect(
      await view.findByText(categoryLabel(CANCELLATION_REASON_CATEGORY.VEHICLE_UNAVAILABLE)),
    ).toBeTruthy();
  });

  /* Gửi lên mà thiếu nhóm chỉ để nhận 400 là bắt người ta gõ lại lý do — chặn tại chỗ. */
  it('chưa chọn nhóm thì KHÔNG gửi, và nói rõ còn thiếu gì', async () => {
    const { view, onConfirm, confirm } = await renderSheet(BOOKING_STATUS.CANCELLED);

    await fireEvent.changeText(await view.findByLabelText(dialog.reasonLabel), 'Xe vừa va chạm');
    await fireEvent.press(confirm);

    expect(await view.findByText(dialog.categoryRequired)).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('chọn nhóm rồi gửi thì `reasonCategory` đi kèm payload', async () => {
    const { view, onConfirm, confirm } = await renderSheet(BOOKING_STATUS.CANCELLED);

    await fireEvent.changeText(await view.findByLabelText(dialog.reasonLabel), 'Xe vừa va chạm');
    await fireEvent.press(
      await view.findByText(categoryLabel(CANCELLATION_REASON_CATEGORY.VEHICLE_UNAVAILABLE)),
    );
    await fireEvent.press(confirm);

    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith({
        reason: 'Xe vừa va chạm',
        reasonCategory: CANCELLATION_REASON_CATEGORY.VEHICLE_UNAVAILABLE,
      }),
    );
  });

  /*
   * "Lý do khác" đổi GỢI Ý dưới ô chữ, không đổi ràng buộc — ô đó vốn đã bắt buộc ở tấm này.
   * Một câu nhắc đúng lúc rẻ hơn một lỗi đỏ sau khi gửi.
   */
  it('chọn "Lý do khác" thì gợi ý dưới ô chữ đổi sang câu riêng của nó', async () => {
    const { view } = await renderSheet(BOOKING_STATUS.CANCELLED);

    expect(view.queryByText(dialog.reasonHelpOther)).toBeNull();
    await fireEvent.press(
      await view.findByText(categoryLabel(CANCELLATION_REASON_CATEGORY.OTHER)),
    );

    expect(await view.findByText(dialog.reasonHelpOther)).toBeTruthy();
    expect(view.queryByText(dialog.reasonHelp)).toBeNull();
  });
});

/**
 * `no_show` KHÔNG có nhóm lý do: nó tự nó đã là một phân loại, và bên chịu trách nhiệm ở đó là
 * khách chứ không phải gian hàng. DTO cũng chỉ đòi nhóm khi `status = cancelled` — gửi thừa là
 * ghi một phân loại HUỶ cho một việc không phải lượt huỷ.
 */
describe('BookingStatusSheet — khách không đến', () => {
  it('không bày lưới nhóm lý do, và payload không kèm `reasonCategory`', async () => {
    const { view, onConfirm, confirm } = await renderSheet(BOOKING_STATUS.NO_SHOW);

    expect(view.queryByText(dialog.categoryLabel)).toBeNull();

    await fireEvent.changeText(await view.findByLabelText(dialog.reasonLabel), 'Chờ 2 tiếng');
    await fireEvent.press(confirm);

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ reason: 'Chờ 2 tiếng' }));
  });
});
