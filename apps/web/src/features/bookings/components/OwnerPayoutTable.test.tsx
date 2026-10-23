import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/i18n/test-utils';
import { OwnerPayoutTable, type OwnerPayout } from './OwnerPayoutTable';

/**
 * Bảng cộng ví chủ xe (ADR 0068 điều 5 · đặc tả 05 §7.1) — các con số lấy NGUYÊN từ ví dụ đối
 * soát của đặc tả 05 §6. Bảng chỉ hiện số server dựng; thứ được khoá ở đây là chọn đúng dòng,
 * đúng nhãn, và số hiện ĐÚNG TỚI ĐỒNG (ADR 0069 — 54.600 chứ không phải 55.000).
 */

/** Số tiền như `fmt.money` in ra — khoảng trắng trước `₫` có thể là NBSP. */
const money = (digits: string, sign = '') =>
  new RegExp(`^${sign}${digits.replace('.', '\\.')}\\s*₫$`);

/** Đặc tả 05 §6.1 — tự lái 1 ngày × 780.000đ, chủ xe cá nhân, tuyến hoa hồng. */
const SELF_DRIVE: OwnerPayout = {
  rentAmount: '780000',
  rentalDays: 1,
  unitAmount: '780000',
  ownerCommissionAmount: '78000',
  commissionTiers: [
    { fromDay: 1, percent: 10 },
    { fromDay: 3, percent: 7 },
    { fromDay: 8, percent: 3 },
    { fromDay: 31, percent: 0 },
  ],
  taxAmount: '54600',
  vatAmount: '39000',
  pitAmount: '15600',
  vatPercent: 5,
  pitPercent: 2,
  taxTotalPercent: 7,
  taxExemptReason: null,
  ownerNetAmount: '647400',
  payAtPickupRentAmount: '585000',
  ownerPayableAmount: '62400',
  collectsHold: true,
};

/** Đặc tả 05 §6.3 — tuyến gói, gian hàng là DOANH NGHIỆP: 3 ngày × 1.000.000đ. */
const PACKAGE_COMPANY: OwnerPayout = {
  rentAmount: '3000000',
  rentalDays: 3,
  unitAmount: '1000000',
  ownerCommissionAmount: '0',
  commissionTiers: null,
  taxAmount: '0',
  vatAmount: '0',
  pitAmount: '0',
  vatPercent: null,
  pitPercent: null,
  taxTotalPercent: null,
  taxExemptReason: 'company',
  ownerNetAmount: '3000000',
  payAtPickupRentAmount: '2550000',
  ownerPayableAmount: '450000',
  collectsHold: true,
};

afterEach(cleanup);

describe('OwnerPayoutTable', () => {
  it('§6.1 tự lái tuyến hoa hồng: đủ bảy dòng, thuế tách GTGT/TNCN, đúng tới đồng', () => {
    renderWithIntl(<OwnerPayoutTable payout={SELF_DRIVE} />);

    expect(screen.getByText('Đơn giá thuê')).toBeTruthy();
    expect(screen.getByText(/^780\.000\s*₫\/ngày$/)).toBeTruthy();
    expect(screen.getByText('Số ngày thuê')).toBeTruthy();
    expect(screen.getByText('1 ngày')).toBeTruthy();

    expect(screen.getByText('Doanh thu cho thuê xe')).toBeTruthy();
    expect(screen.getByText(money('780.000'))).toBeTruthy();
    expect(screen.getByText('Phí dịch vụ – Chủ xe')).toBeTruthy();
    expect(screen.getByText(money('78.000', '−'))).toBeTruthy();
    expect(screen.getByText('Thuế khấu trừ (GTGT 5% + TNCN 2%)')).toBeTruthy();
    expect(screen.getByText(money('54.600', '−'))).toBeTruthy();

    expect(screen.getByText('Thu nhập chủ xe (a)')).toBeTruthy();
    expect(screen.getByText(money('647.400'))).toBeTruthy();
    expect(screen.getByText('Khách thanh toán trực tiếp (b)')).toBeTruthy();
    expect(screen.getByText(money('585.000'))).toBeTruthy();
    expect(screen.getByText('Số tiền cộng ví (a − b)')).toBeTruthy();
    expect(screen.getByText(money('62.400'))).toBeTruthy();
  });

  it('dấu "i" của dòng thuế dẫn tới văn bản Chính sách thuế', () => {
    renderWithIntl(<OwnerPayoutTable payout={SELF_DRIVE} />);
    const link = screen.getByRole('link', { name: 'Chính sách thuế' });
    expect(link.getAttribute('href')).toBe('/legal/owner-tax');
    expect(screen.getByText(/NĐ 117\/2025 và NĐ 68\/2026/)).toBeTruthy();
    // Mỗi dòng có giải thích mang một nút bấm được, có tên.
    expect(screen.getByRole('button', { name: 'Giải thích: Phí dịch vụ – Chủ xe' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Giải thích: Thuế khấu trừ' })).toBeTruthy();
  });

  it('dấu "i" của phí dịch vụ chủ xe kể nấc của chính sách ĐÃ ĐÓNG BĂNG cùng chuyến', () => {
    renderWithIntl(<OwnerPayoutTable payout={SELF_DRIVE} />);
    expect(
      screen.getByText(
        'Tính lũy tiến theo ngày thuê theo chính sách phí áp cho chuyến này: Ngày 1–2: 10% · Ngày 3–7: 7% · Ngày 8–30: 3% · Từ ngày 31: 0%.',
      ),
    ).toBeTruthy();
    expect(screen.getByText(/^Gian hàng có gói: 0đ\./)).toBeTruthy();
  });

  it('nấc đến từ dữ liệu, không viết cứng — chính sách khác thì câu khác', () => {
    renderWithIntl(
      <OwnerPayoutTable
        payout={{
          ...SELF_DRIVE,
          commissionTiers: [
            { fromDay: 1, percent: 12 },
            { fromDay: 4, percent: 5.5 },
          ],
        }}
      />,
    );
    expect(
      screen.getByText(
        'Tính lũy tiến theo ngày thuê theo chính sách phí áp cho chuyến này: Ngày 1–3: 12% · Từ ngày 4: 5,5%.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Ngày 1–2: 10%/)).toBeNull();
  });

  it('snapshot không mang nấc ⇒ câu chung, không có con số nào', () => {
    renderWithIntl(<OwnerPayoutTable payout={{ ...SELF_DRIVE, commissionTiers: null }} />);
    expect(
      screen.getByText('Tính theo nấc lũy tiến của chính sách phí áp cho chuyến này.'),
    ).toBeTruthy();
    expect(screen.queryByText(/Ngày 1–2/)).toBeNull();
  });

  it('có tài xế (§6.2): mức 3% + 1,5% hiện theo định dạng số Việt Nam', () => {
    renderWithIntl(
      <OwnerPayoutTable
        payout={{
          ...SELF_DRIVE,
          rentAmount: '2400000',
          rentalDays: 2,
          unitAmount: '1200000',
          ownerCommissionAmount: '240000',
          taxAmount: '108000',
          vatAmount: '72000',
          pitAmount: '36000',
          vatPercent: 3,
          pitPercent: 1.5,
          taxTotalPercent: 4.5,
          ownerNetAmount: '2052000',
          payAtPickupRentAmount: '1800000',
          ownerPayableAmount: '252000',
        }}
      />,
    );
    expect(screen.getByText('Thuế khấu trừ (GTGT 3% + TNCN 1,5%)')).toBeTruthy();
    expect(screen.getByText(money('252.000'))).toBeTruthy();
  });

  it('§6.3 tuyến gói, doanh nghiệp: ẩn phí dịch vụ, thuế "Không khấu trừ (doanh nghiệp)", cộng ví 450.000', () => {
    renderWithIntl(<OwnerPayoutTable payout={PACKAGE_COMPANY} />);

    expect(screen.queryByText('Phí dịch vụ – Chủ xe')).toBeNull();
    expect(screen.getByText('Thuế khấu trừ')).toBeTruthy();
    expect(screen.getByText('Không khấu trừ (doanh nghiệp)')).toBeTruthy();
    expect(screen.queryByText(/^Thuế khấu trừ \(GTGT/)).toBeNull();
    expect(screen.getAllByText(money('3.000.000')).length).toBe(2); // doanh thu + thu nhập (a)
    expect(screen.getByText(money('2.550.000'))).toBeTruthy();
    expect(screen.getByText(money('450.000'))).toBeTruthy();
  });

  it('snapshot CŨ (trước ADR 0068, không tách sắc thuế) ⇒ một dòng thuế gộp theo mức đơn', () => {
    renderWithIntl(
      <OwnerPayoutTable
        payout={{
          ...SELF_DRIVE,
          taxAmount: '78000',
          vatAmount: null,
          pitAmount: null,
          vatPercent: null,
          pitPercent: null,
          taxTotalPercent: 10,
          ownerNetAmount: '624000',
          ownerPayableAmount: '39000',
        }}
      />,
    );
    expect(screen.getByText('Thuế khấu trừ (10%)')).toBeTruthy();
    expect(screen.queryByText(/^Thuế khấu trừ \(GTGT/)).toBeNull();
    expect(screen.getAllByText(money('78.000', '−')).length).toBe(2); // phí dịch vụ + thuế
  });

  it('giá khác nhau theo ngày ⇒ không bịa đơn giá, hiện "Tiền thuê N ngày"', () => {
    renderWithIntl(
      <OwnerPayoutTable payout={{ ...SELF_DRIVE, rentalDays: 3, unitAmount: null }} />,
    );
    expect(screen.queryByText('Đơn giá thuê')).toBeNull();
    expect(screen.getByText('Tiền thuê 3 ngày')).toBeTruthy();
    expect(screen.getByText('Giá khác nhau theo ngày')).toBeTruthy();
  });

  it('thuế bằng 0 vì cổng thuế tắt (không phải miễn) ⇒ ẩn dòng thuế', () => {
    renderWithIntl(
      <OwnerPayoutTable
        payout={{
          ...SELF_DRIVE,
          taxAmount: '0',
          vatAmount: '0',
          pitAmount: '0',
          vatPercent: null,
          pitPercent: null,
          taxTotalPercent: null,
        }}
      />,
    );
    expect(screen.queryByText(/^Thuế khấu trừ/)).toBeNull();
  });

  it('không thu tiền giữ chỗ online ⇒ ẩn (b) và số cộng ví, vẫn có thu nhập (a)', () => {
    renderWithIntl(<OwnerPayoutTable payout={{ ...SELF_DRIVE, collectsHold: false }} />);
    expect(screen.getByText('Thu nhập chủ xe (a)')).toBeTruthy();
    expect(screen.queryByText('Khách thanh toán trực tiếp (b)')).toBeNull();
    expect(screen.queryByText('Số tiền cộng ví (a − b)')).toBeNull();
  });

  it('tiếng Anh: nhãn dịch, số tiền vẫn VND đúng tới đồng', () => {
    renderWithIntl(<OwnerPayoutTable payout={SELF_DRIVE} />, { locale: 'en' });
    expect(screen.getByText('Owner service fee')).toBeTruthy();
    expect(screen.getByText('Tax withheld (VAT 5% + PIT 2%)')).toBeTruthy();
    expect(screen.getByText('Credited to your wallet (a − b)')).toBeTruthy();
    expect(screen.getByText(/^62,400\s*₫$/)).toBeTruthy();
    expect(
      screen.getByText(
        'Tiered by rental day under the fee policy applied to this trip: Days 1–2: 10% · Days 3–7: 7% · Days 8–30: 3% · From day 31: 0%.',
      ),
    ).toBeTruthy();
  });
});
