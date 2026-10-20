import { describe, expect, it } from 'vitest';
import { SERVICE_TYPE } from '@xeprime/types';
import { toAppTz } from '@/lib/datetime';
import { publicQuoteParams } from './use-public-quote';

/**
 * Thẻ đặt xe (trang chi tiết) và hộp gửi yêu cầu hỏi giá CÙNG một câu — và dùng chung cache
 * TanStack — chỉ khi tham số dựng ra giống hệt nhau. `publicQuoteParams` là chỗ dựng duy nhất.
 */
const pickupAt = toAppTz('2026-11-01T01:00:00.000Z');
const returnAt = toAppTz('2026-11-03T01:00:00.000Z');

describe('publicQuoteParams', () => {
  it('tự lái: gửi khoảng nhận–trả, KHÔNG gửi lộ trình', () => {
    expect(
      publicQuoteParams({
        serviceType: SERVICE_TYPE.SELF_DRIVE,
        pickupAt,
        returnAt,
        routeType: 'in_city',
      }),
    ).toEqual({
      pickupAt: '2026-11-01T01:00:00.000Z',
      returnAt: '2026-11-03T01:00:00.000Z',
      serviceType: SERVICE_TYPE.SELF_DRIVE,
    });
  });

  it('có tài xế: giữ lộ trình', () => {
    expect(
      publicQuoteParams({
        serviceType: SERVICE_TYPE.WITH_DRIVER,
        pickupAt,
        returnAt,
        routeType: 'inter_city',
      }),
    ).toMatchObject({ serviceType: SERVICE_TYPE.WITH_DRIVER, routeType: 'inter_city' });
  });

  it('dài hạn: chỉ gói, không gửi ngày (ADR 0011); chưa có gói thì không hỏi', () => {
    expect(
      publicQuoteParams({
        serviceType: SERVICE_TYPE.LONG_TERM,
        pickupAt,
        returnAt,
        packageMonths: 3,
      }),
    ).toEqual({ serviceType: SERVICE_TYPE.LONG_TERM, packageMonths: 3 });
    expect(
      publicQuoteParams({ serviceType: SERVICE_TYPE.LONG_TERM, packageMonths: null }),
    ).toBeNull();
  });

  it('thiếu ngày nhận hoặc trả: không hỏi giá', () => {
    expect(
      publicQuoteParams({ serviceType: SERVICE_TYPE.SELF_DRIVE, pickupAt, returnAt: null }),
    ).toBeNull();
  });
});
