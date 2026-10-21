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
  it('thu tiền giữ chỗ: dòng QR, khoản trừ có dấu trừ, thuế 0 bị ẩn, hai cửa sổ', () => {
    renderWithIntl(<ApprovalPreviewSummary preview={PREVIEW} />);
    expect(screen.getByText('Khách chuyển qua QR (tiền giữ chỗ)')).toBeTruthy();
    expect(screen.getByText('−200.000 ₫')).toBeTruthy();
    expect(screen.queryByText('Thuế khấu trừ')).toBeNull();
    expect(screen.getByText(/Khách có 2 giờ để chuyển tiền giữ chỗ/)).toBeTruthy();
    expect(screen.getByText(/huỷ miễn phí trong 4 giờ/)).toBeTruthy();
  });

  it('KHÔNG thu tiền giữ chỗ ⇒ không dòng QR / ví điểm, không cửa sổ, có câu "không QR"', () => {
    renderWithIntl(
      <ApprovalPreviewSummary
        preview={{ ...PREVIEW, collectsHold: false, onlineAmount: null, windows: null }}
      />,
    );
    expect(screen.queryByText('Khách chuyển qua QR (tiền giữ chỗ)')).toBeNull();
    expect(screen.queryByText('Vào Ví điểm của bạn khi hoàn thành chuyến')).toBeNull();
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
    expect(
      screen.getByText('Nhận xe sát giờ nên khách không có thời gian huỷ miễn phí.'),
    ).toBeTruthy();
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
    expect(screen.queryByText('Bạn thực nhận cả chuyến')).toBeNull();
    expect(screen.queryByText('−200.000 ₫')).toBeNull();
    expect(screen.getByText(/Khách có 2 giờ để chuyển tiền giữ chỗ/)).toBeTruthy();
  });
});
