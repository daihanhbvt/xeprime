import { API_ERROR_CODE } from '@xeprime/types';
import viBookingRequests from '@xeprime/domain/messages/vi/booking-requests.json';
import { cancelErrorKey, decisionErrorKey } from './decision-error';

/**
 * Bảng lỗi có LỐI ĐI TIẾP — soi gương `decisionErrorText` / `cancelErrorText` của web.
 *
 * Mất một nhánh ở đây KHÔNG làm gì đỏ: màn hình vẫn hiện một câu, chỉ là câu chung ("Có lỗi xảy
 * ra") thay cho câu chỉ đúng việc phải làm tiếp. Người trực bấm lại vài lần rồi gọi hỗ trợ.
 */
describe('decisionErrorKey — duyệt và từ chối', () => {
  it('trùng lịch ⇒ câu chỉ sang chọn giờ khác', () => {
    expect(decisionErrorKey(API_ERROR_CODE.BOOKING_SCHEDULE_CONFLICT)).toBe(
      'approve.scheduleConflict',
    );
  });

  it('quá hạn phản hồi ⇒ câu chỉ sang gọi khách', () => {
    expect(decisionErrorKey(API_ERROR_CODE.BOOKING_REQUEST_EXPIRED)).toBe('approve.expired');
  });

  /* Không có câu riêng thì nơi gọi rơi về ánh xạ chung theo MÃ (ADR 0012) — không bịa câu ở đây. */
  it('mã khác ⇒ null', () => {
    expect(decisionErrorKey(API_ERROR_CODE.CONFLICT)).toBeNull();
    expect(decisionErrorKey(null)).toBeNull();
  });
});

describe('cancelErrorKey — huỷ chuyến đã nhận', () => {
  /* Cuộc đua với đồng tiền: webhook thắng, yêu cầu đã thành đơn, lệnh huỷ không claim được gì. */
  it('409 ⇒ câu "khách vừa thanh toán xong"', () => {
    expect(cancelErrorKey(API_ERROR_CODE.CONFLICT)).toBe('cancel.raceLost');
  });

  it('chặng không huỷ được ⇒ câu riêng của nó', () => {
    expect(cancelErrorKey(API_ERROR_CODE.BOOKING_CANCEL_NOT_ALLOWED)).toBe('cancel.notAllowed');
  });

  /*
   * HAI bảng không được trộn: lượt huỷ KHÔNG đi qua cửa `claimPending` nên không bao giờ gặp
   * trùng lịch, và lượt duyệt thì `CONFLICT` mang nghĩa khác hẳn.
   */
  it('không mượn nhánh của bảng kia', () => {
    expect(cancelErrorKey(API_ERROR_CODE.BOOKING_SCHEDULE_CONFLICT)).toBeNull();
    expect(decisionErrorKey(API_ERROR_CODE.BOOKING_CANCEL_NOT_ALLOWED)).toBeNull();
  });
});

/*
 * `use-intl` không ném khi thiếu khoá — nó in thẳng đường dẫn khoá lên màn hình. Một lỗi chính tả
 * ở bảng trên vì thế đi tới tận người dùng, dưới dạng chuỗi "BookingRequests.approve.xxx".
 */
describe('mọi khoá trả ra đều tồn tại trong bó message', () => {
  const keys = [
    ...[API_ERROR_CODE.BOOKING_SCHEDULE_CONFLICT, API_ERROR_CODE.BOOKING_REQUEST_EXPIRED].map(
      decisionErrorKey,
    ),
    ...[API_ERROR_CODE.CONFLICT, API_ERROR_CODE.BOOKING_CANCEL_NOT_ALLOWED].map(cancelErrorKey),
  ];

  it.each(keys)('%s', (key) => {
    const [group, leaf] = key!.split('.') as ['approve' | 'cancel', string];
    expect(viBookingRequests[group]).toHaveProperty(leaf);
  });
});
