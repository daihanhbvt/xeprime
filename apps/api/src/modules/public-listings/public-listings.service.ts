import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  LISTING_STATUS,
  PROVINCE_CODES,
  REVIEW_STATUS,
  SEAT_BUCKET_RANGE,
  SEAT_BUCKET_VALUES,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  type PaginationMeta,
  type SeatBucket,
} from '@xeprime/types';
import { ProvincesService } from '../locations/provinces.service';
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

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 48;

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
  tenant: { select: { name: true } },
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
function toListingCard(l: ListingCardRow): PublicListingDto {
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
    provinceCode: l.provinceCode,
    shopProvince: l.provinceName,
    ratingAvg: l.ratingAvg != null ? l.ratingAvg.toFixed(1) : null,
    ratingCount: l.ratingCount,
  };
}

/** `recommended` (mặc định): điểm cao trước (NULLS LAST) → nhiều đánh giá trước → mới trước. */
function listingOrderBy(
  sort: string | undefined,
): Prisma.PublicListingOrderByWithRelationInput[] {
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
 * Lọc dịch vụ theo NĂNG LỰC phục vụ: `service_types` là MẢNG (một xe đăng nhiều dịch vụ),
 * filter là "mảng CÓ CHỨA dịch vụ đang tìm" — GIN index phục vụ `has`. Giá trị `both` cũ đã
 * khai tử từ 17/08 (backfill thành ['self_drive','with_driver'] ở migration).
 */
function serviceTypeFilter(serviceType: string): Prisma.PublicListingWhereInput {
  return { serviceTypes: { has: serviceType } };
}

/** Lọc khoảng giá thuê/ngày. Listing chưa có giá không lọt khi có ràng buộc giá. */
function priceFilter(min?: number, max?: number): Prisma.PublicListingWhereInput {
  if (min == null && max == null) return {};
  return {
    weekdayPrice: {
      ...(min != null ? { gte: min } : {}),
      ...(max != null ? { lte: max } : {}),
    },
  };
}

/**
 * Một chiều của bộ lọc facet. Khi đếm facet cho chiều nào thì bỏ chính filter của chiều đó
 * (semantics chuẩn — chọn SUV vẫn thấy Sedan còn bao nhiêu xe nếu đổi lựa chọn).
 */
type FacetDimension =
  | 'bodyType'
  | 'brand'
  | 'seats'
  | 'fuelType'
  | 'features'
  | 'price'
  | 'hourly'
  | 'delivery'
  | 'noCollateral'
  | 'discount';

/** Bộ filter dùng chung giữa search và facets (facets không có sort/paging). */
type ListingFilterQuery = Omit<PublicListingQueryDto, 'sort' | 'page' | 'limit'>;

/** Bucket số chỗ của một seatCount cụ thể (mỗi giá trị rơi vào đúng một bucket). */
function seatBucketOf(seatCount: number | null): SeatBucket | null {
  if (seatCount == null) return null;
  for (const bucket of SEAT_BUCKET_VALUES) {
    const { min, max } = SEAT_BUCKET_RANGE[bucket];
    if ((min == null || seatCount >= min) && (max == null || seatCount <= max)) return bucket;
  }
  return null;
}

/**
 * Where-clause marketplace duy nhất cho cả search lẫn facets. Mọi fragment đẩy vào `AND` để
 * không giẫm key (cả `q` lẫn bucket số chỗ đều dùng `OR` — spread phẳng sẽ ghi đè nhau).
 * `exclude` bỏ đúng một chiều khi đếm facet cho chiều đó.
 */
function buildListingWhere(
  query: ListingFilterQuery,
  exclude?: FacetDimension,
): Prisma.PublicListingWhereInput {
  const and: Prisma.PublicListingWhereInput[] = [];

  // Lọc theo MÃ tỉnh, khớp chính xác.
  //
  // Trước đây chỗ này là `provinceName contains … insensitive`, và nó sai theo hai hướng cùng
  // lúc: "Hà Nam" khớp luôn mọi tên chứa nó, còn "TP.HCM" thì không khớp "Hồ Chí Minh" dù là
  // một nơi. Tên tỉnh còn đổi được; mã thì không. Tham số `province` (tên) vẫn nhận được nhưng
  // controller đã quy nó về mã qua bảng bí danh TRƯỚC khi tới đây.
  if (query.provinceCode) {
    and.push({ provinceCode: query.provinceCode });
  }
  if (query.vehicleType) and.push({ vehicleType: query.vehicleType });
  if (query.serviceType) and.push(serviceTypeFilter(query.serviceType));
  if (query.minSeats) and.push({ seatCount: { gte: query.minSeats } });
  const availability = availabilityFilter(query.pickupAt, query.returnAt);
  if (Object.keys(availability).length > 0) and.push(availability);
  if (query.q) {
    and.push({
      OR: [
        { title: { contains: query.q, mode: 'insensitive' } },
        { brand: { contains: query.q, mode: 'insensitive' } },
        { model: { contains: query.q, mode: 'insensitive' } },
      ],
    });
  }

  if (exclude !== 'bodyType' && query.bodyType?.length) {
    and.push({ bodyType: { in: query.bodyType } });
  }
  // Hãng khớp đúng tên đã lưu (facet trả về giá trị thật từ DB); insensitive đỡ lệch hoa thường.
  if (exclude !== 'brand' && query.brand?.length) {
    and.push({ brand: { in: query.brand, mode: 'insensitive' } });
  }
  if (exclude !== 'seats' && query.seats?.length) {
    const ranges = query.seats
      .map((b) => SEAT_BUCKET_RANGE[b as SeatBucket])
      .filter((r): r is { min?: number; max?: number } => r != null)
      .map(({ min, max }) => ({
        seatCount: {
          ...(min != null ? { gte: min } : {}),
          ...(max != null ? { lte: max } : {}),
        },
      }));
    if (ranges.length > 0) and.push({ OR: ranges });
  }
  if (exclude !== 'fuelType' && query.fuelType?.length) {
    and.push({ fuelType: { in: query.fuelType } });
  }
  // Tính năng là AND (xe phải có ĐỦ các tiện ích đã chọn) — GIN index phục vụ hasEvery.
  if (exclude !== 'features' && query.features?.length) {
    and.push({ features: { hasEvery: query.features } });
  }
  if (exclude !== 'price') {
    const price = priceFilter(query.priceMin, query.priceMax);
    if (Object.keys(price).length > 0) and.push(price);
  }
  if (exclude !== 'hourly' && query.hourly) and.push({ hourlyPrice: { not: null } });
  if (exclude !== 'delivery' && query.delivery) and.push({ deliveryEnabled: true });
  if (exclude !== 'noCollateral' && query.noCollateral) and.push({ noCollateral: true });
  if (exclude !== 'discount' && query.discount) and.push({ discountPercent: { gt: 0 } });

  return { ...publicListingScope(), AND: and };
}

/**
 * Điều kiện để một snapshot ĐƯỢC PHÉP xuất hiện công khai — dùng chung cho search, facets,
 * điểm đến, trang gian hàng và chi tiết xe.
 *
 * Gom một chỗ vì đây là ranh giới an toàn: thiếu một vế ở một endpoint là tỉnh đã ẩn vẫn tra
 * được bằng cách gõ tay tham số, hoặc xe của gian hàng bị khoá vẫn hiện ở trang shop.
 *
 * Bốn vế:
 *   1. listing đang `active`;
 *   2. gian hàng đang hoạt động và chưa xoá (join, KHÔNG denormalize — ADR 0008 §3);
 *   3. có tỉnh hợp lệ — xe chưa gán vị trí thì không biết xếp vào đâu;
 *   4. tỉnh đó đang được phép hiển thị công khai (`isPublicVisible`).
 *
 * `branch` KHÔNG lọc theo `status`: chi nhánh ngừng hoạt động chỉ ngăn GẮN XE MỚI, nó không có
 * nghĩa là những xe đang cho thuê ở đó biến mất khỏi chợ giữa chừng.
 */
function publicListingScope(): Prisma.PublicListingWhereInput {
  return {
    status: LISTING_STATUS.ACTIVE,
    tenant: { status: TENANT_STATUS.ACTIVE, deletedAt: null },
    provinceCode: { not: null },
    province: { isPublicVisible: true },
  };
}

/**
 * Lọc xe RẢNH trong [pickupAt, returnAt): loại listing có xe bận (occupancy chồng lấn — đọc
 * `vehicle_occupancies` qua quan hệ, ADR 0006 chỉ ĐỌC; preview khả dụng, KHÔNG phải guard đặt xe).
 * Hai mốc phải hợp lệ và return > pickup, nếu không thì bỏ qua lọc.
 */
function availabilityFilter(pickupAt?: string, returnAt?: string): Prisma.PublicListingWhereInput {
  if (!pickupAt || !returnAt) return {};
  const start = new Date(pickupAt);
  const end = new Date(returnAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return {};
  // Chồng lấn khi occ.startAt < end VÀ occ.endAt > start.
  return { vehicle: { occupancies: { none: { startAt: { lt: end }, endAt: { gt: start } } } } };
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly provinces: ProvincesService,
  ) {}

  async search(query: PublicListingQueryDto): Promise<{
    data: PublicListingDto[];
    meta: PaginationMeta;
  }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, query.limit ?? DEFAULT_LIMIT));

    const where = buildListingWhere(await this.withResolvedProvince(query));

    // Đếm và lấy trang trong một transaction để total khớp với data cùng thời điểm.
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.publicListing.count({ where }),
      this.prisma.publicListing.findMany({
        where,
        orderBy: listingOrderBy(query.sort),
        skip: (page - 1) * limit,
        take: limit,
        select: LISTING_CARD_SELECT,
      }),
    ]);

    return {
      data: rows.map(toListingCard),
      meta: { page, limit, total, hasNext: page * limit < total },
    };
  }

  /**
   * Facet counts cho panel Bộ lọc: total (mọi filter), biên giá (bỏ filter giá → slider không
   * tự co khi kéo), groupBy cho từng chiều scalar (bỏ chính chiều đó), 4 count tiện ích.
   * Tính năng nằm trong mảng `features` nên đếm riêng bằng raw unnest (Prisma groupBy không
   * bung được phần tử mảng). Dùng Promise.all thay vì `$transaction([...])` dạng mảng vì
   * overload transaction-mảng của groupBy mất literal type (`_count` suy về union) — số đếm
   * facet là dữ liệu hiển thị, lệch một nhịp giữa các query không sao.
   */
  async facets(rawQuery: ListingFacetsQueryDto): Promise<ListingFacetsDto> {
    const query = await this.withResolvedProvince(rawQuery);
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
      features: await this.featureFacets(query),
      amenities: {
        hourly: hourlyCount,
        delivery: deliveryCount,
        noCollateral: noCollateralCount,
        discount: discountCount,
      },
    };
  }

  /**
   * Đếm listing theo từng key tính năng: lấy id khớp filter (bỏ chiều features) rồi unnest mảng
   * `features` bằng raw SQL — cách duy nhất groupBy theo phần tử mảng; GIN index không giúp
   * unnest nhưng tập id đã được filter thu hẹp trước.
   */
  private async featureFacets(query: ListingFacetsQueryDto): Promise<FacetBucketDto[]> {
    const rows = await this.prisma.publicListing.findMany({
      where: buildListingWhere(query, 'features'),
      select: { id: true },
    });
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const counted = await this.prisma.$queryRaw<Array<{ key: string; count: number }>>`
      SELECT f AS key, COUNT(*)::int AS count
      FROM "public_listings" pl, LATERAL unnest(pl."features") AS f
      WHERE pl."id" IN (${Prisma.join(ids)})
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
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, query.limit ?? DEFAULT_LIMIT));

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
        skip: (page - 1) * limit,
        take: limit,
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
      meta: { page, limit, total, hasNext: page * limit < total },
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
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, query.limit ?? DEFAULT_LIMIT));

    // Cùng scope với marketplace: xe của gian hàng nằm ở tỉnh đã bị ẩn cũng không hiện ở trang
    // shop — nếu không, trang shop thành đường vòng qua luật hiển thị.
    const where: Prisma.PublicListingWhereInput = { ...publicListingScope(), shopSlug: slug };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.publicListing.count({ where }),
      this.prisma.publicListing.findMany({
        where,
        orderBy: listingOrderBy(query.sort),
        skip: (page - 1) * limit,
        take: limit,
        select: LISTING_CARD_SELECT,
      }),
    ]);

    return {
      data: rows.map(toListingCard),
      meta: { page, limit, total, hasNext: page * limit < total },
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
        name: true,
        branch: { select: { province: { select: { code: true, name: true } } } },
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
            profile: { select: { provinceName: true, logoUrl: true, bio: true } },
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

    const rating = (await this.ratingsByVehicle([v.id])).get(v.id);

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
    };
  }
}
