import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { intlWrapper } from '@/i18n/test-utils';
import { useFreeCancelNote } from './use-free-cancel-note';
import type { CustomerTripDetail } from './types';

type Hold = NonNullable<CustomerTripDetail['hold']>;

/**
 * Câu "huỷ thế nào thì tiền đi đâu" — ba trạng thái (ADR 0064 · ADR 0072). Hàm chỉ CHỌN câu; mọi con số do
 * server đưa (`lateCancelRefundAmount`), nên test khoá đúng lựa chọn câu theo từng trạng thái.
 */
function hold(overrides: Partial<Hold>): Hold {
  return {
    freeCancelAvailable: true,
    // Mặc định: ĐÃ trả đủ — mốc huỷ miễn phí đã lưu, đếm từ lúc trả (ADR 0072).
    freeCancelStarted: true,
    freeCancelMinutes: 120,
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

  /**
   * ADR 0072: CHƯA trả thì chưa có mốc huỷ miễn phí nào — câu nói ĐỘ DÀI cửa sổ tính từ lúc thanh
   * toán thành công (server xem trước), không in một giờ cụ thể, không nói "kết thúc trước hạn".
   */
  it('chưa trả ⇒ huỷ miễn phí tính TỪ LÚC THANH TOÁN, nói độ dài chứ không nói giờ', () => {
    const text = note(
      hold({ freeCancelStarted: false, freeCancelMinutes: 65, lateCancelRefundAmount: '50000' }),
    );
    expect(text).toMatch(/^Huỷ miễn phí trong 1 giờ 5 phút kể từ lúc thanh toán thành công/);
    expect(text).not.toContain('Huỷ trước');
    expect(text).not.toContain('TRƯỚC hạn thanh toán');
    expect(text).toContain('50.000');
  });

  it('đã trả ⇒ mốc huỷ miễn phí ĐÃ LƯU + câu huỷ muộn không bảo hiểm', () => {
    const text = note(hold({}));
    expect(text).toMatch(/^Huỷ trước .+ được hoàn 100%/);
    expect(text).toContain('Huỷ sau mốc này thì tiền giữ chỗ không được hoàn');
  });
});
