import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import viMessages from '../../../messages/vi';
import { PriceBreakdown, type PriceBreakdownFees } from './PriceBreakdown';

/**
 * BẢNG KÊ PHỤ PHÍ PHÍA KHÁCH — ADR 0029 điều 1–2 (R3).
 *
 * Lời hứa của sản phẩm nằm gọn trong bốn khẳng định dưới đây, và mỗi cái đều là một cách nói dối
 * về tiền nếu làm sai:
 *
 *  1. **Tổng giá THUÊ và tổng KHÁCH TRẢ là hai con số khác nhau**, cùng hiện. Gộp lại thì hoặc
 *     gian hàng thấy doanh thu phồng lên, hoặc khách thấy một tổng không giải thích được.
 *  2. **Mỗi dòng nói rõ ai nhận** (ADR 0028 điều 3) — không gọi phí XePrime là thuế hay bảo hiểm.
 *  3. **Tuyến gói không có dòng phí 0đ lấp lửng** — không có phụ phí thì không có khối nào.
 *  4. **Dòng do CHỦ XE chịu không cộng vào tổng khách, và KHÁCH KHÔNG THẤY NÓ** (17/09/2026).
 *     Thuế khấu trừ nằm giữa hoá đơn của khách là một con số họ không trả và không giải thích
 *     được — người dùng thật đã hiểu nhầm đúng như vậy.
 */
const ROWS = [{ key: 'base', label: 'Tiền thuê 2 ngày', amount: '1000000' }];

/**
 * So một số tiền đã hiển thị, BỎ QUA kiểu khoảng trắng.
 *
 * `Intl.NumberFormat` chèn khoảng trắng KHÔNG NGẮT (U+00A0) giữa số và ký hiệu tiền tệ, nên một
 * chuỗi gõ tay trong test sẽ không bao giờ khớp. Chuẩn hoá trước khi so — đây là chuyện của
 * cách trình bày, không phải của con số.
 */
function moneyText(expected: string) {
  const want = expected.replace(/\s+/g, ' ');
  return (_content: string, node: Element | null) =>
    (node?.textContent ?? '').replace(/\s+/g, ' ').trim() === want;
}


function renderIt(fees: PriceBreakdownFees | null, audience: 'customer' | 'owner' = 'customer') {
  return render(
    <NextIntlClientProvider locale="vi" messages={viMessages} timeZone="Asia/Ho_Chi_Minh">
      <PriceBreakdown rows={ROWS} totalAmount="1000000" fees={fees} audience={audience} />
    </NextIntlClientProvider>,
  );
}

describe('PriceBreakdown — phụ phí phía khách', () => {
  it('tuyến hoa hồng: hiện phí dịch vụ, tổng khách trả và số giữ chỗ', () => {
    renderIt({
      lines: [
        { key: 'service_fee', bearer: 'customer', percent: 10, amount: '100000' },
      ],
      customerTotalAmount: '1100000',
      holdAmount: '100000',
    });

    // Nhãn theo NGƯỜI HƯỞNG, dịch qua Domain.feeLine.
    expect(screen.getByText('Phí dịch vụ XePrime')).toBeTruthy();
    // Hai con số cùng hiện: giá thuê (doanh thu gian hàng) và tổng khách trả.
    expect(screen.getAllByText(moneyText('1.000.000 ₫'))[0]).toBeTruthy();
    expect(screen.getAllByText(moneyText('1.100.000 ₫'))[0]).toBeTruthy();
    expect(screen.getByText('Tổng bạn trả')).toBeTruthy();
    expect(screen.getByText('Tiền giữ chỗ (trả trước)')).toBeTruthy();
    // Phần trả tay chủ xe = tổng khách − giữ chỗ.
    expect(screen.getByText('Trả chủ xe khi nhận xe')).toBeTruthy();
  });

  it('tuyến gói (không phụ phí): KHÔNG dựng khối nào, không có dòng 0đ lấp lửng', () => {
    renderIt({ lines: [], customerTotalAmount: '1000000', holdAmount: null });
    expect(screen.queryByText('Tổng bạn trả')).toBeNull();
    expect(screen.queryByText('Các khoản đi kèm chuyến')).toBeNull();
  });

  it('không truyền fees ⇒ bảng kê giữ nguyên như trước (đơn cũ, đơn ngoài luồng chợ)', () => {
    renderIt(null);
    expect(screen.queryByText('Tổng bạn trả')).toBeNull();
    expect(screen.getAllByText(moneyText('1.000.000 ₫'))[0]).toBeTruthy();
  });

  it('báo giá tạm tính (holdAmount null) ⇒ hiện phí dự kiến nhưng KHÔNG đòi chuyển tiền', () => {
    renderIt({
      lines: [{ key: 'service_fee', bearer: 'customer', percent: 10, amount: '100000' }],
      customerTotalAmount: '1100000',
      holdAmount: null,
    });

    expect(screen.getByText('Phí dịch vụ XePrime')).toBeTruthy();
    // Không thu % trên một con số chưa chốt (CLAUDE.md) — nên không có ô giữ chỗ.
    expect(screen.queryByText('Tiền giữ chỗ (trả trước)')).toBeNull();
  });

  const OWNER_BORNE: PriceBreakdownFees = {
    lines: [
      { key: 'service_fee', bearer: 'customer', percent: 10, amount: '100000' },
      { key: 'vehicle_protection', bearer: 'owner', percent: 2, amount: '20000', partnerName: 'Đối tác BH' },
    ],
    // Tổng khách CHỈ cộng dòng của khách — dòng kia trừ vào tiền chủ xe.
    customerTotalAmount: '1100000',
    holdAmount: '100000',
  };

  it('CHỦ XE đọc: dòng họ chịu hiện ra, đánh dấu riêng, không nằm trong tổng khách', () => {
    renderIt(OWNER_BORNE, 'owner');

    expect(screen.getByText('Bảo vệ xe')).toBeTruthy();
    expect(screen.getAllByText(moneyText('1.100.000 ₫'))[0]).toBeTruthy();
    // Tên đối tác bảo hiểm hiện ngay tại dòng — không được thu dưới danh nghĩa một hãng không có.
    expect(screen.getByText(/Đối tác BH/)).toBeTruthy();
  });

  /**
   * Lỗi thật người dùng báo (17/09/2026): hoá đơn của khách có dòng "Thuế khấu trừ/nộp thay ·
   * Chủ xe thực nhận", và họ hỏi mình có đang phải trả khoản đó không.
   *
   * Không trả — nó không nằm trong tổng. Nhưng một con số nằm giữa hoá đơn thì mặc nhiên được
   * đọc là tiền mình phải lo, và phần chú thích nhỏ không cứu được điều đó.
   */
  it('KHÁCH đọc: KHÔNG thấy dòng do chủ xe chịu, tổng vẫn nguyên', () => {
    renderIt(OWNER_BORNE);

    expect(screen.queryByText('Bảo vệ xe')).toBeNull();
    expect(screen.queryByText(/Đối tác BH/)).toBeNull();
    // Tổng khách KHÔNG đổi vì dòng đó vốn chưa từng nằm trong đó.
    expect(screen.getAllByText(moneyText('1.100.000 ₫'))[0]).toBeTruthy();
  });
});
