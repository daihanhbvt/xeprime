import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { STOREFRONT_KIND } from '@xeprime/types';
import type { PublicShop } from '../types';
import { ShopHeader } from './ShopHeader';

vi.mock('./ShopContactActions', () => ({
  ShopContactActions: () => <div>Liên hệ</div>,
}));

/*
 * `getAppFormat()` / `getTranslations()` chỉ chạy trong môi trường react-server và sẽ ném trong
 * jsdom — thay bằng bộ dựng từ CHÍNH bó message thật, để bài test đọc đúng chữ người dùng thấy.
 */
vi.mock('next-intl/server', async () => {
  const { serverTranslationsStub } = await import('@/i18n/test-utils');
  return serverTranslationsStub('vi');
});

vi.mock('@/i18n/server-format', async () => {
  const { createTestAppFormat } = await import('@/i18n/test-utils');
  return { getAppFormat: async () => createTestAppFormat('vi') };
});

const BASE = {
  name: 'XePrime Sài Gòn',
  slug: 'xeprime-sai-gon',
  storefrontKind: STOREFRONT_KIND.PERSONAL,
  verified: false,
  provinceName: 'Hồ Chí Minh',
  logoUrl: null,
  coverUrl: null,
  bio: null,
  address: null,
  chatOpen: true,
  joinedAt: '2024-03-04T00:00:00.000Z',
  ratingAvg: '4.90',
  ratingCount: 156,
  vehicleCount: 36,
  completedTripCount: 500,
  responseRatePercent: 99,
  branchCount: 4,
  serviceProvinceNames: ['Hồ Chí Minh', 'Hà Nội'],
  deliveryAvailable: true,
} as unknown as PublicShop;

const shop = (patch: Partial<PublicShop>): PublicShop => ({ ...BASE, ...patch });

afterEach(cleanup);

/*
 * `ShopHeader` là SERVER Component async — gọi như một hàm, chờ cây, rồi mới render. Chính bài
 * test này bắt được nếu ai đó lỡ biến nó thành Client Component và mất SEO của trang gian hàng.
 */
const renderHeader = async (value: PublicShop) => render(await ShopHeader({ shop: value }));

describe('ShopHeader — mặt tiền gian hàng (tuyến gói)', () => {
  it('có dấu xác thực, nhãn Đối tác và các năng lực ĐẾM ĐƯỢC trên ảnh bìa', async () => {
    await renderHeader(shop({ storefrontKind: STOREFRONT_KIND.SHOP, verified: true }));

    expect(screen.getByLabelText('Gian hàng đã được XePrime xác minh')).toBeTruthy();
    expect(screen.getByText('Đối tác')).toBeTruthy();
    expect(screen.getByText('Đã xác minh doanh nghiệp')).toBeTruthy();
    expect(screen.getByText('4 chi nhánh')).toBeTruthy();
    expect(screen.getByText('Giao xe tận nơi')).toBeTruthy();
    expect(screen.getByText('Đối tác từ Tháng 3 năm 2024')).toBeTruthy();
  });

  /*
   * Chip chỉ được nói điều gì backend ĐẾM được. Một gian hàng một chi nhánh, không giao tận nơi
   * thì hai chip kia phải biến mất — không có chip mặc định nào kiểu "Hỗ trợ 24/7" (ADR 0028).
   */
  it('chỉ hiện chip có dữ liệu thật', async () => {
    await renderHeader(
      shop({
        storefrontKind: STOREFRONT_KIND.SHOP,
        verified: true,
        branchCount: 1,
        deliveryAvailable: false,
      }),
    );

    expect(screen.getByText('Đã xác minh doanh nghiệp')).toBeTruthy();
    expect(screen.queryByText(/chi nhánh/)).toBeNull();
    expect(screen.queryByText('Giao xe tận nơi')).toBeNull();
  });
});

describe('ShopHeader — mặt tiền chủ xe cá nhân', () => {
  it('không dấu xác thực, không ảnh bìa, không chip năng lực', async () => {
    await renderHeader(shop({ coverUrl: 'https://img.example/cover.jpg' }));

    expect(screen.queryByLabelText('Gian hàng đã được XePrime xác minh')).toBeNull();
    expect(screen.getByText('Chủ xe cá nhân')).toBeTruthy();
    expect(screen.getByText('Tham gia từ Tháng 3 năm 2024')).toBeTruthy();
    // Ảnh bìa có trong dữ liệu nhưng KHÔNG được vẽ: dải bìa là ngôn ngữ của doanh nghiệp đã
    // được xác minh, không phải của một người có vài chiếc xe.
    expect(screen.queryByAltText(/Ảnh bìa/)).toBeNull();
    expect(screen.queryByText('Đã xác minh doanh nghiệp')).toBeNull();
  });
});

/*
 * Số điện thoại KHÔNG được xuất hiện trên trang công khai, và nút "Nhắn tin" của tuyến hoa hồng
 * cũng không — kênh đó mở sau khi khách gửi yêu cầu thuê. Hai bài dưới khoá cả hai lại, vì cả
 * hai đều là thứ rất dễ bị "tiện tay" thêm lại khi ai đó muốn trang trông đầy đủ hơn.
 */
describe('ShopHeader — liên hệ', () => {
  it('gian hàng mở hộp thư: có nút nhắn tin, KHÔNG có số điện thoại', async () => {
    await renderHeader(shop({ storefrontKind: STOREFRONT_KIND.SHOP, verified: true }));

    expect(screen.getByText('Liên hệ')).toBeTruthy();
    expect(screen.queryByText(/09d{8}/)).toBeNull();
    expect(screen.queryByText(/Gọi/)).toBeNull();
  });
});

describe('ShopHeader — dữ liệu thiếu', () => {
  it('chưa có đánh giá thì nói "Chưa có đánh giá", không hiện 0 sao', async () => {
    await renderHeader(shop({ ratingAvg: '0', ratingCount: 0 }));

    expect(screen.getByText('Chưa có đánh giá')).toBeTruthy();
    expect(screen.queryByText(/đánh giá\)/)).toBeNull();
  });

  /*
   * Gian hàng chưa có xe công khai nào ⇒ `serviceProvinceNames` rỗng. Dòng địa bàn phải rơi về
   * tỉnh trong hồ sơ chứ không biến mất — một trang gian hàng không nói được mình ở đâu là một
   * trang khách không dùng được.
   */
  it('chưa có xe công khai thì địa bàn rơi về tỉnh trong hồ sơ', async () => {
    await renderHeader(shop({ serviceProvinceNames: [] }));

    expect(screen.getByText('Hồ Chí Minh')).toBeTruthy();
  });
});
