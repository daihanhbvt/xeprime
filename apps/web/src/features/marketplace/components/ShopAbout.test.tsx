import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { STOREFRONT_KIND } from '@xeprime/types';
import type { PublicShop } from '../types';
import { ShopAbout } from './ShopAbout';

vi.mock('next-intl/server', async () => {
  const { serverTranslationsStub } = await import('@/i18n/test-utils');
  return serverTranslationsStub('vi');
});

vi.mock('@/i18n/server-format', async () => {
  const { createTestAppFormat } = await import('@/i18n/test-utils');
  return { getAppFormat: async () => createTestAppFormat('vi') };
});

const BASE = {
  name: 'Minh Đức',
  slug: 'minh-duc',
  storefrontKind: STOREFRONT_KIND.PERSONAL,
  verified: false,
  provinceName: 'Hồ Chí Minh',
  logoUrl: null,
  coverUrl: null,
  bio: 'Chào các bạn, tôi là Minh Đức.',
  address: '12 Nguyễn Huệ, Quận 1',
  chatOpen: false,
  joinedAt: '2024-03-04T00:00:00.000Z',
  ratingAvg: '4.80',
  ratingCount: 12,
  vehicleCount: 5,
  completedTripCount: 45,
  responseRatePercent: 98,
  branchCount: 1,
  serviceProvinceNames: ['Hồ Chí Minh'],
  deliveryAvailable: false,
} as unknown as PublicShop;

const shop = (patch: Partial<PublicShop>): PublicShop => ({ ...BASE, ...patch });

afterEach(cleanup);

const renderAbout = async (value: PublicShop) => render(await ShopAbout({ shop: value }));

describe('ShopAbout', () => {
  it('chủ xe cá nhân đọc "Về tôi"; gian hàng đọc "Giới thiệu doanh nghiệp"', async () => {
    const personal = await renderAbout(shop({}));
    expect(screen.getByText('Về tôi')).toBeTruthy();
    personal.unmount();

    await renderAbout(shop({ storefrontKind: STOREFRONT_KIND.SHOP }));
    expect(screen.getByText('Giới thiệu doanh nghiệp')).toBeTruthy();
  });

  it('trưng đủ bốn số liệu khi có đủ dữ liệu', async () => {
    await renderAbout(shop({}));

    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('98%')).toBeTruthy();
    expect(screen.getByText('45')).toBeTruthy();
    expect(screen.getByText('4,8')).toBeTruthy();
  });

  /*
   * Số 0 ở đây KHÔNG phải một giá trị mặc định vô hại: "Phản hồi 0%" là một lời khẳng định xấu
   * về một gian hàng mới mở mà chưa ai từng gửi yêu cầu thuê, và "0,0 sao" cũng vậy. Ô nào chưa
   * có dữ liệu thì biến mất.
   */
  it('chưa có dữ liệu thì ô biến mất, không hiện 0', async () => {
    await renderAbout(shop({ responseRatePercent: null, ratingAvg: '0', ratingCount: 0 }));

    expect(screen.queryByText('Phản hồi')).toBeNull();
    expect(screen.queryByText('Đánh giá chung')).toBeNull();
    expect(screen.queryByText('0%')).toBeNull();
    // Hai ô đếm thật thì vẫn ở lại — chúng có dữ liệu.
    expect(screen.getByText('Xe cho thuê')).toBeTruthy();
    expect(screen.getByText('Chuyến hoàn thành')).toBeTruthy();
  });

  it('không có gì để kể và không có số nào ⇒ không dựng thẻ rỗng', async () => {
    const { container } = await renderAbout(
      shop({
        bio: null,
        address: null,
        vehicleCount: 0,
        completedTripCount: 0,
        responseRatePercent: null,
        ratingCount: 0,
      }),
    );

    // `vehicleCount`/`completedTripCount` vẫn là số đếm THẬT (0 xe là sự thật, không phải thiếu
    // dữ liệu) nên thẻ vẫn dựng — bài test này khoá đúng điều đó lại.
    expect(container.querySelector('section')).toBeTruthy();
    expect(screen.getByText('Xe cho thuê')).toBeTruthy();
  });
});
