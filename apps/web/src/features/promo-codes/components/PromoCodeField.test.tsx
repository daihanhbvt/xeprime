import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { PROMO_INELIGIBLE_REASON } from '@xeprime/types';
import viMessages from '../../../../messages/vi';
import { PromoCodeField } from './PromoCodeField';
import type { PromoPreview, PromoTripParams } from '../types';

/**
 * Ô ÁP MÃ KHUYẾN MÃI — ADR 0046, giao diện khách thuê.
 *
 * Năm khẳng định của sản phẩm, và mỗi cái là một lỗi UX thật nếu làm sai:
 *
 *  1. **Mã gửi lên đã CHUẨN HOÁ** — khách gõ chữ thường hoặc dán kèm khoảng trắng vẫn áp được.
 *  2. **Nút "Áp dụng" không bấm được khi ô trống** — không có nút bấm được mà không có tác dụng.
 *  3. **Lý do hiện thành CHỮ, dịch từ MÃ** (ADR 0012) — không hiện `min_order_not_met` cho khách.
 *  4. **Đã áp ⇒ hiện mã + số giảm + nút bỏ**, và ô nhập biến mất (một chuyến một mã).
 *  5. **Điều kiện thuê đổi ⇒ nói ra**, không im lặng giữ số cũ và không im lặng bỏ mã.
 */
const TRIP: PromoTripParams = {
  vehicleId: '01VEHICLE000000000000000001',
  serviceType: 'self_drive',
  pickupAt: '2026-10-01T02:00:00.000Z',
  returnAt: '2026-10-03T02:00:00.000Z',
};

const APPLIED: PromoPreview = {
  code: 'BANMOI',
  applicable: true,
  reason: null,
  discountAmount: '100000',
  clamped: false,
  customerTotalAmount: '1440000',
  holdAmount: '320000',
  name: 'Ưu đãi khách hàng mới',
  description: null,
  discountType: 'fixed',
  discountPercent: null,
  maxDiscountAmount: null,
  minOrderAmount: '800000',
  endsAt: '2026-12-31T16:59:59.000Z',
};

function renderIt(props: Partial<Parameters<typeof PromoCodeField>[0]> = {}) {
  const onApply = vi.fn();
  const onRemove = vi.fn();
  /*
   * `retry: false` — component mở một query cho danh sách mã khả dụng. Để mặc định thì một lượt
   * gọi hỏng sẽ thử lại ba lần và test chờ vô ích.
   */
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="vi" messages={viMessages} timeZone="Asia/Ho_Chi_Minh">
        <PromoCodeField
          trip={TRIP}
          appliedCode={null}
          applied={null}
          checking={false}
          reason={null}
          onApply={onApply}
          onRemove={onRemove}
          {...props}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { onApply, onRemove };
}

describe('PromoCodeField', () => {
  it('chuẩn hoá mã trước khi gửi lên — chữ thường và khoảng trắng đều áp được', () => {
    const { onApply } = renderIt();

    fireEvent.change(screen.getByLabelText('Mã khuyến mãi'), { target: { value: '  ban moi ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Áp dụng' }));

    expect(onApply).toHaveBeenCalledWith('BANMOI');
  });

  it('nút Áp dụng KHÔNG bấm được khi ô trống', () => {
    renderIt();
    expect(screen.getByRole('button', { name: 'Áp dụng' })).toHaveProperty('disabled', true);
  });

  it('đang kiểm tra ⇒ nói ra, và ô nhập bị khoá', () => {
    renderIt({ checking: true });
    expect(screen.getByText('Đang kiểm tra mã…')).toBeTruthy();
    expect(screen.getByLabelText('Mã khuyến mãi')).toHaveProperty('disabled', true);
  });

  it('lý do hiện thành CHỮ, dịch từ MÃ — không hiện mã kỹ thuật cho khách', () => {
    renderIt({ reason: PROMO_INELIGIBLE_REASON.MIN_ORDER_NOT_MET });
    expect(screen.getByText('Chuyến chưa đạt giá trị tối thiểu của mã')).toBeTruthy();
    expect(screen.queryByText(/min_order_not_met/)).toBeNull();
  });

  it('mã lý do LẠ (backend thêm mới) không làm sập bảng giá', () => {
    renderIt({ reason: 'some_future_reason' });
    // Rơi về câu chung thay vì ném — bảng giá của khách không được phép trắng vì một mã mới.
    expect(screen.getByText('Mã khuyến mãi không tồn tại')).toBeTruthy();
  });

  it('đã áp: hiện mã, số giảm và nút bỏ; ô nhập biến mất', () => {
    const { onRemove } = renderIt({ appliedCode: 'BANMOI', applied: APPLIED });

    expect(screen.getByText('BANMOI')).toBeTruthy();
    expect(screen.getByText('Ưu đãi khách hàng mới')).toBeTruthy();
    expect(screen.getByText(/100\.000/)).toBeTruthy();
    // Một chuyến MỘT mã — không mời gõ mã thứ hai.
    expect(screen.queryByRole('button', { name: 'Áp dụng' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ mã khuyến mãi đang áp dụng' }));
    expect(onRemove).toHaveBeenCalled();
  });

  it('mã bị TRẦN kẹp ⇒ nói rõ số thật, không để khách tự trừ mệnh giá', () => {
    renderIt({
      appliedCode: 'VAOTHU',
      applied: { ...APPLIED, code: 'VAOTHU', clamped: true, discountAmount: '80000' },
    });
    expect(screen.getByText(/Mã giảm tối đa/)).toBeTruthy();
  });

  it('mã bị BỎ vì điều kiện thuê đổi ⇒ NÓI RA, không im lặng', () => {
    renderIt({ droppedCode: 'BANMOI' });
    expect(screen.getByText(/BANMOI không còn áp dụng được/)).toBeTruthy();
  });

  it('chuyến KHÔNG thu trước ⇒ giải thích thay vì mời gõ mã', () => {
    renderIt({ unavailable: true });
    expect(screen.getByText('Chuyến này chưa chốt giá nên chưa áp được mã khuyến mãi.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Áp dụng' })).toBeNull();
    // Và không mời mở danh sách mã — không có mã nào áp được ở đây.
    expect(screen.queryByRole('button', { name: 'Xem mã khả dụng' })).toBeNull();
  });

  it('chuyến chưa báo giá được (trip = null) ⇒ khối tự ẩn hoàn toàn', () => {
    renderIt({ trip: null });
    expect(screen.queryByLabelText('Mã khuyến mãi')).toBeNull();
  });

  it('dấu "i" là một NÚT thật, dùng được bằng bàn phím', async () => {
    renderIt();
    const hint = screen.getByRole('button', { name: 'Giải thích về mã khuyến mãi' });
    expect(hint.getAttribute('type')).toBe('button');
    // Nội dung có mặt trong cây khả truy cập không phụ thuộc trạng thái mở của tooltip.
    await waitFor(() =>
      expect(screen.getByText(/Mã do XePrime tài trợ/)).toBeTruthy(),
    );
  });
});
