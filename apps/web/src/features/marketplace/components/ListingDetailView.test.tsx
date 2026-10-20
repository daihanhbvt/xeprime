import { cleanup, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EMPTY_CATALOG } from '@/features/catalog/types';
import { renderWithIntl as renderIntlOnly } from '@/i18n/test-utils';
import type { PublicQuote } from '@/features/rental-policies/types';
import type { PublicListingDetail } from '../types';
import { ListingDetailView } from './ListingDetailView';

/*
 * Thẻ "Thành tiền" hỏi báo giá SERVER (`/public/listings/:id/quote`) qua TanStack Query — mỗi lần dựng
 * trang là một QueryClient mới (không lẫn cache giữa các bài), và báo giá là một bảng kê kiểu server.
 */
const fetchPublicQuote = vi.hoisted(() => vi.fn());
vi.mock('@/features/rental-policies/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/rental-policies/api')>()),
  fetchPublicQuote,
}));

function renderWithIntl(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderIntlOnly(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

/** Báo giá 1 ngày tự lái của chiếc Fadil: tiền thuê 408k, phí dịch vụ 10%, thuế (CHỦ XE chịu) 10%. */
const QUOTE = {
  breakdown: {
    days: 1,
    longTerm: null,
    rows: [
      { key: 'base', label: 'Tiền thuê gốc', sublabel: '1 ngày × 480.000đ/ngày', amount: '480000' },
      { key: 'discount', label: 'Khuyến mãi trực tiếp (15%)', sublabel: null, amount: '-72000' },
      { key: 'subtotal', label: 'Tạm tính', sublabel: null, amount: '408000' },
    ],
    totalAmount: '408000',
    depositAmount: '0',
    policySource: 'vehicle',
    estimateNote: null,
    fees: {
      billingMode: 'commission',
      policy: {},
      baseAmount: '408000',
      lines: [
        {
          key: 'service_fee',
          beneficiary: 'xeprime',
          bearer: 'customer',
          percent: 10,
          amount: '40800',
        },
        { key: 'tax', beneficiary: 'state', bearer: 'owner', percent: 10, amount: '40800' },
      ],
      customerFeeTotal: '40800',
      customerTotalAmount: '448800',
      depositAmount: '40800',
      grossOnlineAmount: '81600',
      promoDiscountAmount: '0',
      onlineAmount: '81600',
      payAtPickupAmount: '367200',
      taxAmount: '40800',
      ownerPayableAmount: '367200',
      ownerNetAmount: '326400',
      holdAmount: '81600',
    },
  },
  delivery: { enabled: false, maxRadiusKm: null, tiers: [] },
  autoAccept: null,
} as unknown as PublicQuote;

beforeEach(() => {
  fetchPublicQuote.mockReset();
  fetchPublicQuote.mockResolvedValue(QUOTE);
});

vi.mock('@/features/booking-requests/components/RequestBookingButton', () => ({
  RequestBookingButton: () => <button type="button">Chọn thuê</button>,
}));

/*
 * `ShopChatButton` tự hỏi server "khách này nhắn được chưa" qua TanStack Query, nên render thật
 * nó ở đây sẽ đòi một QueryClientProvider mà bài test này không có lý do gì phải dựng — nó đang
 * đo GIÁ và ĐIỀU KIỆN THUÊ. Luật ẩn/hiện nút có spec riêng ở `ShopContactActions.test.tsx`.
 */
vi.mock('@/features/chat/components/ShopChatButton', () => ({
  ShopChatButton: () => <button type="button">Nhắn shop</button>,
}));

/*
 * `getAppFormat()` gọi `getLocale()` của next-intl — API chỉ chạy trong môi trường react-server,
 * nên trong jsdom nó ném. Thay bằng bộ định dạng dựng từ CHÍNH bó message thật.
 */
vi.mock('next-intl/server', async () => {
  const { serverTranslationsStub } = await import('@/i18n/test-utils');
  return serverTranslationsStub('vi');
});

vi.mock('@/i18n/server-format', async () => {
  const { createTestAppFormat } = await import('@/i18n/test-utils');
  return { getAppFormat: async () => createTestAppFormat('vi') };
});

vi.mock('./ListingGallery', () => ({
  ListingGallery: () => <div aria-label="Ảnh xe" />,
}));

vi.mock('./ListingReviews', () => ({
  ListingReviews: () => <div>Đánh giá</div>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/features/promo-codes/use-promo-code', () => ({
  usePromoCode: () => ({
    appliedCode: null,
    applied: null,
    checking: false,
    reason: null,
    droppedCode: null,
    apply: vi.fn(),
    remove: vi.fn(),
    rejectByServer: vi.fn(),
  }),
}));

vi.mock('@/features/promo-codes/components/PromoCodeField', () => ({
  PromoPicker: () => null,
  PromoStatusNote: () => null,
  PromoCodeField: () => null,
}));

vi.mock('./DeliveryAddressModal', () => ({
  DeliveryAddressModal: () => null,
}));

vi.mock('./ListingServiceSelector', () => ({
  ListingServiceSelector: () => <div>Dịch vụ</div>,
}));

const LISTING = {
  id: 'listing-1',
  name: 'VinFast Fadil 2022',
  vehicleType: 'car',
  serviceTypes: ['self_drive'],
  brand: 'vinfast',
  model: 'Fadil',
  seatCount: 5,
  fuelType: 'gasoline',
  bodyType: 'mini_car',
  mainImageUrl: null,
  weekdayPrice: '480000',
  weekendPrice: '550000',
  hourlyPrice: '70000',
  monthlyPrice: null,
  withDriverDailyPrice: null,
  deliveryEnabled: false,
  noCollateral: true,
  vatInvoiceSupported: false,
  discountPercent: 15,
  shopName: 'Gian hàng Demo XePrime',
  shopSlug: 'demo-xeprime',
  /*
   * Ba chỉ số uy tín của chủ xe (ADR 0045 điều 3) — ở đây là gian hàng chưa có YÊU CẦU NÀO, nên
   * khối chỉ hiện đúng một câu giải thích và không con số nào lọt vào những phép so giá bên dưới.
   */
  shopMetrics: {
    sampleCount: 0,
    responseRatePercent: null,
    acceptKeepRatePercent: null,
    responseMinutesMedian: null,
    instantBook: false,
  },
  shopProvince: 'Hồ Chí Minh',
  ratingAvg: '0',
  ratingCount: 0,
  description: null,
  color: 'Trắng',
  manufactureYear: 2022,
  shopLogoUrl: null,
  shopBio: null,
  // Số của GIAN HÀNG (khác ratingAvg/ratingCount ở trên — số của RIÊNG chiếc xe này).
  shopRatingAvg: '4.9',
  shopRatingCount: 120,
  shopCompletedTripCount: 1234,
  images: [],
  features: [],
  longTermPackages: [],
} as unknown as PublicListingDetail;

afterEach(cleanup);

describe('ListingDetailView pricing', () => {
  /*
   * `ListingDetailView` là SERVER Component async (nó `await getAppFormat()`), nên không render
   * thẳng bằng JSX được: gọi nó như một hàm, chờ cây trả về, rồi mới render cây đó.
   * Chính bài test này là thứ bắt được nếu ai đó lỡ biến nó thành Client Component.
   */
  it('dùng DiscountTag chung và không hiển thị giá cuối tuần/thuê giờ', async () => {
    renderWithIntl(await ListingDetailView({ listing: LISTING, catalog: EMPTY_CATALOG }));

    expect(screen.getByLabelText('Giảm 15%').textContent).toBe('-15%');
    expect(screen.getByText('408.000 ₫')).toBeTruthy();
    expect(screen.queryByText(/Cuối tuần/)).toBeNull();
    expect(screen.queryByText(/Thuê giờ/)).toBeNull();
    expect(screen.queryByText(/550\.000/)).toBeNull();
    expect(screen.queryByText(/70\.000/)).toBeNull();
  });
});

/**
 * Hoá đơn VAT (ADR 0059) — THÔNG TIN chủ xe công bố. Dấu hiệu chỉ hiện khi chủ xe đã bật, và câu
 * chữ phải nói rõ hai bên tự thoả thuận, XePrime không xuất hoá đơn thay chủ xe. `false` là "chưa công
 * bố", nên xe còn lại không mang câu phủ định nào.
 */
describe('ListingDetailView — hoá đơn VAT', () => {
  it('chủ xe chưa bật: không badge, không khối giải thích', async () => {
    renderWithIntl(await ListingDetailView({ listing: LISTING, catalog: EMPTY_CATALOG }));
    expect(screen.queryByText('Hỗ trợ xuất hoá đơn VAT')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Hoá đơn VAT' })).toBeNull();
  });

  it('chủ xe đã bật: badge + khối nói rõ thoả thuận trực tiếp, XePrime không xuất thay', async () => {
    renderWithIntl(
      await ListingDetailView({
        listing: { ...LISTING, vatInvoiceSupported: true },
        catalog: EMPTY_CATALOG,
      }),
    );
    expect(screen.getByText('Hỗ trợ xuất hoá đơn VAT')).toBeTruthy();
    const section = screen.getByRole('region', { name: 'Hoá đơn VAT' });
    expect(section.textContent).toContain('xác nhận trực tiếp với chủ xe');
    // Phạm vi đúng: hoá đơn của CHỦ XE cho tiền thuê — không phủ khoản trả cho XePrime.
    expect(section.textContent).toContain('tiền thuê xe trả cho chủ xe');
    expect(section.textContent).toContain('XePrime không xuất hoá đơn thay chủ xe');
    expect(section.textContent).toContain('không nằm trong hoá đơn này');
  });
});

/**
 * Thủ tục / khung giờ / phụ phí do CHỦ XE cấu hình (08/09/2026) được công bố ở trang xe.
 *
 * Khách phải biết trước khi gửi yêu cầu, chứ không phải tới quầy mới biết mình thiếu giấy tờ hay
 * chủ xe không giao sau 18h. Ba điều quan trọng ở đây: quy tắc phụ phí chỉ thuộc chuyến CÓ TÀI
 * XẾ, "đối chiếu VNeID" là thao tác THỦ CÔNG (không hứa tra cứu tự động), và trang không được
 * vỡ khi API cũ chưa trả ba khối này.
 */
describe('ListingDetailView — điều kiện thuê công bố', () => {
  const WITH_TERMS = {
    ...LISTING,
    serviceTypes: ['self_drive', 'with_driver'],
    withDriverDailyPrice: '1300000',
    rentalTerms: [
      {
        serviceType: 'self_drive',
        requiredDocuments: ['driver_licence', 'citizen_id'],
        identityVerifyMethod: 'vneid',
        termsText: 'Không hút thuốc trong xe.',
        requireTermsAcceptance: true,
        depositMode: null,
        instantBookEnabled: true,
        minRentalMinutes: null,
      },
      {
        serviceType: 'with_driver',
        requiredDocuments: ['citizen_id'],
        identityVerifyMethod: 'in_person',
        termsText: null,
        requireTermsAcceptance: false,
        depositMode: 'none',
        instantBookEnabled: false,
        minRentalMinutes: 720,
      },
    ],
    handover: {
      pickupWindows: [{ start: '08:00', end: '18:00' }],
      returnWindows: [{ start: '08:00', end: '20:00' }],
    },
    driverSurchargeRules: [
      { kind: 'waiting', unit: 'per_30_minutes', amount: '30000', thresholdValue: 30 },
    ],
  } as unknown as PublicListingDetail;

  it('tự lái: hiện giấy tờ, cách đối chiếu, điều khoản và nhãn Đặt ngay', async () => {
    renderWithIntl(await ListingDetailView({ listing: WITH_TERMS, catalog: EMPTY_CATALOG }));
    fireEvent.click(screen.getByRole('tab', { name: 'Giấy tờ thuê xe' }));

    expect(screen.getByText('Thủ tục & điều kiện thuê')).toBeTruthy();
    // Nhãn đậm (`<strong>`) tách dòng thành hai nút chữ — so theo chữ của cả dòng.
    expect(
      screen.getByText(
        (_, el) =>
          el?.tagName === 'SPAN' && /Giấy tờ cần có: Giấy phép lái xe/.test(el.textContent ?? ''),
      ),
    ).toBeTruthy();
    expect(screen.getByText('Đặt ngay')).toBeTruthy();
    expect(screen.getByText('Không hút thuốc trong xe.')).toBeTruthy();
    // "Đối chiếu VNeID" là người xem app của khách — không hứa gọi API định danh.
    expect(screen.queryByText(/tự động (tra cứu|xác thực|định danh)/i)).toBeNull();
  });

  it('hiện khung giờ giao nhận nhưng KHÔNG lộ thời gian chết nội bộ của gian hàng', async () => {
    renderWithIntl(await ListingDetailView({ listing: WITH_TERMS, catalog: EMPTY_CATALOG }));

    expect(screen.getByText('Khung giờ giao nhận')).toBeTruthy();
    expect(screen.getByText(/08:00–18:00/)).toBeTruthy();
    expect(screen.queryByText(/chuẩn bị giữa hai chuyến/i)).toBeNull();
  });

  it('phụ phí tài xế chỉ hiện khi khách đang xem dịch vụ CÓ TÀI XẾ', async () => {
    const { unmount } = renderWithIntl(
      await ListingDetailView({ listing: WITH_TERMS, catalog: EMPTY_CATALOG }),
    );
    expect(screen.queryByText('Phụ phí có thể phát sinh')).toBeNull();
    unmount();

    renderWithIntl(
      await ListingDetailView({
        listing: WITH_TERMS,
        catalog: EMPTY_CATALOG,
        serviceType: 'with_driver',
      }),
    );
    expect(screen.getByText('Phụ phí có thể phát sinh')).toBeTruthy();
    // Cùng một câu ở thẻ đặt xe và tab "Quy định chung" — soát trong khối điều khoản. Ngưỡng đọc
    // theo LOẠI của nó (số phút chờ miễn phí), không in con số trần; không lặp ký hiệu tiền tệ.
    const policies = within(screen.getByRole('region', { name: 'Quy định thuê xe' }));
    expect(
      policies.getByText('Phụ phí chờ đợi: 30.000 ₫/30 phút · tính sau 30 phút chờ miễn phí'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Tài sản thế chấp' }));
    expect(screen.getByText(/Không cần cọc giữ chuyến/)).toBeTruthy();
  });

  it('API cũ chưa trả ba khối này: trang vẫn dựng, chỉ thiếu mục thông tin', async () => {
    renderWithIntl(await ListingDetailView({ listing: LISTING, catalog: EMPTY_CATALOG }));

    expect(screen.getByText('VinFast Fadil 2022')).toBeTruthy();
    expect(screen.queryByText('Thủ tục & điều kiện thuê')).toBeNull();
    expect(screen.queryByText('Khung giờ giao nhận')).toBeNull();
  });

  /*
   * Body CŨ trong Data Cache của Next: `fetchListingDetail` cache 30 giây theo kiểu
   * stale-while-revalidate, nên ngay sau khi backend thêm một trường, lượt đọc stale đầu tiên
   * vẫn nhận body của phiên bản trước — thiếu hẳn `shopMetrics` dù kiểu sinh từ OpenAPI khai
   * nó bắt buộc. Trước 22/09/2026 chỗ đó ném `Cannot read properties of undefined` và giết cả
   * trang chi tiết xe, ngẫu nhiên theo đúng nhịp hết hạn cache.
   */
  it('body cũ thiếu hẳn shopMetrics: trang vẫn dựng, khối uy tín im lặng', async () => {
    const { shopMetrics: _omitted, ...withoutMetrics } = LISTING;
    renderWithIntl(
      await ListingDetailView({
        listing: withoutMetrics as unknown as PublicListingDetail,
        catalog: EMPTY_CATALOG,
      }),
    );

    expect(screen.getByText('VinFast Fadil 2022')).toBeTruthy();
    expect(screen.getByText('Gian hàng Demo XePrime')).toBeTruthy();
    // Không có số liệu thì không nói gì — kể cả câu "chưa đủ dữ liệu", vốn là một khẳng định.
    expect(screen.queryByText(/Chưa có yêu cầu thuê nào/)).toBeNull();
  });
});

/**
 * Thẻ gian hàng dùng chung (`ShopQuickInfoCard`) — số của GIAN HÀNG, không phải của riêng chiếc
 * xe đang xem, và dòng "Chủ xe … sao" chỉ được phép nói khi số liệu thật sự đủ tốt.
 */
describe('ListingDetailView — thẻ gian hàng', () => {
  const READY_GOOD_METRICS = {
    sampleCount: 10,
    responseRatePercent: 95,
    acceptKeepRatePercent: 92,
    responseMinutesMedian: 8,
    instantBook: false,
  };

  it('hiện rating + số chuyến LÀM TRÒN của GIAN HÀNG, tách khỏi rating của riêng chiếc xe', async () => {
    renderWithIntl(await ListingDetailView({ listing: LISTING, catalog: EMPTY_CATALOG }));

    // LISTING: shopRatingAvg 4.9, shopCompletedTripCount 1234 → làm tròn xuống 1200, kèm dấu +.
    // Điểm đánh giá hiện ở CẢ dòng tóm tắt lẫn dòng ghi chú bên dưới.
    expect(screen.getAllByText(/4[.,]9/).length).toBeGreaterThan(0);
    expect(screen.getByText(/1[.,]?200\+/)).toBeTruthy();
  });

  it('đủ mẫu và số liệu tốt: dòng ghi chú dùng câu mạnh nhất', async () => {
    const goodHost = {
      ...LISTING,
      shopMetrics: READY_GOOD_METRICS,
      shopRatingAvg: '4.9',
      shopRatingCount: 120,
    } as unknown as PublicListingDetail;
    renderWithIntl(await ListingDetailView({ listing: goodHost, catalog: EMPTY_CATALOG }));

    expect(screen.getByText(/Chủ xe .* sao có thời gian phản hồi nhanh/)).toBeTruthy();
  });

  /*
   * Dòng ghi chú KHÔNG biến mất khi gian hàng kém nổi bật — nó đổi sang câu chỉ nói đúng thứ
   * số liệu cho phép. Một khoảng trống ở đây làm thẻ trông như thiếu mất một phần.
   */
  it('tỉ lệ phản hồi thấp: đổi sang câu chỉ nói về điểm đánh giá, không bỏ trống', async () => {
    const mediocreHost = {
      ...LISTING,
      shopMetrics: { ...READY_GOOD_METRICS, responseRatePercent: 60 },
      shopRatingAvg: '4.9',
      shopRatingCount: 120,
    } as unknown as PublicListingDetail;
    renderWithIntl(await ListingDetailView({ listing: mediocreHost, catalog: EMPTY_CATALOG }));

    expect(screen.queryByText(/Chủ xe .* sao có thời gian phản hồi nhanh/)).toBeNull();
    expect(screen.getByText(/được khách đánh giá .* sao qua/)).toBeTruthy();
  });

  it('bỏ hẳn dòng "Tính trên N yêu cầu trong 90 ngày gần nhất"', async () => {
    const goodHost = {
      ...LISTING,
      shopMetrics: READY_GOOD_METRICS,
    } as unknown as PublicListingDetail;
    renderWithIntl(await ListingDetailView({ listing: goodHost, catalog: EMPTY_CATALOG }));

    expect(screen.queryByText(/Tính trên/)).toBeNull();
  });

  /*
   * Cùng lý do "body cũ trong Data Cache" đã ghi ở test shopMetrics phía trên — ba trường này
   * mới thêm 23/09/2026, nên lượt đọc stale đầu tiên sau khi backend thêm chúng vẫn có thể thiếu
   * hẳn. Component phải im lặng phần đó, không vỡ cả trang.
   */
  it('body cũ thiếu shopRatingAvg/shopRatingCount/shopCompletedTripCount: trang vẫn dựng', async () => {
    const {
      shopRatingAvg: _a,
      shopRatingCount: _b,
      shopCompletedTripCount: _c,
      ...stale
    } = LISTING;
    renderWithIntl(
      await ListingDetailView({
        listing: stale as unknown as PublicListingDetail,
        catalog: EMPTY_CATALOG,
      }),
    );

    expect(screen.getByText('VinFast Fadil 2022')).toBeTruthy();
    expect(screen.getByText('Gian hàng Demo XePrime')).toBeTruthy();
  });
});

/**
 * HẠN MỨC QUÃNG ĐƯỜNG (21/09/2026) — khách phải đọc được TRƯỚC khi gửi yêu cầu.
 *
 * Phí vượt km không nằm trong báo giá (lúc đặt chưa ai biết khách sẽ chạy bao xa), nên thứ duy
 * nhất làm nó công bằng là được công bố ở đây. Hai điều bị khoá: nó chỉ thuộc chuyến TỰ LÁI, và
 * xe không đặt hạn mức thì khối biến mất hoàn toàn — không có dòng "không giới hạn" nào.
 */
describe('ListingDetailView — hạn mức quãng đường', () => {
  const WITH_MILEAGE = {
    ...LISTING,
    serviceTypes: ['self_drive', 'with_driver'],
    withDriverDailyPrice: '1300000',
    mileagePolicy: { includedKmPerDay: 200, excessFeePerKm: '3000' },
  } as unknown as PublicListingDetail;

  it('tự lái: hiện số km mỗi ngày và tiền mỗi km vượt', async () => {
    renderWithIntl(await ListingDetailView({ listing: WITH_MILEAGE, catalog: EMPTY_CATALOG }));

    expect(screen.getByText('Hạn mức quãng đường')).toBeTruthy();
    expect(screen.getByText(/Bao gồm 200 km\/ngày/)).toBeTruthy();
    expect(screen.getByText(/3\.000/)).toBeTruthy();
    // Và nói rõ hạn mức phụ thuộc số ngày thuê có tính phí.
    expect(screen.getByText(/số ngày thuê có tính phí/)).toBeTruthy();
  });

  it('có tài xế: KHÔNG hiện — đi xa là phụ phí đường dài, một khoản khác', async () => {
    renderWithIntl(
      await ListingDetailView({
        listing: WITH_MILEAGE,
        catalog: EMPTY_CATALOG,
        serviceType: 'with_driver',
      }),
    );

    expect(screen.queryByText('Hạn mức quãng đường')).toBeNull();
  });

  it('xe không đặt hạn mức: không có khối rỗng, không có số 0 nào', async () => {
    renderWithIntl(await ListingDetailView({ listing: LISTING, catalog: EMPTY_CATALOG }));

    expect(screen.queryByText('Hạn mức quãng đường')).toBeNull();
    expect(screen.queryByText(/Bao gồm 0 km/)).toBeNull();
  });
});

/**
 * Bản mobile (Figma `19771:71482`) dùng chung cây với PC — các luật dưới đây đúng ở mọi khổ.
 * Trang này là nơi khách QUYẾT thuê: không một con số nào được là số mẫu của bản vẽ.
 */
describe('ListingDetailView — không có dữ liệu giả', () => {
  it('gian hàng chưa đủ mẫu: hàng ba chỉ số nói "chưa có yêu cầu", không hiện 100% / 10 phút', async () => {
    renderWithIntl(await ListingDetailView({ listing: LISTING, catalog: EMPTY_CATALOG }));

    expect(screen.getByText(/Chưa có yêu cầu thuê nào/)).toBeTruthy();
    expect(screen.queryByText('10 phút')).toBeNull();
    expect(screen.queryByText('100%')).toBeNull();
  });

  it('thông số chưa khai thì bỏ hẳn ô đó, không điền "5 chỗ · Xăng · 2023"', async () => {
    const bare = {
      ...LISTING,
      seatCount: null,
      fuelType: null,
      bodyType: null,
      manufactureYear: null,
    } as unknown as PublicListingDetail;
    renderWithIntl(await ListingDetailView({ listing: bare, catalog: EMPTY_CATALOG }));

    expect(screen.queryByText('Số chỗ')).toBeNull();
    expect(screen.queryByText('Đời xe')).toBeNull();
    expect(screen.queryByText('5 chỗ')).toBeNull();
    expect(screen.queryByText('2023')).toBeNull();
  });

  it('nhãn "Xe mới" theo cùng luật với thẻ xe: chỉ khi chiếc xe chưa có đánh giá nào', async () => {
    renderWithIntl(await ListingDetailView({ listing: LISTING, catalog: EMPTY_CATALOG }));
    expect(screen.getByText('Xe mới')).toBeTruthy();
    cleanup();

    const reviewed = { ...LISTING, ratingAvg: '4.8', ratingCount: 3 } as PublicListingDetail;
    renderWithIntl(await ListingDetailView({ listing: reviewed, catalog: EMPTY_CATALOG }));
    expect(screen.queryByText('Xe mới')).toBeNull();
  });

  it('nút quay lại (mobile) về trang kết quả MANG LẠI ngữ cảnh tìm kiếm', async () => {
    renderWithIntl(
      await ListingDetailView({
        listing: LISTING,
        catalog: EMPTY_CATALOG,
        pickupAt: '2026-11-01T01:00:00.000Z',
        returnAt: '2026-11-03T01:00:00.000Z',
        serviceType: 'self_drive',
        searchProvinceCode: '79',
      }),
    );

    const back = screen.getByRole('link', { name: 'Quay lại danh sách xe' });
    const href = new URL(back.getAttribute('href') ?? '', 'http://x');
    expect(href.pathname).toBe('/search');
    expect(href.searchParams.get('pickupAt')).toBe('2026-11-01T01:00:00.000Z');
    expect(href.searchParams.get('serviceType')).toBe('self_drive');
    expect(href.searchParams.get('provinceCode')).toBe('79');
  });

  it('hãng + màu đầu khối mô tả đọc từ tin đăng, thiếu thì bỏ', async () => {
    renderWithIntl(await ListingDetailView({ listing: LISTING, catalog: EMPTY_CATALOG }));
    // Danh mục rỗng ⇒ hãng hiện bằng khoá, màu là chữ tự do của chủ xe.
    expect(screen.getByText('vinfast')).toBeTruthy();
    expect(screen.getByText('Trắng')).toBeTruthy();
    cleanup();

    const noColor = { ...LISTING, color: null } as unknown as PublicListingDetail;
    renderWithIntl(await ListingDetailView({ listing: noColor, catalog: EMPTY_CATALOG }));
    expect(screen.queryByText(/Màu sắc/)).toBeNull();
  });
});

/**
 * "Tự nhận xe" (Figma `19707:83510` / mobile `19771:72529`) chỉ hứa điều ĐÚNG với chiếc xe này: bản vẽ
 * in ba cam kết cho mọi xe, nhưng "không cần chờ chủ xe duyệt" là sai khi xe không bật Đặt ngay
 * (ADR 0044).
 */
describe('ListingDetailView — thẻ "Tự nhận xe"', () => {
  it('xe KHÔNG bật Đặt ngay: không hứa "không cần chờ duyệt"; có giá giờ thì vẫn nói gói giờ', async () => {
    const listing = { ...LISTING, instantBookServiceTypes: [] } as unknown as PublicListingDetail;
    renderWithIntl(await ListingDetailView({ listing, catalog: EMPTY_CATALOG }));

    expect(screen.getByText('Tối ưu chi phí khi thuê gói theo giờ')).toBeTruthy();
    expect(screen.queryByText(/không cần chờ chủ xe duyệt/)).toBeNull();
  });

  it('xe bật Đặt ngay cho tự lái: có cam kết "không cần chờ duyệt"', async () => {
    const listing = {
      ...LISTING,
      instantBookServiceTypes: ['self_drive'],
    } as unknown as PublicListingDetail;
    renderWithIntl(await ListingDetailView({ listing, catalog: EMPTY_CATALOG }));

    expect(screen.getByText(/không cần chờ chủ xe duyệt/)).toBeTruthy();
  });

  it('không còn cam kết nào đúng (không giá giờ, không Đặt ngay): không vẽ thẻ', async () => {
    const listing = {
      ...LISTING,
      hourlyPrice: null,
      instantBookServiceTypes: [],
    } as unknown as PublicListingDetail;
    renderWithIntl(await ListingDetailView({ listing, catalog: EMPTY_CATALOG }));

    expect(screen.queryByText('Tự nhận xe')).toBeNull();
  });

  it('đang xem dịch vụ CÓ TÀI XẾ: không có chuyện "tự nhận xe"', async () => {
    const listing = {
      ...LISTING,
      serviceTypes: ['self_drive', 'with_driver'],
      instantBookServiceTypes: ['self_drive'],
    } as unknown as PublicListingDetail;
    renderWithIntl(
      await ListingDetailView({ listing, catalog: EMPTY_CATALOG, serviceType: 'with_driver' }),
    );

    expect(screen.queryByText('Tự nhận xe')).toBeNull();
  });
});

describe('ListingDetailView — tab "Quy định & Chính sách"', () => {
  it('điều khoản huỷ: miễn phí tính XUÔI từ lúc chủ xe nhận chuyến, cửa sổ giữ chỗ theo hằng số', async () => {
    renderWithIntl(await ListingDetailView({ listing: LISTING, catalog: EMPTY_CATALOG }));
    fireEvent.click(screen.getByRole('tab', { name: 'Điều khoản huỷ' }));

    const panel = screen.getByRole('tabpanel', { name: 'Điều khoản huỷ' });
    // ADR 0032 · 0044: 4 giờ kể từ khi được nhận — KHÔNG phải "trước giờ nhận xe 4 tiếng".
    expect(within(panel).getByText(/trong 4 giờ kể từ lúc chủ xe nhận chuyến/)).toBeTruthy();
    expect(within(panel).queryByText(/trước giờ nhận xe/)).toBeNull();
    expect(within(panel).getByText(/120 phút để thanh toán tiền giữ chỗ/)).toBeTruthy();
  });

  it('tab và panel nối nhau bằng id; mũi tên phải/trái/End chuyển tab', async () => {
    renderWithIntl(await ListingDetailView({ listing: LISTING, catalog: EMPTY_CATALOG }));

    const general = screen.getByRole('tab', { name: 'Quy định chung' });
    expect(general.getAttribute('aria-selected')).toBe('true');
    expect(document.getElementById(general.getAttribute('aria-controls') ?? '')).toBeTruthy();

    fireEvent.keyDown(general, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Giấy tờ thuê xe' }).getAttribute('aria-selected')).toBe(
      'true',
    );

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Giấy tờ thuê xe' }), { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Điều khoản huỷ' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });
});

describe('ListingDetailView — khuyến mãi trực tiếp chỉ của tự lái', () => {
  it('đang xem CÓ TÀI XẾ: không nhãn giảm giá, không dòng "Khuyến mãi trực tiếp" (ADR 0011)', async () => {
    const listing = {
      ...LISTING,
      serviceTypes: ['self_drive', 'with_driver'],
      withDriverDailyPrice: '1300000',
    } as unknown as PublicListingDetail;
    renderWithIntl(
      await ListingDetailView({ listing, catalog: EMPTY_CATALOG, serviceType: 'with_driver' }),
    );

    expect(screen.queryByLabelText('Giảm 15%')).toBeNull();
    expect(screen.queryByText(/Khuyến mãi trực tiếp/)).toBeNull();
    expect(screen.getByText('1.300.000 ₫')).toBeTruthy();
  });
});

describe('ListingDetailView — thẻ "Thành tiền" đọc báo giá SERVER', () => {
  it('mọi con số là của báo giá: tiền thuê, phí dịch vụ, tiền giữ chỗ, phần trả chủ xe, tổng', async () => {
    renderWithIntl(await ListingDetailView({ listing: LISTING, catalog: EMPTY_CATALOG }));

    await waitFor(() => expect(screen.getByText('Tiền thuê gốc')).toBeTruthy());
    expect(fetchPublicQuote).toHaveBeenCalledWith(
      'listing-1',
      expect.objectContaining({ serviceType: 'self_drive' }),
    );
    const costs = within(screen.getByRole('region', { name: 'Thành tiền' }));
    expect(costs.getByText('480.000 ₫')).toBeTruthy();
    expect(costs.getByText('−72.000 ₫')).toBeTruthy();
    expect(costs.getByText('40.800 ₫')).toBeTruthy();
    // Tiền giữ chỗ = D + S của SERVER (81.600), không phải 30% tiền thuê ở trình duyệt.
    expect(costs.getByText('Tiền giữ chỗ (trả trước)')).toBeTruthy();
    expect(costs.getByText('81.600 ₫')).toBeTruthy();
    expect(costs.getByText('367.200 ₫')).toBeTruthy();
    expect(costs.getByText('Tổng bạn trả')).toBeTruthy();
    expect(costs.getByText('448.800 ₫')).toBeTruthy();
  });

  it('thuế do CHỦ XE chịu không bao giờ hiện trong bảng của khách (ADR 0032 điều 3)', async () => {
    const listing = { ...LISTING, vatInvoiceSupported: true } as PublicListingDetail;
    renderWithIntl(await ListingDetailView({ listing, catalog: EMPTY_CATALOG }));

    await waitFor(() => expect(screen.getByText('Tiền thuê gốc')).toBeTruthy());
    expect(screen.queryByText('Thuế VAT')).toBeNull();
    expect(screen.queryByText(/Thuế khấu trừ|Thuế/)).toBeNull();
  });

  it('xe không có thông tin cọc: KHÔNG có dòng cọc mặc định 3.000.000', async () => {
    const listing = {
      ...LISTING,
      noCollateral: false,
      collateral: null,
    } as unknown as PublicListingDetail;
    renderWithIntl(await ListingDetailView({ listing, catalog: EMPTY_CATALOG }));

    await waitFor(() => expect(screen.getByText('Tiền thuê gốc')).toBeTruthy());
    expect(screen.queryByText('3.000.000 ₫')).toBeNull();
    expect(screen.queryByText('Cọc thế chấp khi nhận xe')).toBeNull();
  });

  it('báo giá không về: nói thẳng, không bịa số — vẫn đặt được', async () => {
    fetchPublicQuote.mockRejectedValue(new Error('network'));
    renderWithIntl(await ListingDetailView({ listing: LISTING, catalog: EMPTY_CATALOG }));

    await waitFor(() => expect(screen.getByText(/Chưa tải được giá tạm tính/)).toBeTruthy());
    expect(screen.queryByText('Tổng bạn trả')).toBeNull();
    expect(screen.getByRole('button', { name: 'Chọn thuê' })).toBeTruthy();
  });

  it('báo giá không có tiền giữ chỗ: không mời áp mã khuyến mãi (ADR 0046 điều 2)', async () => {
    fetchPublicQuote.mockResolvedValue({
      ...QUOTE,
      breakdown: { ...QUOTE.breakdown, fees: { ...QUOTE.breakdown.fees!, holdAmount: null } },
    });
    renderWithIntl(await ListingDetailView({ listing: LISTING, catalog: EMPTY_CATALOG }));

    await waitFor(() => expect(screen.getByText('Tiền thuê gốc')).toBeTruthy());
    expect(screen.queryByText('Áp dụng mã khuyến mãi / giới thiệu')).toBeNull();
    expect(screen.queryByText('Tiền giữ chỗ (trả trước)')).toBeNull();
  });
});

describe('ListingDetailView — thuê dài hạn chưa có gói', () => {
  it('không bịa gói 1/3/6/12, không hiện 0 ₫, không hỏi báo giá — nói "Liên hệ báo giá"', async () => {
    const listing = {
      ...LISTING,
      serviceTypes: ['self_drive', 'long_term'],
      monthlyPrice: null,
      longTermPackages: [],
    } as unknown as PublicListingDetail;
    renderWithIntl(
      await ListingDetailView({ listing, catalog: EMPTY_CATALOG, serviceType: 'long_term' }),
    );

    expect(screen.getAllByText('Liên hệ báo giá').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /3 tháng/ })).toBeNull();
    expect(screen.queryByText('0 ₫')).toBeNull();
    expect(fetchPublicQuote).not.toHaveBeenCalledWith(
      'listing-1',
      expect.objectContaining({ serviceType: 'long_term' }),
    );
  });
});

describe('ListingDetailView — tiếng Anh', () => {
  it('nhãn dòng tiền dịch theo MÃ dòng, không lọt câu tiếng Việt của server', async () => {
    renderIntlOnly(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        {await ListingDetailView({ listing: LISTING, catalog: EMPTY_CATALOG })}
      </QueryClientProvider>,
      { locale: 'en' },
    );

    const costs = within(await screen.findByRole('region', { name: 'Total' }));
    await waitFor(() => expect(costs.getByText('Base rental')).toBeTruthy());
    expect(costs.getByText('Direct discount')).toBeTruthy();
    expect(costs.queryByText('Tiền thuê gốc')).toBeNull();
    expect(costs.queryByText(/ngày ×/)).toBeNull();
  });
});
