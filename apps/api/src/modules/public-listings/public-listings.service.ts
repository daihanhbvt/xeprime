import { Injectable } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  type PaginationMeta,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import type { PublicListingDto, PublicListingQueryDto } from './dto/public-listing.dto';

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 48;

/**
 * Nguồn dữ liệu marketplace.
 *
 * ADR 0008: đúng ra Marketplace đọc bảng snapshot `public_listings` (Phase 3) và lọc tenant
 * active qua join. Bảng đó + luồng duyệt (Phase 2) chưa dựng, nên tạm đọc thẳng `vehicles`
 * đã `approved_public` thuộc tenant `active`. Điều kiện lọc GIỮ NGUYÊN như bản thật (chỉ xe
 * đã duyệt + shop đang hoạt động), nên khi có `public_listings` chỉ đổi nguồn đọc, không đổi
 * hợp đồng API.
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

    const where: Prisma.VehicleWhereInput = {
      deletedAt: null,
      publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
      // Khoá shop là ẩn listing tức thì — lọc qua quan hệ, không denormalize (ADR 0008).
      tenant: { status: TENANT_STATUS.ACTIVE, deletedAt: null },
      ...(query.vehicleType ? { vehicleType: query.vehicleType } : {}),
      ...(query.serviceType ? { serviceType: query.serviceType } : {}),
      ...(query.brand ? { brand: query.brand } : {}),
      ...(query.minSeats ? { seatCount: { gte: query.minSeats } } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { brand: { contains: query.q, mode: 'insensitive' } },
              { model: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.VehicleOrderByWithRelationInput =
      query.sort === 'price_asc'
        ? { weekdayPrice: 'asc' }
        : query.sort === 'price_desc'
          ? { weekdayPrice: 'desc' }
          : { createdAt: 'desc' };

    // Đếm và lấy trang trong một transaction để total khớp với data cùng thời điểm.
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.vehicle.count({ where }),
      this.prisma.vehicle.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
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
          tenant: { select: { name: true, slug: true } },
        },
      }),
    ]);

    const data: PublicListingDto[] = rows.map((v) => ({
      id: v.id,
      name: v.name,
      vehicleType: v.vehicleType,
      serviceType: v.serviceType,
      brand: v.brand,
      model: v.model,
      seatCount: v.seatCount,
      fuelType: v.fuelType,
      mainImageUrl: v.mainImageUrl,
      // Decimal → string do ResponseInterceptor lo (ADR 0007); ở đây giữ nguyên kiểu.
      weekdayPrice: v.weekdayPrice as unknown as string | null,
      weekendPrice: v.weekendPrice as unknown as string | null,
      shopName: v.tenant.name,
      shopSlug: v.tenant.slug,
    }));

    return {
      data,
      meta: { page, limit, total, hasNext: page * limit < total },
    };
  }
}
