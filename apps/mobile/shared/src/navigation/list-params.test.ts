import { BOOKING_STATUS, BOOKING_STATUS_SELECTABLE_VALUES } from '@xeprime/types';
import { compactParams, pickListParam } from './list-params';

describe('pickListParam', () => {
  it('nhận giá trị nằm trong danh sách cho phép', () => {
    expect(pickListParam(BOOKING_STATUS.ACTIVE, BOOKING_STATUS_SELECTABLE_VALUES)).toBe(
      BOOKING_STATUS.ACTIVE,
    );
    expect(pickListParam([BOOKING_STATUS.COMPLETED], BOOKING_STATUS_SELECTABLE_VALUES)).toBe(
      BOOKING_STATUS.COMPLETED,
    );
  });

  it('bỏ qua giá trị lạ / rỗng', () => {
    expect(pickListParam('hacked', BOOKING_STATUS_SELECTABLE_VALUES)).toBeUndefined();
    expect(pickListParam('', BOOKING_STATUS_SELECTABLE_VALUES)).toBeUndefined();
    expect(pickListParam(undefined, BOOKING_STATUS_SELECTABLE_VALUES)).toBeUndefined();
  });
});

describe('compactParams', () => {
  it('bỏ khoá rỗng; không còn gì thì null', () => {
    expect(compactParams({ status: 'active', sort: undefined })).toEqual({ status: 'active' });
    expect(compactParams({ status: undefined })).toBeNull();
  });
});
