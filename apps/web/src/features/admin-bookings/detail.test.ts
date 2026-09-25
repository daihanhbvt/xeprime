import { BOOKING_STATUS } from '@xeprime/types';
import { describe, expect, it } from 'vitest';

import {
  BOOKING_TIMELINE_STATE,
  BOOKING_TIMELINE_STEP,
  buildBookingTimeline,
  isDebtOverdue,
  isInDebtScope,
  otherChargesAmount,
} from './detail';

const CREATED = '2026-09-18T10:54:00.000Z';
const PICKED = '2026-09-21T02:55:00.000Z';
const RETURNED = '2026-09-22T03:00:00.000Z';

const base = { createdAt: CREATED, actualPickupAt: null, actualReturnAt: null };

const summary = (steps: ReturnType<typeof buildBookingTimeline>) =>
  steps.map((s) => `${s.key}:${s.state}:${s.at ?? '-'}`);

describe('buildBookingTimeline', () => {
  it('đơn chờ giao xe: chỉ mốc tạo đơn xong, hai mốc sau chưa tới và KHÔNG có giờ', () => {
    expect(summary(buildBookingTimeline({ ...base, status: BOOKING_STATUS.RESERVED }))).toEqual([
      `created:done:${CREATED}`,
      'pickedUp:todo:-',
      'completed:todo:-',
    ]);
  });

  it('đơn đang thuê: mốc giao xe lấy giờ biên bản bàn giao', () => {
    const steps = buildBookingTimeline({
      ...base,
      status: BOOKING_STATUS.ACTIVE,
      actualPickupAt: PICKED,
    });
    expect(summary(steps)).toEqual([
      `created:done:${CREATED}`,
      `pickedUp:done:${PICKED}`,
      'completed:todo:-',
    ]);
  });

  it('đơn hoàn thành: mốc hoàn thành lấy giờ trả xe thực tế (cùng transaction với việc đổi trạng thái)', () => {
    const steps = buildBookingTimeline({
      ...base,
      status: BOOKING_STATUS.COMPLETED,
      actualPickupAt: PICKED,
      actualReturnAt: RETURNED,
    });
    expect(steps.every((s) => s.state === BOOKING_TIMELINE_STATE.DONE)).toBe(true);
    expect(steps[2]!.at).toBe(RETURNED);
  });

  it('đơn cũ hoàn thành mà thiếu giờ bàn giao: mốc vẫn xong nhưng không bịa giờ', () => {
    const steps = buildBookingTimeline({ ...base, status: BOOKING_STATUS.COMPLETED });
    expect(summary(steps)).toEqual([
      `created:done:${CREATED}`,
      'pickedUp:done:-',
      'completed:done:-',
    ]);
  });

  it('không bao giờ lấy giờ tạo đơn làm giờ giao/trả xe', () => {
    const steps = buildBookingTimeline({ ...base, status: BOOKING_STATUS.ACTIVE });
    expect(steps[1]!.at).toBeNull();
  });

  it.each([
    [BOOKING_STATUS.CANCELLED, BOOKING_TIMELINE_STEP.CANCELLED],
    [BOOKING_STATUS.NO_SHOW, BOOKING_TIMELINE_STEP.NO_SHOW],
  ])('%s: điểm cuối tiêu cực thay cho hai mốc sau, không có giờ', (status, key) => {
    expect(summary(buildBookingTimeline({ ...base, status }))).toEqual([
      `created:done:${CREATED}`,
      `${key}:failed:-`,
    ]);
  });

  it('trạng thái cũ `confirmed` (deprecated) đọc như chờ giao xe', () => {
    const steps = buildBookingTimeline({ ...base, status: BOOKING_STATUS.CONFIRMED });
    expect(steps.map((s) => s.state)).toEqual(['done', 'todo', 'todo']);
  });
});

describe('isDebtOverdue', () => {
  it('chuyến chưa kết thúc còn nợ là bình thường — không cảnh báo', () => {
    expect(isDebtOverdue({ status: BOOKING_STATUS.RESERVED, debtAmount: '500000' })).toBe(false);
    expect(isDebtOverdue({ status: BOOKING_STATUS.ACTIVE, debtAmount: '500000' })).toBe(false);
  });

  it('chuyến đã hoàn thành mà còn nợ ⇒ quá hạn', () => {
    expect(isDebtOverdue({ status: BOOKING_STATUS.COMPLETED, debtAmount: '500000' })).toBe(true);
  });

  it('hết nợ thì không cảnh báo, kể cả chuyến đã hoàn thành', () => {
    expect(isDebtOverdue({ status: BOOKING_STATUS.COMPLETED, debtAmount: '0' })).toBe(false);
    expect(isDebtOverdue({ status: BOOKING_STATUS.COMPLETED, debtAmount: '0.00' })).toBe(false);
  });

  it('đơn huỷ không bị coi là nợ quá hạn', () => {
    expect(isDebtOverdue({ status: BOOKING_STATUS.CANCELLED, debtAmount: '500000' })).toBe(false);
  });
});

describe('isInDebtScope', () => {
  it('đơn huỷ nằm ngoài phạm vi công nợ (cùng luật SQL_DEBT_SCOPE phía API)', () => {
    expect(isInDebtScope({ status: BOOKING_STATUS.CANCELLED })).toBe(false);
  });

  it.each([
    BOOKING_STATUS.RESERVED,
    BOOKING_STATUS.ACTIVE,
    BOOKING_STATUS.COMPLETED,
    BOOKING_STATUS.NO_SHOW,
  ])('%s vẫn tính công nợ', (status) => {
    expect(isInDebtScope({ status })).toBe(true);
  });
});

describe('otherChargesAmount', () => {
  const money = { baseAmount: '520000', deliveryFee: '50000', discountAmount: '52000' };

  it('tổng khớp đúng tiền thuê + giao xe − giảm giá ⇒ không có dòng phụ phí', () => {
    expect(otherChargesAmount({ ...money, totalAmount: '518000' })).toBeNull();
  });

  it('tổng lớn hơn (phụ phí phát sinh nằm trong phải-thu) ⇒ phần chênh, tính trên chuỗi', () => {
    expect(otherChargesAmount({ ...money, totalAmount: '718000' })).toBe('200000');
  });

  it('chênh ÂM (dữ liệu lệch) thì không dựng một "phụ phí" âm', () => {
    expect(otherChargesAmount({ ...money, totalAmount: '500000' })).toBeNull();
  });

  it('giữ phần lẻ xu thay vì làm tròn qua Number (ADR 0007)', () => {
    expect(
      otherChargesAmount({
        baseAmount: '100000.10',
        deliveryFee: '0',
        discountAmount: '0',
        totalAmount: '100000.35',
      }),
    ).toBe('0.25');
  });
});
