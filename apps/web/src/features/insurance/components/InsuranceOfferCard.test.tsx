import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INSURANCE_PRODUCT_KIND } from '@xeprime/types';
import { renderWithIntl } from '@/i18n/test-utils';
import type { InsuranceOfferItem, PublicInsuranceProduct } from '../types';
import { InsuranceOfferCard } from './InsuranceOfferCard';

const media = vi.hoisted(() => ({ mobile: false }));
vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => media.mobile,
  useIsTablet: () => false,
  useIsDesktop: () => !media.mobile,
  useMediaQuery: () => false,
}));

/**
 * Thẻ "Bảo hiểm chuyến đi" (Figma `22548:36923`): điện thoại mở quyền lợi NGAY TRONG THẺ, desktop
 * mở popup; nút chọn của popup chỉ đổi ô tích (báo giá tự tính lại), dòng Bắt buộc không bỏ được.
 */
const PRODUCT: PublicInsuranceProduct = {
  kind: INSURANCE_PRODUCT_KIND.VEHICLE_TRIP,
  provider: 'mic',
  nameVi: 'Bảo hiểm vật chất xe MIC',
  nameEn: 'MIC Auto Damage Protection',
  coverageVi: 'Đâm va, lật đổ trong thời gian thuê\nHoả hoạn, cháy nổ\nMất cắp bộ phận',
  coverageEn: 'Collision\nFire\nTheft of parts',
  summaryVi: 'Đâm va, ngập nước (thuỷ kích), mất cắp bộ phận',
  summaryEn: null,
  deductibleAmount: '2000000',
  maxPayoutAmount: null,
  maxPayoutNoteVi: 'Theo giá trị thực tế của xe',
  maxPayoutNoteEn: "Up to the vehicle's actual value",
  mandatory: true,
  claimHotline: '1900 558 891',
};

const ITEM: InsuranceOfferItem = {
  kind: INSURANCE_PRODUCT_KIND.VEHICLE_TRIP,
  dailyAmount: null,
  mandatory: false,
  tripAmount: '59411',
  serviceFeeAmount: null,
  product: PRODUCT,
};

const NONE = {
  [INSURANCE_PRODUCT_KIND.VEHICLE_TRIP]: false,
  [INSURANCE_PRODUCT_KIND.PERSONAL_ACCIDENT]: false,
};

beforeEach(() => {
  media.mobile = false;
});

describe('InsuranceOfferCard', () => {
  it('không có lựa chọn ⇒ không render gì', () => {
    const { container } = renderWithIntl(
      <InsuranceOfferCard items={[]} selected={NONE} onChange={vi.fn()} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('thẻ: tiêu đề, nhãn hãng, mô tả ngắn, giá theo chuyến, viên khấu trừ + hotline, ghi chú tự nguyện', () => {
    renderWithIntl(<InsuranceOfferCard items={[ITEM]} selected={NONE} onChange={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Bảo hiểm chuyến đi' })).toBeTruthy();
    expect(screen.getByText('MIC')).toBeTruthy();
    expect(screen.getByText('Đâm va, ngập nước (thuỷ kích), mất cắp bộ phận')).toBeTruthy();
    expect(screen.getByText('/ chuyến')).toBeTruthy();
    expect(screen.getByText('Khấu trừ 2tr/vụ')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Gọi hotline 1900 558 891' }).getAttribute('href'),
    ).toBe('tel:1900558891');
    expect(
      screen.getByText('Bảo hiểm tự nguyện giúp bảo vệ xe trong suốt chuyến đi.'),
    ).toBeTruthy();
  });

  it('tích ô ⇒ báo lựa chọn lên trên', () => {
    const onChange = vi.fn();
    renderWithIntl(<InsuranceOfferCard items={[ITEM]} selected={NONE} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bảo hiểm vật chất xe MIC' }));
    expect(onChange).toHaveBeenCalledWith(INSURANCE_PRODUCT_KIND.VEHICLE_TRIP, true);
  });

  it('desktop: "Xem quyền lợi" mở popup; "Chọn bảo hiểm" tích ô và đóng', async () => {
    const onChange = vi.fn();
    renderWithIntl(<InsuranceOfferCard items={[ITEM]} selected={NONE} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Xem quyền lợi' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByText(/2.000.000/)).toHaveLength(2);
    expect(within(dialog).getByText('Theo giá trị thực tế của xe')).toBeTruthy();
    expect(within(dialog).getByText('Hoả hoạn, cháy nổ')).toBeTruthy();
    expect(within(dialog).getByText('Quyền lợi & người chịu khấu trừ')).toBeTruthy();
    expect(
      within(dialog)
        .getByRole('link', { name: 'Xem đầy đủ quy tắc bảo hiểm' })
        .getAttribute('href'),
    ).toBe('/insurance');
    const select = within(dialog).getByRole('button', { name: /Chọn bảo hiểm MIC/ });
    // Một dấu + duy nhất trước giá (giá trong nút không mang dấu của thẻ).
    expect(select.textContent).toContain('(+59.411');
    expect(select.textContent).not.toContain('++');
    fireEvent.click(select);
    expect(onChange).toHaveBeenCalledWith(INSURANCE_PRODUCT_KIND.VEHICLE_TRIP, true);
  });

  it('điện thoại: mở quyền lợi ngay trong thẻ, không có popup', () => {
    media.mobile = true;
    renderWithIntl(<InsuranceOfferCard items={[ITEM]} selected={NONE} onChange={vi.fn()} />);
    const toggle = screen.getByRole('button', { name: 'Xem quyền lợi' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Thu gọn' }).getAttribute('aria-expanded')).toBe(
      'true',
    );
    expect(screen.getByText('Mất cắp bộ phận')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Bắt buộc (ADR 0091): ô luôn tích, không bỏ được, không có ghi chú tự nguyện', () => {
    renderWithIntl(
      <InsuranceOfferCard
        items={[{ ...ITEM, mandatory: true }]}
        selected={NONE}
        onChange={vi.fn()}
      />,
    );
    const box = screen.getByRole('checkbox', { name: 'Bảo hiểm vật chất xe MIC' });
    expect((box as HTMLInputElement).checked).toBe(true);
    expect((box as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('Bắt buộc')).toBeTruthy();
    expect(
      screen.queryByText('Bảo hiểm tự nguyện giúp bảo vệ xe trong suốt chuyến đi.'),
    ).toBeNull();
  });
});
