import { Injectable, NotFoundException } from '@nestjs/common';
import { newId, type Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  FAVORITE_DEFAULT_VEHICLE_TYPE,
  FAVORITE_LIST_DEFAULT_LIMIT,
  FAVORITE_LIST_MAX_LIMIT,
  type PaginationMeta,
} from '@xeprime/types';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import {
  completedTripsByVehicle,
  listingCardSelect,
  toListingCard,
} from '../public-listings/listing-card';
import { publicListingScope } from '../public-listings/listing-filter';
import type {
  FavoriteListQueryDto,
  FavoriteStatusDto,
  FavoriteToggleResultDto,
  FavoriteVehicleDto,
} from './dto/favorite.dto';

/**
 * Điều kiện để một xe đã lưu HIỆN trong danh sách và ĐƯỢC lưu mới: đúng scope công khai của chợ
 * (`publicListingScope` — listing `active`, gian hàng hoạt động, tỉnh được hiển thị) và còn ít
 * nhất một dịch vụ. Dùng lại scope của chợ thay vì viết lại: thiếu một vế ở đây là Xe yêu thích
 * thành đường vòng để thấy xe của một gian hàng đã bị khoá.
 */
function favoriteListingScope(): Prisma.PublicListingWhereInput {
  return { ...publicListingScope(), serviceTypes: { isEmpty: false } };
}

/**
 * Xe yêu thích của TÀI KHOẢN KHÁCH — writer DUY NHẤT của `customer_favorites`.
 *
 * Mọi hàm nhận `userId` từ phiên (controller đọc `@CurrentUser()`), không bao giờ từ client:
 * không có tham số nào cho phép xem/sửa danh sách của người khác (BRD §6.1).
 *
 * Ba điều BRD §6.6 khoá, và module này giữ bằng cách KHÔNG làm: không ghi `public_listings`
 * (ADR 0008 — chỉ đọc), không chạm `rank_score`, không phát thông báo cho chủ xe.
 */
@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Danh sách một tab, mới lưu lên trước. Xe ẩn/gỡ/đình chỉ/không còn dịch vụ bị LỌC lúc đọc chứ
   * không bị xoá — mở bán lại là hiện lại (BRD §5.4). Đếm và lấy trang chung một transaction để
   * `total` khớp `data`.
   */
  async list(
    userId: string,
    query: FavoriteListQueryDto,
  ): Promise<{ data: FavoriteVehicleDto[]; meta: PaginationMeta }> {
    const now = new Date();
    const paging = resolvePaging(query, FAVORITE_LIST_DEFAULT_LIMIT, FAVORITE_LIST_MAX_LIMIT);
    const vehicleType = query.vehicleType ?? FAVORITE_DEFAULT_VEHICLE_TYPE;

    const where: Prisma.CustomerFavoriteWhereInput = {
      userId,
      vehicle: { publicListing: { is: { ...favoriteListingScope(), vehicleType } } },
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.customerFavorite.count({ where }),
      this.prisma.customerFavorite.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: paging.skip,
        take: paging.take,
        select: {
          createdAt: true,
          vehicle: { select: { publicListing: { select: listingCardSelect(now) } } },
        },
      }),
    ]);

    const listed = rows.flatMap((row) =>
      row.vehicle.publicListing
        ? [{ favoritedAt: row.createdAt, listing: row.vehicle.publicListing }]
        : [],
    );
    const trips = await completedTripsByVehicle(
      this.prisma,
      listed.map((row) => row.listing.vehicleId),
    );

    return {
      data: listed.map(({ favoritedAt, listing }) => ({
        ...toListingCard(listing, trips.get(listing.vehicleId) ?? 0, now),
        favoritedAt: favoritedAt.toISOString(),
      })),
      meta: paginationMeta(paging, total),
    };
  }

  /**
   * Trong `vehicleIds`, xe nào tài khoản này đang lưu. Một câu cho cả trang kết quả (unique
   * `(user_id, vehicle_id)` phục vụ), không N+1. Không lọc scope chợ: trái tim chỉ hiện trên xe
   * đang ở chợ, còn câu hỏi ở đây chỉ là "đã lưu chưa".
   */
  async status(userId: string, vehicleIds: string[]): Promise<FavoriteStatusDto> {
    const ids = [...new Set(vehicleIds)];
    if (ids.length === 0) return { vehicleIds: [] };
    const rows = await this.prisma.customerFavorite.findMany({
      where: { userId, vehicleId: { in: ids } },
      select: { vehicleId: true },
    });
    return { vehicleIds: rows.map((row) => row.vehicleId) };
  }

  /**
   * Lưu một xe — IDEMPOTENT: thích lại một xe đã thích là no-op (`ON CONFLICT DO NOTHING` trên
   * unique `(user_id, vehicle_id)`), hai lượt bấm song song cũng chỉ ra một dòng.
   *
   * Chỉ lưu được xe ĐANG niêm yết công khai. Xe đã lưu từ trước mà nay bị ẩn thì vẫn trả
   * `favorited: true` (đúng trạng thái thật, và giữ tính idempotent) — không xoá mục đó.
   */
  async add(userId: string, vehicleId: string): Promise<FavoriteToggleResultDto> {
    const listed = await this.prisma.publicListing.findFirst({
      where: { vehicleId, ...favoriteListingScope() },
      select: { vehicleId: true },
    });

    if (!listed) {
      const existing = await this.prisma.customerFavorite.findUnique({
        where: { userId_vehicleId: { userId, vehicleId } },
        select: { id: true },
      });
      if (existing) return { vehicleId, favorited: true };
      throw new NotFoundException({
        code: API_ERROR_CODE.FAVORITE_VEHICLE_UNAVAILABLE,
        message: 'Xe này hiện không còn trên chợ nên chưa lưu vào yêu thích được.',
      });
    }

    await this.prisma.customerFavorite.createMany({
      data: [{ id: newId(), userId, vehicleId }],
      skipDuplicates: true,
    });
    return { vehicleId, favorited: true };
  }

  /**
   * Bỏ lưu một xe — IDEMPOTENT: xe chưa từng lưu (hay id lạ) cũng trả `favorited: false`, không
   * lỗi. Một xe có nhiều dịch vụ vẫn chỉ là MỘT dòng, nên bỏ thích là bỏ cả xe (BRD §5.3.5).
   */
  async remove(userId: string, vehicleId: string): Promise<FavoriteToggleResultDto> {
    await this.prisma.customerFavorite.deleteMany({ where: { userId, vehicleId } });
    return { vehicleId, favorited: false };
  }
}
