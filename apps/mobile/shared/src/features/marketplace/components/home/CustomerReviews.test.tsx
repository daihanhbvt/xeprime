import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import viHome from '@xeprime/domain/messages/vi/home.json';
import { withIntl } from '@/i18n/test-utils';
import { marketplaceApi, type FeaturedReview } from '../../api';
import { CustomerReviews } from './CustomerReviews';

const REVIEW: FeaturedReview = {
  id: 'r1',
  rating: 5,
  comment: 'Xe sạch, chủ xe giao đúng giờ.',
  customerName: 'Vũ L.',
  customerTripCount: 7,
  vehicleId: 'v1',
  vehicleName: 'VinFast VF3',
  createdAt: '2026-10-01T00:00:00.000Z',
};

async function renderReviews() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <CustomerReviews />
      </QueryClientProvider>,
    ),
  );
}

describe('CustomerReviews', () => {
  afterEach(() => jest.restoreAllMocks());

  it('chưa có đánh giá nào ⇒ ẩn cả khối, không dựng câu trích dẫn mẫu', async () => {
    jest.spyOn(marketplaceApi, 'featuredReviews').mockResolvedValue([]);
    await renderReviews();
    await new Promise((resolve) => setImmediate(resolve));
    expect(screen.queryByText(viHome.reviews.title)).toBeNull();
  });

  it('có đánh giá ⇒ hiện lời nhận xét, tên và số lần đã thuê', async () => {
    jest.spyOn(marketplaceApi, 'featuredReviews').mockResolvedValue([REVIEW]);
    await renderReviews();
    expect(await screen.findByText(REVIEW.comment)).toBeTruthy();
    expect(screen.getByText(REVIEW.customerName)).toBeTruthy();
    expect(screen.getByText('Đã thuê 7 lần')).toBeTruthy();
  });

  it('lỗi tải ⇒ hộp lỗi của khối, không sập trang chủ', async () => {
    jest.spyOn(marketplaceApi, 'featuredReviews').mockRejectedValue(new Error('boom'));
    await renderReviews();
    expect(await screen.findByText(viHome.reviews.loadError)).toBeTruthy();
  });
});
