import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { HostMetrics as HostMetricsShape } from '@xeprime/types';
import { renderWithIntl } from '@/i18n/test-utils';
import { ShopQuickInfoCard, type ShopQuickInfoCardShop } from './ShopQuickInfoCard';

const SHOP: ShopQuickInfoCardShop = {
  name: 'Việt Car Hà Nội',
  slug: 'viet-car-ha-noi',
  logoUrl: null,
  verified: true,
  province: 'Hà Nội',
  bio: 'Cho thuê xe tự lái và thuê tháng tại Hà Nội, Hải Phòng.',
  ratingAvg: '4.9',
  ratingCount: 120,
  completedTripCount: 1234,
};

const READY_GOOD_METRICS: HostMetricsShape = {
  sampleCount: 10,
  responseRatePercent: 95,
  acceptKeepRatePercent: 92,
  responseMinutesMedian: 8,
  instantBook: false,
};

const INSUFFICIENT_METRICS: HostMetricsShape = {
  sampleCount: 0,
  responseRatePercent: null,
  acceptKeepRatePercent: null,
  responseMinutesMedian: null,
  instantBook: false,
};

afterEach(cleanup);

describe('ShopQuickInfoCard — variant="full"', () => {
  it('hiện tên, dấu xác thực, vị trí, giới thiệu, rating + số chuyến làm tròn của GIAN HÀNG', () => {
    renderWithIntl(<ShopQuickInfoCard shop={SHOP} metrics={INSUFFICIENT_METRICS} />);

    expect(screen.getByRole('link', { name: 'Việt Car Hà Nội' })).toBeTruthy();
    expect(screen.getByLabelText('Gian hàng đã được XePrime xác minh')).toBeTruthy();
    expect(screen.getByText('Hà Nội')).toBeTruthy();
    expect(screen.getByText(/Cho thuê xe tự lái/)).toBeTruthy();
    // Điểm đánh giá xuất hiện ở CẢ dòng tóm tắt lẫn dòng ghi chú — `getAllByText` là đúng ý.
    expect(screen.getAllByText(/4[.,]9/).length).toBeGreaterThan(0);
    // 1234 làm tròn XUỐNG còn 1200, kèm dấu + vì không phải số thật.
    expect(screen.getByText(/1[.,]?200\+/)).toBeTruthy();
  });

  it('chưa đủ mẫu: ba chỉ số nói "chưa đủ dữ liệu" nhưng dòng ghi chú VẪN có', () => {
    renderWithIntl(<ShopQuickInfoCard shop={SHOP} metrics={INSUFFICIENT_METRICS} />);

    expect(screen.getByText(/Chưa có yêu cầu thuê nào/)).toBeTruthy();
    // 4.9 sao / 120 lượt → câu nói về điểm đánh giá, không phải câu khen vận hành.
    expect(screen.getByText(/được khách đánh giá/i)).toBeTruthy();
  });

  it('đủ mẫu, tỉ lệ tốt, rating cao: hiện câu mạnh nhất kèm số sao', () => {
    renderWithIntl(<ShopQuickInfoCard shop={SHOP} metrics={READY_GOOD_METRICS} />);

    expect(screen.getByText(/Chủ xe .* sao có thời gian phản hồi nhanh/)).toBeTruthy();
  });

  it('đủ mẫu nhưng rating dưới ngưỡng: đổi sang câu chỉ khen phần vận hành', () => {
    renderWithIntl(
      <ShopQuickInfoCard shop={{ ...SHOP, ratingAvg: '4.2' }} metrics={READY_GOOD_METRICS} />,
    );

    expect(screen.queryByText(/Chủ xe .* sao có thời gian phản hồi nhanh/)).toBeNull();
    expect(screen.getByText(/giữ đúng cam kết/)).toBeTruthy();
  });

  /* Cửa sổ 90 ngày vẫn còn — nhưng nằm trong dấu "i", không phải một dòng chữ thứ tư. */
  it('không còn dòng "Tính trên N yêu cầu trong 90 ngày gần nhất"', () => {
    renderWithIntl(<ShopQuickInfoCard shop={SHOP} metrics={READY_GOOD_METRICS} />);

    expect(screen.queryByText(/Tính trên/)).toBeNull();
  });

  it('rating chưa ai chấm (ratingCount 0): không hiện "0.0" giả, chỉ hiện số chuyến', () => {
    renderWithIntl(
      <ShopQuickInfoCard shop={{ ...SHOP, ratingCount: 0 }} metrics={INSUFFICIENT_METRICS} />,
    );

    expect(screen.queryByText(/0[.,]0/)).toBeNull();
    expect(screen.getByText(/1[.,]?200\+/)).toBeTruthy();
  });

  it('thiếu hẳn ratingAvg/ratingCount/completedTripCount (cache cũ): không vỡ, không hiện dòng số', () => {
    const stale: ShopQuickInfoCardShop = {
      name: SHOP.name,
      slug: SHOP.slug,
      verified: false,
    };
    renderWithIntl(<ShopQuickInfoCard shop={stale} metrics={undefined} />);

    expect(screen.getByRole('link', { name: SHOP.name })).toBeTruthy();
    expect(screen.queryByText(/\+/)).toBeNull();
  });

  it('render actions bên trong thẻ khi có', () => {
    renderWithIntl(
      <ShopQuickInfoCard
        shop={SHOP}
        metrics={READY_GOOD_METRICS}
        actions={<button type="button">Chọn thuê</button>}
      />,
    );

    expect(screen.getByRole('button', { name: 'Chọn thuê' })).toBeTruthy();
  });
});

describe('ShopQuickInfoCard — variant="compact"', () => {
  it('bỏ giới thiệu, ba chỉ số và dòng "Chủ xe … sao" — chỉ giữ danh tính + rating/số chuyến', () => {
    renderWithIntl(
      <ShopQuickInfoCard shop={SHOP} metrics={READY_GOOD_METRICS} variant="compact" />,
    );

    expect(screen.getByRole('link', { name: 'Việt Car Hà Nội' })).toBeTruthy();
    expect(screen.getByText(/4[.,]9/)).toBeTruthy();
    expect(screen.queryByText(/Cho thuê xe tự lái/)).toBeNull();
    expect(screen.queryByText(/Chủ xe .* sao có thời gian/)).toBeNull();
    expect(screen.queryByText(/Chưa có yêu cầu thuê nào/)).toBeNull();
  });

  it('render actions cạnh danh tính khi có', () => {
    renderWithIntl(
      <ShopQuickInfoCard
        shop={SHOP}
        metrics={READY_GOOD_METRICS}
        variant="compact"
        actions={<a href="/shops/demo">Xem gian hàng</a>}
      />,
    );

    expect(screen.getByRole('link', { name: 'Xem gian hàng' })).toBeTruthy();
  });
});
