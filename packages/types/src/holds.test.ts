import { describe, expect, it } from 'vitest';
import {
  COMMISSION_PERCENT_MAX,
  COMMISSION_PERCENT_MIN,
  ESCROW_MAX_PERCENT,
  FREE_TRIP_ALLOWANCE,
  HOLD_FREE_CANCEL_HOURS,
  HOLD_MIN_AMOUNT,
  HOLD_PAYMENT_WINDOW_MINUTES,
  WITHDRAWAL_TERMS,
  holdExpiresAt,
  holdFreeCancelUntil,
  holdRemainingMs,
  isHoldPastDue,
  isWithinFreeCancel,
} from './holds';
import {
  BOOKING_HOLD_OUTCOME,
  BOOKING_HOLD_OUTCOME_VALUES,
  BOOKING_HOLD_PURPOSE,
  BOOKING_HOLD_PURPOSE_VALUES,
  BOOKING_HOLD_STATUS,
  creditsShopWallet,
  isAwaitingPayment,
  isHeldForSomeoneElse,
  isOutcomeAllowed,
} from './status/hold';
import { WALLET_ENTRY_KIND } from './status/wallet';
import {
  BILLING_MODE,
  FEATURE_STATE,
  PLAN_FEATURE,
  PLAN_FEATURE_LABEL,
  PLAN_FEATURE_VALUES,
  REFERENCE_CODE_ALPHABET,
  REFERENCE_CODE_PREFIX,
  BANK_MATCH_TARGET_TYPE,
  canWriteFeature,
  chargesCommission,
  featureState,
  isFeatureVisible,
  referenceCodeTarget,
} from './status/billing';
import { PERMISSION } from './rbac';

/**
 * Đây là các mốc TIỀN phụ thuộc vào (ADR 0021): api tính, worker dọn, web/mobile đếm ngược.
 * Sai một mốc là hoặc thu tiền của người đáng được hoàn, hoặc hoàn tiền cho người không đáng.
 */
describe('mốc thời gian của khoản giữ chỗ', () => {
  const pickup = new Date('2026-09-01T10:00:00.000Z');

  it('mốc huỷ miễn phí là đúng 4 giờ trước giờ nhận', () => {
    expect(holdFreeCancelUntil(pickup).toISOString()).toBe('2026-09-01T06:00:00.000Z');
    expect(HOLD_FREE_CANCEL_HOURS).toBe(4);
  });

  it('hạn chuyển khoản là đúng 15 phút sau khi tạo', () => {
    const created = new Date('2026-08-28T03:00:00.000Z');
    expect(holdExpiresAt(created).toISOString()).toBe('2026-08-28T03:15:00.000Z');
    expect(HOLD_PAYMENT_WINDOW_MINUTES).toBe(15);
  });

  /**
   * Mốc là một thời điểm TUYỆT ĐỐI, không phải một giờ địa phương. Nếu ai đó nhập máy móc múi
   * giờ VN vào `holds.ts`, phép trừ sẽ lệch và test này đỏ.
   */
  it('không phụ thuộc múi giờ: cùng một mốc dù biểu diễn khác nhau', () => {
    const asVnLocal = new Date('2026-09-01T17:00:00.000+07:00'); // = 10:00Z
    expect(holdFreeCancelUntil(asVnLocal).getTime()).toBe(holdFreeCancelUntil(pickup).getTime());
  });

  it('qua nửa đêm vẫn đúng — không có bước "về đầu ngày"', () => {
    const earlyMorning = new Date('2026-09-02T02:00:00.000Z');
    expect(holdFreeCancelUntil(earlyMorning).toISOString()).toBe('2026-09-01T22:00:00.000Z');
  });
});

describe('quyền huỷ miễn phí', () => {
  const until = new Date('2026-09-01T06:00:00.000Z');

  it('trước mốc thì còn quyền, sau mốc thì hết', () => {
    expect(isWithinFreeCancel(until, new Date('2026-09-01T05:59:59.000Z'))).toBe(true);
    expect(isWithinFreeCancel(until, new Date('2026-09-01T06:00:01.000Z'))).toBe(false);
  });

  it('đúng ngay mốc là ĐÃ HẾT quyền — biên đóng về phía nền tảng, không mơ hồ', () => {
    expect(isWithinFreeCancel(until, until)).toBe(false);
  });

  it('nhận cả chuỗi ISO vì API trả về string, không phải Date', () => {
    expect(isWithinFreeCancel(until.toISOString(), new Date('2026-09-01T05:00:00.000Z'))).toBe(
      true,
    );
  });

  it('không có mốc thì KHÔNG được hoàn — mặc định an toàn', () => {
    expect(isWithinFreeCancel(null)).toBe(false);
    expect(isWithinFreeCancel(undefined)).toBe(false);
  });
});

describe('hạn chuyển khoản', () => {
  const expires = new Date('2026-08-28T03:15:00.000Z');

  /**
   * Trạng thái `expired` do worker ghi, nên luôn có một cửa sổ mà hold đã quá hạn nhưng cột
   * `status` vẫn là `pending`. Đường xử lý webhook phải hỏi hàm này, không hỏi cột.
   */
  it('quá hạn tính theo MỐC, đúng ngay mốc là đã quá', () => {
    expect(isHoldPastDue(expires, new Date('2026-08-28T03:14:59.000Z'))).toBe(false);
    expect(isHoldPastDue(expires, expires)).toBe(true);
  });

  it('đếm ngược không bao giờ âm', () => {
    expect(holdRemainingMs(expires, new Date('2026-08-28T03:14:00.000Z'))).toBe(60_000);
    expect(holdRemainingMs(expires, new Date('2026-08-28T04:00:00.000Z'))).toBe(0);
    expect(holdRemainingMs(null)).toBe(0);
  });
});

describe('sàn số tiền giữ chỗ', () => {
  /**
   * Đây là SÀN, không phải làm tròn (ADR 0021 ràng buộc 3). Test khoá ý nghĩa đó: một khoản
   * lẻ như 78.000đ phải đi qua nguyên vẹn, vì VietQR mang sẵn số tiền và số chính xác là thứ
   * làm cho đối soát tự động rẻ.
   */
  it('không làm tròn số lẻ lên nghìn', () => {
    const computed = 78_000;
    expect(Math.max(computed, HOLD_MIN_AMOUNT)).toBe(78_000);
  });

  it('chỉ nâng khi thật sự dưới sàn', () => {
    expect(Math.max(5_000, HOLD_MIN_AMOUNT)).toBe(HOLD_MIN_AMOUNT);
  });
});

describe('mục đích của khoản giữ chỗ — tiền này của ai', () => {
  /**
   * Ràng buộc đắt nhất trong cả mô hình: nền tảng KHÔNG BAO GIỜ được giữ lại một đồng escrow.
   * Test này là bản sao ở tầng ứng dụng của `CHECK` trong migration (ADR 0025 điều 4).
   */
  it('escrow không bao giờ được mang kết cục “nền tảng giữ”', () => {
    expect(isOutcomeAllowed(BOOKING_HOLD_PURPOSE.ESCROW, BOOKING_HOLD_OUTCOME.KEPT)).toBe(false);
    expect(isOutcomeAllowed(BOOKING_HOLD_PURPOSE.COMMISSION, BOOKING_HOLD_OUTCOME.KEPT)).toBe(true);
  });

  it('hold hoa hồng không bao giờ “chuyển gian hàng” như tiền của họ', () => {
    expect(
      isOutcomeAllowed(BOOKING_HOLD_PURPOSE.COMMISSION, BOOKING_HOLD_OUTCOME.RELEASED_TO_SHOP),
    ).toBe(false);
    expect(
      isOutcomeAllowed(BOOKING_HOLD_PURPOSE.ESCROW, BOOKING_HOLD_OUTCOME.RELEASED_TO_SHOP),
    ).toBe(true);
  });

  it('hoàn khách hợp lệ với cả hai mục đích', () => {
    for (const p of BOOKING_HOLD_PURPOSE_VALUES) {
      expect(isOutcomeAllowed(p, BOOKING_HOLD_OUTCOME.REFUNDED)).toBe(true);
      expect(isOutcomeAllowed(p, BOOKING_HOLD_OUTCOME.FORFEITED)).toBe(true);
    }
  });

  it('chỉ escrow là nợ phải trả của nền tảng', () => {
    expect(isHeldForSomeoneElse(BOOKING_HOLD_PURPOSE.ESCROW)).toBe(true);
    expect(isHeldForSomeoneElse(BOOKING_HOLD_PURPOSE.COMMISSION)).toBe(false);
  });

  it('hai kết cục cùng ghi có ví gian hàng, và chúng là hai bút toán khác nhau', () => {
    expect(creditsShopWallet(BOOKING_HOLD_OUTCOME.FORFEITED)).toBe(true);
    expect(creditsShopWallet(BOOKING_HOLD_OUTCOME.RELEASED_TO_SHOP)).toBe(true);
    expect(creditsShopWallet(BOOKING_HOLD_OUTCOME.REFUNDED)).toBe(false);
    expect(creditsShopWallet(BOOKING_HOLD_OUTCOME.KEPT)).toBe(false);
    expect(WALLET_ENTRY_KIND.HOLD_FORFEIT).not.toBe(WALLET_ENTRY_KIND.HOLD_RELEASE);
  });
});

describe('ưu đãi hai chuyến đầu và các biên trong code', () => {
  it('hai lượt, không phải một hay năm', () => {
    expect(FREE_TRIP_ALLOWANCE).toBe(2);
  });

  /** Phí nền bằng 0 hoặc hoa hồng bằng 0 là cấu hình im lặng cho không dịch vụ (ADR 0020). */
  it('hoa hồng không được phép bằng 0 — miễn phí đi đường riêng', () => {
    expect(COMMISSION_PERCENT_MIN).toBeGreaterThan(0);
    expect(COMMISSION_PERCENT_MAX).toBeGreaterThanOrEqual(15);
  });

  /** Không có trần thì “cọc giữ chỗ” thành thu tiền thuê trước (ADR 0025 điều 3). */
  it('escrow có trần cứng dưới 100% giá chuyến', () => {
    expect(ESCROW_MAX_PERCENT).toBeGreaterThan(0);
    expect(ESCROW_MAX_PERCENT).toBeLessThan(100);
  });

  it('rút tiền có cam kết cụ thể, không phải “sớm nhất có thể”', () => {
    expect(WITHDRAWAL_TERMS.MIN_AMOUNT).toBeGreaterThan(0);
    expect(WITHDRAWAL_TERMS.CUTOFF_HOUR_VN).toBeGreaterThan(0);
    expect(WITHDRAWAL_TERMS.CUTOFF_HOUR_VN).toBeLessThan(24);
    expect(WITHDRAWAL_TERMS.MAX_BUSINESS_DAYS).toBeGreaterThan(0);
  });
});

describe('trạng thái và kết cục của hold', () => {
  it('pending và underpaid đều đang chờ tiền — cả hai vẫn giữ chỗ', () => {
    expect(isAwaitingPayment(BOOKING_HOLD_STATUS.PENDING)).toBe(true);
    expect(isAwaitingPayment(BOOKING_HOLD_STATUS.UNDERPAID)).toBe(true);
    expect(isAwaitingPayment(BOOKING_HOLD_STATUS.PAID)).toBe(false);
    expect(isAwaitingPayment(BOOKING_HOLD_STATUS.EXPIRED)).toBe(false);
  });

  it('bốn kết cục sau khi ADR 0025 thêm đường trả về gian hàng', () => {
    expect([...BOOKING_HOLD_OUTCOME_VALUES].sort()).toEqual([
      'forfeited',
      'kept',
      'refunded',
      'released_to_shop',
    ]);
    expect(BOOKING_HOLD_OUTCOME.KEPT).toBe('kept');
  });
});

describe('chế độ thu phí', () => {
  it('chỉ tuyến hoa hồng mới trừ % trên chuyến', () => {
    expect(chargesCommission(BILLING_MODE.COMMISSION)).toBe(true);
    expect(chargesCommission(BILLING_MODE.PACKAGE)).toBe(false);
  });
});

describe('năng lực theo gói — trục thứ hai, độc lập với quyền theo vai', () => {
  it('có gói thì dùng được, ghi được', () => {
    const s = featureState(true, false);
    expect(s).toBe(FEATURE_STATE.ENABLED);
    expect(canWriteFeature(s)).toBe(true);
    expect(isFeatureVisible(s)).toBe(true);
  });

  /**
   * Điều quan trọng nhất của ADR 0027: hết hạn gói KHÔNG được làm người ta mất quyền xem sổ sách
   * của chính mình. Menu còn, đọc được, chỉ ghi bị chặn.
   */
  it('hết gói nhưng đã có dữ liệu ⇒ chỉ đọc, KHÔNG ẩn', () => {
    const s = featureState(false, true);
    expect(s).toBe(FEATURE_STATE.READ_ONLY);
    expect(isFeatureVisible(s)).toBe(true);
    expect(canWriteFeature(s)).toBe(false);
  });

  it('chưa bao giờ dùng thì ẩn hẳn — chủ xe mới không phải nhìn menu khoá', () => {
    const s = featureState(false, false);
    expect(s).toBe(FEATURE_STATE.HIDDEN);
    expect(isFeatureVisible(s)).toBe(false);
    expect(canWriteFeature(s)).toBe(false);
  });

  it('mọi cờ tính năng đều có nhãn cho màn “Gói của tôi”', () => {
    for (const f of PLAN_FEATURE_VALUES) {
      expect(PLAN_FEATURE_LABEL[f]).toBeTruthy();
    }
  });

  /** Ba màn người dùng nêu đích danh phải nằm sau gói, không được lọt vào bậc cơ bản. */
  it('thu chi, công nợ, bảo dưỡng là tính năng của gói', () => {
    for (const f of [PLAN_FEATURE.FINANCE, PLAN_FEATURE.DEBTS, PLAN_FEATURE.MAINTENANCE]) {
      expect(PLAN_FEATURE_VALUES).toContain(f);
    }
  });

  /**
   * Cờ tính năng và permission là hai không gian tên khác nhau. Trùng chuỗi là dấu hiệu ai đó
   * đang định gộp hai trục lại (ADR 0027 điều 2).
   */
  it('không cờ nào trùng tên một permission', () => {
    const perms = new Set(Object.values(PERMISSION) as string[]);
    for (const f of PLAN_FEATURE_VALUES) expect(perms.has(f)).toBe(false);
  });
});

describe('mã đối soát', () => {
  it('tiền tố quyết định loại đích, không cần tra bảng', () => {
    expect(referenceCodeTarget('XPH2K9ADFG')).toBe(BANK_MATCH_TARGET_TYPE.BOOKING_HOLD);
    expect(referenceCodeTarget('XPG7NPQRST')).toBe(BANK_MATCH_TARGET_TYPE.SUBSCRIPTION_INVOICE);
  });

  it('chấp nhận chữ thường và khoảng trắng thừa — ngân hàng không hứa gì về định dạng', () => {
    expect(referenceCodeTarget('  xph2k9adfg ')).toBe(BANK_MATCH_TARGET_TYPE.BOOKING_HOLD);
  });

  /** Không rút được mã KHÔNG phải lỗi — nó là đường dẫn tới hàng đợi khớp tay (ADR 0022 điều 4). */
  it('không nhận ra thì trả null, không đoán', () => {
    expect(referenceCodeTarget('CK TIEN THUE XE')).toBeNull();
    expect(referenceCodeTarget('')).toBeNull();
    expect(referenceCodeTarget(null)).toBeNull();
  });

  it('hai tiền tố khác nhau — trùng nhau là khớp nhầm tiền giữa hai bảng', () => {
    expect(REFERENCE_CODE_PREFIX[BANK_MATCH_TARGET_TYPE.BOOKING_HOLD]).not.toBe(
      REFERENCE_CODE_PREFIX[BANK_MATCH_TARGET_TYPE.SUBSCRIPTION_INVOICE],
    );
  });

  /** ADR 0016 điều 5: người đọc lại mã từ màn hình ngân hàng sẽ nhầm 0/O và 1/I. */
  it('bảng chữ cái bỏ các ký tự dễ nhầm', () => {
    for (const ch of ['0', 'O', '1', 'I']) {
      expect(REFERENCE_CODE_ALPHABET).not.toContain(ch);
    }
  });

  it('mọi tiền tố đều dùng ký tự nằm trong bảng chữ cái', () => {
    for (const prefix of Object.values(REFERENCE_CODE_PREFIX)) {
      for (const ch of prefix) expect(REFERENCE_CODE_ALPHABET).toContain(ch);
    }
  });
});
