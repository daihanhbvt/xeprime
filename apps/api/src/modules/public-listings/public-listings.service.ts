import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  LISTING_STATUS,
  REVIEW_STATUS,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  type PaginationMeta,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import type {
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

/** Cột đủ cho một thẻ marketplace — đọc từ snapshot `public_listings` (ADR 0008). */
const LISTING_CARD_SELECT = {
  vehicleId: true,
  title: true,
  vehicleType: true,
  serviceType: true,
  brand: true,
  model: true,
  seatCount: true,
  fuelType: true,
  mainImageUrl: true,
  weekdayPrice: true,
  weekendPrice: true,
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
 * dùng vehicle id). Decimal → string do ResponseInterceptor lo (ADR 0007). `rating` bơm từ
 * `ratingsByVehicle` (không có review → null/0, FE tự ẩn).
 */
function toListingCard(l: ListingCardRow, rating?: VehicleRating): PublicListingDto {
  return {
    id: l.vehicleId,
    name: l.title,
    vehicleType: l.vehicleType,
    serviceType: l.serviceType,
    brand: l.brand,
    model: l.model,
    seatCount: l.seatCount,
    fuelType: l.fuelType,
    mainImageUrl: l.mainImageUrl,
    weekdayPrice: l.weekdayPrice as unknown as string | null,
    weekendPrice: l.weekendPrice as unknown as string | null,
    shopName: l.tenant.name,
    shopSlug: l.shopSlug,
    shopProvince: l.provinceName,
    ratingAvg: rating?.avg ?? null,
    ratingCount: rating?.count ?? 0,
  };
}

function listingOrderBy(sort: string | undefined): Prisma.PublicListingOrderByWithRelationInput {
  if (sort === 'price_asc') return { weekdayPrice: 'asc' };
  if (sort === 'price_desc') return { weekdayPrice: 'desc' };
  return { createdAt: 'desc' };
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
  constructor(private readonly prisma: PrismaService) {}

  async search(query: PublicListingQueryDto): Promise<{
    data: PublicListingDto[];
    meta: PaginationMeta;
  }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, query.limit ?? DEFAULT_LIMIT));

    const where: Prisma.PublicListingWhereInput = {
      status: LISTING_STATUS.ACTIVE,
      // Khoá shop là ẩn listing tức thì — join tenant, KHÔNG denormalize (ADR 0008 §3).
      tenant: { status: TENANT_STATUS.ACTIVE, deletedAt: null },
      ...(query.province
        ? { provinceName: { contains: query.province, mode: 'insensitive' } }
        : {}),
      ...(query.vehicleType ? { vehicleType: query.vehicleType } : {}),
      ...(query.serviceType ? { serviceType: query.serviceType } : {}),
      ...(query.brand ? { brand: query.brand } : {}),
      ...(query.minSeats ? { seatCount: { gte: query.minSeats } } : {}),
      ...priceFilter(query.priceMin, query.priceMax),
      ...availabilityFilter(query.pickupAt, query.returnAt),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { brand: { contains: query.q, mode: 'insensitive' } },
              { model: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

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

    const ratings = await this.ratingsByVehicle(rows.map((r) => r.vehicleId));
    return {
      data: rows.map((r) => toListingCard(r, ratings.get(r.vehicleId))),
      meta: { page, limit, total, hasNext: page * limit < total },
    };
  }

  /**
   * Điểm đánh giá gộp theo xe cho ĐÚNG trang vừa lấy (một query `groupBy`, không N+1). Chỉ tính
   * review `published` chưa xoá — cùng quy tắc với `tenants.rating_avg` (xem `review.ts`).
   * Index `[vehicleId, status, createdAt]` phục vụ truy vấn này.
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
   * "Địa điểm nổi bật" — các tỉnh/thành đang có xe, kèm số xe và một ảnh đại diện. Gộp từ snapshot
   * `public_listings` (index `[provinceName]`), KHÔNG hardcode danh sách tỉnh ở FE. `provinceName`
   * trả về dùng luôn được làm giá trị lọc `province` của `/public/listings`.
   *
   * Bounded tự nhiên (63 tỉnh/thành) nên trả mảng có trần `limit` thay vì phân trang.
   */
  async listDestinations(query: PublicDestinationQueryDto): Promise<PublicDestinationDto[]> {
    const limit = Math.min(63, Math.max(1, query.limit ?? 6));

    const scope: Prisma.PublicListingWhereInput = {
      status: LISTING_STATUS.ACTIVE,
      tenant: { status: TENANT_STATUS.ACTIVE, deletedAt: null },
      provinceName: { not: null },
    };

    const groups = await this.prisma.publicListing.groupBy({
      by: ['provinceName'],
      where: scope,
      _count: { _all: true },
      orderBy: { _count: { provinceName: 'desc' } },
      take: limit,
    });

    const names = groups
      .map((g) => g.provinceName)
      .filter((n): n is string => n != null && n.length > 0);
    if (names.length === 0) return [];

    // Một ảnh đại diện cho mỗi tỉnh — `distinct` để DB trả đúng 1 dòng/tỉnh, không kéo cả bảng.
    const covers = await this.prisma.publicListing.findMany({
      where: { ...scope, provinceName: { in: names }, mainImageUrl: { not: null } },
      distinct: ['provinceName'],
      select: { provinceName: true, mainImageUrl: true },
    });
    const coverBy = new Map(covers.map((c) => [c.provinceName, c.mainImageUrl]));

    return groups
      .filter((g): g is typeof g & { provinceName: string } => Boolean(g.provinceName))
      .map((g) => ({
        provinceName: g.provinceName,
        vehicleCount: g._count._all,
        imageUrl: coverBy.get(g.provinceName) ?? null,
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

    const where: Prisma.TenantWhereInput = {
      status: TENANT_STATUS.ACTIVE,
      deletedAt: null,
      publicListings: { some: { status: LISTING_STATUS.ACTIVE } },
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
          _count: { select: { publicListings: { where: { status: LISTING_STATUS.ACTIVE } } } },
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

    const where: Prisma.PublicListingWhereInput = {
      status: LISTING_STATUS.ACTIVE,
      shopSlug: slug,
      tenant: { status: TENANT_STATUS.ACTIVE, deletedAt: null },
    };

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

    const ratings = await this.ratingsByVehicle(rows.map((r) => r.vehicleId));
    return {
      data: rows.map((r) => toListingCard(r, ratings.get(r.vehicleId))),
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
      },
      select: {
        id: true,
        name: true,
        vehicleType: true,
        serviceType: true,
        brand: true,
        model: true,
        seatCount: true,
        fuelType: true,
        mainImageUrl: true,
        weekdayPrice: true,
        weekendPrice: true,
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
      serviceType: v.serviceType,
      brand: v.brand,
      model: v.model,
      seatCount: v.seatCount,
      fuelType: v.fuelType,
      mainImageUrl: v.mainImageUrl,
      weekdayPrice: v.weekdayPrice as unknown as string | null,
      weekendPrice: v.weekendPrice as unknown as string | null,
      shopName: v.tenant.name,
      shopSlug: v.tenant.slug,
      shopProvince: v.tenant.profile?.provinceName ?? null,
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
