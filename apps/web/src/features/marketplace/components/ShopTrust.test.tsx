import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SELLER_ENTITY_TYPE } from '@xeprime/types';
import type { PublicShop } from '../types';
import { ShopTrust } from './ShopTrust';

vi.mock('next-intl/server', async () => {
  const { serverTranslationsStub } = await import('@/i18n/test-utils');
  return serverTranslationsStub('vi');
});

const NOTHING: PublicShop['trust'] = {
  legalEntityType: null,
  legalEntityVerifiedAt: null,
  shopVerified: false,
  contactVerified: false,
  vatInvoiceSupported: false,
  maintenanceOnScheduleCount: 0,
};

afterEach(cleanup);

const renderTrust = async (trust: PublicShop['trust'], noCollateralCount = 0) =>
  render(await ShopTrust({ trust, vehicleCount: 10, noCollateralCount }));

describe('ShopTrust', () => {
  /*
   * Chưa có gì được kiểm chứng ⇒ không có thẻ "Xác thực XePrime" — kể cả không dựng một thẻ rỗng.
   * Chỉ còn ô luật SÀN (cọc & hoàn tiền), vốn đúng với mọi gian hàng.
   */
  it('chưa kiểm chứng gì: không thẻ xác thực, chỉ còn ô cọc & hoàn tiền', async () => {
    await renderTrust(NOTHING);

    expect(screen.queryByText('Xác thực XePrime')).toBeNull();
    expect(screen.queryByText('Verified Partner')).toBeNull();
    expect(screen.queryByText('Pháp lý & Hoá đơn minh bạch')).toBeNull();
    expect(screen.queryByText('Bảo dưỡng định kỳ')).toBeNull();
    expect(screen.getByText('Chính sách cọc & Hoàn tiền')).toBeTruthy();
  });

  it('đủ kiểm chứng: liệt kê đúng ba dòng, kèm nhãn Verified Partner', async () => {
    await renderTrust({
      ...NOTHING,
      legalEntityType: SELLER_ENTITY_TYPE.COMPANY,
      shopVerified: true,
      contactVerified: true,
    });

    expect(screen.getByText('Verified Partner')).toBeTruthy();
    expect(screen.getByText('Pháp nhân doanh nghiệp, đã kiểm định giấy phép kinh doanh')).toBeTruthy();
    expect(screen.getByText('Hồ sơ gian hàng đã được XePrime duyệt')).toBeTruthy();
    expect(
      screen.getByText('Thông tin liên hệ và địa chỉ chi nhánh được xác minh'),
    ).toBeTruthy();
  });

  /* Hộ kinh doanh không phải "pháp nhân doanh nghiệp" — nói đúng loại chủ thể đã được duyệt. */
  it('hộ kinh doanh đọc là hộ kinh doanh, không phải doanh nghiệp', async () => {
    await renderTrust({ ...NOTHING, legalEntityType: SELLER_ENTITY_TYPE.HOUSEHOLD_BUSINESS });

    expect(screen.getByText(/Hộ kinh doanh đã được XePrime xác minh/)).toBeTruthy();
    expect(screen.queryByText(/Pháp nhân doanh nghiệp/)).toBeNull();
    // Không có phiếu duyệt gian hàng ⇒ không có nhãn Verified Partner.
    expect(screen.queryByText('Verified Partner')).toBeNull();
  });

  it('ô VAT, bảo dưỡng và miễn thế chấp chỉ hiện khi có số thật', async () => {
    await renderTrust(
      { ...NOTHING, vatInvoiceSupported: true, maintenanceOnScheduleCount: 7 },
      3,
    );

    expect(screen.getByText('Pháp lý & Hoá đơn minh bạch')).toBeTruthy();
    expect(
      screen.getByText('Gian hàng xuất hoá đơn VAT cho tiền thuê xe khi khách yêu cầu.'),
    ).toBeTruthy();
    expect(screen.getByText(/^7\/10 xe đang trong chu kỳ bảo dưỡng/)).toBeTruthy();
    expect(screen.getByText('3/10 xe miễn thế chấp.')).toBeTruthy();
  });

  /* Lời hứa chưa có dữ liệu đứng sau không bao giờ được vẽ (ADR 0028). */
  it('không vẽ hợp đồng chất lượng, xe dự phòng hay cứu hộ 24/7', async () => {
    await renderTrust({
      ...NOTHING,
      legalEntityType: SELLER_ENTITY_TYPE.COMPANY,
      shopVerified: true,
      contactVerified: true,
      vatInvoiceSupported: true,
      maintenanceOnScheduleCount: 10,
    });

    expect(screen.queryByText(/hợp đồng cam kết/i)).toBeNull();
    expect(screen.queryByText(/dự phòng|24\/7|siêu cấp/i)).toBeNull();
  });
});
