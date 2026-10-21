import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { intlWrapper } from '@/i18n/test-utils';
import { useFreeCancelNote } from './use-free-cancel-note';
import type { CustomerTripDetail } from './types';

type Hold = NonNullable<CustomerTripDetail['hold']>;

/**
 * Câu "huỷ thế nào thì tiền đi đâu" — ba trạng thái (ADR 0064). Hàm chỉ CHỌN câu; mọi con số do
 * server đưa (`lateCancelRefundAmount`), nên test khoá đúng lựa chọn câu theo từng trạng thái.
 */
function hold(overrides: Partial<Hold>): Hold {
  return {
    freeCancelAvailable: true,
    // Mốc huỷ miễn phí SAU hạn thanh toán ⇒ cửa sổ thường lệ.
    expiresAt: '2026-08-10T03:00:00.000Z',
    freeCancelUntil: '2026-08-10T05:00:00.000Z',
    lateCancelRefundAmount: '0',
    ...overrides,
  } as Hold;
}

function note(h: Hold): string {
  const { result } = renderHook(() => useFreeCancelNote(), { wrapper: intlWrapper('vi') });
  return result.current(h);
}

describe('useFreeCancelNote', () => {
  it('không có thời gian huỷ miễn phí (đặt gấp): không in mốc nào, nói thẳng là không có', () => {
    const text = note(hold({ freeCancelAvailable: false, lateCancelRefundAmount: '70000' }));
    expect(text).toContain('không có thời gian huỷ miễn phí');
    expect(text).toContain('70.000');
    expect(text).not.toContain('Huỷ trước');
  });

  it('không có huỷ miễn phí và không có bảo hiểm để hoàn ⇒ câu không nhắc tới bảo hiểm', () => {
    const text = note(hold({ freeCancelAvailable: false, lateCancelRefundAmount: '0' }));
    expect(text).toContain('không có thời gian huỷ miễn phí');
    expect(text).not.toContain('bảo hiểm');
  });

  it('cửa sổ NGẮN (bị kẹp bởi giờ nhận xe) ⇒ báo ngắn hơn thường lệ + câu huỷ muộn', () => {
    const text = note(
      hold({
        freeCancelUntil: '2026-08-10T03:00:00.000Z',
        expiresAt: '2026-08-10T03:00:00.000Z',
        lateCancelRefundAmount: '50000',
      }),
    );
    expect(text).toContain('ngắn hơn thường lệ');
    expect(text).toContain('Huỷ sau mốc này');
    expect(text).toContain('50.000');
  });

  it('thường lệ ⇒ mốc huỷ miễn phí + câu huỷ muộn không bảo hiểm', () => {
    const text = note(hold({}));
    expect(text).toMatch(/^Huỷ trước .+ được hoàn 100%/);
    expect(text).not.toContain('ngắn hơn thường lệ');
    expect(text).toContain('Huỷ sau mốc này thì tiền giữ chỗ không được hoàn');
  });
});
