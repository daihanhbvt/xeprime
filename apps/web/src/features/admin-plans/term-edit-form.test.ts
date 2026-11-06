import { describe, expect, it } from 'vitest';
import { toAppTz } from '@/lib/datetime';
import { termEditDefaults, toUpdateTermBody } from './term-edit-form';
import type { Subscription } from './types';

const term = (over: Partial<Subscription> = {}) =>
  ({
    id: 's',
    price: '5000000',
    startsAt: '2026-09-21T03:15:00.123Z',
    endsAt: '2027-03-21T03:15:00.123Z',
    quota: { maxVehicles: null, maxBranches: null, maxMembers: null },
    note: null,
    origin: 'admin',
    ...over,
  }) as Subscription;

describe('toUpdateTermBody - chỉ gửi trường đã đổi', () => {
  it('mở rồi lưu ngay ⇒ payload rỗng (ngày giữ đủ mili giây khi đi vòng qua ô chọn)', () => {
    expect(toUpdateTermBody(term(), termEditDefaults(term()))).toEqual({});
  });

  it('đổi giá, trần xe, ngày, ghi chú', () => {
    const form = {
      ...termEditDefaults(term()),
      price: 7_000_000,
      unlimitedVehicles: false,
      maxVehicles: 40,
      endsAt: toAppTz('2027-04-21T03:15:00.123Z'),
      note: '  HĐ 12  ',
    };
    expect(toUpdateTermBody(term(), form)).toEqual({
      price: '7000000',
      maxVehicles: 40,
      endsAt: '2027-04-21T03:15:00.123Z',
      note: 'HĐ 12',
    });
  });

  it('kỳ từ hoá đơn đã trả không bao giờ gửi giá; xoá ghi chú ⇒ null', () => {
    const paid = term({ origin: 'payment', note: 'cũ' });
    const form = { ...termEditDefaults(paid), price: 1, note: '' };
    expect(toUpdateTermBody(paid, form)).toEqual({ note: null });
  });
});
