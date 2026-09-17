import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import viMessages from '../../../../messages/vi';
import { TripEstimateCard } from './TripEstimateCard';
import type { CustomerTripEstimate } from '../types';

/**
 * BẢNG GIÁ CỦA MỘT CHUYẾN CHƯA CÓ ĐƠN — hai lỗi người dùng thật báo ngày 17/09/2026.
 *
 *  1. **Hoá đơn của khách có dòng của CHỦ XE.** "Thuế khấu trừ/nộp thay · Chủ xe thực nhận" nằm
 *     giữa bảng giá làm người thuê tưởng mình đang gánh thuế của chủ xe. Khoản đó KHÔNG cộng vào
 *     tổng khách (ADR 0032 điều 3) nên nó không có việc gì ở đây.
 *  2. **Đã trả tiền rồi mà bảng vẫn dán nhãn "Tạm tính"**, và không có dòng nào nói đã cọc bao
 *     nhiêu, còn phải trả bao nhiêu khi nhận xe. Từ ADR 0039 chuyến đã cọc đọc SNAPSHOT đã đóng
 *     băng, nên con số ở đây đúng bằng thứ đã thu — gọi nó là tạm tính là nói sai.
 */
const ESTIMATE: CustomerTripEstimate = {
  rows: [{ key: 'base', label: 'Tiền thuê 1 ngày', sublabel: null, amount: '780000' }],
  rentalTotal: '702000',
  depositAmount: '5000000',
  fees: {
    billingMode: 'commission',
    lines: [
      { key: 'service_fee', bearer: 'customer', beneficiary: 'platform', percent: 10, amount: '70200' },
      { key: 'tax', bearer: 'owner', beneficiary: 'tax', percent: 10, amount: '70200' },
    ],
    customerTotalAmount: '772200',
    holdAmount: '224640',
    ownerNetAmount: '631800',
  } as unknown as CustomerTripEstimate['fees'],
};

function renderCard(opts: { isHost?: boolean; settled?: boolean } = {}) {
  return render(
    <NextIntlClientProvider locale="vi" messages={viMessages} timeZone="Asia/Ho_Chi_Minh">
      <TripEstimateCard
        estimate={ESTIMATE}
        isHost={opts.isHost ?? false}
        settled={opts.settled ?? false}
      />
    </NextIntlClientProvider>,
  );
}

describe('TripEstimateCard', () => {
  it('KHÁCH không thấy dòng thuế của chủ xe, nhưng thấy phí dịch vụ mình trả', () => {
    renderCard();
    // Bảng kê từng dòng nằm sau nút "Xem chi tiết giá" — mở ra trước khi đọc dòng phí.
    fireEvent.click(screen.getByText('Xem chi tiết giá'));

    expect(screen.getByText('Phí dịch vụ XePrime')).toBeTruthy();
    // Thuế do CHỦ XE chịu — khách không trả, nên không được bày ra giữa hoá đơn của họ.
    expect(screen.queryByText(/Thuế/)).toBeNull();
    expect(screen.queryByText(/thực nhận/i)).toBeNull();
  });

  it('CHỦ XE thấy đủ cả dòng thuế lẫn số thực nhận — đó là thứ giải thích doanh thu của họ', () => {
    renderCard({ isHost: true });
    fireEvent.click(screen.getByText('Xem chi tiết giá'));

    expect(screen.getByText(/Thuế/)).toBeTruthy();
    // Hai chỗ: nhãn nhỏ dưới dòng thuế, và dòng tổng thực nhận ở chân thẻ.
    expect(screen.getAllByText(/thực nhận/i).length).toBeGreaterThanOrEqual(1);
  });

  /**
   * Hai dòng này là câu trả lời cho "tôi còn phải trả bao nhiêu khi nhận xe" — câu hỏi người
   * dùng đặt ra và màn hình trước đợt này không trả lời được.
   */
  it('có dòng ĐÃ CHUYỂN GIỮ CHỖ và dòng TRẢ KHI NHẬN XE, không bắt khách tự trừ', () => {
    renderCard({ settled: true });

    expect(screen.getByText('Chuyển trước để giữ chỗ')).toBeTruthy();
    expect(screen.getByText('Trả chủ xe khi nhận xe')).toBeTruthy();
  });

  it('đã thanh toán ⇒ nhãn "Đã chốt", KHÔNG còn "Tạm tính"', () => {
    renderCard({ settled: true });

    expect(screen.getByText('Đã chốt')).toBeTruthy();
    expect(screen.queryByText('Tạm tính')).toBeNull();
  });

  it('chưa thanh toán ⇒ vẫn là "Tạm tính" — số chốt chỉ sinh ra khi tiền về', () => {
    renderCard();

    expect(screen.getByText('Tạm tính')).toBeTruthy();
    expect(screen.queryByText('Đã chốt')).toBeNull();
  });
});
