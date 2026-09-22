import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketplaceFilters, PublicDestination, PublicListing } from '../types';

/**
 * Khối "Xe phù hợp với bạn" ở trang chủ.
 *
 * Điều đáng khoá ở đây là HỢP ĐỒNG giữa khối này và backend xếp hạng, không phải cách vẽ:
 *
 *   1. Tỉnh đi lên dưới tên `nearProvinceCode` (ƯU TIÊN) chứ không phải `provinceCode` (LỌC) —
 *      lẫn hai tham số này là biến trang chủ thành trang kết quả và làm khối rỗng ở tỉnh ít xe.
 *   2. Tỉnh lấy được từ BỘ NHỚ lượt trước khi URL không nói gì. Đây chính là lỗi đã thấy trên
 *      màn hình: viên địa điểm ghi "Hà Nội" còn danh sách mở đầu bằng xe An Giang.
 *   3. Khi phải bù xe ngoài tỉnh, khối NÓI RA thay vì im lặng.
 *   4. Thứ tự backend trả về được giữ NGUYÊN — sắp lại ở client là vứt bỏ cả phép xếp hạng.
 */

const DESTINATIONS: PublicDestination[] = [
  { provinceCode: '01', provinceName: 'Hà Nội', vehicleCount: 88 },
  { provinceCode: '91', provinceName: 'An Giang', vehicleCount: 4 },
];

const nav = vi.hoisted(() => ({ filters: {} as MarketplaceFilters }));

vi.mock('../hooks/use-marketplace-filters', () => ({
  useMarketplaceFilters: () => ({ filters: nav.filters, setFilters: vi.fn() }),
}));

vi.mock('../hooks/use-destinations', () => ({
  useDestinations: () => ({ data: DESTINATIONS, isLoading: false, error: null }),
}));

const api = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/services/api-client');
  return { ...actual, apiRequest: (...args: unknown[]) => api.request(...args) };
});

function listing(id: string, name: string, provinceCode: string, province: string): PublicListing {
  return {
    id,
    name,
    vehicleType: 'car',
    serviceTypes: ['self_drive'],
    brand: null,
    model: null,
    seatCount: 5,
    fuelType: null,
    bodyType: null,
    motorbikeCategory: null,
    mainImageUrl: null,
    weekdayPrice: '600000',
    weekendPrice: null,
    hourlyPrice: null,
    monthlyPrice: null,
    withDriverDailyPrice: null,
    withDriverInterCityPrice: null,
    withDriverOneWayPrice: null,
    deliveryEnabled: false,
    noCollateral: false,
    discountPercent: null,
    shopName: 'Gian hàng A',
    shopSlug: 'gian-hang-a',
    shopLogoUrl: null,
    shopVerified: false,
    provinceCode,
    shopProvince: province,
    completedTripCount: 2,
    ratingAvg: '5.0',
    ratingCount: 2,
  } as PublicListing;
}

const HANOI = listing('v1', 'Toyota Vios 2022', '01', 'Hà Nội');
const AN_GIANG = listing('v2', 'Kia Morning 2019', '91', 'An Giang');

function respond(data: PublicListing[], meta: Partial<Record<string, unknown>> = {}) {
  api.request.mockResolvedValue({
    data,
    meta: {
      count: data.length,
      total: 98,
      nearProvinceCode: null,
      mixedProvinces: false,
      ...meta,
    },
  });
}

/** Tham số query của lần gọi API gần nhất. */
function lastQuery(): Record<string, unknown> {
  const [, options] = api.request.mock.calls.at(-1) as [string, { query: Record<string, unknown> }];
  return options.query;
}

beforeEach(() => {
  nav.filters = {};
  api.request.mockReset();
  respond([HANOI]);
  window.localStorage.clear();
});

afterEach(cleanup);

async function renderPreview() {
  const { VehiclePreview } = await import('./VehiclePreview');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <VehiclePreview />
    </QueryClientProvider>,
  );
}

describe('Xe phù hợp với bạn', () => {
  it('gửi tỉnh dưới dạng ƯU TIÊN, không phải bộ lọc', async () => {
    nav.filters = { provinceCode: '01' };
    await renderPreview();

    await waitFor(() => expect(api.request).toHaveBeenCalled());
    const [path] = api.request.mock.calls[0] as [string];
    expect(path).toBe('/public/listings/recommended');
    expect(lastQuery().nearProvinceCode).toBe('01');
    expect(lastQuery()).not.toHaveProperty('provinceCode');
  });

  it('URL không có tỉnh thì dùng lựa chọn lượt trước — đúng chỗ trước đây rơi về toàn quốc', async () => {
    window.localStorage.setItem(
      'xp.provinceCode',
      JSON.stringify({ provinceCode: '01', savedAt: new Date().toISOString() }),
    );
    respond([HANOI], { nearProvinceCode: '01' });

    await renderPreview();

    await waitFor(() => expect(api.request).toHaveBeenCalled());
    expect(lastQuery().nearProvinceCode).toBe('01');
    expect(await screen.findByText('Ưu tiên xe ở Hà Nội')).toBeTruthy();
  });

  it('không nhớ gì và URL trống thì xếp theo cả nước, không nói về tỉnh nào', async () => {
    await renderPreview();

    await waitFor(() => expect(api.request).toHaveBeenCalled());
    expect(lastQuery().nearProvinceCode).toBeNull();
    expect(screen.queryByText(/Ưu tiên xe ở/)).toBeNull();
  });

  it('phải bù xe ngoài tỉnh thì nói ra, thay vì hứa một điều danh sách không giữ', async () => {
    nav.filters = { provinceCode: '01' };
    respond([HANOI, AN_GIANG], { nearProvinceCode: '01', mixedProvinces: true });

    await renderPreview();

    expect(
      await screen.findByText('Ưu tiên xe ở Hà Nội — chưa đủ nên có thêm xe tỉnh khác'),
    ).toBeTruthy();
  });

  it('giữ NGUYÊN thứ tự backend trả về', async () => {
    respond([AN_GIANG, HANOI]);
    await renderPreview();

    // So theo VỊ TRÍ TRONG DOM chứ không theo chỉ số của `findAllByRole('listitem')`: thẻ xe
    // có danh sách con của riêng nó (nhãn tiện ích), nên chỉ số `listitem` không phải thứ tự thẻ.
    const first = await screen.findByText('Kia Morning 2019');
    const second = await screen.findByText('Toyota Vios 2022');
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('lỗi tải KHÔNG kéo đổ cả trang chủ — hiện cảnh báo gọn kèm lối sang trang tìm xe', async () => {
    api.request.mockRejectedValue(new Error('network'));
    await renderPreview();

    expect(await screen.findByText('Không tải được danh sách xe')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mở trang tìm xe' })).toBeTruthy();
  });

  it('chợ chưa có xe nào khớp ngữ cảnh thì nói rõ, không để một khối trống', async () => {
    respond([], { total: 0 });
    await renderPreview();

    expect(await screen.findByText('Chưa có xe nào được đăng công khai')).toBeTruthy();
  });
});
