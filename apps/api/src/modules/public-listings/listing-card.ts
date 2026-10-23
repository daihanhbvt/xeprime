import type { Prisma } from '@xeprime/prisma';
import { BOOKING_STATUS, hasVerifiedStorefront } from '@xeprime/types';
import {
  resolveStorefront,
  storefrontTenantSelect,
} from '../../common/storefront/storefront-identity';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PublicListingDto } from './dto/public-listing.dto';

/**
 * HÌNH THẺ XE của chợ — một định nghĩa cho mọi bề mặt đọc snapshot `public_listings` (kết quả
 * tìm kiếm, trang chủ, trang gian hàng, Xe yêu thích của khách).
 *
 * Tách khỏi `PublicListingsService` khi danh sách Xe yêu thích (module `favorites`) cần đúng thẻ
 * này: chép lại select/mapper ở module thứ hai là để hai thẻ của cùng một chiếc xe trôi khỏi nhau
 * ở lần thêm cột kế tiếp. Chỉ ĐỌC — writer của snapshot vẫn là `ListingsService` (ADR 0008).
 */

/**
 * Cột đủ cho một thẻ marketplace — đọc từ snapshot `public_listings` (ADR 0008).
 *
 * Là HÀM chứ không phải hằng vì một cột không nằm trên snapshot: tuyến thu tiền của gian hàng.
 * Nó đổi khi dòng thuê bao hết hạn, chứ không khi ai đó sửa chiếc xe — denormalize nó vào
 * `public_listings` là nhận một giá trị cũ đúng bằng khoảng thời gian từ lần refresh gần nhất
 * tới lúc gói hết hạn, và trong khoảng đó thẻ xe sẽ đeo dấu xác thực cho một tenant đã rời tuyến
 * gói. Nên nó đọc live từ `tenant.subscriptions` với `now` của chính request này.
 */
export const listingCardSelect = (now: Date) =>
  ({
    vehicleId: true,
    title: true,
    vehicleType: true,
    serviceTypes: true,
    brand: true,
    model: true,
    seatCount: true,
    fuelType: true,
    bodyType: true,
    motorbikeCategory: true,
    mainImageUrl: true,
    imageCount: true,
    transmission: true,
    instantBookServiceTypes: true,
    wardName: true,
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
    // Tên + ảnh + tuyến HIỆU LỰC của gian hàng — danh tính công khai theo tuyến (ADR 0054).
    // `subscriptions` là `take: 1` nên đây là một truy vấn phụ cho cả trang kết quả, không N+1.
    // `vatInvoiceSupported`: thiết lập cấp gian hàng (ADR 0059), đọc cùng lượt join này.
    tenant: { select: { ...storefrontTenantSelect(now), vatInvoiceSupported: true } },
  }) satisfies Prisma.PublicListingSelect;

export type ListingCardRow = Prisma.PublicListingGetPayload<{
  select: ReturnType<typeof listingCardSelect>;
}>;

/**
 * Row listing → thẻ marketplace. `id` của thẻ là `vehicleId` (route `/listings/[id]` + đặt xe
 * dùng vehicle id). Decimal → string do ResponseInterceptor lo (ADR 0007). Rating đọc từ cột
 * denormalize trên snapshot (ListingsService.refreshRating nuôi) — hiển thị 1 chữ số thập phân
 * như UI (4.9).
 */
export function toListingCard(
  l: ListingCardRow,
  completedTripCount: number,
  now: Date,
): PublicListingDto {
  // MỘT lần chấm tuyến cho mọi thứ thẻ xe cần nói về gian hàng: tên, ảnh, dấu tick. Ba lời gọi
  // riêng là ba cơ hội để thẻ tự mâu thuẫn với chính nó.
  const storefront = resolveStorefront(l.tenant, now);

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
    motorbikeCategory: l.motorbikeCategory,
    mainImageUrl: l.mainImageUrl,
    imageCount: l.imageCount,
    transmission: l.transmission,
    instantBookServiceTypes: l.instantBookServiceTypes,
    weekdayPrice: l.weekdayPrice as unknown as string | null,
    weekendPrice: l.weekendPrice as unknown as string | null,
    hourlyPrice: l.hourlyPrice as unknown as string | null,
    monthlyPrice: l.monthlyPrice as unknown as string | null,
    withDriverDailyPrice: l.withDriverDailyPrice as unknown as string | null,
    withDriverInterCityPrice: l.withDriverInterCityPrice as unknown as string | null,
    withDriverOneWayPrice: l.withDriverOneWayPrice as unknown as string | null,
    deliveryEnabled: l.deliveryEnabled,
    noCollateral: l.noCollateral,
    vatInvoiceSupported: l.tenant.vatInvoiceSupported,
    discountPercent: l.discountPercent,
    shopName: storefront.name,
    shopSlug: l.shopSlug,
    shopLogoUrl: storefront.avatarUrl,
    // Cùng phép suy với trang gian hàng: dấu chỉ dành cho tuyến gói, và `unconfigured` không
    // được đeo (ADR 0038 điều 1 — đường đọc hiển thị chọn mặt tiền cá nhân khi chưa xác định).
    shopVerified: hasVerifiedStorefront(storefront.billingMode),
    provinceCode: l.provinceCode,
    shopProvince: l.provinceName,
    wardName: l.wardName,
    completedTripCount,
    ratingAvg: l.ratingAvg != null ? l.ratingAvg.toFixed(1) : null,
    ratingCount: l.ratingCount,
  };
}

/**
 * Số chuyến ĐÃ HOÀN THÀNH theo xe — một truy vấn gộp cho cả trang, không N+1. Chỉ đếm đơn
 * `completed` chưa xoá; trạng thái khác không được quảng bá như một chuyến.
 */
export async function completedTripsByVehicle(
  prisma: PrismaService,
  vehicleIds: string[],
): Promise<Map<string, number>> {
  if (vehicleIds.length === 0) return new Map();

  const groups = await prisma.booking.groupBy({
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
