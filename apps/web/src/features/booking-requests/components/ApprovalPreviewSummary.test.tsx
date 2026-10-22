import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/i18n/test-utils';
import { ApprovalPreviewSummary, type ApprovalPreview } from './ApprovalPreviewSummary';

/**
 * Xem trước lượt duyệt của gian hàng (ADR 0064) — mọi số do server ước; khối chỉ chọn dòng và câu.
 */
const PREVIEW: ApprovalPreview = {
  isEstimate: true,
  collectsHold: true,
  onlineAmount: '350000',
  payAtPickupAmount: '1650000',
  ownerCommissionAmount: '200000',
  taxAmount: '0',
  ownerPayableAmount: '150000',
  ownerNetAmount: '1800000',
  /*
   * Bảng cộng ví (ADR 0068 điều 5) — 2 ngày × 1.000.000đ tuyến hoa hồng, chưa bật khấu trừ
   * thuế: H = 200.000, T = 0, D = 300.000 ⇒ a = 1.800.000, b = 1.500.000, cộng ví 300.000.
   */
  ownerPayout: {
    rentAmount: '2000000',
    rentalDays: 2,
    unitAmount: '1000000',
    ownerCommissionAmount: '200000',
    commissionTiers: [
      { fromDay: 1, percent: 10 },
      { fromDay: 3, percent: 7 },
    ],
    taxAmount: '0',
    vatAmount: '0',
    pitAmount: '0',
    vatPercent: null,
    pitPercent: null,
    taxTotalPercent: null,
    taxExemptReason: null,
    ownerNetAmount: '1800000',
    payAtPickupRentAmount: '1500000',
    ownerPayableAmount: '300000',
    collectsHold: true,
  },
  policyFreeCancelHours: 4,
  policyPaymentWindowMinutes: 120,
  windows: {
    leadMinutes: 3000,
    paymentWindowMinutes: 120,
    freeCancelMinutes: 240,
    expiresAt: '2026-08-10T02:00:00.000Z',
    freeCancelUntil: '2026-08-10T04:00:00.000Z',
    tooShort: false,
  },
} as ApprovalPreview;

afterEach(cleanup);

describe('ApprovalPreviewSummary', () => {
  it('thu tiền giữ chỗ: bảng cộng ví, khoản trừ có dấu trừ, thuế 0 bị ẩn, hai cửa sổ', () => {
    renderWithIntl(<ApprovalPreviewSummary preview={PREVIEW} />);
    expect(screen.getByText('Phí dịch vụ – Chủ xe')).toBeTruthy();
    expect(screen.getByText(/^−200\.000\s*₫$/)).toBeTruthy();
    expect(screen.queryByText(/^Thuế khấu trừ/)).toBeNull();
    expect(screen.getByText('Thu nhập chủ xe (a)')).toBeTruthy();
    expect(screen.getByText('Khách thanh toán trực tiếp (b)')).toBeTruthy();
    expect(screen.getByText(/^1\.500\.000\s*₫$/)).toBeTruthy();
    expect(screen.getByText('Số tiền cộng ví (a − b)')).toBeTruthy();
    expect(screen.getByText(/^300\.000\s*₫$/)).toBeTruthy();
    expect(screen.getByText(/Khách có 2 giờ để chuyển tiền giữ chỗ/)).toBeTruthy();
    expect(screen.getByText(/huỷ miễn phí trong 4 giờ/)).toBeTruthy();
  });

  it('KHÔNG thu tiền giữ chỗ ⇒ không dòng (b) / cộng ví, không cửa sổ, có câu "không QR"', () => {
    renderWithIntl(
      <ApprovalPreviewSummary
        preview={{
          ...PREVIEW,
          collectsHold: false,
          onlineAmount: null,
          windows: null,
          ownerPayout: { ...PREVIEW.ownerPayout, collectsHold: false },
        }}
      />,
    );
    expect(screen.queryByText('Khách thanh toán trực tiếp (b)')).toBeNull();
    expect(screen.queryByText('Số tiền cộng ví (a − b)')).toBeNull();
    expect(screen.getByText(/không thu tiền giữ chỗ online/)).toBeTruthy();
    expect(screen.queryByText(/để chuyển tiền giữ chỗ/)).toBeNull();
  });

  it('cửa sổ huỷ miễn phí 0 phút ⇒ nói không có huỷ miễn phí, không in mốc', () => {
    renderWithIntl(
      <ApprovalPreviewSummary
        preview={{
          ...PREVIEW,
          windows: { ...PREVIEW.windows!, freeCancelMinutes: 0, paymentWindowMinutes: 36 },
        }}
      />,
    );
    expect(screen.getByText('Chuyến này khách không có thời gian huỷ miễn phí.')).toBeTruthy();
    expect(screen.getByText(/Khách có 36 phút để chuyển tiền giữ chỗ/)).toBeTruthy();
  });

  it('cửa sổ quá ngắn ⇒ cảnh báo lượt duyệt sẽ không thành công', () => {
    renderWithIntl(
      <ApprovalPreviewSummary
        preview={{ ...PREVIEW, windows: { ...PREVIEW.windows!, tooShort: true } }}
      />,
    );
    expect(screen.getByText(/lượt duyệt sẽ không thành công/)).toBeTruthy();
  });

  it('showMoney=false (dài hạn LEGACY chưa có gói) ⇒ chỉ còn cửa sổ, không dòng tiền', () => {
    renderWithIntl(<ApprovalPreviewSummary preview={PREVIEW} showMoney={false} />);
    expect(screen.queryByText('Thu nhập chủ xe (a)')).toBeNull();
    expect(screen.queryByText(/^−200\.000\s*₫$/)).toBeNull();
    expect(screen.getByText(/Khách có 2 giờ để chuyển tiền giữ chỗ/)).toBeTruthy();
  });
});
