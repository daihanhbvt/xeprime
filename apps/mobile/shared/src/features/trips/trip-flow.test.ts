import {
  COLLATERAL_MODE,
  CUSTOMER_TRIP_STAGE,
  FUEL_TYPE,
  SERVICE_TYPE,
  TRIP_ROLE,
} from '@xeprime/types';
import {
  canStartHoldPayment,
  hasHoldStage,
  isPaymentSuccessFresh,
  PAYMENT_SUCCESS_FRESH_MS,
  pickupChecklistItems,
  TRIP_FLOW_VIEW,
  tripFlowView,
  tripRequestSteps,
} from './trip-flow';

/** Luật của các màn chuyến design v2 — chép từ web PR #207, khoá ở đây để hai client không lệch. */
describe('tripFlowView — chặng → màn', () => {
  it.each([
    [CUSTOMER_TRIP_STAGE.PENDING_APPROVAL, TRIP_FLOW_VIEW.PENDING],
    [CUSTOMER_TRIP_STAGE.AWAITING_HOLD, TRIP_FLOW_VIEW.AWAITING_HOLD],
    [CUSTOMER_TRIP_STAGE.READY, TRIP_FLOW_VIEW.CONFIRMED],
  ])('khách, chặng %s ⇒ %s', (stage, view) => {
    expect(tripFlowView(TRIP_ROLE.RENTER, stage)).toBe(view);
  });

  it.each([
    CUSTOMER_TRIP_STAGE.ACTIVE,
    CUSTOMER_TRIP_STAGE.COMPLETED,
    CUSTOMER_TRIP_STAGE.CANCELLED,
    CUSTOMER_TRIP_STAGE.REJECTED,
    CUSTOMER_TRIP_STAGE.SLOT_TAKEN,
  ])('khách, chặng %s ⇒ bố cục chung', (stage) => {
    expect(tripFlowView(TRIP_ROLE.RENTER, stage)).toBeNull();
  });

  it('CHỦ XE luôn ở bố cục chung — nơi có cụm Duyệt/Từ chối', () => {
    expect(tripFlowView(TRIP_ROLE.HOST, CUSTOMER_TRIP_STAGE.PENDING_APPROVAL)).toBeNull();
    expect(tripFlowView(TRIP_ROLE.HOST, CUSTOMER_TRIP_STAGE.READY)).toBeNull();
  });
});

describe('tripRequestSteps — tiến trình yêu cầu', () => {
  it('có khoản giữ chỗ: bốn mốc, đang chờ phản hồi', () => {
    expect(tripRequestSteps('response', true)).toEqual([
      { step: 'sent', state: 'done' },
      { step: 'response', state: 'current' },
      { step: 'hold', state: 'todo' },
      { step: 'confirmed', state: 'todo' },
    ]);
  });

  it('không có khoản giữ chỗ: KHÔNG có mốc "Hoàn tất giữ chỗ" (ADR 0044 điều 4)', () => {
    expect(tripRequestSteps('response', false).map((s) => s.step)).toEqual([
      'sent',
      'response',
      'confirmed',
    ]);
  });

  it('mốc không có trên thanh ⇒ đứng ở mốc xác nhận ngay sau nó', () => {
    expect(tripRequestSteps('hold', false).at(-1)).toEqual({ step: 'confirmed', state: 'current' });
  });

  it('chưa có bảng kê thì coi như CÓ chặng giữ chỗ; có bảng kê thì theo holdAmount', () => {
    expect(hasHoldStage(null)).toBe(true);
    expect(hasHoldStage({ fees: { holdAmount: '100000' } })).toBe(true);
    expect(hasHoldStage({ fees: { holdAmount: null } })).toBe(false);
    expect(hasHoldStage({ fees: null })).toBe(false);
  });
});

describe('canStartHoldPayment — ô xác nhận chính sách gác nút thanh toán', () => {
  it('chỉ mở khi đã tích VÀ chưa hết hạn', () => {
    expect(canStartHoldPayment(false, false)).toBe(false);
    expect(canStartHoldPayment(true, false)).toBe(true);
    expect(canStartHoldPayment(true, true)).toBe(false);
  });
});

describe('pickupChecklistItems — checklist nhận xe', () => {
  const base = {
    serviceType: SERVICE_TYPE.SELF_DRIVE,
    fuelType: FUEL_TYPE.GASOLINE,
    documents: [],
    depositRequired: '0',
    collateral: null,
  };

  it('tự lái: bằng lái · giấy tờ · kiểm xe · ký biên bản; cọc 0đ thì không dặn nộp cọc', () => {
    expect(pickupChecklistItems(base).map((i) => i.key)).toEqual([
      'licence',
      'identity',
      'inspect',
      'sign',
    ]);
  });

  it('có tài xế: không cần bằng lái', () => {
    const keys = pickupChecklistItems({ ...base, serviceType: SERVICE_TYPE.WITH_DRIVER }).map(
      (i) => i.key,
    );
    expect(keys).not.toContain('licence');
  });

  it('xe điện ⇒ "mức pin"; xe khác ⇒ "mức nhiên liệu"', () => {
    expect(pickupChecklistItems({ ...base, fuelType: FUEL_TYPE.ELECTRIC })).toContainEqual({
      key: 'inspect',
      energy: 'electric',
    });
    expect(pickupChecklistItems(base)).toContainEqual({ key: 'inspect', energy: 'other' });
  });

  it('cọc TIỀN của đơn thắng tài sản thế chấp', () => {
    const items = pickupChecklistItems({
      ...base,
      depositRequired: '3000000',
      collateral: { mode: COLLATERAL_MODE.ASSET, assetTypes: ['motorbike'] },
    });
    expect(items.at(-1)).toEqual({ key: 'deposit', amount: '3000000' });
    expect(items.map((i) => i.key)).not.toContain('asset');
  });

  it('không cọc tiền + thế chấp tài sản có loại ⇒ dặn để lại tài sản', () => {
    const items = pickupChecklistItems({
      ...base,
      collateral: { mode: COLLATERAL_MODE.ASSET, assetTypes: ['motorbike'] },
    });
    expect(items.at(-1)).toEqual({ key: 'asset', assets: ['motorbike'] });
  });

  it('thế chấp tài sản nhưng chưa khai loại nào ⇒ không dặn gì', () => {
    const items = pickupChecklistItems({
      ...base,
      collateral: { mode: COLLATERAL_MODE.ASSET, assetTypes: [] },
    });
    expect(items.map((i) => i.key)).not.toContain('asset');
  });

  it('giấy tờ chủ xe yêu cầu đi kèm mục định danh', () => {
    expect(pickupChecklistItems({ ...base, documents: ['cccd'] })).toContainEqual({
      key: 'identity',
      documents: ['cccd'],
    });
  });
});

describe('isPaymentSuccessFresh — khối "Thanh toán thành công"', () => {
  const now = Date.parse('2026-10-20T03:00:00.000Z');

  it('vừa trả trong 30′ ⇒ mở; quá 30′ ⇒ không chúc mừng lần hai', () => {
    expect(isPaymentSuccessFresh(new Date(now - 60_000).toISOString(), false, now)).toBe(true);
    expect(
      isPaymentSuccessFresh(new Date(now - PAYMENT_SUCCESS_FRESH_MS - 1).toISOString(), false, now),
    ).toBe(false);
  });

  it('vừa quay về từ cổng ⇒ mở, kể cả khi đã trả lâu', () => {
    expect(isPaymentSuccessFresh('2026-10-01T00:00:00.000Z', true, now)).toBe(true);
    expect(isPaymentSuccessFresh(null, false, now)).toBe(false);
  });
});
