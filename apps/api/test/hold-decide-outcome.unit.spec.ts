import { Prisma } from '@xeprime/prisma';
import {
  ALLOCATION_TARGET,
  AUDIT_ACTOR_SCOPE,
  BOOKING_HOLD_OUTCOME,
  BOOKING_STATUS,
  HOLD_REFUND_REASON,
  allocationTotals,
} from '@xeprime/types';
import { allocationForHold, decideOutcome } from '../src/modules/holds/hold-settlement.service';

/**
 * Luật kết cục của khoản giữ chỗ (ADR 0064) — hàm THUẦN, không cần DB.
 *
 * Khoá hai điều mà sổ hoàn và màn xem trước lượt huỷ của khách cùng dựa vào:
 *  - huỷ muộn / không đến là LUẬT TỰ ĐỘNG, mang lý do `late_cancel` / `no_show` chứ không phải
 *    "quyết định của XePrime";
 *  - phép chia dùng chung (`allocationForHold`) cho ra đúng con số lượt chốt thật ghi xuống.
 */
describe('decideOutcome — lý do hoàn của kết cục tự động', () => {
  const past = new Date(Date.now() - 3_600_000);
  const future = new Date(Date.now() + 3_600_000);

  it('khách huỷ TRƯỚC mốc miễn phí ⇒ hoàn hết, `early_cancel`', () => {
    expect(
      decideOutcome({
        to: BOOKING_STATUS.CANCELLED,
        actorScope: AUDIT_ACTOR_SCOPE.CUSTOMER,
        freeCancelUntil: future,
      }),
    ).toEqual({
      outcome: BOOKING_HOLD_OUTCOME.REFUNDED,
      refundReason: HOLD_REFUND_REASON.EARLY_CANCEL,
    });
  });

  it('khách huỷ SAU mốc ⇒ `split_late_cancel`, lý do `late_cancel` (không phải admin_decision)', () => {
    expect(
      decideOutcome({
        to: BOOKING_STATUS.CANCELLED,
        actorScope: AUDIT_ACTOR_SCOPE.CUSTOMER,
        freeCancelUntil: past,
      }),
    ).toEqual({
      outcome: BOOKING_HOLD_OUTCOME.SPLIT_LATE_CANCEL,
      refundReason: HOLD_REFUND_REASON.LATE_CANCEL,
    });
  });

  it('không đến nhận xe ⇒ như huỷ muộn, lý do `no_show`', () => {
    expect(
      decideOutcome({
        to: BOOKING_STATUS.NO_SHOW,
        actorScope: AUDIT_ACTOR_SCOPE.TENANT,
        freeCancelUntil: future,
      }),
    ).toEqual({
      outcome: BOOKING_HOLD_OUTCOME.SPLIT_LATE_CANCEL,
      refundReason: HOLD_REFUND_REASON.NO_SHOW,
    });
  });

  it('gian hàng huỷ dù đã qua mốc ⇒ khách được hoàn 100%', () => {
    expect(
      decideOutcome({
        to: BOOKING_STATUS.CANCELLED,
        actorScope: AUDIT_ACTOR_SCOPE.TENANT,
        freeCancelUntil: past,
      }),
    ).toEqual({
      outcome: BOOKING_HOLD_OUTCOME.REFUNDED,
      refundReason: HOLD_REFUND_REASON.OWNER_CANCEL,
    });
  });
});

describe('allocationForHold — phép chia lượt chốt thật và màn xem trước dùng chung', () => {
  const hold = {
    depositAmount: new Prisma.Decimal(100_000),
    serviceFeeAmount: new Prisma.Decimal(50_000),
    ownerCommissionAmount: new Prisma.Decimal(20_000),
    vehicleInsuranceAmount: new Prisma.Decimal(50_000),
    personalInsuranceAmount: new Prisma.Decimal(20_000),
    promoDiscountAmount: new Prisma.Decimal(0),
    priceSnapshotJson: { fees: { taxAmount: '10000' } } as Prisma.JsonValue,
  };

  it('huỷ muộn (ADR 0066): khách chỉ nhận lại IV + IP, chủ xe nhận trọn D, XePrime giữ S + H', () => {
    const totals = allocationTotals(
      allocationForHold(hold, BOOKING_HOLD_OUTCOME.SPLIT_LATE_CANCEL) ?? [],
    );
    expect(totals[ALLOCATION_TARGET.CUSTOMER_BALANCE]).toBe('70000'); // IV 50.000 + IP 20.000
    expect(totals[ALLOCATION_TARGET.OWNER_BALANCE]).toBe('100000'); // D
    expect(totals[ALLOCATION_TARGET.PLATFORM_REVENUE]).toBe('70000'); // S 50.000 + H 20.000
    // Huỷ không bao giờ có thuế.
    expect(totals[ALLOCATION_TARGET.TAX_LEDGER]).toBe('0');
  });

  it('kết cục LEGACY không phân bổ gì', () => {
    expect(allocationForHold(hold, BOOKING_HOLD_OUTCOME.KEPT)).toBeNull();
  });
});
