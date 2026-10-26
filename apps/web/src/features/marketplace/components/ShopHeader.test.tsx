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

const NO_METRICS = {
  sampleCount: 0,
  responseRatePercent: null,
  acceptKeepRatePercent: null,
  responseMinutesMedian: null,
  instantBook: false,
};

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
  metrics: NO_METRICS,
  branchCount: 4,
  serviceProvinceNames: ['Hồ Chí Minh', 'Hà Nội'],
  serviceProvinces: [],
  branches: [],
  vehicleFilterCounts: {
    withDriver: 0,
    longTerm: 0,
    delivery: 0,
    instantBook: 0,
    noCollateral: 0,
    vatInvoice: 0,
  },
  trust: {
    legalEntityType: null,
    legalEntityVerifiedAt: null,
    shopVerified: false,
    contactVerified: false,
    vatInvoiceSupported: false,
    maintenanceOnScheduleCount: 0,
  },
  deliveryAvailable: true,
} satisfies PublicShop;

const REVIEWED = { ...BASE.trust, shopVerified: true };

const shop = (patch: Partial<PublicShop>): PublicShop => ({ ...BASE, ...patch });

afterEach(cleanup);

/*
 * `ShopHeader` là SERVER Component async — gọi như một hàm, chờ cây, rồi mới render. Chính bài
 * test này bắt được nếu ai đó lỡ biến nó thành Client Component và mất SEO của trang gian hàng.
 */
const renderHeader = async (value: PublicShop) => render(await ShopHeader({ shop: value }));

describe('ShopHeader — mặt tiền gian hàng (tuyến gói)', () => {
  it('có ảnh bìa, dấu xác thực, nhãn "Chủ gian hàng" và các điểm nổi bật ĐẾM ĐƯỢC', async () => {
    await renderHeader(
      shop({
        storefrontKind: STOREFRONT_KIND.SHOP,
        verified: true,
        coverUrl: 'https://img.example/cover.jpg',
        trust: REVIEWED,
      }),
    );

    expect(screen.getByAltText('Ảnh bìa gian hàng XePrime Sài Gòn')).toBeTruthy();
    expect(screen.getByLabelText('Gian hàng đã được XePrime xác minh')).toBeTruthy();
    expect(screen.getByText('Chủ gian hàng')).toBeTruthy();
    expect(screen.getByText('Đã xác minh')).toBeTruthy();
    expect(screen.getByText('4 chi nhánh')).toBeTruthy();
    expect(screen.getByText('Hỗ trợ giao xe tận nơi')).toBeTruthy();
    expect(screen.getByText('Đã tham gia từ Tháng 3 năm 2024')).toBeTruthy();
    // Ô "Chi nhánh" chỉ có ở mặt tiền gian hàng.
    expect(screen.getByText('Chi nhánh')).toBeTruthy();
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
        trust: REVIEWED,
      }),
    );

    expect(screen.getByText('Đã xác minh')).toBeTruthy();
    expect(screen.queryByText(/\d+ chi nhánh/)).toBeNull();
    expect(screen.queryByText('Hỗ trợ giao xe tận nơi')).toBeNull();
    expect(screen.queryByText(/Hỗ trợ phí đặt xe|24\/7/)).toBeNull();
  });
});

/*
 * ADR 0040 điều 5: trả tiền gói KHÔNG làm gian hàng thành "đã xác minh". Dấu xanh trên logo là dấu
 * gian hàng tuyến gói (cùng dấu ở thẻ xe); chip "Đã xác minh" chỉ có khi phiếu duyệt đã được duyệt.
 */
describe('ShopHeader — chip "Đã xác minh" đọc phiếu duyệt, không đọc tuyến gói', () => {
  it('gian hàng tuyến gói chưa được duyệt hồ sơ: có dấu logo, KHÔNG có chip', async () => {
    await renderHeader(shop({ storefrontKind: STOREFRONT_KIND.SHOP, verified: true }));

    expect(screen.getByLabelText('Gian hàng đã được XePrime xác minh')).toBeTruthy();
    expect(screen.queryByText('Đã xác minh')).toBeNull();
  });
});

describe('ShopHeader — mặt tiền chủ xe cá nhân', () => {
  it('không dấu xác thực, không ảnh bìa, không ô chi nhánh', async () => {
    await renderHeader(shop({ coverUrl: 'https://img.example/cover.jpg' }));

    expect(screen.queryByLabelText('Gian hàng đã được XePrime xác minh')).toBeNull();
    expect(screen.getByText('Chủ xe cá nhân')).toBeTruthy();
    // Ảnh bìa có trong dữ liệu nhưng KHÔNG được vẽ: dải bìa là ngôn ngữ của doanh nghiệp đã
    // được xác minh, không phải của một người có vài chiếc xe.
    expect(screen.queryByAltText(/Ảnh bìa/)).toBeNull();
    expect(screen.queryByText('Đã xác minh')).toBeNull();
    expect(screen.queryByText('Chi nhánh')).toBeNull();
  });
});

describe('ShopHeader — giới thiệu và số liệu', () => {
  it('có giới thiệu thì hiện khối "Thông tin" kèm địa chỉ; không có thì không dựng khối', async () => {
    await renderHeader(shop({ bio: 'Ba xe khu trung tâm.', address: '35 Lê Thánh Tôn' }));
    expect(screen.getByText('Thông tin')).toBeTruthy();
    expect(screen.getByText('Ba xe khu trung tâm.')).toBeTruthy();
    expect(screen.getByText('Địa chỉ: 35 Lê Thánh Tôn')).toBeTruthy();

    cleanup();
    await renderHeader(shop({}));
    expect(screen.queryByText('Thông tin')).toBeNull();
  });

  it('số đếm nhỏ hiện hai chữ số như bản vẽ, điểm hiện kèm sao', async () => {
    await renderHeader(shop({ vehicleCount: 2, completedTripCount: 4, ratingAvg: '4.80' }));

    expect(screen.getByText('02')).toBeTruthy();
    expect(screen.getByText('04')).toBeTruthy();
    expect(screen.getByText('Xe cho thuê')).toBeTruthy();
    expect(screen.getByText('Chuyến đã hoàn thành')).toBeTruthy();
    // Điểm đứng ở cả dòng meta dưới tên lẫn ô số liệu — đúng như bản vẽ.
    expect(screen.getAllByText('4,8')).toHaveLength(2);
  });

  it('đủ mẫu ⇒ hai ô uy tín hiện phần trăm thật', async () => {
    await renderHeader(
      shop({
        metrics: {
          sampleCount: 12,
          responseRatePercent: 98,
          acceptKeepRatePercent: 85,
          responseMinutesMedian: 40,
          instantBook: false,
        },
      }),
    );

    expect(screen.getByText('Tỷ lệ phản hồi')).toBeTruthy();
    expect(screen.getByText('98%')).toBeTruthy();
    expect(screen.getByText('Nhận & giữ chuyến')).toBeTruthy();
    expect(screen.getByText('85%')).toBeTruthy();
  });

  /*
   * `null` nghĩa là chưa đủ dữ liệu (ADR 0045 điều 3). Ô biến mất — không có "0%" nào là lời vu
   * khống về một gian hàng chưa ai hỏi thuê, và không có ô điểm "0" khi chưa ai chấm.
   */
  it('chưa có dữ liệu thì ô biến mất, không hiện 0', async () => {
    await renderHeader(shop({ ratingAvg: '0', ratingCount: 0 }));

    expect(screen.queryByText('Tỷ lệ phản hồi')).toBeNull();
    expect(screen.queryByText('Nhận & giữ chuyến')).toBeNull();
    expect(screen.queryByText('0%')).toBeNull();
    expect(screen.queryByText('Đánh giá')).toBeNull();
    expect(screen.getByText('Chưa có đánh giá')).toBeTruthy();
  });
});

/*
 * Số điện thoại KHÔNG được xuất hiện trên trang công khai, kể cả khi bản vẽ có — `PublicShopDto`
 * không trả nó. Bài dưới khoá điều đó ở tầng vẽ, vì đây là thứ rất dễ bị "tiện tay" thêm lại.
 */
describe('ShopHeader — liên hệ', () => {
  it('gian hàng mở hộp thư: có nút nhắn tin, KHÔNG có số điện thoại', async () => {
    await renderHeader(shop({ storefrontKind: STOREFRONT_KIND.SHOP, verified: true }));

    expect(screen.getByText('Liên hệ')).toBeTruthy();
    expect(screen.queryByText(/0\d{9}|0\d{3} \d{3} \d{3}/)).toBeNull();
    expect(screen.queryByText(/Gọi/)).toBeNull();
  });
});

describe('ShopHeader — dữ liệu thiếu', () => {
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
