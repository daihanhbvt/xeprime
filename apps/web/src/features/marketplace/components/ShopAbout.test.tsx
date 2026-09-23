import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { STOREFRONT_KIND } from '@xeprime/types';
import type { PublicShop } from '../types';
import { renderWithIntl } from '@/i18n/test-utils';
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
  metrics: {
    sampleCount: 40,
    responseRatePercent: 98,
    acceptKeepRatePercent: 85,
    responseMinutesMedian: 24,
    instantBook: false,
  },
  branchCount: 1,
  serviceProvinceNames: ['Hồ Chí Minh'],
  deliveryAvailable: false,
} as unknown as PublicShop;

const shop = (patch: Partial<PublicShop>): PublicShop => ({ ...BASE, ...patch });

afterEach(cleanup);

/*
 * `renderWithIntl`, không phải `render` trần: cây trả về chứa `HostMetrics` — một CLIENT
 * component gọi `useTranslations`, nên nó cần provider của next-intl. `ShopAbout` vẫn là server
 * component, vẫn được gọi như một hàm rồi `await`.
 */
const renderAbout = async (value: PublicShop) => renderWithIntl(await ShopAbout({ shop: value }));

describe('ShopAbout', () => {
  it('chủ xe cá nhân đọc "Về tôi"; gian hàng đọc "Giới thiệu doanh nghiệp"', async () => {
    const personal = await renderAbout(shop({}));
    expect(screen.getByText('Về tôi')).toBeTruthy();
    personal.unmount();

    await renderAbout(shop({ storefrontKind: STOREFRONT_KIND.SHOP }));
    expect(screen.getByText('Giới thiệu doanh nghiệp')).toBeTruthy();
  });

  it('trưng đủ số liệu đếm được khi có đủ dữ liệu', async () => {
    await renderAbout(shop({}));

    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('45')).toBeTruthy();
    expect(screen.getByText('4,8')).toBeTruthy();
  });

  /*
   * Ba chỉ số uy tín (ADR 0045 điều 3) là một KHỐI RIÊNG, không phải ô thứ năm của lưới số
   * liệu: mỗi con số cần một định nghĩa mẫu số đi kèm, và cả ba chia chung một ngưỡng "đủ dữ
   * liệu" — trộn vào lưới sẽ có ô biến mất ô còn, trông như lỗi hiển thị.
   */
  it('đủ mẫu ⇒ ba chỉ số uy tín hiện kèm CƠ SỞ tính', async () => {
    await renderAbout(shop({}));

    expect(screen.getByText('98%')).toBeTruthy();
    expect(screen.getByText('85%')).toBeTruthy();
    expect(screen.getByText('Trong 1 giờ')).toBeTruthy();
    // Số mẫu luôn đi kèm: một tỉ lệ không có mẫu số là một con số không kiểm chứng được.
    expect(screen.getByText(/40 yêu cầu/)).toBeTruthy();
  });

  /*
   * Dưới ngưỡng thì nói MỘT câu kèm số mẫu thật, không vẽ ba ô "—". "2 yêu cầu trong 90 ngày"
   * là một sự thật; "0%" từ hai yêu cầu là một lời vu khống.
   */
  it('chưa đủ mẫu ⇒ một câu "chưa đủ dữ liệu" kèm số mẫu, không có phần trăm nào', async () => {
    await renderAbout(
      shop({
        metrics: {
          sampleCount: 2,
          responseRatePercent: null,
          acceptKeepRatePercent: null,
          responseMinutesMedian: null,
          instantBook: false,
        },
      }),
    );

    expect(screen.getByText(/Chưa đủ dữ liệu/)).toBeTruthy();
    expect(screen.getByText(/2 yêu cầu/)).toBeTruthy();
    expect(screen.queryByText('0%')).toBeNull();
    expect(screen.queryByText('100%')).toBeNull();
  });

  /*
   * "Đặt ngay" là một CÀI ĐẶT của gian hàng, không phải một phép đo — nó đúng ngay từ yêu cầu
   * đầu tiên, nên nó không bị ngưỡng "đủ dữ liệu" chặn.
   */
  it('chưa đủ mẫu nhưng có "Đặt ngay" ⇒ vẫn hiện nhãn đó', async () => {
    await renderAbout(
      shop({
        metrics: {
          sampleCount: 1,
          responseRatePercent: null,
          acceptKeepRatePercent: null,
          responseMinutesMedian: null,
          instantBook: true,
        },
      }),
    );

    expect(screen.getByText('Đặt ngay')).toBeTruthy();
  });

  /*
   * Số 0 ở đây KHÔNG phải một giá trị mặc định vô hại: "Phản hồi 0%" là một lời khẳng định xấu
   * về một gian hàng mới mở mà chưa ai từng gửi yêu cầu thuê, và "0,0 sao" cũng vậy. Ô nào chưa
   * có dữ liệu thì biến mất.
   */
  it('chưa có dữ liệu thì ô biến mất, không hiện 0', async () => {
    await renderAbout(shop({ ratingAvg: '0', ratingCount: 0 }));

    expect(screen.queryByText('Đánh giá chung')).toBeNull();
    // Hai ô đếm thật thì vẫn ở lại — chúng có dữ liệu.
    expect(screen.getByText('Xe cho thuê')).toBeTruthy();
    expect(screen.getByText('Chuyến hoàn thành')).toBeTruthy();
  });

  it('không có gì để kể và không có số nào ⇒ vẫn dựng thẻ', async () => {
    const { container } = await renderAbout(
      shop({
        bio: null,
        address: null,
        vehicleCount: 0,
        completedTripCount: 0,
        ratingCount: 0,
      }),
    );

    // `vehicleCount`/`completedTripCount` vẫn là số đếm THẬT (0 xe là sự thật, không phải thiếu
    // dữ liệu) nên thẻ vẫn dựng — bài test này khoá đúng điều đó lại.
    expect(container.querySelector('section')).toBeTruthy();
    expect(screen.getByText('Xe cho thuê')).toBeTruthy();
  });
});
