import { describe, expect, it } from 'vitest';

import {
  HANDOVER_CONFIRMATION_GRACE_MINUTES,
  handoverGraceEndsAt,
  notReceivedWindowPhase,
} from './status/handover';
import {
  SUPPORT_CASE_CATEGORY,
  SUPPORT_CASE_CATEGORY_SYSTEM_ONLY,
  SUPPORT_CASE_SETTLEMENT_FREEZING_CATEGORIES,
} from './status/support';

/** Ân hạn bàn giao (ADR 0066) — một mốc, hai biên, dùng chung API/worker/web. */
const PICKUP = new Date('2026-10-22T03:00:00.000Z');
const at = (minutes: number) => new Date(PICKUP.getTime() + minutes * 60_000);

describe('ân hạn bàn giao', () => {
  it('mốc hết ân hạn = giờ nhận + 120′', () => {
    expect(HANDOVER_CONFIRMATION_GRACE_MINUTES).toBe(120);
    expect(handoverGraceEndsAt(PICKUP).toISOString()).toBe('2026-10-22T05:00:00.000Z');
  });

  it('cửa sổ báo "chưa nhận được xe" là [pickupAt, pickupAt + 120′] — hai biên đều tính', () => {
    expect(notReceivedWindowPhase(PICKUP, at(-1))).toBe('before');
    expect(notReceivedWindowPhase(PICKUP, at(0))).toBe('open');
    expect(notReceivedWindowPhase(PICKUP, at(120))).toBe('open');
    expect(notReceivedWindowPhase(PICKUP, at(121))).toBe('closed');
  });
});

describe('loại case giữ quyết toán', () => {
  it('tranh chấp và chưa xác nhận bàn giao cùng giữ tiền; loại khác thì không', () => {
    expect(SUPPORT_CASE_SETTLEMENT_FREEZING_CATEGORIES).toEqual([
      SUPPORT_CASE_CATEGORY.DISPUTE,
      SUPPORT_CASE_CATEGORY.HANDOVER_UNCONFIRMED,
    ]);
  });

  it('`handover_unconfirmed` chỉ hệ thống mở', () => {
    expect(SUPPORT_CASE_CATEGORY_SYSTEM_ONLY).toContain(SUPPORT_CASE_CATEGORY.HANDOVER_UNCONFIRMED);
  });
});
