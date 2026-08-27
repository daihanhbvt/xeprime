import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BOOKING_STATUS,
  PROVINCE_CODES,
  PUBLIC_CACHE_SECONDS,
  REVIEW_STATUS,
  SEAT_BUCKET_VALUES,
  SERVICE_TYPE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  type PaginationMeta,
  type SeatBucket,
} from '@xeprime/types';
import { ProvincesService } from '../locations/provinces.service';
import { PricingService } from '../pricing/pricing.service';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  FacetBucketDto,
  ListingFacetsDto,
  ListingFacetsQueryDto,
  PublicDestinationDto,
  PublicDestinationQueryDto,
  PublicListingDetailDto,
  PublicListingDto,
  PublicListingQueryDto,
  PublicShopDto,
  PublicShopListQueryDto,
  PublicShopSummaryDto,
  ShopListingQueryDto,
} from './dto/public-listing.dto';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { stableCacheKey, TtlCache } from '../../common/ttl-cache';
import {
  buildListingWhere,
  buildListingWhereSql,
  publicListingScope,
  seatBucketOf,
} from './listing-filter';

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 48;

/**
 * Facet sống 60 giây trong bộ nhớ tiến trình.
 *
 * Đây là đầu ra ĐẮT NHẤT của marketplace: một lần mở panel Bộ lọc là 11 phép gộp gần như quét
 * trọn `public_listings`, và panel gọi lại sau mỗi lần khách chạm một ô (đã debounce). Nội dung
 * thì hoàn toàn công khai — không đọc cookie, không phụ thuộc người đang xem — nên hai khách
 * cùng bộ lọc đang bắt Postgres tính lại y hệt nhau.
 *
 * 60 giây là khoảng mà không ai nhận ra: con số facet vốn đã không đồng bộ tuyệt đối với danh
 * sách (chúng chạy `Promise.all`, không chung một transaction — xem docblock `facets`). Đổi lại,
 * duyệt/ẩn một xe cần tới một phút mới thấy số đếm nhúc nhích; `search` KHÔNG cache nên bản
 * thân danh sách xe vẫn tức thì.
 *
 * Trần 500 khoá: mỗi tổ hợp filter là một khoá, và tổ hợp thì vô hạn — không có trần thì đây là
 * một chỗ rò bộ nhớ chờ ngày phát tác.
 *
 * TTL lấy từ `PUBLIC_CACHE_SECONDS.facets` — CÙNG con số với header `Cache-Control` của endpoint
 * facets và `next.revalidate` phía web, để "facet cũ tối đa bao lâu" chỉ có một câu trả lời.
 */
const FACETS_CACHE_TTL_MS = PUBLIC_CACHE_SECONDS.facets * 1000;
const FACETS_CACHE_MAX_ENTRIES = 500;

/**
 * Mã không thuộc danh mục — dùng khi tên tỉnh cũ không quy được về mã nào.
 *
 * Lọc bằng nó ra kết quả RỖNG, đúng ý "không tìm thấy tỉnh đó". Không có mã hành chính nào là
 * `00`, và `provinces.code` là khoá chính nên giá trị này không bao giờ va vào dữ liệu thật.
 */
const UNRESOLVED_PROVINCE_CODE = '00';

/** Cột đủ cho một thẻ marketplace — đọc từ snapshot `public_listings` (ADR 0008). */
const LISTING_CARD_SELECT = {
  vehicleId: true,
  title: true,
  vehicleType: true,
  serviceTypes: true,
  brand: true,
  model: true,
  seatCount: true,
  fuelType: true,
  bodyType: true,
  mainImageUrl: true,
  weekdayPrice: true,
  weekendPrice: true,
  hourlyPrice: true,
  monthlyPrice: true,
  withDriverDailyPrice: true,
  withDriverInterCityPrice: true,
  withDriverOneWayPrice: true,
  deliveryEnabled: true,
  noCollateral: true,
  discountPercent: true,
  ratingAvg: true,
  ratingCount: true,
  provinceCode: true,
  provinceName: true,
  shopSlug: true,
  tenant: { select: { name: true, profile: { select: { logoUrl: true } } } },
} satisfies Prisma.PublicListingSelect;

type ListingCardRow = Prisma.PublicListingGetPayload<{ select: typeof LISTING_CARD_SELECT }>;

/** Điểm đánh giá gộp của MỘT xe (chỉ review `published`). */
interface VehicleRating {
  avg: string | null;
  count: number;
}

/**
 * Row listing → thẻ marketplace. `id` của thẻ là `vehicleId` (route `/listings/[id]` + đặt xe
 * dùng vehicle id). Decimal → string do ResponseInterceptor lo (ADR 0007). Rating đọc từ cột
 * denormalize trên snapshot (ListingsService.refreshRating nuôi) — hiển thị 1 chữ số thập phân
 * như UI (4.9).
 */
function toListingCard(l: ListingCardRow, completedTripCount: number): PublicListingDto {
  return {
    id: l.vehicleId,
    name: l.title,
    vehicleType: l.vehicleType,
    serviceTypes: l.serviceTypes,
    brand: l.brand,
    model: l.model,
    seatCount: l.seatCount,
    fuelType: l.fuelType,
    bodyType: l.bodyType,
    mainImageUrl: l.mainImageUrl,
    weekdayPrice: l.weekdayPrice as unknown as string | null,
    weekendPrice: l.weekendPrice as unknown as string | null,
    hourlyPrice: l.hourlyPrice as unknown as string | null,
    monthlyPrice: l.monthlyPrice as unknown as string | null,
    withDriverDailyPrice: l.withDriverDailyPrice as unknown as string | null,
    withDriverInterCityPrice: l.withDriverInterCityPrice as unknown as string | null,
    withDriverOneWayPrice: l.withDriverOneWayPrice as unknown as string | null,
    deliveryEnabled: l.deliveryEnabled,
    noCollateral: l.noCollateral,
    discountPercent: l.discountPercent,
    shopName: l.tenant.name,
    shopSlug: l.shopSlug,
    shopLogoUrl: l.tenant.profile?.logoUrl ?? null,
    provinceCode: l.provinceCode,
    shopProvince: l.provinceName,
    completedTripCount,
    ratingAvg: l.ratingAvg != null ? l.ratingAvg.toFixed(1) : null,
    ratingCount: l.ratingCount,
  };
}

/** `recommended` (mặc định): điểm cao trước (NULLS LAST) → nhiều đánh giá trước → mới trước. */
function listingOrderBy(sort: string | undefined): Prisma.PublicListingOrderByWithRelationInput[] {
  if (sort === 'price_asc') return [{ weekdayPrice: 'asc' }];
  if (sort === 'price_desc') return [{ weekdayPrice: 'desc' }];
  if (sort === 'newest') return [{ createdAt: 'desc' }];
  return [
    { ratingAvg: { sort: 'desc', nulls: 'last' } },
    { ratingCount: 'desc' },
    { createdAt: 'desc' },
  ];
}

/**
 * Nguồn dữ liệu marketplace (ADR 0008).
 *
 * `search`/`listShopVehicles` đọc snapshot `public_listings` (status=`active`) và LUÔN join
 * `tenants` lọc `status='active'` — không denormalize trạng thái tenant, nên khoá shop có hiệu
 * lực tức thì. `getById` (chi tiết) đọc thẳng `vehicles` vì cần field không snapshot (mô tả, màu,
 * đời xe, logo/bio shop); điều kiện `approved_public + tenant active + chưa xoá` TƯƠNG ĐƯƠNG
 * "listing active" (do `syncFromVehicle` suy status từ đúng các cờ đó trong cùng transaction).
 * Ghi snapshot: DUY NHẤT `ListingsService` (ADR 0008 §1).
 */
@Injectable()
export class PublicListingsService {
  /**
   * Cache facet của RIÊNG instance này (service là singleton nên thực tế là một cache cho cả
   * tiến trình). Để ở instance thay vì module-scope để mỗi service dựng trong test có cache
   * riêng — không spec nào ăn phải số đếm của spec khác.
   *
   * Không có đường "đẩy" vô hiệu hoá từ `ListingsService`: nó phải ở lại module LÁ (ADR 0008,
   * xem `ListingsSyncModule`), nên gọi ngược lên đây là dựng lại đúng vòng phụ thuộc đã gỡ.
   * Hết hạn theo TTL là cách duy nhất, và đó là lý do TTL để ngắn.
   */
  private readonly facetsCache = new TtlCache<ListingFacetsDto>({
    ttlMs: FACETS_CACHE_TTL_MS,
    maxEntries: FACETS_CACHE_MAX_ENTRIES,
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly provinces: ProvincesService,
    private readonly pricing: PricingService,
  ) {}

  /**
   * Một truy vấn gộp cho cả trang — không phát sinh N+1 khi card cần hiển thị số chuyến thật.
   * Chỉ đếm đơn đã hoàn thành và chưa xoá; trạng thái khác không được quảng bá như một chuyến.
   */
  private async completedTripsByVehicle(vehicleIds: string[]): Promise<Map<string, number>> {
    if (vehicleIds.length === 0) return new Map();

    const groups = await this.prisma.booking.groupBy({
      by: ['vehicleId'],
      where: {
        vehicleId: { in: vehicleIds },
        status: BOOKING_STATUS.COMPLETED,
        deletedAt: null,
      },
      _count: { _all: true },
    });

    return new Map(groups.map((group) => [group.vehicleId, group._count._all]));
  }

  async search(query: PublicListingQueryDto): Promise<{
    data: PublicListingDto[];
    meta: PaginationMeta;
  }> {
    const paging = resolvePaging(query, DEFAULT_LIMIT, MAX_LIMIT);

    const where = buildListingWhere(await this.withResolvedProvince(query));

    // Đếm và lấy trang trong một transaction để total khớp với data cùng thời điểm.
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.publicListing.count({ where }),
      this.prisma.publicListing.findMany({
        where,
        orderBy: listingOrderBy(query.sort),
        skip: paging.skip,
        take: paging.take,
        select: LISTING_CARD_SELECT,
      }),
    ]);
    const completedTrips = await this.completedTripsByVehicle(rows.map((row) => row.vehicleId));

    return {
      data: rows.map((row) => toListingCard(row, completedTrips.get(row.vehicleId) ?? 0)),
      meta: paginationMeta(paging, total),
    };
  }

  /**
   * Facet counts cho panel Bộ lọc: total (mọi filter), biên giá (bỏ filter giá → slider không
   * tự co khi kéo), groupBy cho từng chiều scalar (bỏ chính chiều đó), 4 count tiện ích.
   *
   * Có cache (xem `facetsCache`) vì đây là đầu ra đắt nhất của marketplace và panel gọi lại sau
   * mỗi thao tác lọc. Phần tính thật nằm ở `computeFacets`.
   */
  async facets(rawQuery: ListingFacetsQueryDto): Promise<ListingFacetsDto> {
    const query = await this.withResolvedProvince(rawQuery);
    /*
     * Khoá bỏ `province` (tên) vì `provinceCode` đã là kết quả quy đổi của nó — giữ cả hai thì
     * "?province=TP.HCM" và "?provinceCode=79" thành hai khoá cho cùng một câu trả lời.
     */
    const key = stableCacheKey({ ...query, province: undefined });
    return this.facetsCache.wrap(key, () => this.computeFacets(query));
  }

  /** Bỏ toàn bộ facet đã cache. Có mặt để test không phải chờ TTL. */
  clearFacetsCache(): void {
    this.facetsCache.clear();
  }

  /**
   * Phần tính thật của `facets` — 11 phép gộp, mỗi chiều bỏ chính filter của nó.
   *
   * Tính năng nằm trong mảng `features` nên đếm riêng bằng raw unnest (Prisma groupBy không
   * bung được phần tử mảng). Dùng Promise.all thay vì `$transaction([...])` dạng mảng vì
   * overload transaction-mảng của groupBy mất literal type (`_count` suy về union) — số đếm
   * facet là dữ liệu hiển thị, lệch một nhịp giữa các query không sao.
   */
  private async computeFacets(query: ListingFacetsQueryDto): Promise<ListingFacetsDto> {
    const [
      total,
      priceAgg,
      bodyTypeRows,
      brandRows,
      seatRows,
      fuelRows,
      hourlyCount,
      deliveryCount,
      noCollateralCount,
      discountCount,
      features,
    ] = await Promise.all([
      this.prisma.publicListing.count({ where: buildListingWhere(query) }),
      this.prisma.publicListing.aggregate({
        where: buildListingWhere(query, 'price'),
        _min: { weekdayPrice: true },
        _max: { weekdayPrice: true },
      }),
      this.prisma.publicListing.groupBy({
        by: ['bodyType'],
        where: buildListingWhere(query, 'bodyType'),
        _count: { _all: true },
      }),
      this.prisma.publicListing.groupBy({
        by: ['brand'],
        where: buildListingWhere(query, 'brand'),
        _count: { _all: true },
      }),
      this.prisma.publicListing.groupBy({
        by: ['seatCount'],
        where: buildListingWhere(query, 'seats'),
        _count: { _all: true },
      }),
      this.prisma.publicListing.groupBy({
        by: ['fuelType'],
        where: buildListingWhere(query, 'fuelType'),
        _count: { _all: true },
      }),
      this.prisma.publicListing.count({
        where: { AND: [buildListingWhere(query, 'hourly'), { hourlyPrice: { not: null } }] },
      }),
      this.prisma.publicListing.count({
        where: { AND: [buildListingWhere(query, 'delivery'), { deliveryEnabled: true }] },
      }),
      this.prisma.publicListing.count({
        where: { AND: [buildListingWhere(query, 'noCollateral'), { noCollateral: true }] },
      }),
      this.prisma.publicListing.count({
        where: { AND: [buildListingWhere(query, 'discount'), { discountPercent: { gt: 0 } }] },
      }),
      // Phần tử thứ 11 nằm TRONG Promise.all: đây là phép gộp đắt nhất (raw unnest), để nó chạy
      // nối tiếp sau 10 phép kia là cộng thẳng thời gian của nó vào p95 của endpoint.
      this.featureFacets(query),
    ]);

    // Gom seatCount thô về bucket (4 / 5 / 7 / 7+) ở JS — mỗi giá trị rơi đúng một bucket.
    const seatCounts = new Map<SeatBucket, number>();
    for (const row of seatRows) {
      const bucket = seatBucketOf(row.seatCount);
      if (!bucket) continue;
      seatCounts.set(bucket, (seatCounts.get(bucket) ?? 0) + row._count._all);
    }

    return {
      total,
      price: {
        min: priceAgg._min.weekdayPrice as unknown as string | null,
        max: priceAgg._max.weekdayPrice as unknown as string | null,
      },
      bodyType: bodyTypeRows
        .filter((r): r is typeof r & { bodyType: string } => r.bodyType != null)
        .map((r) => ({ key: r.bodyType, count: r._count._all })),
      brand: brandRows
        .filter((r): r is typeof r & { brand: string } => r.brand != null)
        .map((r) => ({ key: r.brand, count: r._count._all }))
        .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, 'vi')),
      seats: SEAT_BUCKET_VALUES.filter((b) => seatCounts.has(b)).map((b) => ({
        key: b,
        count: seatCounts.get(b) ?? 0,
      })),
      fuelType: fuelRows
        .filter((r): r is typeof r & { fuelType: string } => r.fuelType != null)
        .map((r) => ({ key: r.fuelType, count: r._count._all })),
      features,
      amenities: {
        hourly: hourlyCount,
        delivery: deliveryCount,
        noCollateral: noCollateralCount,
        discount: discountCount,
      },
    };
  }

  /**
   * Đếm listing theo từng key tính năng — MỘT câu, lọc và gộp đều nằm lại trong Postgres.
   *
   * Trước đây chỗ này chạy hai lượt: Prisma lấy `id` của mọi listing khớp filter, rồi nối chúng
   * thành `IN (...)` cho câu unnest. Lập luận "tập id đã được filter thu hẹp trước" đúng ở mọi
   * trường hợp TRỪ trường hợp hay xảy ra nhất — mở chợ mà chưa lọc gì, khi đó tập id là toàn bộ
   * bảng. Ở quy mô vài chục nghìn xe, mỗi lần mở trang là kéo ngần ấy ULID về Node rồi gửi ngược
   * lại một câu SQL vài MB để Postgres parse lại từ đầu.
   *
   * `unnest` không dùng được GIN index, nhưng cái giá đó là một lượt quét `public_listings` đã
   * lọc sẵn — rẻ hơn nhiều lần so với việc vận chuyển tập id qua lại.
   */
  private async featureFacets(query: ListingFacetsQueryDto): Promise<FacetBucketDto[]> {
    const counted = await this.prisma.$queryRaw<Array<{ key: string; count: number }>>`
      SELECT f AS key, COUNT(*)::int AS count
      FROM "public_listings" pl, LATERAL unnest(pl."features") AS f
      WHERE ${buildListingWhereSql(query, 'features')}
      GROUP BY f
    `;
    return counted
      .map((r) => ({ key: r.key, count: Number(r.count) }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  }

  /**
   * Điểm đánh giá gộp theo xe, tính live từ `reviews` — giờ chỉ còn `getById` dùng (chi tiết đọc
   * thẳng `vehicles`, không có snapshot); danh sách đọc cột denormalize `rating_avg/rating_count`
   * trên `public_listings`. Chỉ tính review `published` chưa xoá — cùng quy tắc với
   * `tenants.rating_avg` (xem `review.ts`). Index `[vehicleId, status, createdAt]` phục vụ.
   */
  private async ratingsByVehicle(vehicleIds: string[]): Promise<Map<string, VehicleRating>> {
    if (vehicleIds.length === 0) return new Map();

    const rows = await this.prisma.review.groupBy({
      by: ['vehicleId'],
      where: {
        vehicleId: { in: vehicleIds },
        status: REVIEW_STATUS.PUBLISHED,
        deletedAt: null,
      },
      _avg: { rating: true },
      _count: { _all: true },
    });

    return new Map(
      rows.map((r) => [
        r.vehicleId,
        {
          // Một chữ số thập phân như UI hiển thị (4.9); string để nhất quán ADR 0007.
          avg: r._avg.rating != null ? r._avg.rating.toFixed(1) : null,
          count: r._count._all,
        },
      ]),
    );
  }

  /**
   * Quy tham số địa điểm về MÃ trước khi dựng where.
   *
   * `provinceCode` có sẵn thì dùng luôn. Chỉ có `province` (tên, từ link/bookmark cũ) thì tra bí
   * danh — "TP.HCM", "Bà Rịa - Vũng Tàu" (tỉnh đã sáp nhập) đều ra đúng mã.
   *
   * Không quy được thì gán mã KHÔNG TỒN TẠI (`00`) để kết quả rỗng, TUYỆT ĐỐI không bỏ qua bộ
   * lọc: bỏ qua nghĩa là người dùng hỏi "xe ở Vientiane" và nhận về xe toàn quốc — sai lặng lẽ,
   * kiểu tệ nhất.
   */
  private async withResolvedProvince<T extends { province?: string; provinceCode?: string }>(
    query: T,
  ): Promise<T> {
    if (query.provinceCode || !query.province) return query;
    const resolved = await this.provinces.resolveCode(query.province);
    return { ...query, provinceCode: resolved ?? UNRESOLVED_PROVINCE_CODE };
  }

  /**
   * "Địa điểm" công khai — các tỉnh ĐANG CÓ XE, kèm số xe và một ảnh đại diện.
   *
   * Đây là NGUỒN DUY NHẤT cho mọi bộ chọn địa điểm ở marketplace (hero desktop, dialog mobile,
   * trang /search, địa điểm nổi bật). Frontend không có danh sách tỉnh riêng, nên desktop và
   * mobile không thể lệch nhau, và tỉnh không có xe nào thì không hiện ở đâu cả.
   *
   * Gộp theo `provinceCode` (không phải tên): tên chỉ để hiển thị, mã mới là thứ đi vào URL và
   * bộ lọc. Scope dùng chung `publicListingScope()` nên tỉnh bị admin ẩn tự biến mất khỏi đây.
   *
   * Trần `limit` mặc định nhỏ (trang chủ chỉ hiện vài ô); danh mục cấp tỉnh có 34 đơn vị nên
   * `limit=34` là lấy hết, không cần phân trang.
   */
  async listDestinations(query: PublicDestinationQueryDto): Promise<PublicDestinationDto[]> {
    const limit = Math.min(PROVINCE_CODES.length, Math.max(1, query.limit ?? 6));
    const scope = publicListingScope();

    const groups = await this.prisma.publicListing.groupBy({
      by: ['provinceCode'],
      where: scope,
      _count: { _all: true },
      orderBy: { _count: { provinceCode: 'desc' } },
      take: limit,
    });

    const codes = groups
      .map((g) => g.provinceCode)
      .filter((c): c is string => c != null && c.length > 0);
    if (codes.length === 0) return [];

    // Ảnh đại diện + tên chuẩn: `distinct` để DB trả đúng một dòng mỗi tỉnh (không kéo cả bảng),
    // tên lấy từ bảng `provinces` chứ không từ cột denormalize — tên chuẩn chỉ có một nguồn.
    const [covers, provinces] = await Promise.all([
      this.prisma.publicListing.findMany({
        where: { ...scope, provinceCode: { in: codes }, mainImageUrl: { not: null } },
        distinct: ['provinceCode'],
        select: { provinceCode: true, mainImageUrl: true },
      }),
      this.prisma.province.findMany({
        where: { code: { in: codes } },
        select: { code: true, name: true },
      }),
    ]);
    const coverBy = new Map(covers.map((c) => [c.provinceCode, c.mainImageUrl]));
    const nameBy = new Map(provinces.map((p) => [p.code, p.name]));

    return groups
      .filter((g): g is typeof g & { provinceCode: string } => Boolean(g.provinceCode))
      .map((g) => ({
        provinceCode: g.provinceCode,
        provinceName: nameBy.get(g.provinceCode) ?? g.provinceCode,
        vehicleCount: g._count._all,
        imageUrl: coverBy.get(g.provinceCode) ?? null,
      }));
  }

  /**
   * "Gian hàng nổi bật" — shop đang `active` và CÓ ít nhất một xe hiển thị công khai, sắp theo
   * điểm đánh giá. Số xe đếm ngay trong query (`_count` có điều kiện), không N+1.
   */
  async listShops(
    query: PublicShopListQueryDto,
  ): Promise<{ data: PublicShopSummaryDto[]; meta: PaginationMeta }> {
    const paging = resolvePaging(query, DEFAULT_LIMIT, MAX_LIMIT);

    // "Có xe hiển thị được" phải dùng đúng luật hiển thị, không chỉ `status = active`: gian hàng
    // mà toàn bộ xe nằm ở tỉnh đã ẩn thì không còn là gian hàng nổi bật.
    const visibleListing = publicListingScope();
    const where: Prisma.TenantWhereInput = {
      status: TENANT_STATUS.ACTIVE,
      deletedAt: null,
      publicListings: { some: visibleListing },
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.tenant.count({ where }),
      this.prisma.tenant.findMany({
        where,
        orderBy: [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }, { createdAt: 'desc' }],
        skip: paging.skip,
        take: paging.take,
        select: {
          name: true,
          slug: true,
          ratingAvg: true,
          ratingCount: true,
          profile: { select: { provinceName: true, logoUrl: true } },
          _count: { select: { publicListings: { where: visibleListing } } },
        },
      }),
    ]);

    return {
      data: rows.map((t) => ({
        name: t.name,
        slug: t.slug,
        logoUrl: t.profile?.logoUrl ?? null,
        provinceName: t.profile?.provinceName ?? null,
        vehicleCount: t._count.publicListings,
        ratingAvg: t.ratingAvg as unknown as string,
        ratingCount: t.ratingCount,
      })),
      meta: paginationMeta(paging, total),
    };
  }

  /**
   * Hồ sơ công khai của một gian hàng theo slug — chỉ shop đang `active`. 404 nếu không có/đã
   * khoá. Không lộ dữ liệu nội bộ (id, email, mã số thuế…), chỉ thứ marketplace cần.
   */
  async getShopBySlug(slug: string): Promise<PublicShopDto> {
    const t = await this.prisma.tenant.findFirst({
      where: { slug, status: TENANT_STATUS.ACTIVE, deletedAt: null },
      select: {
        name: true,
        slug: true,
        phone: true,
        ratingAvg: true,
        ratingCount: true,
        profile: {
          select: {
            provinceName: true,
            logoUrl: true,
            coverUrl: true,
            bio: true,
            address: true,
          },
        },
      },
    });
    if (!t) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy gian hàng hoặc gian hàng không còn hoạt động',
      });
    }

    return {
      name: t.name,
      slug: t.slug,
      phone: t.phone,
      provinceName: t.profile?.provinceName ?? null,
      logoUrl: t.profile?.logoUrl ?? null,
      coverUrl: t.profile?.coverUrl ?? null,
      bio: t.profile?.bio ?? null,
      address: t.profile?.address ?? null,
      // Decimal → string do ResponseInterceptor lo (ADR 0007).
      ratingAvg: t.ratingAvg as unknown as string,
      ratingCount: t.ratingCount,
    };
  }

  /**
   * Xe `approved_public` của một gian hàng `active`, phân trang. Slug sai/shop khoá → trang rỗng
   * (trang shop đã 404 từ `getShopBySlug`); điều kiện lọc giống marketplace.
   */
  async listShopVehicles(
    slug: string,
    query: ShopListingQueryDto,
  ): Promise<{ data: PublicListingDto[]; meta: PaginationMeta }> {
    const paging = resolvePaging(query, DEFAULT_LIMIT, MAX_LIMIT);

    // Cùng scope với marketplace: xe của gian hàng nằm ở tỉnh đã bị ẩn cũng không hiện ở trang
    // shop — nếu không, trang shop thành đường vòng qua luật hiển thị.
    const where: Prisma.PublicListingWhereInput = { ...publicListingScope(), shopSlug: slug };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.publicListing.count({ where }),
      this.prisma.publicListing.findMany({
        where,
        orderBy: listingOrderBy(query.sort),
        skip: paging.skip,
        take: paging.take,
        select: LISTING_CARD_SELECT,
      }),
    ]);
    const completedTrips = await this.completedTripsByVehicle(rows.map((row) => row.vehicleId));

    return {
      data: rows.map((row) => toListingCard(row, completedTrips.get(row.vehicleId) ?? 0)),
      meta: paginationMeta(paging, total),
    };
  }

  /**
   * Chi tiết một xe trên marketplace — chỉ trả xe đã duyệt của shop đang hoạt động (cùng điều
   * kiện scope với danh sách). Không lộ dữ liệu nội bộ (biển số, tenantId…).
   */
  async getById(id: string): Promise<PublicListingDetailDto> {
    const v = await this.prisma.vehicle.findFirst({
      where: {
        id,
        deletedAt: null,
        publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
        tenant: { status: TENANT_STATUS.ACTIVE, deletedAt: null },
        // Link trực tiếp tới chi tiết xe KHÔNG được là đường vòng qua luật hiển thị theo tỉnh:
        // ẩn một tỉnh mà URL cũ vẫn mở được xe ở đó thì việc ẩn chỉ là trang trí.
        branch: { province: { isPublicVisible: true } },
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
        // `name`/`address`/`phone`: chi nhánh giữ xe CHÍNH LÀ chỗ khách tới nhận khi tự lấy xe.
        // Toạ độ để trang xe ghim được điểm nhận lên bản đồ — cùng mức công khai với địa chỉ
        // vốn đã hiện ở đó, không mở thêm gì về quyền riêng tư.
        branch: {
          select: {
            name: true,
            address: true,
            phone: true,
            latitude: true,
            longitude: true,
            province: { select: { code: true, name: true } },
          },
        },
        vehicleType: true,
        serviceTypes: true,
        brand: true,
        model: true,
        seatCount: true,
        fuelType: true,
        bodyType: true,
        mainImageUrl: true,
        weekdayPrice: true,
        weekendPrice: true,
        hourlyPrice: true,
        monthlyPrice: true,
        withDriverDailyPrice: true,
        withDriverInterCityPrice: true,
        withDriverOneWayPrice: true,
        deliveryEnabled: true,
        noCollateral: true,
        discountPercent: true,
        description: true,
        color: true,
        manufactureYear: true,
        tenant: {
          select: {
            name: true,
            slug: true,
            // `address`: dự phòng cho điểm nhận xe khi chi nhánh chưa điền địa chỉ.
            profile: { select: { provinceName: true, logoUrl: true, bio: true, address: true } },
          },
        },
        images: { orderBy: { sortOrder: 'asc' }, select: { imageUrl: true } },
        features: { select: { featureKey: true } },
      },
    });
    if (!v) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy xe hoặc xe không còn hiển thị công khai',
      });
    }

    /*
     * `effectivePolicy` lấy cho MỌI xe chứ không chỉ xe dài hạn: ngoài giá gói, nó còn là nguồn
     * DUY NHẤT trả lời được "xe này có đặt giao tận nơi được không" — cùng giá trị mà
     * `BookingRequestsService` dùng để chấp nhận/từ chối `deliveryRequested`.
     */
    const [rating, completedTripCount, policy] = await Promise.all([
      this.ratingsByVehicle([v.id]).then((ratings) => ratings.get(v.id)),
      this.prisma.booking.count({
        where: { vehicleId: v.id, status: BOOKING_STATUS.COMPLETED, deletedAt: null },
      }),
      this.pricing.effectivePolicy(v.tenantId, v.id),
    ]);

    /*
     * Giá SÁU gói thuê dài hạn (ADR 0011): bảng chọn gói phải hiện TIỀN THẬT ngay khi mở, nên
     * giá tính sẵn ở đây bằng chính hàm mà báo giá dùng — nút gói và breakdown không thể lệch.
     * Chỉ tính khi xe đăng dịch vụ dài hạn.
     */
    const longTermPackages = v.serviceTypes.includes(SERVICE_TYPE.LONG_TERM)
      ? this.pricing.longTermPackages(v.monthlyPrice as unknown as string | null, policy)
      : [];

    /*
     * Điểm nhận xe: địa chỉ chi nhánh giữ xe, rơi về địa chỉ hồ sơ gian hàng khi chi nhánh chưa
     * điền. Không có địa chỉ nào thì trả `null` — một điểm hẹn không có địa chỉ là thông tin vô
     * dụng, và bịa ra tên chi nhánh trần còn tệ hơn im lặng.
     */
    const pickupAddress = v.branch?.address?.trim() || v.tenant.profile?.address?.trim() || null;
    const pickupPoint = pickupAddress
      ? {
          // Tên chi nhánh chỉ có nghĩa khi địa chỉ ĐẾN TỪ chi nhánh đó.
          branchName: v.branch?.address?.trim() ? (v.branch.name ?? null) : null,
          address: pickupAddress,
          provinceName: v.branch?.province?.name ?? v.tenant.profile?.provinceName ?? null,
          phone: v.branch?.phone ?? null,
          /*
           * Toạ độ CHỈ đi kèm khi địa chỉ đến từ chính chi nhánh đó. Địa chỉ rơi về hồ sơ gian
           * hàng mà vẫn ghim toạ độ chi nhánh là ghim sai chỗ — trang xe sẽ chỉ khách tới một
           * điểm không phải nơi ghi trong dòng địa chỉ ngay bên trên.
           */
          latitude:
            v.branch?.address?.trim() && v.branch.latitude != null
              ? Number(v.branch.latitude)
              : null,
          longitude:
            v.branch?.address?.trim() && v.branch.longitude != null
              ? Number(v.branch.longitude)
              : null,
        }
      : null;

    return {
      id: v.id,
      name: v.name,
      vehicleType: v.vehicleType,
      serviceTypes: v.serviceTypes,
      brand: v.brand,
      model: v.model,
      seatCount: v.seatCount,
      fuelType: v.fuelType,
      bodyType: v.bodyType,
      mainImageUrl: v.mainImageUrl,
      weekdayPrice: v.weekdayPrice as unknown as string | null,
      weekendPrice: v.weekendPrice as unknown as string | null,
      hourlyPrice: v.hourlyPrice as unknown as string | null,
      monthlyPrice: v.monthlyPrice as unknown as string | null,
      withDriverDailyPrice: v.withDriverDailyPrice as unknown as string | null,
      withDriverInterCityPrice: v.withDriverInterCityPrice as unknown as string | null,
      withDriverOneWayPrice: v.withDriverOneWayPrice as unknown as string | null,
      deliveryEnabled: v.deliveryEnabled,
      noCollateral: v.noCollateral,
      discountPercent: v.discountPercent,
      shopName: v.tenant.name,
      shopSlug: v.tenant.slug,
      completedTripCount,
      // Vị trí là của CHI NHÁNH giữ xe, không phải của hồ sơ gian hàng: shop nhiều chi nhánh thì
      // hai xe cùng shop hoàn toàn có thể ở hai tỉnh khác nhau.
      provinceCode: v.branch?.province?.code ?? null,
      shopProvince: v.branch?.province?.name ?? null,
      description: v.description,
      color: v.color,
      manufactureYear: v.manufactureYear,
      shopLogoUrl: v.tenant.profile?.logoUrl ?? null,
      shopBio: v.tenant.profile?.bio ?? null,
      images: v.images.map((i) => i.imageUrl),
      features: v.features.map((f) => f.featureKey),
      ratingAvg: rating?.avg ?? null,
      ratingCount: rating?.count ?? 0,
      longTermPackages,
      pickupPoint,
      deliveryAvailable: policy?.values.deliveryEnabled ?? false,
      // Điều kiện bảo đảm lấy từ CHÍNH SÁCH HIỆU LỰC — cùng nguồn với nhãn "Miễn thế chấp" trên
      // thẻ xe. Chưa có chính sách thì null: nói "chưa công bố" đúng hơn là hứa miễn thế chấp.
      collateral: policy
        ? {
            mode: policy.values.collateralMode,
            assetTypes: policy.values.collateralAssetTypes,
            depositAmount: policy.values.depositAmount,
          }
        : null,
    };
  }
}
