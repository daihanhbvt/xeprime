import { BOOKING_REQUEST_STATUS } from '@xeprime/types';
import { isHoldLimitBlocked, REQUEST_STEP } from './use-booking-request-flow';

const awaiting = { id: 'RQ1', status: BOOKING_REQUEST_STATUS.AWAITING_HOLD };
const pending = { id: 'RQ1', status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL };

describe('isHoldLimitBlocked', () => {
  it('đang điền form + đủ trần ⇒ chặn', () => {
    expect(
      isHoldLimitBlocked({ step: REQUEST_STEP.TRIP, receipt: null, limitReached: true, submitHitHoldLimit: false }),
    ).toBe(true);
  });

  it('chuyến vừa được NHẬN NGAY là chỗ cuối ⇒ KHÔNG chớp màn chặn trước khi sang thanh toán', () => {
    expect(
      isHoldLimitBlocked({ step: REQUEST_STEP.REVIEW, receipt: awaiting, limitReached: true, submitHitHoldLimit: false }),
    ).toBe(false);
  });

  it('màn "đã gửi" không bị thay', () => {
    expect(
      isHoldLimitBlocked({ step: REQUEST_STEP.DONE, receipt: pending, limitReached: true, submitHitHoldLimit: true }),
    ).toBe(false);
  });

  it('chưa có dữ liệu lời nhắc ⇒ tin lỗi server của lượt gửi', () => {
    expect(
      isHoldLimitBlocked({ step: REQUEST_STEP.REVIEW, receipt: null, limitReached: undefined, submitHitHoldLimit: true }),
    ).toBe(true);
    expect(
      isHoldLimitBlocked({ step: REQUEST_STEP.REVIEW, receipt: null, limitReached: false, submitHitHoldLimit: true }),
    ).toBe(false);
  });
});
