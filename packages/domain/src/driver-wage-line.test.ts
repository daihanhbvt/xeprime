import { describe, expect, it } from 'vitest';
import { DRIVER_WAGE_STAGE } from '@xeprime/types';
import { driverWageLine } from './driver-wage-line';

describe('driverWageLine — ADR 0075', () => {
  it('đang mời / đã nhận / hoàn thành giữ đúng số', () => {
    expect(driverWageLine({ amount: '1500000', stage: DRIVER_WAGE_STAGE.OFFER })).toEqual({
      kind: 'offer',
      amount: '1500000',
    });
    expect(driverWageLine({ amount: '1700000', stage: DRIVER_WAGE_STAGE.RUNNING })?.kind).toBe(
      'running',
    );
    expect(driverWageLine({ amount: '1700000', stage: DRIVER_WAGE_STAGE.COMPLETED })?.kind).toBe(
      'received',
    );
  });

  it('không chạy: có số thoả thuận ⇒ agreed, 0 ⇒ none', () => {
    expect(driverWageLine({ amount: '300000', stage: DRIVER_WAGE_STAGE.NOT_RUN })).toEqual({
      kind: 'agreed',
      amount: '300000',
    });
    expect(driverWageLine({ amount: '0', stage: DRIVER_WAGE_STAGE.NOT_RUN })).toEqual({
      kind: 'none',
      amount: '0',
    });
  });

  it('không có gì để hiện: chưa từng nhận, lượt cũ chưa có số, thiếu dữ liệu', () => {
    expect(driverWageLine({ amount: '0', stage: DRIVER_WAGE_STAGE.NOT_APPLICABLE })).toBeNull();
    expect(driverWageLine({ amount: null, stage: DRIVER_WAGE_STAGE.RUNNING })).toBeNull();
    expect(driverWageLine(null)).toBeNull();
  });
});
