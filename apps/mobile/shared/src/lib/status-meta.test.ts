import {
  BOOKING_STATUS,
  BOOKING_STATUS_META,
  RECEIPT_STATUS_META,
  STATUS_COLOR,
} from '@xeprime/types';
import { metaColor, metaLabel } from './status-meta';

describe('metaColor / metaLabel', () => {
  it('mã đã biết → màu và nhãn của bảng', () => {
    expect(metaColor(BOOKING_STATUS_META, BOOKING_STATUS.ACTIVE)).toBe(
      BOOKING_STATUS_META[BOOKING_STATUS.ACTIVE].color,
    );
    expect(metaLabel(BOOKING_STATUS_META, BOOKING_STATUS.ACTIVE)).toBe(
      BOOKING_STATUS_META[BOOKING_STATUS.ACTIVE].label,
    );
  });

  it('mã lạ từ backend mới hơn → trung tính, không ném lỗi', () => {
    expect(metaColor(RECEIPT_STATUS_META, 'status_from_newer_api')).toBe(STATUS_COLOR.NEUTRAL);
    expect(metaLabel(RECEIPT_STATUS_META, 'status_from_newer_api')).toBeUndefined();
  });

  it('mã rỗng/null → trung tính', () => {
    expect(metaColor(BOOKING_STATUS_META, null)).toBe(STATUS_COLOR.NEUTRAL);
    expect(metaColor(BOOKING_STATUS_META, '')).toBe(STATUS_COLOR.NEUTRAL);
  });
});
