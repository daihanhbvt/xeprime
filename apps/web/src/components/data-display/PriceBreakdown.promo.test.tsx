import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import viMessages from '../../../messages/vi';
import { PriceBreakdown, type PriceBreakdownFees } from './PriceBreakdown';

/**
 * BẢNG GIÁ + MÃ KHUYẾN MÃI — ADR 0046, và hai luật hiển thị đi cùng đợt này.
 *
 * Bốn khẳng định, mỗi cái là một cách nói dối về tiền nếu làm sai:
 *
 *  1. **Dòng mã khuyến mãi là một dòng TRỪ riêng**, không trộn vào khối phụ phí (thứ khách phải
 *     trả THÊM) và không trộn vào `PRICE_ROW.DISCOUNT` (khuyến mãi của CHỦ XE). Trộn là mất khả
 *     năng trả lời "ai đã bớt tiền cho chuyến này".
 *  2. **Tổng khách trả đã trừ mã, tiền thuê thì KHÔNG** — `totalAmount` là doanh thu gian hàng.
 *  3. **Khối phụ phí vẫn hiện khi chỉ có mã** (tuyến gói không có dòng phí nào): giấu nó đi là
 *     hiện tiền thuê như số khách phải trả.
 *  4. **Dòng 0đ không vẽ** — `buildDailyQuote` cố ý sinh "Phí ngoài giờ"/"Dịch vụ cộng thêm"
 *     bằng 0 cho snapshot, nhưng một bảng đầy "0 ₫" làm những dòng có tiền thật khó tìm hơn.
 */
const ROWS = [
  { key: 'base', label: 'Tiền thuê gốc', amount: '1400000' },
  { key: 'overtime', label: 'Phí phát sinh ngoài giờ', amount: '0' },
  { key: 'extras', label: 'Dịch vụ cộng thêm', amount: '0' },
];

/**
 * So một số tiền đã hiển thị, BỎ QUA kiểu khoảng trắng — `Intl.NumberFormat` chèn khoảng trắng
 * KHÔNG NGẮT (U+00A0) giữa số và ký hiệu tiền tệ.
 */
function moneyText(expected: string) {
  const want = expected.replace(/\s+/g, ' ');
  return (_content: string, node: Element | null) =>
    (node?.textContent ?? '').replace(/\s+/g, ' ').trim() === want;
}

function renderIt(fees: PriceBreakdownFees | null, promoSlot?: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="vi" messages={viMessages} timeZone="Asia/Ho_Chi_Minh">
      <PriceBreakdown
        rows={ROWS}
        totalAmount="1400000"
        fees={fees}
        {...(promoSlot ? { promoSlot } : {})}
      />
    </NextIntlClientProvider>,
  );
}

/** Bảng phí của một chuyến 1.400.000đ tuyến hoa hồng, đã áp mã 100.000đ. */
const FEES_WITH_PROMO: PriceBreakdownFees = {
  lines: [{ key: 'service_fee', bearer: 'customer', percent: 10, amount: '140000' }],
  customerTotalAmount: '1440000',
  promoDiscountAmount: '100000',
  promo: { code: 'BANMOI', name: 'Ưu đãi khách hàng mới' },
  holdAmount: '320000',
  payAtPickupAmount: '1120000',
};

describe('PriceBreakdown — mã khuyến mãi nền tảng', () => {
  it('vẽ dòng TRỪ riêng, có mã và tên chương trình', () => {
    renderIt(FEES_WITH_PROMO);

    // Nhãn theo `Domain.feeLine.promo` — dịch từ MÃ, không viết thẳng trong component.
    expect(screen.getByText('Mã khuyến mãi XePrime')).toBeTruthy();
    expect(screen.getByText(/BANMOI/)).toBeTruthy();
    expect(screen.getByText(/Ưu đãi khách hàng mới/)).toBeTruthy();
    // Dấu trừ đứng TRƯỚC số: đây là khoản giảm, không phải một khoản phải trả thêm.
    expect(screen.getAllByText(moneyText('−100.000 ₫'))[0]).toBeTruthy();
  });

  it('tổng khách trả ĐÃ TRỪ mã; tiền thuê (doanh thu gian hàng) thì KHÔNG', () => {
    renderIt(FEES_WITH_PROMO);

    // 1.400.000 = tiền thuê, nguyên vẹn — mã của nền tảng không bớt tiền của gian hàng.
    expect(screen.getAllByText(moneyText('1.400.000 ₫'))[0]).toBeTruthy();
    // 1.440.000 = 1.400.000 + 140.000 phí dịch vụ − 100.000 mã.
    expect(screen.getAllByText(moneyText('1.440.000 ₫'))[0]).toBeTruthy();
    expect(screen.getByText('Tổng bạn trả')).toBeTruthy();
    // Tiền giữ chỗ cũng đã trừ mã: 420.000 − 100.000.
    expect(screen.getAllByText(moneyText('320.000 ₫'))[0]).toBeTruthy();
  });

  it('CHỈ có mã, không có dòng phụ phí nào (tuyến gói) — khối tổng vẫn hiện', () => {
    /*
     * Không có phí dịch vụ ở tuyến gói (ADR 0029 điều 2), nhưng `customerTotalAmount` vẫn khác
     * `totalAmount` vì mã đã trừ. Giấu khối đi là hiện tiền thuê như số khách phải trả.
     */
    renderIt({
      lines: [],
      customerTotalAmount: '1300000',
      promoDiscountAmount: '100000',
      promo: { code: 'VIP20' },
      holdAmount: '180000',
    });

    expect(screen.getByText('Tổng bạn trả')).toBeTruthy();
    expect(screen.getByText('Mã khuyến mãi XePrime')).toBeTruthy();
    expect(screen.getAllByText(moneyText('1.300.000 ₫'))[0]).toBeTruthy();
  });

  it('KHÔNG có mã ⇒ không có dòng mã nào (hành vi y như trước ADR 0046)', () => {
    renderIt({
      lines: [{ key: 'service_fee', bearer: 'customer', percent: 10, amount: '140000' }],
      customerTotalAmount: '1540000',
      promoDiscountAmount: '0',
      promo: null,
      holdAmount: '420000',
    });
    expect(screen.queryByText('Mã khuyến mãi XePrime')).toBeNull();
  });

  it('dòng 0đ KHÔNG VẼ — nhưng dữ liệu không bị đụng tới', () => {
    renderIt(FEES_WITH_PROMO);

    // Hai dòng chỗ-đứng của snapshot biến mất khỏi màn hình…
    expect(screen.queryByText('Phí phát sinh ngoài giờ')).toBeNull();
    expect(screen.queryByText('Dịch vụ cộng thêm')).toBeNull();
    // …còn dòng có tiền thật thì vẫn ở đó.
    expect(screen.getByText('Tiền thuê gốc')).toBeTruthy();
  });

  it('TỔNG không bao giờ bị ẩn, kể cả khi bằng 0', () => {
    /*
     * Luật ẩn chỉ áp cho các DÒNG KÊ. Một chuyến tổng 0đ (mã phủ hết khoản online) vẫn phải hiện
     * con số đó — ẩn nó đi là để khách không biết mình phải chuẩn bị bao nhiêu.
     */
    render(
      <NextIntlClientProvider locale="vi" messages={viMessages} timeZone="Asia/Ho_Chi_Minh">
        <PriceBreakdown rows={[{ key: 'base', label: 'Tiền thuê gốc', amount: '0' }]} totalAmount="0" />
      </NextIntlClientProvider>,
    );
    expect(screen.getAllByText(moneyText('0 ₫'))[0]).toBeTruthy();
  });

  it('ô áp mã được chèn giữa bảng tạm tính và tổng cộng', () => {
    renderIt(FEES_WITH_PROMO, <div data-testid="promo-slot">slot</div>);
    const slot = screen.getByTestId('promo-slot');
    const total = screen.getByText('Tổng bạn trả');
    // `compareDocumentPosition`: slot phải đứng TRƯỚC hàng tổng trong cây.
    expect(slot.compareDocumentPosition(total) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('ô áp mã hiện kể cả khi chuyến CHƯA có bảng phí', () => {
    // Một chuyến chưa xác định được tuyến thu phí vẫn phải cho khách gõ mã — server trả lời.
    renderIt(null, <div data-testid="promo-slot">slot</div>);
    expect(screen.getByTestId('promo-slot')).toBeTruthy();
  });
});

/*
 * Bộ test dưới đây khoá lại lỗi ngày 24/09/2026: dòng "−100.000đ" hiện ra trong khi "Tổng bạn
 * trả" và "Tiền giữ chỗ" vẫn là con số CHƯA trừ, vì bảng giá đọc `fees` của báo giá gốc còn ô
 * mã đọc kết quả xem trước — hai nguồn cho cùng một chuyến.
 */
describe('PriceBreakdown — số giảm và tổng phải cùng MỘT bảng phí', () => {
  it('tổng bạn trả là con số ĐÃ trừ mã, không phải tiền thuê cộng phí', () => {
    renderIt(FEES_WITH_PROMO);
    // 1.400.000 + 140.000 − 100.000 = 1.440.000 ⇒ đúng `customerTotalAmount` của server.
    expect(screen.getAllByText(moneyText('1.440.000 ₫')).length).toBeGreaterThan(0);
    // Con số CHƯA trừ mã không được xuất hiện ở đâu cả.
    expect(screen.queryAllByText(moneyText('1.540.000 ₫'))).toHaveLength(0);
  });

  it('có ô nhập mã ⇒ KHÔNG vẽ thêm dòng giảm (ô nhập đã hiện số đó rồi)', () => {
    renderIt(FEES_WITH_PROMO, <div data-testid="promo-slot">slot</div>);
    expect(screen.queryAllByText(moneyText('−100.000 ₫'))).toHaveLength(0);
    // Tổng vẫn phải là số đã trừ — ẩn dòng chỉ là chuyện trình bày, không đụng tiền.
    expect(screen.getAllByText(moneyText('1.440.000 ₫')).length).toBeGreaterThan(0);
  });

  it('màn chỉ ĐỌC (không có ô nhập) vẫn vẽ dòng giảm kèm mã', () => {
    renderIt(FEES_WITH_PROMO);
    expect(screen.getAllByText(moneyText('−100.000 ₫')).length).toBeGreaterThan(0);
    expect(screen.getByText(/BANMOI/)).toBeTruthy();
  });
});
